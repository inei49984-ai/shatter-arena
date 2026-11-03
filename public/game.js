import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const MODEL_URL = '/assets/thomas_the_tank_engine.glb';
const loader = new GLTFLoader();
const keys = new Set();
const clock = new THREE.Clock();
let sourceModel = null, modelPromise = null, preview = null, game = null, raf = 0, state = 'menu';
let elapsed = 0, score = 0, wave = 1, health = 100, spawnIn = 1, ramCooldown = 0, whistleCooldown = 0, whistleTime = 0, damageCooldown = 0, steamTimer = 0;
let player = null, drones = [], steam = [], arenaRadius = 18, moveTouch = { x: 0, y: 0 }, joystickPointer = null;
const clamp = THREE.MathUtils.clamp;
const rand = (a,b) => a + Math.random() * (b-a);

function configureModel(root) {
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (node.isMesh) {
      node.castShadow = true; node.receiveShadow = true;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) if (mat) { mat.roughness = Math.max(mat.roughness ?? .6, .34); mat.envMapIntensity = .8; }
    }
  });
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  root.scale.setScalar(3.55 / Math.max(size.x,size.y,size.z)); root.updateMatrixWorld(true);
  const centered = new THREE.Box3().setFromObject(root), center = centered.getCenter(new THREE.Vector3());
  root.position.x -= center.x; root.position.z -= center.z; root.position.y -= centered.min.y; root.updateMatrixWorld(true);
  root.userData.baseY=root.position.y;
  root.userData.wheelPivots = [];
  root.userData.rodGroup=null;
  root.traverse(node => {
    if(node.name==='con_arm_gr')root.userData.rodGroup=node;
    if (!/^wheel_\d+_C$/i.test(node.name) || !node.parent) return;
    const bounds = new THREE.Box3().setFromObject(node); if (bounds.isEmpty()) return;
    const pivot = new THREE.Group(), parent = node.parent, centerWorld = bounds.getCenter(new THREE.Vector3());
    parent.updateWorldMatrix(true,false); parent.add(pivot); pivot.position.copy(parent.worldToLocal(centerWorld));
    parent.updateWorldMatrix(true,false); pivot.attach(node); root.userData.wheelPivots.push(pivot);
  });
  root.updateMatrixWorld(true);
  return root;
}

function makeLights(scene) {
  scene.add(new THREE.HemisphereLight(0xc5edff,0x111b26,2.35));
  const key = new THREE.DirectionalLight(0xffe1bd,3.2); key.position.set(-8,16,9); scene.add(key);
  const cyan = new THREE.PointLight(0x32dfff,42,34,2); cyan.position.set(8,5,-7); scene.add(cyan);
  const amber = new THREE.PointLight(0xff8c46,28,28,2); amber.position.set(-10,4,9); scene.add(amber);
}

function buildArena(scene) {
  const floor = new THREE.Mesh(new THREE.CircleGeometry(arenaRadius,96),new THREE.MeshStandardMaterial({color:0x111c26,metalness:.44,roughness:.68}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.13; floor.receiveShadow=true; scene.add(floor);
  const grid = new THREE.GridHelper(arenaRadius*2,32,0x285368,0x1a3040); grid.position.y=-.115;
  grid.material.transparent=true; grid.material.opacity=.42; scene.add(grid);
  for (const [r,t,c,o] of [[arenaRadius,.13,0x46d9fa,.48],[arenaRadius-1.1,.035,0xffae67,.28],[arenaRadius*.47,.04,0x3295b2,.24]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r,t,8,144),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o}));
    ring.rotation.x=Math.PI/2; ring.position.y=-.05; scene.add(ring);
  }
  const postMat = new THREE.MeshStandardMaterial({color:0x182733,metalness:.65,roughness:.32,emissive:0x062533,emissiveIntensity:.8});
  const postGlow = new THREE.MeshBasicMaterial({color:0x50dfff,transparent:true,opacity:.72});
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,x=Math.sin(a)*(arenaRadius-.4),z=Math.cos(a)*(arenaRadius-.4);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.19,.27,2.8,8),postMat);post.position.set(x,1.25,z);scene.add(post);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.27,10,8),postGlow);cap.position.set(x,2.62,z);scene.add(cap);
  }
  const core=new THREE.Group(); core.position.y=.12; core.userData.core=true;
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(1.25,0),new THREE.MeshStandardMaterial({color:0x1d7385,metalness:.42,roughness:.2,emissive:0x1e9fba,emissiveIntensity:1.6}));crystal.position.y=1.4;core.add(crystal);
  const coreRing=new THREE.Mesh(new THREE.TorusGeometry(1.8,.035,8,48),new THREE.MeshBasicMaterial({color:0x7cefff,transparent:true,opacity:.7}));coreRing.rotation.x=Math.PI/2;coreRing.position.y=1.1;core.add(coreRing);scene.add(core);
  for(let i=0;i<28;i++){
    const a=i*Math.PI*2/28,r=arenaRadius*.78, pebble=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.08),new THREE.MeshBasicMaterial({color:i%2?0x53cce9:0xffb06c,transparent:true,opacity:.5}));
    pebble.position.set(Math.cos(a)*r,.05,Math.sin(a)*r); scene.add(pebble);
  }
}

