import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const roster = [
  { id:'soldier', name:'SOLDIER', jp:'戦場の歩兵', role:'BALANCED / ALL-ROUNDER', meleeName:'クロススラッシュ', skillName:'閃光連斬', file:'/assets/soldier_human.glb', tint:0x77dff4 },
  { id:'super', name:'SUPER HUMAN', jp:'超人', role:'POWER / HEAVY HITTER', meleeName:'ヘヴィブレイカー', skillName:'メテオスマッシュ', file:'/assets/super_human.glb', tint:0xffb565 },
  { id:'thomas', name:'THOMAS', jp:'タンク機関車', role:'RAPID / MOBILE', meleeName:'ボイラーバッシュ', skillName:'サンダーチャージ', file:'/assets/thomas_the_tank_engine.glb', tint:0xcca1ff }
];
const loader = new GLTFLoader();
const cache = new Map(), loaded = new Map();
let chosen = roster[0].id, socket, selfId, scene, camera, renderer, clock, entities = new Map(), effects = [], running = false, yaw = 0;
let cameraYaw=0,cameraPitch=.28,cameraDistance=7.5,cameraDragging=false,lastPointerX=0,lastPointerY=0,meleeReadyAt=0,skillReadyAt=0;
const keys = new Set();
const $ = (id) => document.getElementById(id);
const lobby = $('lobby'), game = $('game'), loading = $('loading');
const updateBanner = $('updateBanner');
let localVersion = '0.0.0';
function versionParts(v) { return String(v).split('.').map(n => Number.parseInt(n, 10) || 0); }
function isNewer(a,b) { const x=versionParts(a), y=versionParts(b); for(let i=0;i<3;i++){if((x[i]||0)>(y[i]||0))return true;if((x[i]||0)<(y[i]||0))return false;}return false; }
async function checkForUpdates() {
  try {
    const local = await fetch('/version', {cache:'no-store'}); if(!local.ok) return;
    const {version,canSelfUpdate} = await local.json();
    if(localVersion && version!==localVersion && localVersion!=='0.0.0') { location.reload(); return; }
    localVersion=version;
    const remote = await fetch(`https://raw.githubusercontent.com/inei49984-ai/shatter-arena/main/package.json?t=${Date.now()}`, {cache:'no-store'});
    if(!remote.ok) return;
    const latest = await remote.json();
    if(isNewer(latest.version,localVersion) && canSelfUpdate) updateBanner.classList.remove('hidden');
  } catch { /* Keep the game usable when GitHub is offline. */ }
}
checkForUpdates(); setInterval(checkForUpdates, 5*60*1000);
$('dismissUpdate').addEventListener('click',()=>updateBanner.classList.add('hidden'));
$('copyAddress').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('networkAddress').textContent);$('copyAddress').textContent='コピーしました';setTimeout(()=>$('copyAddress').textContent='URLをコピー',1600);}catch{toast($('networkAddress').textContent);}});
fetch('/network',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.urls?.length){$('networkAddress').textContent=data.urls[0];$('networkShare').classList.remove('hidden');}}).catch(()=>{});
fetch('/updates.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('更新履歴を取得できません');return r.json();}).then(entries=>{
  const list=$('updateLogEntries'); list.replaceChildren();
  for(const entry of entries){const item=document.createElement('article');item.className='update-entry';const meta=document.createElement('span');meta.className='update-entry-meta';meta.textContent=`${entry.version} · ${entry.date}`;const copy=document.createElement('div');const title=document.createElement('b');title.textContent=entry.title;const summary=document.createElement('p');summary.textContent=entry.summary;copy.append(title,summary);item.append(meta,copy);list.append(item);}
}).catch(()=>{$('updateLogEntries').innerHTML='<p>更新履歴を読み込めませんでした。</p>';});
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) navigator.serviceWorker.register('/sw.js').catch(()=>{});
$('updateButton').addEventListener('click', async()=>{
  const button=$('updateButton'), message=$('updateMessage'); button.disabled=true; message.textContent='アップデートを取得・適用しています...';
  try {
    const response=await fetch('/update',{method:'POST'}), result=await response.json();
    if(!response.ok||!result.ok) throw new Error(result.error||'更新に失敗しました');
    message.textContent=`v${result.version} に更新しました。ゲームを再起動しています...`;
  } catch(error) { message.textContent=error.message||'更新に失敗しました'; button.disabled=false; }
});

