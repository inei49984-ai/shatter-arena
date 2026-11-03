import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const MODEL_URL = '/assets/thomas_the_tank_engine.glb';
const loader = new GLTFLoader();
const keys = new Set();
const clock = new THREE.Clock();
let sourceModel = null, modelPromise = null, game = null, raf = 0, state = 'lobby';
let elapsed = 0, score = 0, wave = 1, health = 100, spawnIn = 1, ramCooldown = 0, whistleCooldown = 0, whistleTime = 0, damageCooldown = 0, steamTimer = 0;
let player = null, drones = [], steam = [], arenaRadius = 18, moveTouch = { x: 0, y: 0 }, joystickPointer = null;
let deviceKey = '', profile = null, lobbyPollTimer = 0;
const clamp = THREE.MathUtils.clamp;
const rand = (a,b) => a + Math.random() * (b-a);

function makeThomasFallback(){
  const train=new THREE.Group();train.userData.baseY=0;train.userData.wheelPivots=[];
  const blue=new THREE.MeshStandardMaterial({color:0x245b96,roughness:.72}),red=new THREE.MeshStandardMaterial({color:0xa23c33,roughness:.78}),black=new THREE.MeshStandardMaterial({color:0x272b2d,roughness:.83}),metal=new THREE.MeshStandardMaterial({color:0x777c7c,metalness:.3,roughness:.58}),faceMat=new THREE.MeshStandardMaterial({color:0xe1d7bd,roughness:.88}),white=new THREE.MeshStandardMaterial({color:0xf0eee5,roughness:.65});
  const box=(w,h,d,mat,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;train.add(m);return m};
  box(1.24,.24,2.35,red,0,.58,0);
  box(.98,.97,.87,blue,0,1.25,-.62);box(1.12,.12,.98,red,0,1.79,-.62);
  const boiler=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,1.55,24),blue);boiler.rotation.x=Math.PI/2;boiler.position.set(0,1.25,.37);boiler.castShadow=true;train.add(boiler);
  const nose=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.12,24),metal);nose.rotation.x=Math.PI/2;nose.position.set(0,1.25,1.17);train.add(nose);
  const face=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.08,24),faceMat);face.rotation.x=Math.PI/2;face.position.set(0,1.25,1.245);train.add(face);
  for(const side of [-1,1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.065,12,10),black);eye.position.set(side*.13,1.32,1.31);train.add(eye);
    const wheelPivot=new THREE.Group();wheelPivot.position.set(side*.59,.36,-.74);const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.13,20),black);wheel.rotation.z=Math.PI/2;wheel.castShadow=true;wheelPivot.add(wheel);train.add(wheelPivot);train.userData.wheelPivots.push(wheelPivot);
    const wheel2=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.13,20),black);wheel2.rotation.z=Math.PI/2;wheel2.position.set(side*.59,.36,0);train.add(wheel2);train.userData.wheelPivots.push(wheel2);
    const wheel3=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.13,20),black);wheel3.rotation.z=Math.PI/2;wheel3.position.set(side*.59,.36,.74);train.add(wheel3);train.userData.wheelPivots.push(wheel3);
    const rod=box(.055,.075,1.35,metal,side*.67,.36,0);rod.name='fallbackRod';
  }
  const chimney=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,.42,14),black);chimney.position.set(0,1.98,.78);train.add(chimney);
  const chimneyLip=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.08,14),red);chimneyLip.position.set(0,2.2,.78);train.add(chimneyLip);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(.19,16,12),new THREE.MeshStandardMaterial({color:0xb79a64,metalness:.26,roughness:.5}));dome.position.set(0,1.72,.12);train.add(dome);
  const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.1,16),white);lamp.rotation.x=Math.PI/2;lamp.position.set(0,1.78,1.08);train.add(lamp);
  const bumper=box(.72,.15,.16,black,0,.52,1.25);
  train.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  train.userData.rodGroup=train.children.find(o=>o.name==='fallbackRod')||null;
  return train;
}

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
  scene.add(new THREE.HemisphereLight(0xe7f0f1,0x596258,2.2));
  const key = new THREE.DirectionalLight(0xfff2d7,3.1); key.position.set(-8,16,9); scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6e2e7,.85); fill.position.set(8,8,-7); scene.add(fill);
}