function makeScene(canvas,hero=false) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color(hero?0x0a111b:0x0b121a); scene.fog=new THREE.Fog(0x0b121a,30,62); makeLights(scene);
  const viewW=canvas.clientWidth||innerWidth,viewH=canvas.clientHeight||innerHeight;
  const camera=new THREE.PerspectiveCamera(hero?38:58,viewW/Math.max(1,viewH),.1,120);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:hero,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); renderer.setSize(viewW,viewH,false); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.08;
  if(!hero){buildArena(scene);camera.position.set(0,8,12);camera.lookAt(0,0,0);}
  return {scene,camera,renderer};
}

function createPreview() {
  const canvas=$('heroCanvas'); preview=makeScene(canvas,true); preview.scene.fog=null;
  const floor=new THREE.Mesh(new THREE.CircleGeometry(4.5,48),new THREE.MeshBasicMaterial({color:0x101b26}));floor.rotation.x=-Math.PI/2;floor.position.y=-.08;preview.scene.add(floor);
  preview.camera.position.set(4.5,3.1,5.6);preview.camera.lookAt(0,1,0);
}

function createPlayer() {
  const group=new THREE.Group(); group.position.set(0,0,7); group.userData.actor=true;
  const model=configureModel(cloneSkinned(sourceModel)); group.add(model); game.scene.add(group);
  return {group,model,vx:0,vz:0,yaw:Math.PI,walk:0,bob:0};
}

function makeDrone() {
  const a=Math.random()*Math.PI*2, r=arenaRadius+rand(1,4), x=Math.sin(a)*r,z=Math.cos(a)*r;
  const heavy=wave>=3&&Math.random()<Math.min(.12+wave*.03,.38), fast=!heavy&&wave>=2&&Math.random()<.32;
  const group=new THREE.Group();group.position.set(x,rand(1.2,2.8),z);group.userData.actor=true;
  const color=heavy?0xffa85e:fast?0xff6585:0x73eaff;
  const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(heavy?.78:.48,1),new THREE.MeshStandardMaterial({color:heavy?0x543727:0x16333d,metalness:.62,roughness:.25,emissive:color,emissiveIntensity:.55}));shell.castShadow=true;group.add(shell);
  const eye=new THREE.Mesh(new THREE.SphereGeometry(heavy?.19:.13,12,10),new THREE.MeshBasicMaterial({color}));eye.position.set(0,.02,.43);group.add(eye);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(heavy?.82:.58,.035,6,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8}));ring.rotation.x=Math.PI/2;group.add(ring);
  const hp=heavy?4:fast?1:2;game.scene.add(group);
  return {group,shell,ring,hp,maxHp:hp,heavy,fast,speed:(heavy?2.25:fast?4.5:3.1)+Math.min(wave*.12,1.25),stun:0,hitFlash:0,phase:Math.random()*7};
}

function puffSteam() {
  if(!player)return;
  const p=new THREE.Vector3(.03,2.55,.95).applyMatrix4(player.group.matrixWorld);
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(rand(.09,.16),8,7),new THREE.MeshBasicMaterial({color:0xbdeeff,transparent:true,opacity:.48,depthWrite:false}));
  mesh.position.copy(p);game.scene.add(mesh);steam.push({mesh,life:0,duration:rand(.55,.9),vx:rand(-.24,.24),vz:rand(-.25,.25)});
}

async function loadModel() {
  if(sourceModel)return sourceModel;
  if(modelPromise)return modelPromise;
  $('assetStatus').textContent='トーマスを読み込み中...';
  modelPromise=loader.loadAsync(MODEL_URL).then(gltf=>{sourceModel=gltf.scene;sourceModel.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    createPreview();const display=configureModel(cloneSkinned(sourceModel));const group=new THREE.Group();group.add(display);preview.scene.add(group);preview.model=display;preview.group=group;
    $('assetStatus').textContent='トーマス出発準備OK';$('assetStatus').classList.add('ready');return sourceModel;
  }).catch(error=>{modelPromise=null;throw error});
  return modelPromise;
}