function addLight(s) {
  s.add(new THREE.HemisphereLight(0xdbeeff, 0x263041, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-5, 11, 7); key.castShadow = true; key.shadow.mapSize.set(1024,1024); s.add(key);
  const rim = new THREE.PointLight(0x32c9ff, 18, 24); rim.position.set(6,4,-7); s.add(rim);
}
function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  root.scale.multiplyScalar(2.05 / maxDim);
  root.updateMatrixWorld(true);
  const centered = new THREE.Box3().setFromObject(root), center = centered.getCenter(new THREE.Vector3());
  root.position.x -= center.x; root.position.z -= center.z; root.position.y -= centered.min.y;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { o.material = o.material.clone(); o.material.roughness = Math.max(o.material.roughness ?? .7, .4); } } });
  return root;
}
async function loadModel(id) {
  if (!cache.has(id)) {
    const item = roster.find(x => x.id === id);
    cache.set(id, loader.loadAsync(item.file).then(g => { const model={ scene:g.scene, animations:g.animations }; loaded.set(id,model); return model; }).catch(err => { cache.delete(id); throw err; }));
  }
  return cache.get(id);
}
function cloneModel(id) { const base = loaded.get(id); return normalizeModel(cloneSkinned(base.scene)); }
function createAnimator(root, fighterId='soldier') {
  const mixer = new THREE.AnimationMixer(root), basePosition = root.position.clone();
  const baseQuaternion = root.quaternion.clone();
  const wheels=[];
  root.traverse(node=>{if(/wheel/i.test(node.name)){wheels.push({node,rotation:node.rotation.x});}});
  let wheelPhase=0, activeKind='';
  const clip = (name, times, offsets, rotations) => {
    const positions = offsets.flatMap(v => [basePosition.x+v[0],basePosition.y+v[1],basePosition.z+v[2]]);
    const quats = rotations.flatMap(v => { const q=baseQuaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0],v[1],v[2]))); return [q.x,q.y,q.z,q.w]; });
    return new THREE.AnimationClip(name,-1,[new THREE.VectorKeyframeTrack('.position',times,positions),new THREE.QuaternionKeyframeTrack('.quaternion',times,quats)]);
  };
  const styles={
    soldier:{ idle:[[0,0,0],[0,.018,0],[0,0,0]],idleLean:[0,.012,0],run:[[0,0,0],[0,.055,.035],[0,0,0],[0,.055,-.035],[0,0,0]],melee:[[0,0,0],[0,.025,.11],[0,0,.2],[0,-.015,.08],[0,0,0]],skill:[[0,0,0],[0,.015,.1],[0,.035,.2],[0,.015,.12],[0,0,0]] },
    super:{ idle:[[0,0,0],[0,.012,0],[0,0,0]],idleLean:[0,.008,0],run:[[0,0,0],[0,.09,.05],[0,-.015,0],[0,.09,-.05],[0,0,0]],melee:[[0,0,0],[.13,-.1,.12],[0,-.17,.22],[-.1,.02,.08],[0,0,0]],skill:[[0,0,0],[0,-.22,.08],[0,.65,.2],[0,.12,.48],[0,0,0]] },
    thomas:{ idle:[[0,0,0],[0,.018,0],[0,0,0]],idleLean:[0,.018,0],run:[[0,0,0],[0,.045,.06],[0,0,0],[0,.045,-.06],[0,0,0]],melee:[[0,0,0],[0,.08,.18],[0,-.05,.3],[0,.035,.12],[0,0,0]],skill:[[0,0,0],[0,-.04,.12],[0,.08,.42],[0,-.08,.36],[0,0,0]] }
  }[fighterId]||{idle:[[0,0,0],[0,.02,0],[0,0,0]],idleLean:[0,.01,0],run:[[0,0,0],[0,.07,.04],[0,0,0],[0,.07,-.04],[0,0,0]],melee:[[0,0,0],[0,.04,.2],[0,-.02,.11],[0,0,0],[0,0,0]],skill:[[0,0,0],[0,.1,.25],[0,.02,.58],[0,0,0],[0,0,0]]};
  const neutral=[0,0,0];
  const clips = {
    idle:clip('idle',[0,.5,1],styles.idle,[neutral,styles.idleLean||neutral,neutral]),
    run:clip('run',[0,.16,.32,.48,.64],styles.run,styles.run.map((_,i)=>[0,(i%2?.045:-.045),i%2?-.025:.025])),
    melee:clip('melee',[0,.12,.24,.38,.52],styles.melee,fighterId==='super'?[[0,0,0],[.12,0,-.18],[-.28,0,.12],[.1,0,.08],[0,0,0]]:fighterId==='thomas'?[[0,0,0],[-.08,0,0],[.16,0,0],[-.08,0,0],[0,0,0]]:[[0,0,0],[0,-.22,-.1],[0,.5,.12],[0,-.08,.04],[0,0,0]]),
    skill:clip('skill',[0,.16,.31,.48,.72],styles.skill,fighterId==='super'?[[0,0,0],[.2,0,0],[-.48,0,0],[.28,0,0],[0,0,0]]:fighterId==='thomas'?[[0,0,0],[-.04,0,0],[.12,0,0],[-.1,0,0],[0,0,0]]:[[0,0,0],[-.12,-.4,0],[0,1.8,0],[.06,3.6,0],[0,6.28,0]])
  };
  const actions = Object.fromEntries(Object.entries(clips).map(([name,c])=>[name,mixer.clipAction(c)]));
  let base=actions.idle, active=null, moving=false;
  base.setLoop(THREE.LoopRepeat,Infinity).play();
  const syncLocomotion = next => {
    moving=next;
    if(active)return;
    const target=next?actions.run:actions.idle; if(target===base)return;
    target.reset().play(); base.crossFadeTo(target,.18,false); base=target;
  };
  mixer.addEventListener('finished',event=>{
    if(event.action!==active)return;
    active.stop(); active=null; activeKind=''; base= moving?actions.run:actions.idle; base.reset().fadeIn(.12).play();
  });
  return {
    update(dt,isMoving){ syncLocomotion(isMoving); mixer.update(dt); if(isMoving||activeKind==='skill'){wheelPhase+=dt*(fighterId==='thomas'&&activeKind==='skill'?24:7);for(const wheel of wheels)wheel.node.rotation.x=wheel.rotation+wheelPhase;} },
    play(kind){
      if(active)active.stop();
      base.fadeOut(.06);
      activeKind=kind; active=actions[kind]||actions.melee; active.reset(); active.setLoop(THREE.LoopOnce,1); active.clampWhenFinished=true; active.fadeIn(.05).play();
    }
  };
}