function buildArena(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:0x6f7d68,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.3;ground.receiveShadow=true;scene.add(ground);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(arenaRadius,96),new THREE.MeshStandardMaterial({color:0x777a72,metalness:.04,roughness:.92}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.13; floor.receiveShadow=true; scene.add(floor);
  const grid = new THREE.GridHelper(arenaRadius*2,24,0x777b72,0x85877e); grid.position.y=-.115;
  grid.material.transparent=true; grid.material.opacity=.2; scene.add(grid);
  for (const [r,t,c,o] of [[arenaRadius,.12,0xd8c69f,.82],[arenaRadius-1.1,.035,0x8c8a7e,.55],[arenaRadius*.47,.04,0x9c9382,.34]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r,t,8,144),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o}));
    ring.rotation.x=Math.PI/2; ring.position.y=-.05; scene.add(ring);
  }
  const postMat = new THREE.MeshStandardMaterial({color:0x77766c,metalness:.12,roughness:.8});
  const postGlow = new THREE.MeshStandardMaterial({color:0xd0a65e,roughness:.68});
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,x=Math.sin(a)*(arenaRadius-.4),z=Math.cos(a)*(arenaRadius-.4);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.19,.27,2.8,8),postMat);post.position.set(x,1.25,z);scene.add(post);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.27,10,8),postGlow);cap.position.set(x,2.62,z);scene.add(cap);
  }
  const core=new THREE.Group(); core.position.y=.12; core.userData.core=true;
  const crystal=new THREE.Mesh(new THREE.CylinderGeometry(.38,.58,1.6,8),new THREE.MeshStandardMaterial({color:0x9a8d74,roughness:.83}));crystal.position.y=.8;core.add(crystal);
  const coreRing=new THREE.Mesh(new THREE.TorusGeometry(1.8,.035,8,48),new THREE.MeshBasicMaterial({color:0xc6b48f,transparent:true,opacity:.45}));coreRing.rotation.x=Math.PI/2;coreRing.position.y=.15;core.add(coreRing);scene.add(core);
  for(let i=0;i<28;i++){
    const a=i*Math.PI*2/28,r=arenaRadius*.78, pebble=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.08),new THREE.MeshBasicMaterial({color:i%2?0xb5a989:0x9a9587,transparent:true,opacity:.55}));
    pebble.position.set(Math.cos(a)*r,.05,Math.sin(a)*r); scene.add(pebble);
  }
}

function makeScene(canvas) {
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x91a3aa); scene.fog=new THREE.Fog(0x91a3aa,48,100); makeLights(scene);
  const viewW=canvas.clientWidth||innerWidth,viewH=canvas.clientHeight||innerHeight;
  const camera=new THREE.PerspectiveCamera(58,viewW/Math.max(1,viewH),.1,180);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); renderer.setSize(viewW,viewH,false); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.08;
  buildArena(scene);camera.position.set(0,8,12);camera.lookAt(0,0,0);
  return {scene,camera,renderer};
}

function createPlayer() {
  const group=new THREE.Group(); group.position.set(0,0,7); group.userData.actor=true;
  const model=sourceModel?configureModel(cloneSkinned(sourceModel)):makeThomasFallback(); group.add(model); game.scene.add(group);
  return {group,model,vx:0,vz:0,yaw:Math.PI,walk:0,bob:0};
}

function upgradePlayerModel(){
  if(!player||!sourceModel||player.model.userData.fromAsset)return;
  const old=player.model,model=configureModel(cloneSkinned(sourceModel));model.userData.fromAsset=true;
  player.group.remove(old);old.traverse(node=>{if(node.isMesh){node.geometry.dispose();for(const mat of (Array.isArray(node.material)?node.material:[node.material]))mat?.dispose()}});
  player.group.add(model);player.model=model;
}

