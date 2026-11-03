import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
const staticOptions = {
  maxAge: process.env.RENDER ? '1h' : 0,
  setHeaders(res, file) {
    if (/\.(html|js|css|webmanifest)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache');
  }
};
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three'), staticOptions));
app.use(express.static(path.join(root, 'public'), staticOptions));
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

app.get('*path', (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`Shatter Arena listening on port ${port}`));