// Lightweight, independently rendered model cards.
const cards = $('cards');
for (const item of roster) {
  const card = document.createElement('article'); card.className = `fighter${item.id===chosen?' selected':''}`; card.dataset.id = item.id;
  card.innerHTML = `<canvas></canvas><span class="pick">${item.id===chosen?'SELECTED':'SELECT'}</span><div class="fighter-info"><small>${item.role}</small><b>${item.name}</b><p>${item.jp}</p><span class="technique">必殺技 · ${item.skillName}</span></div>`;
  card.addEventListener('click', () => { chosen = item.id; document.querySelectorAll('.fighter').forEach(c => { const yes=c.dataset.id===chosen; c.classList.toggle('selected',yes); c.querySelector('.pick').textContent=yes?'SELECTED':'SELECT'; }); });
  cards.append(card);
  const canvas = card.querySelector('canvas');
  const r = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true }); r.setPixelRatio(Math.min(devicePixelRatio,1.5)); r.setSize(card.clientWidth,card.clientHeight,false); r.outputColorSpace=THREE.SRGBColorSpace;
  const s = new THREE.Scene(), c = new THREE.PerspectiveCamera(32, card.clientWidth/card.clientHeight, .1, 100); c.position.set(0,1.4,6.3); c.lookAt(0,1,0); addLight(s);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1,48),new THREE.MeshStandardMaterial({color:0x1a2b3b,roughness:.8})); floor.rotation.x=-Math.PI/2; floor.position.y=.015; s.add(floor);
  loadModel(item.id).then(() => { const m=cloneModel(item.id); m.rotation.y=-.2; m.userData.animator=createAnimator(m,item.id); s.add(m); card.dataset.ready='1'; }).catch(()=> { card.querySelector('.pick').textContent='MODEL ERROR'; });
  const preview = {r,s,c,card};
  let last=performance.now();
  const animate = () => { if (!document.body.contains(card)) { r.dispose(); return; } const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now; const fighter=s.children.find(o=>o.isGroup); if(fighter){fighter.rotation.y+=.003;fighter.userData.animator?.update(dt,false);} r.render(s,c); requestAnimationFrame(animate); };
  requestAnimationFrame(animate);
  new ResizeObserver(() => { const w=card.clientWidth,h=card.clientHeight; r.setSize(w,h,false); c.aspect=w/h; c.updateProjectionMatrix(); }).observe(card);
}