function makeDrone() {
  const a=Math.random()*Math.PI*2, r=arenaRadius+rand(1,4), x=Math.sin(a)*r,z=Math.cos(a)*r;
  const heavy=wave>=3&&Math.random()<Math.min(.12+wave*.03,.38), fast=!heavy&&wave>=2&&Math.random()<.32;
  const group=new THREE.Group();group.position.set(x,rand(1.2,2.8),z);group.userData.actor=true;
  const color=heavy?0xc66b3b:fast?0xb94f48:0x8f8063;
  const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(heavy?.78:.48,1),new THREE.MeshStandardMaterial({color:heavy?0x655246:0x596167,metalness:.24,roughness:.62}));shell.castShadow=true;group.add(shell);
  const eye=new THREE.Mesh(new THREE.SphereGeometry(heavy?.19:.13,12,10),new THREE.MeshStandardMaterial({color,roughness:.48}));eye.position.set(0,.02,.43);group.add(eye);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(heavy?.82:.58,.035,6,32),new THREE.MeshStandardMaterial({color,roughness:.6}));ring.rotation.x=Math.PI/2;group.add(ring);
  const hp=heavy?4:fast?1:2;game.scene.add(group);
  return {group,shell,ring,hp,maxHp:hp,heavy,fast,speed:(heavy?2.25:fast?4.5:3.1)+Math.min(wave*.12,1.25),stun:0,hitFlash:0,phase:Math.random()*7};
}

function puffSteam() {
  if(!player)return;
  const p=new THREE.Vector3(.03,2.55,.95).applyMatrix4(player.group.matrixWorld);
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(rand(.09,.16),8,7),new THREE.MeshBasicMaterial({color:0xe1e1dc,transparent:true,opacity:.48,depthWrite:false}));
  mesh.position.copy(p);game.scene.add(mesh);steam.push({mesh,life:0,duration:rand(.55,.9),vx:rand(-.24,.24),vz:rand(-.25,.25)});
}

async function loadModel() {
  if(sourceModel)return sourceModel;
  if(modelPromise)return modelPromise;
  modelPromise=loader.loadAsync(MODEL_URL).then(gltf=>{sourceModel=gltf.scene;sourceModel.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});upgradePlayerModel();$('modelStatus').textContent='Thomas 3D';return sourceModel;
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
  game.controls.addEventListener('change',()=>{if((state==='playing'||state==='lobby')&&player)game.focusOffset.copy(game.controls.target).sub(player.group.position)});
  player=createPlayer();player.group.position.set(0,0,0);player.yaw=0;game.camera.position.set(0,8,13);game.controls.target.set(0,1,0);drones=[];steam=[];elapsed=0;score=0;wave=1;health=100;spawnIn=1;ramCooldown=0;whistleCooldown=0;whistleTime=0;damageCooldown=0;steamTimer=0;
  updateHud();state='menu';
}

function startGame() {
  if(state==='lobby')return;if(!profile){openProfile();return}
  keys.clear();moveTouch={x:0,y:0};
  for(const particle of steam){game.scene.remove(particle.mesh);particle.mesh.geometry.dispose();particle.mesh.material.dispose()}steam=[];
  player.group.position.set(0,0,0);player.group.rotation.y=0;player.yaw=0;player.vx=0;player.vz=0;player.bob=0;game.focusOffset.set(0,1,0);game.controls.target.set(0,1,0);
  $('lobbyScreen').classList.add('hidden');$('gameScreen').classList.add('playing');state='lobby';clock.start();toast('W A S D または左スティックで移動');
}

function best(){return Number(localStorage.getItem('shatterArenaBest')||0)}
function updateHud(){
  $('waveValue').textContent=String(wave).padStart(2,'0');$('scoreValue').textContent=String(score).padStart(5,'0');$('enemyValue').textContent=String(drones.length).padStart(2,'0');
  $('healthBar').style.width=`${health}%`;$('healthValue').textContent=`${health}%`;
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove('show'),1600)}
function burst(position,color=0xcfc4a5,count=10){
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
    burst(drone.group.position,drone.heavy?0xc9844c:0xb8afa0,8);
    if(drone.hp<=0){score+=drone.heavy?60:drone.fast?25:35;game.scene.remove(drone.group);drone.group.userData.dead=true;}
  }
  if(hits)toast(special?'汽笛ショックウェーブ！':'ボイラーバッシュ！');
}

