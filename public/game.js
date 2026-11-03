const $ = id => document.getElementById(id);
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const startScreen = $('startScreen'), gameScreen = $('gameScreen');
const keys = new Set(), pointer = { x: innerWidth / 2, y: innerHeight / 2, down: false };
let state = 'menu', raf = 0, last = 0, elapsed = 0, score = 0, wave = 1, health = 100, spawnIn = 0, shotIn = 0, dashIn = 0, dashTime = 0, invuln = 0, shake = 0, enemies = [], particles = [], bullets = [], player = { x: 0, y: 0, r: 12 }, moveTouch = { x: 0, y: 0 }, joystickPointer = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
let dpr = 1, width = 1, height = 1, arenaR = 1;

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2); width = innerWidth; height = innerHeight;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); arenaR = Math.min(width, height) * .39;
  if (!player.x) { player.x = width / 2; player.y = height / 2; }
  player.x = clamp(player.x, 24, width - 24); player.y = clamp(player.y, 24, height - 24);
}
addEventListener('resize', resize); resize();

function setScreen(name) {
  const playing = name === 'game'; startScreen.classList.toggle('hidden', playing); gameScreen.classList.toggle('hidden', !playing);
}
function best() { return Number(localStorage.getItem('shatterArenaBest') || 0); }
$('bestScore').textContent = best().toLocaleString('en-US');
function reset() {
  cancelAnimationFrame(raf); resize(); state = 'playing'; elapsed = 0; score = 0; wave = 1; health = 100; spawnIn = .8; shotIn = 0; dashIn = 0; dashTime = 0; invuln = 0; shake = 0;
  enemies = []; particles = []; bullets = []; player.x = width / 2; player.y = height / 2; pointer.x = player.x + 1; pointer.y = player.y;
  $('pauseOverlay').classList.add('hidden'); $('resultOverlay').classList.add('hidden'); $('gameScreen').classList.remove('hidden'); startScreen.classList.add('hidden');
  last = performance.now(); raf = requestAnimationFrame(frame); toast('WAVE 1 — ドローンを迎撃しろ');
}
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.remove('show'), 1500); }
function spawnEnemy() {
  const a = Math.random() * Math.PI * 2, x = width / 2 + Math.cos(a) * (arenaR + 25), y = height / 2 + Math.sin(a) * (arenaR + 25);
  const heavy = wave >= 3 && Math.random() < Math.min(.12 + wave * .035, .38), fast = !heavy && wave >= 2 && Math.random() < .3;
  enemies.push({ x, y, r: heavy ? 17 : fast ? 10 : 12, hp: heavy ? 4 : fast ? 1 : 2, maxHp: heavy ? 4 : fast ? 1 : 2, speed: (heavy ? 43 : fast ? 103 : 65) + Math.min(wave * 3, 36), type: heavy ? 'heavy' : fast ? 'fast' : 'drone', hit: 0 });
}
function fire() {
  if (shotIn > 0) return;
  const dx = pointer.x - player.x, dy = pointer.y - player.y, len = Math.hypot(dx, dy) || 1;
  bullets.push({ x: player.x + dx / len * 15, y: player.y + dy / len * 15, vx: dx / len * 540, vy: dy / len * 540, life: 1.05 }); shotIn = .16;
  particles.push({ x: player.x + dx / len * 17, y: player.y + dy / len * 17, vx: rand(-22,22), vy: rand(-22,22), life: .13, max: .13, color: '#a8f7ff', size: 3 });
}
function dash() { if (state !== 'playing' || dashIn > 0) return; let dx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + moveTouch.x, dy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + moveTouch.y; let len = Math.hypot(dx, dy); if (len < .1) { dx = player.x - pointer.x; dy = player.y - pointer.y; len = Math.hypot(dx, dy) || 1; } dx /= len; dy /= len; player.x = clamp(player.x + dx * 78, 24, width - 24); player.y = clamp(player.y + dy * 78, 24, height - 24); dashIn = 2.4; dashTime = .17; invuln = .22; for (let i=0;i<12;i++) particles.push({x:player.x,y:player.y,vx:rand(-100,100),vy:rand(-100,100),life:.32,max:.32,color:'#65eaff',size:rand(2,5)}); }
function burst(x, y, color, count=10) { for (let i=0;i<count;i++) { const a = Math.random()*Math.PI*2, s = rand(35,180); particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.2,.62),max:.62,color,size:rand(1.5,4)}); } }
function damage(amount) { if (invuln > 0) return; health = Math.max(0, health - amount); invuln = .55; shake = 10; $('healthBar').style.width = `${health}%`; $('healthValue').textContent = `${health}%`; if (health <= 0) finish(); }
function finish() { if (state !== 'playing') return; state = 'over'; const previous = best(); if (score > previous) localStorage.setItem('shatterArenaBest', String(score)); $('resultEyebrow').textContent = score > previous ? 'NEW RECORD // SAVED' : 'RUN COMPLETE'; $('resultTitle').textContent = 'CORE LOST'; $('resultCopy').textContent = `WAVE ${wave} でコアが破壊された。`; $('finalScore').textContent = String(score).padStart(5, '0'); $('resultOverlay').classList.remove('hidden'); }
function frame(now) {
  if (state !== 'playing') return;
  const dt = Math.min((now - last) / 1000, .04); last = now; elapsed += dt;
  const nextWave = 1 + Math.floor(elapsed / 17); if (nextWave !== wave) { wave = nextWave; toast(`WAVE ${wave} — 増援を確認`); }
  const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + moveTouch.x;
  const my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + moveTouch.y;
  const ml = Math.hypot(mx, my) || 1; const speed = dashTime > 0 ? 700 : 245; player.x = clamp(player.x + mx / ml * speed * dt, 24, width - 24); player.y = clamp(player.y + my / ml * speed * dt, 24, height - 24);
  invuln = Math.max(0, invuln-dt); dashIn = Math.max(0,dashIn-dt); dashTime = Math.max(0,dashTime-dt); shotIn = Math.max(0,shotIn-dt); if(pointer.down) fire();
  spawnIn -= dt; if(spawnIn <= 0) { spawnEnemy(); spawnIn = Math.max(.24, 1.05 - wave*.055) * rand(.74,1.18); }
  for (const b of bullets) { b.x += b.vx*dt; b.y += b.vy*dt; b.life -= dt; }
  for (const e of enemies) { const dx=player.x-e.x,dy=player.y-e.y,len=Math.hypot(dx,dy)||1;e.x+=dx/len*e.speed*dt;e.y+=dy/len*e.speed*dt;e.hit=Math.max(0,e.hit-dt);if(len<e.r+player.r+2){damage(e.type==='heavy'?17:10);e.x-=dx/len*12;e.y-=dy/len*12;} }
  for (const b of bullets) { if (b.life<=0) continue; for (const e of enemies) { if (e.hp<=0) continue; if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+4){e.hp--;e.hit=.08;b.life=0;burst(b.x,b.y,e.type==='heavy'?'#ffb56c':'#75edff',3);if(e.hp<=0){score+=e.type==='heavy'?50:e.type==='fast'?20:30;burst(e.x,e.y,e.type==='heavy'?'#ffb56c':'#75edff',e.type==='heavy'?18:12);}break;} } }
  bullets=bullets.filter(b=>b.life>0);enemies=enemies.filter(e=>e.hp>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-3*dt);p.vy*=Math.exp(-3*dt);p.life-=dt;}particles=particles.filter(p=>p.life>0);
  $('waveValue').textContent=String(wave).padStart(2,'0');$('scoreValue').textContent=String(score).padStart(5,'0');$('enemyValue').textContent=String(enemies.length).padStart(2,'0');
  draw(); raf=requestAnimationFrame(frame);
}
function draw() {
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.save();if(shake>0){ctx.translate(rand(-shake,shake),rand(-shake,shake));shake*=.84;}
  const cx=width/2,cy=height/2,r=arenaR;
  const bg=ctx.createRadialGradient(cx,cy,20,cx,cy,Math.max(width,height)*.72);bg.addColorStop(0,'#101e2a');bg.addColorStop(.55,'#0a121b');bg.addColorStop(1,'#070b11');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();ctx.fillStyle='#0b1520';ctx.fillRect(cx-r,cy-r,r*2,r*2);
  const spacing=38;ctx.lineWidth=1;ctx.strokeStyle='#78eaff0b';for(let x=cx-r;x<=cx+r;x+=spacing){ctx.beginPath();ctx.moveTo(x,cy-r);ctx.lineTo(x,cy+r);ctx.stroke();}for(let y=cy-r;y<=cy+r;y+=spacing){ctx.beginPath();ctx.moveTo(cx-r,y);ctx.lineTo(cx+r,y);ctx.stroke();}
  ctx.beginPath();ctx.arc(cx,cy,r*.18,0,Math.PI*2);ctx.strokeStyle='#79eaff18';ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,r*.42,0,Math.PI*2);ctx.strokeStyle='#79eaff12';ctx.stroke();ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#64e8ff65';ctx.shadowColor='#56dcff';ctx.shadowBlur=18;ctx.stroke();ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(cx,cy,r+9,Math.PI*1.08,Math.PI*1.82);ctx.strokeStyle='#ffb66b5a';ctx.lineWidth=2;ctx.stroke();
  ctx.save();ctx.translate(cx,cy);ctx.rotate(elapsed*.4);ctx.fillStyle='#193c4c';ctx.shadowColor='#51dfff';ctx.shadowBlur=20;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(12,-5);ctx.lineTo(9,10);ctx.lineTo(-9,10);ctx.lineTo(-12,-5);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#a9f6ff';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.restore();
  for(const b of bullets){ctx.fillStyle='#adf8ff';ctx.shadowColor='#5cecff';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
  for(const e of enemies){const col=e.type==='heavy'?'#ffb66b':e.type==='fast'?'#ff668b':'#71ecff';ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(player.y-e.y,player.x-e.x));ctx.shadowColor=col;ctx.shadowBlur=e.hit?24:13;ctx.fillStyle=e.hit?'#ffffff':(e.type==='heavy'?'#422f26':e.type==='fast'?'#402330':'#17333d');ctx.strokeStyle=col;ctx.lineWidth=e.type==='heavy'?2:1.5;ctx.beginPath();if(e.type==='heavy'){ctx.rect(-e.r,-e.r,e.r*2,e.r*2)}else{ctx.moveTo(e.r+3,0);ctx.lineTo(-e.r,-e.r);ctx.lineTo(-e.r*.55,0);ctx.lineTo(-e.r,e.r);ctx.closePath()}ctx.fill();ctx.stroke();ctx.restore();if(e.maxHp>1){ctx.fillStyle='#202b36';ctx.fillRect(e.x-e.r,e.y-e.r-7,e.r*2,2);ctx.fillStyle=col;ctx.fillRect(e.x-e.r,e.y-e.r-7,e.r*2*e.hp/e.maxHp,2);}}
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.shadowBlur=0;
  const aim=Math.atan2(pointer.y-player.y,pointer.x-player.x);ctx.save();ctx.translate(player.x,player.y);ctx.rotate(aim);if(invuln>0)ctx.globalAlpha=.55+.45*Math.sin(performance.now()*.045);ctx.shadowColor='#75edff';ctx.shadowBlur=18;ctx.fillStyle='#a9f6ff';ctx.strokeStyle='#e6fdff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(-7,-10);ctx.lineTo(-4,0);ctx.lineTo(-7,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#0e2733';ctx.beginPath();ctx.arc(-1,0,3,0,Math.PI*2);ctx.fill();ctx.restore();ctx.globalAlpha=1;
  ctx.restore();
  if(dashIn>0){ctx.fillStyle='#8998a8';ctx.fillRect(26,height-25,86,3);ctx.fillStyle='#75edff';ctx.fillRect(26,height-25,86*(1-dashIn/2.4),3);}
}
function pause(){if(state!=='playing')return;state='paused';$('pauseOverlay').classList.remove('hidden');}
function resume(){if(state!=='paused')return;state='playing';$('pauseOverlay').classList.add('hidden');last=performance.now();raf=requestAnimationFrame(frame);}
function home(){state='menu';cancelAnimationFrame(raf);setScreen('menu');$('pauseOverlay').classList.add('hidden');$('resultOverlay').classList.add('hidden');$('bestScore').textContent=best().toLocaleString('en-US');}
$('startButton').addEventListener('click',reset);$('retryButton').addEventListener('click',reset);$('resumeButton').addEventListener('click',resume);$('pauseButton').addEventListener('click',pause);$('quitButton').addEventListener('click',home);$('resultHomeButton').addEventListener('click',home);
addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){state==='playing'?pause():resume();return;}keys.add(e.code);if(e.code==='ShiftLeft'||e.code==='ShiftRight')dash();});addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY;});canvas.addEventListener('pointerdown',e=>{pointer.x=e.clientX;pointer.y=e.clientY;pointer.down=true;canvas.setPointerCapture?.(e.pointerId);});canvas.addEventListener('pointerup',()=>pointer.down=false);canvas.addEventListener('pointercancel',()=>pointer.down=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
const joystick=$('joystick'),stick=$('stick');joystick.addEventListener('pointerdown',e=>{joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)moveStick(e);});function moveStick(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),scale=Math.min(1,len/38);moveTouch={x:len?dx/len*scale:0,y:len?dy/len*scale:0};stick.style.transform=`translate(${moveTouch.x*34}px,${moveTouch.y*34}px)`;}function clearStick(){joystickPointer=null;moveTouch={x:0,y:0};stick.style.transform=''}joystick.addEventListener('pointerup',clearStick);joystick.addEventListener('pointercancel',clearStick);$('dashButton').addEventListener('pointerdown',e=>{e.preventDefault();dash();});
