import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const roster = [
  { id:'soldier', name:'SOLDIER', jp:'戦場の歩兵', role:'BALANCED / ALL-ROUNDER', file:'/assets/soldier_human.glb', tint:0x77dff4 },
  { id:'super', name:'SUPER HUMAN', jp:'超人', role:'POWER / HEAVY HITTER', file:'/assets/super_human.glb', tint:0xffb565 },
  { id:'thomas', name:'THOMAS', jp:'タンク機関車', role:'RAPID / MOBILE', file:'/assets/thomas_the_tank_engine.glb', tint:0xcca1ff }
];
const loader = new GLTFLoader();
const cache = new Map(), loaded = new Map();
let chosen = roster[0].id, socket, selfId, scene, camera, renderer, clock, entities = new Map(), effects = [], running = false, yaw = 0;
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
    const {version} = await local.json();
    if(localVersion && version!==localVersion && localVersion!=='0.0.0') { location.reload(); return; }
    localVersion=version;
    const remote = await fetch(`https://raw.githubusercontent.com/inei49984-ai/shatter-arena/main/package.json?t=${Date.now()}`, {cache:'no-store'});
    if(!remote.ok) return;
    const latest = await remote.json(); if(isNewer(latest.version,localVersion)) updateBanner.classList.remove('hidden');
  } catch { /* Keep the game usable when GitHub is offline. */ }
}
checkForUpdates(); setInterval(checkForUpdates, 5*60*1000);
$('dismissUpdate').addEventListener('click',()=>updateBanner.classList.add('hidden'));

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