function arena() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x111b27); scene.fog = new THREE.Fog(0x111b27, 26, 58); addLight(scene);
  camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, .1, 100); renderer = new THREE.WebGLRenderer({canvas:$('world'),antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.8)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x192534,roughness:.92})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
  const grid = new THREE.GridHelper(40,40,0x31516a,0x25394b); grid.position.y=.012; scene.add(grid);
  const wallMat = new THREE.MeshStandardMaterial({color:0x26374a,roughness:.8});
  for(let i=-18;i<=18;i+=6) for(let j=-18;j<=18;j+=6) { if(Math.abs(i)<8&&Math.abs(j)<8) continue; const h=1+Math.random()*1.3; const box=new THREE.Mesh(new THREE.BoxGeometry(1.5,h,1.5),wallMat); box.position.set(i,h/2,j); box.castShadow=box.receiveShadow=true; scene.add(box); }
  const edgeMat = new THREE.MeshStandardMaterial({color:0x152335,emissive:0x071722});
  for(const [x,z,sx,sz] of [[0,-20,42,1],[0,20,42,1],[-20,0,1,42],[20,0,1,42]]) {const m=new THREE.Mesh(new THREE.BoxGeometry(sx,3,sz),edgeMat);m.position.set(x,1.5,z);scene.add(m);}
  clock = new THREE.Clock();
}
function makeEntity(id,p) {
  const group = new THREE.Group(); group.userData.id=id;
  let model;
  try { model=cloneModel(p.model); } catch { const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.4,.9,4,8),new THREE.MeshStandardMaterial({color:p.color})); model=new THREE.Group(); model.add(mesh); }
  group.add(model); group.position.set(p.x,0,p.z); group.rotation.y=p.yaw||0;
  const animator=createAnimator(model,p.model);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.52,.62,32),new THREE.MeshBasicMaterial({color:p.color,side:THREE.DoubleSide,transparent:true,opacity:.65}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;group.add(ring);
  const bar=new THREE.Group();bar.position.y=2.35;group.add(bar);
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.28),new THREE.MeshBasicMaterial({color:0x07101a,transparent:true,opacity:.82,side:THREE.DoubleSide}));bar.add(plate);
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(1.48,.11),new THREE.MeshBasicMaterial({color:p.color,side:THREE.DoubleSide}));fill.position.z=.01; bar.add(fill); bar.userData.fill=fill;
  scene.add(group); entities.set(id,{group,bar,fill,model,animator,p}); return entities.get(id);
}
function updatePlayers(state) {
  for(const [id,p] of Object.entries(state)) {
    let e=entities.get(id); if(!e) e=makeEntity(id,p);
    e.p={...e.p,...p}; if(id===selfId) continue;
    e.group.position.set(p.x,0,p.z); e.group.rotation.y=p.yaw||0; e.bar.lookAt(camera.position);
    e.fill.scale.x=Math.max(.01,p.hp/100); e.fill.position.x=-(1-p.hp/100)*.74;
  }
  for(const [id,e] of entities) if(!state[id]) { scene.remove(e.group); entities.delete(id); }
  $('playerList').innerHTML=Object.entries(state).map(([id,p])=>`<div class="player-row"><i class="dot" style="background:${p.color}"></i>${id===selfId?'YOU':escapeHtml(p.name)}<b>${String(p.score).padStart(2,'0')}</b></div>`).join('');
  const me=state[selfId]; if(me) { $('scoreText').textContent=String(me.score).padStart(2,'0'); $('healthText').textContent=me.hp; $('healthBar').style.width=me.hp+'%'; }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(text) { const el=$('toast'); el.textContent=text; el.classList.add('show'); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('show'),1800); }