function damage(amount){if(damageCooldown>0)return;damageCooldown=.6;health=Math.max(0,health-amount);$('healthBar').style.width=`${health}%`;$('healthValue').textContent=`${health}%`;if(health<=0)finish();}
function finish(){if(state!=='playing')return;state='over';const old=best();if(score>old)localStorage.setItem('shatterArenaBest',String(score));$('resultEyebrow').textContent=score>old?'NEW RECORD // SAVED':'RUN COMPLETE';$('resultTitle').textContent='ENGINE STOPPED';$('resultCopy').textContent=`WAVE ${wave} でトーマスの機関が停止した。`; $('finalScore').textContent=String(score).padStart(5,'0');$('resultOverlay').classList.remove('hidden');}

function frame(){
  if(!game)return;raf=requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.045);
  if(state==='menu'&&player){player.model.position.y=player.model.userData.baseY+Math.sin(clock.elapsedTime*1.4)*.012;player.group.rotation.y=Math.sin(clock.elapsedTime*.35)*.035;}
  if(state==='lobby'){
    if(player&&profile){
      const ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+moveTouch.x;
      const iz=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+moveTouch.y;
      const forward=new THREE.Vector3(player.group.position.x-game.camera.position.x,0,player.group.position.z-game.camera.position.z).normalize();
      const right=new THREE.Vector3(-forward.z,0,forward.x),direction=right.multiplyScalar(ix).add(forward.multiplyScalar(-iz));
      if(direction.lengthSq()>1)direction.normalize();
      const moving=direction.lengthSq()>.04;
      player.vx+=direction.x*6.4*dt*4.2;player.vz+=direction.z*6.4*dt*4.2;
      const drag=Math.exp(-(moving?2.3:4.5)*dt);player.vx*=drag;player.vz*=drag;
      const speed=Math.hypot(player.vx,player.vz);if(speed>6.1){player.vx*=6.1/speed;player.vz*=6.1/speed;}
      player.group.position.x=clamp(player.group.position.x+player.vx*dt,-arenaRadius+1,arenaRadius-1);
      player.group.position.z=clamp(player.group.position.z+player.vz*dt,-arenaRadius+1,arenaRadius-1);
      const actualSpeed=Math.hypot(player.vx,player.vz);
      if(actualSpeed>.2){const desired=Math.atan2(player.vx,player.vz);let diff=Math.atan2(Math.sin(desired-player.yaw),Math.cos(desired-player.yaw));player.yaw+=diff*(1-Math.exp(-dt*9));player.group.rotation.y=player.yaw;}
      player.walk+=actualSpeed*dt*2.9;player.bob+=(Math.sin(player.walk*2)*.035-player.bob)*(1-Math.exp(-dt*7));
      player.model.position.y=player.model.userData.baseY+player.bob;
      if(player.model.userData.rodGroup)player.model.userData.rodGroup.rotation.x=Math.sin(player.walk)*.055*Math.min(1,actualSpeed);
      for(const pivot of player.model.userData.wheelPivots||[])pivot.rotation.x+=actualSpeed*.72*dt;
      game.controls.target.set(player.group.position.x+game.focusOffset.x,player.group.position.y+game.focusOffset.y+player.bob,player.group.position.z+game.focusOffset.z);
      steamTimer-=dt;if(actualSpeed>1.3&&steamTimer<=0){puffSteam();steamTimer=.28;}
    }
    for(const p of steam){p.life+=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=(p.vy||.8)*dt;p.mesh.scale.multiplyScalar(1+dt*1.5);p.mesh.material.opacity=Math.max(0,.48*(1-p.life/p.duration));if(p.life>=p.duration){game.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();p.dead=true;}}
    steam=steam.filter(p=>!p.dead);
    game.controls.update();game.renderer.render(game.scene,game.camera);return;
  }
  if(state!=='playing'){game.renderer.render(game.scene,game.camera);return}elapsed+=dt;
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
    const d=Math.hypot(drone.group.position.x,drone.group.position.z);if(d>arenaRadius+.8){score+=drone.heavy?60:drone.fast?25:35;game.scene.remove(drone.group);drone.group.userData.dead=true;burst(drone.group.position,drone.heavy?0xc9844c:0xb8afa0,13);}
  }
  drones=drones.filter(d=>!d.group.userData.dead);
  for(const p of steam){p.life+=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=(p.vy||.8)*dt;p.mesh.scale.multiplyScalar(1+dt*1.5);p.mesh.material.opacity=Math.max(0,.85*(1-p.life/p.duration));if(p.life>=p.duration){game.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();p.dead=true;}}
  steam=steam.filter(p=>!p.dead);const core=game.scene.children.find(o=>o.userData.core);if(core)core.rotation.y+=dt*.25;
  $('enemyValue').textContent=String(drones.length).padStart(2,'0');$('scoreValue').textContent=String(score).padStart(5,'0');$('waveValue').textContent=String(wave).padStart(2,'0');
  game.renderer.render(game.scene,game.camera);
}