// Lightweight, independently rendered model cards.
const cards = $('cards');
for (const item of roster) {
  const card = document.createElement('article'); card.className = `fighter${item.id===chosen?' selected':''}`; card.dataset.id = item.id;
  card.innerHTML = `<canvas></canvas><span class="pick">${item.id===chosen?'SELECTED':'SELECT'}</span><div class="fighter-info"><small>${item.role}</small><b>${item.name}</b><p>${item.jp}</p></div>`;
  card.addEventListener('click', () => { chosen = item.id; document.querySelectorAll('.fighter').forEach(c => { const yes=c.dataset.id===chosen; c.classList.toggle('selected',yes); c.querySelector('.pick').textContent=yes?'SELECTED':'SELECT'; }); });
  cards.append(card);
  const canvas = card.querySelector('canvas');
  const r = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true }); r.setPixelRatio(Math.min(devicePixelRatio,1.5)); r.setSize(card.clientWidth,card.clientHeight,false); r.outputColorSpace=THREE.SRGBColorSpace;
  const s = new THREE.Scene(), c = new THREE.PerspectiveCamera(32, card.clientWidth/card.clientHeight, .1, 100); c.position.set(0,1.4,6.3); c.lookAt(0,1,0); addLight(s);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1,48),new THREE.MeshStandardMaterial({color:0x1a2b3b,roughness:.8})); floor.rotation.x=-Math.PI/2; floor.position.y=.015; s.add(floor);
  loadModel(item.id).then(() => { const m=cloneModel(item.id); m.rotation.y=-.2; s.add(m); card.dataset.ready='1'; }).catch(()=> { card.querySelector('.pick').textContent='MODEL ERROR'; });
  const preview = {r,s,c,card};
  const animate = () => { if (!document.body.contains(card)) { r.dispose(); return; } const m=s.children.find(o=>o.userData?.fighter); const fighter=s.children.find(o=>o.isGroup); if(fighter && card.dataset.id!==chosen) fighter.rotation.y += .002; if(fighter && card.dataset.id===chosen) fighter.rotation.y += .003; r.render(s,c); requestAnimationFrame(animate); };
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
  const ring=new THREE.Mesh(new THREE.RingGeometry(.52,.62,32),new THREE.MeshBasicMaterial({color:p.color,side:THREE.DoubleSide,transparent:true,opacity:.65}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;group.add(ring);
  const bar=new THREE.Group();bar.position.y=2.35;group.add(bar);
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.28),new THREE.MeshBasicMaterial({color:0x07101a,transparent:true,opacity:.82,side:THREE.DoubleSide}));bar.add(plate);
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(1.48,.11),new THREE.MeshBasicMaterial({color:p.color,side:THREE.DoubleSide}));fill.position.z=.01; bar.add(fill); bar.userData.fill=fill;
  scene.add(group); entities.set(id,{group,bar,fill,model,p}); return entities.get(id);
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
function frame() {
  if(!running)return; requestAnimationFrame(frame); const dt=Math.min(clock.getDelta(),.05), me=entities.get(selfId);
  if(me){
    const speed=7.2; let f=0,s=0; if(keys.has('KeyW'))f++;if(keys.has('KeyS'))f--;if(keys.has('KeyD'))s++;if(keys.has('KeyA'))s--;
    if(f||s){const len=Math.hypot(f,s);f/=len;s/=len;me.group.position.x+= (Math.sin(yaw)*f+Math.cos(yaw)*s)*speed*dt;me.group.position.z+= (Math.cos(yaw)*f-Math.sin(yaw)*s)*speed*dt;me.group.position.x=THREE.MathUtils.clamp(me.group.position.x,-18.7,18.7);me.group.position.z=THREE.MathUtils.clamp(me.group.position.z,-18.7,18.7);me.group.rotation.y=yaw;}
    me.bar.lookAt(camera.position);
    socket.emit('move',{x:me.group.position.x,z:me.group.position.z,yaw});
    const camDist=7.5, target=new THREE.Vector3(me.group.position.x-Math.sin(yaw)*camDist,4.1,me.group.position.z-Math.cos(yaw)*camDist); camera.position.lerp(target,1-Math.exp(-dt*6)); camera.lookAt(me.group.position.x,1.1,me.group.position.z);
  }
  for(const fx of effects){fx.t+=dt;fx.line.material.opacity=Math.max(0,1-fx.t/.18);if(fx.t>.18){scene.remove(fx.line);fx.line.geometry.dispose();fx.line.material.dispose();}} effects=effects.filter(x=>x.t<=.18);
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
    selfId=res.id; $('roomLabel').textContent=res.code; lobby.classList.add('hidden'); game.classList.remove('hidden');loading.classList.add('hidden'); arena(); yaw=0; running=true;
    socket.on('state',updatePlayers); socket.on('move',p=>{const e=entities.get(p.id);if(e){e.group.position.set(p.x,0,p.z);e.group.rotation.y=p.yaw;}});
    socket.on('feed',toast); socket.on('shot',p=>makeShot(p.x,p.z,p.yaw,0xffc36a)); socket.on('hit',p=>{if(p.to===selfId)toast('被弾！');if(p.from===selfId)toast('HIT!');}); frame();
  });});
  socket.on('connect_error',()=>{toast('サーバーに接続できません。サーバー画面で npm.cmd start が動いているか確認してください');socket.disconnect();resetJoin();});
  socket.connect();
}
function leave(){running=false;if(socket){socket.disconnect();socket=null;}if(renderer){renderer.dispose();renderer=null;}entities.clear();effects=[];game.classList.add('hidden');lobby.classList.remove('hidden');$('joinBtn').disabled=false;$('joinBtn').innerHTML='アリーナに入る <span>→</span>';document.exitPointerLock?.();}
$('joinBtn').addEventListener('click',join); $('leaveBtn').addEventListener('click',leave);
$('copyRoom').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('roomLabel').textContent);toast('部屋コードをコピーしました');}catch{toast($('roomLabel').textContent);}});
window.addEventListener('keydown',e=>{keys.add(e.code);if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();}); window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('mousemove',e=>{if(document.pointerLockElement===$('world'))yaw-=e.movementX*.0024;});
$('world').addEventListener('click',()=>{if(!running)return;$('world').requestPointerLock?.();socket.emit('shoot',{yaw});const me=entities.get(selfId);if(me)makeShot(me.group.position.x,me.group.position.z,yaw);});
window.addEventListener('resize',()=>{if(renderer&&camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}});