function setupGame() {
  if(game){game.controls.dispose();game.renderer.dispose();game.scene.clear();}
  const canvas=$('gameCanvas');game=makeScene(canvas,false);
  game.controls=new OrbitControls(game.camera,canvas);game.controls.target.set(0,1,0);game.focusOffset=new THREE.Vector3(0,1,0);game.controls.enableDamping=true;game.controls.dampingFactor=.075;
  game.controls.minDistance=5;game.controls.maxDistance=22;game.controls.minPolarAngle=.18;game.controls.maxPolarAngle=1.43;game.controls.enablePan=true;game.controls.panSpeed=.65;
  game.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;game.controls.mouseButtons.MIDDLE=THREE.MOUSE.DOLLY;game.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
  game.controls.touches.ONE=THREE.TOUCH.ROTATE;game.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  game.controls.addEventListener('change',()=>{if(state==='playing'&&player)game.focusOffset.copy(game.controls.target).sub(player.group.position)});
  player=createPlayer();drones=[];steam=[];elapsed=0;score=0;wave=1;health=100;spawnIn=1;ramCooldown=0;whistleCooldown=0;whistleTime=0;damageCooldown=0;steamTimer=0;
  updateHud();
}

async function startGame() {
  if(state==='loading')return;state='loading';$('loadingOverlay').classList.remove('hidden');$('startButton').disabled=true;
  $('gameScreen').classList.remove('hidden');$('startScreen').classList.add('hidden');
  try {await loadModel();setupGame();$('loadingOverlay').classList.add('hidden');$('resultOverlay').classList.add('hidden');$('pauseOverlay').classList.add('hidden');state='playing';clock.start();raf=requestAnimationFrame(frame);toast('WAVE 1 — トーマス、フルスチーム！');}
  catch(error){console.error('Thomas model failed to load',error);state='menu';$('loadingOverlay').classList.add('hidden');$('gameScreen').classList.add('hidden');$('startScreen').classList.remove('hidden');$('startButton').disabled=false;$('assetStatus').textContent='モデルを読み込めません。再読み込みしてください。';$('assetStatus').className='asset-status error';}
}

function best(){return Number(localStorage.getItem('shatterArenaBest')||0)}
function updateHud(){
  $('waveValue').textContent=String(wave).padStart(2,'0');$('scoreValue').textContent=String(score).padStart(5,'0');$('enemyValue').textContent=String(drones.length).padStart(2,'0');
  $('healthBar').style.width=`${health}%`;$('healthValue').textContent=`${health}%`;
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove('show'),1600)}
function burst(position,color=0x76eaff,count=10){
  for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(rand(.035,.09),0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95}));mesh.position.copy(position);game.scene.add(mesh);steam.push({mesh,life:0,duration:rand(.24,.55),vx:rand(-3,3),vz:rand(-3,3),vy:rand(.6,3)});}
}

function ram(special=false){
  if(state!=='playing'||!player)return;
  if(special){if(whistleCooldown>0){toast('汽笛ブースト充填中');return}whistleCooldown=5.5;whistleTime=1.15;toast('フルスチーム！');}
  else{if(ramCooldown>0)return;ramCooldown=.58;}
  const dir=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
  player.vx+=dir.x*(special?11:4.4);player.vz+=dir.z*(special?11:4.4);
  const reach=special?7.4:3.65,angle=special?-.05:.34;let hits=0;
  for(const drone of drones){const dx=drone.group.position.x-player.group.position.x,dz=drone.group.position.z-player.group.position.z,dist=Math.hypot(dx,dz);if(dist>reach)continue;
    const dot=(dx*dir.x+dz*dir.z)/(dist||1);if(dot<angle)continue;
    drone.group.userData.knockX=dx/(dist||1)*(special?27:19);drone.group.userData.knockZ=dz/(dist||1)*(special?27:19);drone.stun=special?1.05:.82;drone.hp--;drone.hitFlash=.15;hits++;
    burst(drone.group.position,drone.heavy?0xffad65:0x77edff,8);
    if(drone.hp<=0){score+=drone.heavy?60:drone.fast?25:35;game.scene.remove(drone.group);drone.group.userData.dead=true;}
  }
  if(hits)toast(special?'汽笛ショックウェーブ！':'ボイラーバッシュ！');
}