function pause(){if(state!=='playing')return;state='paused';$('pauseOverlay').classList.remove('hidden')}
function resume(){if(state!=='paused')return;state='playing';$('pauseOverlay').classList.add('hidden');clock.start()}
function returnToLobby(){
  for(const drone of drones)game.scene.remove(drone.group);for(const p of steam){game.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose()}drones=[];steam=[];
  state='menu';$('gameScreen').classList.remove('playing');$('lobbyScreen').classList.remove('hidden');$('pauseOverlay').classList.add('hidden');$('resultOverlay').classList.add('hidden');
  player.group.position.set(0,0,0);player.vx=0;player.vz=0;game.focusOffset.set(0,1,0);game.controls.target.set(0,1,0);clock.start();
}

function getDeviceKey(){let key=localStorage.getItem('shatterArenaDeviceKey');if(!key){key=crypto.randomUUID();localStorage.setItem('shatterArenaDeviceKey',key)}return key}
function readSavedProfile(){try{return JSON.parse(localStorage.getItem('shatterArenaProfile')||'null')}catch{return null}}
function saveLocalProfile(value){profile=value;localStorage.setItem('shatterArenaProfile',JSON.stringify(value));$('lobbyName').textContent=value.name;$('lobbyId').textContent=`@${value.id}`;$('myId').textContent=`@${value.id}`;$('profileDot').classList.remove('offline')}
function openProfile(message=''){
  const saved=profile||readSavedProfile(),suffix=String(Math.floor(1000+Math.random()*9000));
  $('nameInput').value=saved?.name||`Player${suffix}`;$('playerIdInput').value=saved?.id||`Player_${suffix}`;$('profileMessage').textContent=message;$('profileModal').classList.remove('hidden');
}
async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},cache:'no-store'});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok){const error=new Error(data.error||`通信エラー (${response.status})`);error.status=response.status;throw error}return data;
}
async function registerProfile(name,id){return api('/api/profile',{method:'POST',body:JSON.stringify({deviceKey,name,id})})}
async function initializeProfile(){
  deviceKey=getDeviceKey();const saved=readSavedProfile();
  if(saved?.name&&saved?.id){try{const result=await registerProfile(saved.name,saved.id);saveLocalProfile(result.profile);void refreshFriends();return}catch(error){openProfile(error.status===409?error.message:'プロフィールをサーバーへ接続できません。名前とIDはこの端末に保存されています。');return}}
  openProfile();
}
async function submitProfile(event){
  event.preventDefault();const name=$('nameInput').value.trim(),id=$('playerIdInput').value.trim();$('profileMessage').textContent='確認中...';
  try{const result=await registerProfile(name,id);saveLocalProfile(result.profile);$('profileModal').classList.add('hidden');$('friendMessage').textContent='';void refreshFriends();}
  catch(error){if(error.status&&error.status!==409){$('profileMessage').textContent=error.message;return}if(error.status===409){$('profileMessage').textContent=error.message;return}
    const normalizedId=id;if(!/^[a-z0-9_]{3,16}$/i.test(normalizedId)||Array.from(name).length<2||Array.from(name).length>16){$('profileMessage').textContent='名前は2〜16文字、IDは英数字と _ の3〜16文字です。';return}
    saveLocalProfile({name,id});$('profileModal').classList.add('hidden');toast('サーバーに接続できません。フレンド機能は一時停止中です。');
  }
}
function renderFriends(friends){
  const list=$('friendList');list.replaceChildren();$('friendCount').textContent=`${friends.filter(f=>f.online).length} ONLINE`;
  if(!friends.length){const li=document.createElement('li');li.className='empty-friends';li.textContent='IDを入力してフレンドを追加';list.append(li);return}
  for(const friend of friends){const li=document.createElement('li');li.className='friend-row';const dot=document.createElement('i');dot.className=`profile-dot${friend.online?'':' offline'}`;const details=document.createElement('span');details.className='friend-details';const name=document.createElement('b');name.textContent=friend.name;const id=document.createElement('small');id.textContent=`@${friend.id} · ${friend.online?'オンライン':'オフライン'}`;details.append(name,id);const remove=document.createElement('button');remove.className='friend-remove';remove.type='button';remove.dataset.removeFriend=friend.id;remove.textContent='削除';li.append(dot,details,remove);list.append(li)}
}
async function refreshFriends(){
  if(!deviceKey||!profile)return;
  try{const result=await api(`/api/lobby/${encodeURIComponent(deviceKey)}`);saveLocalProfile(result.profile);renderFriends(result.friends)}
  catch(error){if(error.status===404){try{const result=await registerProfile(profile.name,profile.id);saveLocalProfile(result.profile);return}catch(conflict){$('friendMessage').textContent=conflict.message;return}}$('friendMessage').textContent='フレンド情報に接続できません。'}
}
async function addFriend(event){
  event.preventDefault();const input=$('friendIdInput'),friendId=input.value.trim();if(!friendId)return;
  try{const result=await api('/api/friends',{method:'POST',body:JSON.stringify({deviceKey,friendId})});input.value='';$('friendMessage').textContent=`${result.friend.name} を追加しました。`;await refreshFriends()}
  catch(error){$('friendMessage').textContent=error.message}
}
async function removeFriend(friendId){
  try{await api(`/api/friends/${encodeURIComponent(friendId)}`,{method:'DELETE',body:JSON.stringify({deviceKey})});$('friendMessage').textContent='フレンドを削除しました。';await refreshFriends()}
  catch(error){$('friendMessage').textContent=error.message}
}
async function copyMyId(){if(!profile)return;try{await navigator.clipboard.writeText(`@${profile.id}`);$('friendMessage').textContent='IDをコピーしました。'}catch{$('friendMessage').textContent=`あなたのID: @${profile.id}`}}
function boot(){
  try{setupGame();$('modelStatus').textContent='Thomasの3Dモデルを準備中';clock.start();raf=requestAnimationFrame(frame);void loadModel().catch(error=>{console.error('Thomas model unavailable; keeping the built-in 3D engine',error);$('modelStatus').textContent='簡易モデルで表示中'});}
  catch(error){console.error('3D scene could not start',error);$('modelStatus').textContent='3D画面を起動できません。WebGL対応ブラウザーを使ってください。';}
  void initializeProfile();
}