function makeShot(x,z,angle,color=0x8ef0ff) {
  const from=new THREE.Vector3(x,.95,z), to=new THREE.Vector3(x+Math.sin(angle)*15,.95,z+Math.cos(angle)*15);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([from,to]),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));scene.add(line);effects.push({line,t:0});
}
function makeCombatFx(x,z,angle,type,fighterId='soldier') {
  const skill=type==='skill', group=new THREE.Group(), materials=[];
  const palette={soldier:[0x75eaff,0xf5fdff],super:[0xffa33f,0xffe997],thomas:[0xb38cff,0x7deaff]}[fighterId]||[0x75eaff,0xf5fdff];
  const add=(geometry,color,position,rotation=[0,0,0],scale=1)=>{const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false});materials.push(material);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.scale.setScalar(scale);group.add(mesh);return mesh;};
  const dist=fighterId==='super'?(skill?2.7:1.35):fighterId==='thomas'?(skill?2.2:1.15):(skill?1.9:1.05);
  group.position.set(x+Math.sin(angle)*dist,.08,z+Math.cos(angle)*dist);group.rotation.y=angle;
  if(fighterId==='soldier'){
    const cuts=skill?3:2;
    for(let i=0;i<cuts;i++){const slash=add(new THREE.TorusGeometry(skill?1.15:.78,.055,8,42,Math.PI*.78),i%2?palette[1]:palette[0],[0,1.02+i*.07,0],[Math.PI/2,0,-.55+i*.48],skill?1+i*.13:1);}
    if(skill){const flash=add(new THREE.OctahedronGeometry(.28,1),palette[1],[0,1.05,0],[0,0,0],1);flash.userData.flash=true;}
  } else if(fighterId==='super'){
    add(new THREE.TorusGeometry(skill?1.75:1.15,.16,10,48),palette[0],[0,.22,0],[0,0,0],.68);
    add(new THREE.TorusGeometry(skill?1.12:.72,.09,8,40),palette[1],[0,.28,0],[0,0,0],.8);
    if(skill)for(let i=0;i<8;i++){const a=i*Math.PI/4;const shard=add(new THREE.ConeGeometry(.11,.8,5),i%2?palette[0]:palette[1],[Math.sin(a)*.85,.12,Math.cos(a)*.85],[Math.PI/2,0,-a],1);}
  } else {
    const puffs=skill?7:4;
    for(let i=0;i<puffs;i++){const a=i*2.4;const puff=add(new THREE.SphereGeometry(skill?.25:.19,10,8),i%2?palette[0]:palette[1],[Math.sin(a)*.48,.65+(i%3)*.22,Math.cos(a)*.48],[0,0,0],.7+(i%3)*.12);puff.userData.puff=true;}
    add(new THREE.TorusGeometry(skill?1.42:.9,.085,8,40),palette[0],[0,.68,0],[Math.PI/2,0,0],.8);
    if(skill)add(new THREE.TorusGeometry(1.02,.045,8,36),palette[1],[0,.72,0],[Math.PI/2,0,0],.75);
  }
  scene.add(group);effects.push({group,materials,t:0,duration:skill?.82:.48,combat:true,fighterId,skill});
}
function performAttack(type) {
  if(!running||!socket)return;
  const now=performance.now(),readyAt=type==='skill'?skillReadyAt:meleeReadyAt;
  if(now<readyAt){toast(type==='skill'?'技はクールダウン中':'近接攻撃はクールダウン中');return;}
  const me=entities.get(selfId); if(!me)return;
  const cooldown=type==='skill'?6500:620;
  if(type==='skill')skillReadyAt=now+cooldown;else meleeReadyAt=now+cooldown;
  yaw=cameraYaw; me.group.rotation.y=yaw; me.animator.play(type);
  makeCombatFx(me.group.position.x,me.group.position.z,yaw,type,me.p.model);
  const fighter=roster.find(item=>item.id===me.p.model);toast(`${type==='skill'?fighter?.skillName:fighter?.meleeName}！`);
  socket.emit(type==='skill'?'skill':'melee',{yaw});
}
function frame() {
  if(!running)return; requestAnimationFrame(frame); const dt=Math.min(clock.getDelta(),.05), me=entities.get(selfId);
  if(me){
    yaw=cameraYaw; me.group.rotation.y=yaw;
    const speed=7.2; let f=0,s=0; if(keys.has('KeyW'))f++;if(keys.has('KeyS'))f--;if(keys.has('KeyD'))s++;if(keys.has('KeyA'))s--;
    if(f||s){const len=Math.hypot(f,s);f/=len;s/=len;me.group.position.x+= (Math.sin(yaw)*f-Math.cos(yaw)*s)*speed*dt;me.group.position.z+= (Math.cos(yaw)*f+Math.sin(yaw)*s)*speed*dt;me.group.position.x=THREE.MathUtils.clamp(me.group.position.x,-18.7,18.7);me.group.position.z=THREE.MathUtils.clamp(me.group.position.z,-18.7,18.7);me.group.rotation.y=yaw;}
    me.animator.update(dt,Boolean(f||s));
    me.bar.lookAt(camera.position);
    socket.emit('move',{x:me.group.position.x,z:me.group.position.z,yaw});
    const horizontal=cameraDistance*Math.cos(cameraPitch), target=new THREE.Vector3(me.group.position.x-Math.sin(cameraYaw)*horizontal,1.1+cameraDistance*Math.sin(cameraPitch),me.group.position.z-Math.cos(cameraYaw)*horizontal); camera.position.lerp(target,1-Math.exp(-dt*6)); camera.lookAt(me.group.position.x,1.05,me.group.position.z);
    const remaining=Math.max(0,skillReadyAt-performance.now()); $('skillCooldown').textContent=remaining>0?`Q ${ (remaining/1000).toFixed(1) }s`:'Q READY'; $('skillCooldown').classList.toggle('ready',remaining<=0);
  }
  const now=performance.now(); for(const [id,remote] of entities)if(id!==selfId){remote.animator.update(dt,remote.movingUntil>now);remote.bar.lookAt(camera.position);}
  for(const fx of effects){fx.t+=dt;if(fx.combat){const progress=Math.min(1,fx.t/fx.duration);fx.group.scale.setScalar(.35+progress*(fx.fighterId==='super'?1.75:1.1));fx.group.rotation.y+=dt*(fx.fighterId==='soldier'?9:fx.fighterId==='thomas'?2:0);for(const material of fx.materials)material.opacity=1-progress;if(fx.fighterId==='thomas')for(const puff of fx.group.children)if(puff.userData.puff){puff.position.y+=dt*(fx.skill?1.8:1.1);puff.scale.multiplyScalar(1+dt*.8);}if(progress>=1){scene.remove(fx.group);for(const child of fx.group.children)child.geometry.dispose();for(const material of fx.materials)material.dispose();}}else{fx.line.material.opacity=Math.max(0,1-fx.t/.18);if(fx.t>.18){scene.remove(fx.line);fx.line.geometry.dispose();fx.line.material.dispose();}}} effects=effects.filter(x=>x.combat?x.t<x.duration:x.t<=.18);
  renderer.render(scene,camera);
}
async function join() {
  $('joinBtn').disabled=true; $('joinBtn').textContent='接続中...'; loading.classList.remove('hidden');
  try { await loadModel(chosen); }
  catch(e){ console.error(e); toast('モデルを読み込めませんでした'); loading.classList.add('hidden'); $('joinBtn').disabled=false; $('joinBtn').innerHTML='アリーナに入る <span>→</span>'; return; }
  socket=io({autoConnect:false,timeout:10000});
  const resetJoin=()=>{loading.classList.add('hidden');$('joinBtn').disabled=false;$('joinBtn').innerHTML='アリーナに入る <span>→</span>';};
  let joinSent=false;
  socket.on('connect',()=>{if(joinSent)return;joinSent=true;socket.timeout(10000).emit('join',{model:chosen,name:$('playerName').value,room:$('roomCode').value},(err,res)=>{
    if(err||!res?.ok){toast(res?.error||(err?'サーバーの応答がタイムアウトしました':'接続に失敗しました'));socket.disconnect();resetJoin();return;}
    selfId=res.id; $('roomLabel').textContent=res.code; lobby.classList.add('hidden'); game.classList.remove('hidden');loading.classList.add('hidden'); arena(); yaw=0;cameraYaw=0;cameraPitch=.28;cameraDistance=7.5;meleeReadyAt=0;skillReadyAt=0;running=true;
    socket.on('state',updatePlayers); socket.on('move',p=>{const e=entities.get(p.id);if(e){e.group.position.set(p.x,0,p.z);e.group.rotation.y=p.yaw;e.movingUntil=performance.now()+140;}});
    socket.on('feed',toast); socket.on('shot',p=>makeShot(p.x,p.z,p.yaw,0xffc36a)); socket.on('hit',p=>{if(p.to===selfId)toast('被弾！');if(p.from===selfId)toast('HIT!');});
    socket.on('combat',data=>{const e=entities.get(data.id);if(e){e.group.rotation.y=data.yaw;e.animator.play(data.type);makeCombatFx(e.group.position.x,e.group.position.z,data.yaw,data.type,e.p.model);}if(data.hitIds?.includes(selfId))toast(data.type==='skill'?'専用技を受けた！':'近接攻撃を受けた！');}); frame();
    socket.on('combatResult',result=>{if(result.hitIds?.length)toast(result.type==='skill'?'衝撃波 HIT!':'近接 HIT!');});
  });});
  socket.on('connect_error',()=>{toast('サーバーに接続できません。サーバー画面で npm.cmd start が動いているか確認してください');socket.disconnect();resetJoin();});
  socket.connect();
}
function leave(){running=false;if(socket){socket.disconnect();socket=null;}if(renderer){renderer.dispose();renderer=null;}entities.clear();effects=[];game.classList.add('hidden');lobby.classList.remove('hidden');$('joinBtn').disabled=false;$('joinBtn').innerHTML='アリーナに入る <span>→</span>';document.exitPointerLock?.();}
$('joinBtn').addEventListener('click',join); $('leaveBtn').addEventListener('click',leave);
$('copyRoom').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('roomLabel').textContent);toast('部屋コードをコピーしました');}catch{toast($('roomLabel').textContent);}});
window.addEventListener('keyup',e=>keys.delete(e.code));
const worldCanvas=$('world');
worldCanvas.addEventListener('pointerdown',e=>{if(e.button===2&&running){cameraDragging=true;lastPointerX=e.clientX;lastPointerY=e.clientY;e.preventDefault();}});
window.addEventListener('pointerup',()=>{cameraDragging=false;});
worldCanvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('pointermove',e=>{if(!cameraDragging)return;cameraYaw-=(e.clientX-lastPointerX)*.006;cameraPitch=THREE.MathUtils.clamp(cameraPitch-(e.clientY-lastPointerY)*.004,.12,.82);lastPointerX=e.clientX;lastPointerY=e.clientY;});
worldCanvas.addEventListener('wheel',e=>{if(!running)return;e.preventDefault();cameraDistance=THREE.MathUtils.clamp(cameraDistance+Math.sign(e.deltaY)*.7,4.5,12);},{passive:false});
worldCanvas.addEventListener('click',e=>{if(e.button===0)performAttack('melee');});
window.addEventListener('keydown',e=>{if(e.repeat)return;keys.add(e.code);if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(e.code==='KeyF')performAttack('melee');if(e.code==='KeyQ')performAttack('skill');});
window.addEventListener('resize',()=>{if(renderer&&camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}});