function damage(amount){if(damageCooldown>0)return;damageCooldown=.6;health=Math.max(0,health-amount);$('healthBar').style.width=`${health}%`;$('healthValue').textContent=`${health}%`;if(health<=0)finish();}
function finish(){if(state!=='playing')return;state='over';const old=best();if(score>old)localStorage.setItem('shatterArenaBest',String(score));$('resultEyebrow').textContent=score>old?'NEW RECORD // SAVED':'RUN COMPLETE';$('resultTitle').textContent='ENGINE STOPPED';$('resultCopy').textContent=`WAVE ${wave} でトーマスの機関が停止した。`; $('finalScore').textContent=String(score).padStart(5,'0');$('resultOverlay').classList.remove('hidden');}

function frame(){
  if(state!=='playing')return;raf=requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.045);elapsed+=dt;
  const newWave=1+Math.floor(elapsed/18);if(newWave!==wave){wave=newWave;toast(`WAVE ${wave} — 増援接近！`)}
  ramCooldown=Math.max(0,ramCooldown-dt);whistleCooldown=Math.max(0,whistleCooldown-dt);whistleTime=Math.max(0,whistleTime-dt);damageCooldown=Math.max(0,damageCooldown-dt);spawnIn-=dt;
  if(spawnIn<=0){drones.push(makeDrone());spawnIn=Math.max(.34,1.15-wave*.055)*rand(.78,1.18)}
  const ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+moveTouch.x;
  const iz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+moveTouch.y;
  const forward=new THREE.Vector3(player.group.position.x-game.camera.position.x,0,player.group.position.z-game.camera.position.z).normalize();
  const right=new THREE.Vector3(-forward.z,0,forward.x),direction=right.multiplyScalar(ix).add(forward.multiplyScalar(-iz));
  if(direction.lengthSq()>1)direction.normalize();
  const moving=direction.lengthSq()>.04,speed=whistleTime>0?13.5:6.4;
  player.vx+=direction.x*speed*dt*4.2;player.vz+=direction.z*speed*dt*4.2;
  const drag=Math.exp(-(moving?2.3:4.5)*dt);player.vx*=drag;player.vz*=drag;
  const limit=whistleTime>0?12:6.1,vel=Math.hypot(player.vx,player.vz);if(vel>limit){player.vx*=limit/vel;player.vz*=limit/vel;}
  player.group.position.x=clamp(player.group.position.x+player.vx*dt,-arenaRadius+1,arenaRadius-1);player.group.position.z=clamp(player.group.position.z+player.vz*dt,-arenaRadius+1,arenaRadius-1);
  const actualSpeed=Math.hypot(player.vx,player.vz);if(actualSpeed>.2){const desired=Math.atan2(player.vx,player.vz);let diff=Math.atan2(Math.sin(desired-player.yaw),Math.cos(desired-player.yaw));player.yaw+=diff*(1-Math.exp(-dt*9));player.group.rotation.y=player.yaw;}
  player.walk+=actualSpeed*dt*2.9;player.bob+=(Math.sin(player.walk*2)*.035-player.bob)*(1-Math.exp(-dt*7));player.model.position.y=player.model.userData.baseY+player.bob;
  if(player.model.userData.rodGroup)player.model.userData.rodGroup.rotation.x=Math.sin(player.walk)*.055*Math.min(1,actualSpeed);
  const wheelSpeed=actualSpeed>.2?actualSpeed*.72:0;for(const pivot of player.model.userData.wheelPivots||[])pivot.rotation.x+=wheelSpeed*dt;
  game.controls.target.set(player.group.position.x+game.focusOffset.x,player.group.position.y+game.focusOffset.y+player.bob,player.group.position.z+game.focusOffset.z);game.controls.update();
  steamTimer-=dt;if(actualSpeed>1.3&&steamTimer<=0){puffSteam();steamTimer=whistleTime>0?.11:.28;}
  for(const drone of drones){if(drone.group.userData.dead)continue;drone.phase+=dt;drone.group.rotation.y+=dt*(drone.fast?2.3:1.2);drone.ring.rotation.z+=dt*1.1;drone.group.position.y+=Math.sin(drone.phase*3)*dt*.25;drone.hitFlash=Math.max(0,drone.hitFlash-dt);
    if(drone.stun>0){drone.stun-=dt;drone.group.position.x+=drone.group.userData.knockX*dt;drone.group.position.z+=drone.group.userData.knockZ*dt;drone.group.userData.knockX*=Math.exp(-3*dt);drone.group.userData.knockZ*=Math.exp(-3*dt);}
    else{const dx=player.group.position.x-drone.group.position.x,dz=player.group.position.z-drone.group.position.z,len=Math.hypot(dx,dz)||1;drone.group.position.x+=dx/len*drone.speed*dt;drone.group.position.z+=dz/len*drone.speed*dt;
      if(len<1.55){damage(drone.heavy?16:9);drone.group.position.x-=dx/len*1.3;drone.group.position.z-=dz/len*1.3;}}
    const d=Math.hypot(drone.group.position.x,drone.group.position.z);if(d>arenaRadius+.8){score+=drone.heavy?60:drone.fast?25:35;game.scene.remove(drone.group);drone.group.userData.dead=true;burst(drone.group.position,drone.heavy?0xffaf67:0x76eaff,13);}
  }
  drones=drones.filter(d=>!d.group.userData.dead);
  for(const p of steam){p.life+=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=(p.vy||.8)*dt;p.mesh.scale.multiplyScalar(1+dt*1.5);p.mesh.material.opacity=Math.max(0,.85*(1-p.life/p.duration));if(p.life>=p.duration){game.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();p.dead=true;}}
  steam=steam.filter(p=>!p.dead);const core=game.scene.children.find(o=>o.userData.core);if(core)core.rotation.y+=dt*.25;
  $('enemyValue').textContent=String(drones.length).padStart(2,'0');$('scoreValue').textContent=String(score).padStart(5,'0');$('waveValue').textContent=String(wave).padStart(2,'0');
  game.renderer.render(game.scene,game.camera);
}