$('playButton').addEventListener('click',startGame);$('editProfileButton').addEventListener('click',()=>openProfile());$('profileForm').addEventListener('submit',submitProfile);$('closeProfileButton').addEventListener('click',()=>$('profileModal').classList.add('hidden'));$('addFriendForm').addEventListener('submit',addFriend);$('friendList').addEventListener('click',event=>{const button=event.target.closest('[data-remove-friend]');if(button)void removeFriend(button.dataset.removeFriend)});$('copyIdButton').addEventListener('click',copyMyId);$('pauseButton').addEventListener('click',returnToLobby);
addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'&&state==='lobby'){returnToLobby();return}keys.add(e.code)});addEventListener('keyup',e=>keys.delete(e.code));
setInterval(()=>void refreshFriends(),15000);
const joystick=$('joystick'),stick=$('stick');joystick.addEventListener('pointerdown',e=>{joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e)});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)moveStick(e)});
function moveStick(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),s=Math.min(1,len/38);moveTouch={x:len?dx/len*s:0,y:len?dy/len*s:0};stick.style.transform=`translate(${moveTouch.x*34}px,${moveTouch.y*34}px)`}
function clearStick(){joystickPointer=null;moveTouch={x:0,y:0};stick.style.transform=''}joystick.addEventListener('pointerup',clearStick);joystick.addEventListener('pointercancel',clearStick);
addEventListener('resize',()=>{if(game){const w=$('gameCanvas').clientWidth||innerWidth,h=$('gameCanvas').clientHeight||innerHeight;game.camera.aspect=w/Math.max(1,h);game.camera.updateProjectionMatrix();game.renderer.setSize(w,h,false);game.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));game.controls.update()}});
boot();
