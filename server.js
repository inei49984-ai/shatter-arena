import express from 'express';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
function allowedOrigin(origin){return !origin||origin==='https://inei49984-ai.github.io'||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);}
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && allowedOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.path!=='/health'&&process.env.RENDER&&req.get('x-forwarded-proto')!=='https') return res.status(426).json({error:'HTTPS is required.'});
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));

const profiles = new Map();
const devices = new Map();
const cleanDeviceKey = value => /^[a-f0-9-]{36}$/i.test(String(value || '')) ? String(value).toLowerCase() : '';
const cleanPlayerId = value => { const id = String(value || '').trim().replace(/^@/, ''); return /^[a-z0-9_]{3,16}$/i.test(id) ? id : ''; };
const nameKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
const publicProfile = profile => ({ name: profile.name, id: profile.id });
const getProfile = deviceKey => devices.get(cleanDeviceKey(deviceKey));

app.post('/api/profile', (req, res) => {
  const deviceKey = cleanDeviceKey(req.body?.deviceKey);
  const name = String(req.body?.name || '').normalize('NFKC').trim();
  const id = cleanPlayerId(req.body?.id);
  const length = Array.from(name).length;
  if (!deviceKey) return res.status(400).json({ error: '端末IDが正しくありません。ページを再読み込みしてください。' });
  if (length < 2 || length > 16 || /[\u0000-\u001f<>]/u.test(name)) return res.status(400).json({ error: '名前は2〜16文字で入力してください。' });
  if (!id) return res.status(400).json({ error: 'IDは英数字と _ を使い、3〜16文字で入力してください。' });
  const old = devices.get(deviceKey);
  const idOwner = profiles.get(id.toLowerCase());
  if (idOwner && idOwner.deviceKey !== deviceKey) return res.status(409).json({ error: 'そのIDは使用中です。別のIDを選んでください。' });
  for (const profile of devices.values()) {
    if (profile.deviceKey !== deviceKey && nameKey(profile.name) === nameKey(name)) return res.status(409).json({ error: 'その名前は使用中です。別の名前を選んでください。' });
  }
  if (old && old.id.toLowerCase() !== id.toLowerCase()) profiles.delete(old.id.toLowerCase());
  const profile = old || { deviceKey, friends: new Set(), lastSeen: Date.now() };
  profile.name = name; profile.id = id; profile.lastSeen = Date.now();
  devices.set(deviceKey, profile); profiles.set(id.toLowerCase(), profile);
  res.json({ ok: true, profile: publicProfile(profile) });
});

app.get('/api/lobby/:deviceKey', (req, res) => {
  const profile = getProfile(req.params.deviceKey);
  if (!profile) return res.status(404).json({ error: 'プロフィールがありません。名前とIDを登録してください。' });
  profile.lastSeen = Date.now();
  const friends = [...profile.friends].map(key => devices.get(key)).filter(Boolean).map(friend => ({
    ...publicProfile(friend), online: Date.now() - friend.lastSeen < 45000
  })).sort((a,b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'ja'));
  res.json({ profile: publicProfile(profile), friends, onlineCount: friends.filter(friend => friend.online).length });
});

app.post('/api/friends', (req, res) => {
  const profile = getProfile(req.body?.deviceKey);
  if (!profile) return res.status(404).json({ error: 'プロフィールがありません。' });
  const friendId = cleanPlayerId(req.body?.friendId);
  const friend = friendId ? profiles.get(friendId.toLowerCase()) : null;
  if (!friend) return res.status(404).json({ error: 'そのIDのプレイヤーが見つかりません。' });
  if (friend.deviceKey === profile.deviceKey) return res.status(400).json({ error: '自分をフレンドには追加できません。' });
  profile.friends.add(friend.deviceKey); friend.friends.add(profile.deviceKey);
  profile.lastSeen = Date.now();
  res.json({ ok: true, friend: publicProfile(friend) });
});

app.delete('/api/friends/:friendId', (req, res) => {
  const profile = getProfile(req.body?.deviceKey);
  if (!profile) return res.status(404).json({ error: 'プロフィールがありません。' });
  const friend = profiles.get(String(req.params.friendId || '').toLowerCase());
  if (friend) friend.friends.delete(profile.deviceKey);
  profile.friends.delete(friend?.deviceKey || '');
  res.json({ ok: true });
});

app.use((_req, res) => res.status(404).json({error:'Not found'}));

const server = createServer(app);
const webSockets = new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
const livePlayers = new Map();
const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
const safePlayer = player => ({id:player.id,name:player.name,x:player.x,z:player.z,yaw:player.yaw});
server.on('upgrade',(request,socket,head)=>{
  const url=new URL(request.url,'http://localhost');
  const origin=request.headers.origin;
  if(url.pathname!=='/ws'||!allowedOrigin(origin)||(request.headers['x-forwarded-proto']&&request.headers['x-forwarded-proto']!=='https')){socket.destroy();return;}
  webSockets.handleUpgrade(request,socket,head,ws=>webSockets.emit('connection',ws,request,url));
});
webSockets.on('connection',(ws,_request,url)=>{
  const profile=getProfile(url.searchParams.get('deviceKey'));
  if(!profile){ws.close(1008,'Profile required');return;}
  const player={deviceKey:profile.deviceKey,id:profile.id,name:profile.name,x:0,z:0,yaw:0};
  livePlayers.set(profile.deviceKey,{ws,player});profile.lastSeen=Date.now();
  send(ws,{type:'players',players:[...livePlayers.values()].filter(entry=>entry.ws!==ws).map(entry=>safePlayer(entry.player))});
  ws.on('message',raw=>{
    let message;try{message=JSON.parse(raw.toString())}catch{return;}
    if(message?.type!=='position')return;
    for(const value of [message.x,message.z,message.yaw])if(!Number.isFinite(value))return;
    player.x=Math.max(-17,Math.min(17,message.x));player.z=Math.max(-17,Math.min(17,message.z));player.yaw=message.yaw;player.name=profile.name;player.id=profile.id;profile.lastSeen=Date.now();
    const packet={type:'player',player:safePlayer(player)};
    for(const entry of livePlayers.values())if(entry.ws!==ws)send(entry.ws,packet);
  });
  ws.on('close',()=>{
    const current=livePlayers.get(profile.deviceKey);
    if(current?.ws===ws){livePlayers.delete(profile.deviceKey);for(const entry of livePlayers.values())send(entry.ws,{type:'leave',id:profile.id});}
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Tomas Fight multiplayer server listening on port ${port}`));