function renderPreview(now){if(state==='menu'&&preview?.renderer){const dt=.016;if(preview.group){preview.group.rotation.y=Math.sin(now*.00025)*.22;preview.model.position.y=preview.model.userData.baseY+Math.sin(now*.0017)*.035;for(const p of preview.model.userData.wheelPivots||[])p.rotation.x+=dt*.8;}preview.renderer.render(preview.scene,preview.camera);}requestAnimationFrame(renderPreview)}
function pause(){if(state!=='playing')return;state='paused';$('pauseOverlay').classList.remove('hidden')}
function resume(){if(state!=='paused')return;state='playing';$('pauseOverlay').classList.add('hidden');clock.start();raf=requestAnimationFrame(frame)}
function home(){state='menu';cancelAnimationFrame(raf);if(game){game.controls.dispose();game.renderer.dispose();game.scene.clear();game=null}player=null;drones=[];steam=[];$('gameScreen').classList.add('hidden');$('startScreen').classList.remove('hidden');$('pauseOverlay').classList.add('hidden');$('resultOverlay').classList.add('hidden');$('bestScore').textContent=best().toLocaleString('en-US');$('startButton').disabled=false}

$('startButton').addEventListener('click',startGame);$('retryButton').addEventListener('click',startGame);$('resumeButton').addEventListener('click',resume);$('pauseButton').addEventListener('click',pause);$('quitButton').addEventListener('click',home);$('resultHomeButton').addEventListener('click',home);$('attackButton').addEventListener('pointerdown',e=>{e.preventDefault();ram(false)});$('dashButton').addEventListener('pointerdown',e=>{e.preventDefault();ram(true)});
addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){state==='playing'?pause():resume();return}keys.add(e.code);if(e.repeat)return;if(e.code==='Space')ram(false);if(e.code==='KeyQ'||e.code==='ShiftLeft'||e.code==='ShiftRight')ram(true)});addEventListener('keyup',e=>keys.delete(e.code));
const joystick=$('joystick'),stick=$('stick');joystick.addEventListener('pointerdown',e=>{joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e)});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)moveStick(e)});
function moveStick(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),s=Math.min(1,len/38);moveTouch={x:len?dx/len*s:0,y:len?dy/len*s:0};stick.style.transform=`translate(${moveTouch.x*34}px,${moveTouch.y*34}px)`}
function clearStick(){joystickPointer=null;moveTouch={x:0,y:0};stick.style.transform=''}joystick.addEventListener('pointerup',clearStick);joystick.addEventListener('pointercancel',clearStick);
addEventListener('resize',()=>{if(game){const w=$('gameCanvas').clientWidth,h=$('gameCanvas').clientHeight;game.camera.aspect=w/Math.max(1,h);game.camera.updateProjectionMatrix();game.renderer.setSize(w,h,false);game.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));game.controls.update()}if(preview){const c=$('heroCanvas');preview.camera.aspect=c.clientWidth/Math.max(1,c.clientHeight);preview.camera.updateProjectionMatrix();preview.renderer.setSize(c.clientWidth,c.clientHeight,false)}});
$('bestScore').textContent=best().toLocaleString('en-US');loadModel().catch(error=>{console.error('Thomas preview unavailable',error);$('assetStatus').textContent='ゲーム開始時にモデルを読み込みます';});requestAnimationFrame(renderPreview);
