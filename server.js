import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readFileSync } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readdir, copyFile, cp, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 1e6 });
const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const HOSTED = Boolean(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.VERCEL);
const execFileAsync = promisify(execFile);
app.use(express.static(path.join(ROOT, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/version', (_req, res) => res.set('Cache-Control', 'no-store').json({ version: VERSION, canSelfUpdate: !HOSTED }));
app.get('/network', (_req, res) => {
  const addresses = Object.values(os.networkInterfaces()).flat().filter(info => info && !info.internal && (info.family === 'IPv4' || info.family === 4) && (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address))).map(info => info.address);
  addresses.sort((a,b) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : 2) - (b.startsWith('192.168.') ? 0 : b.startsWith('10.') ? 1 : 2));
  res.set('Cache-Control','no-store').json({ urls: [...new Set(addresses)].map(address => `http://${address}:${PORT}`) });
});

let updating = false;
async function applyGithubUpdate() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'shatter-arena-update-'));
  const archive = path.join(temp, 'source.tar.gz');
  const extracted = path.join(temp, 'source');
  const backup = path.join(temp, 'backup');
  await mkdir(extracted);
  await mkdir(backup);
  try {
    const response = await fetch('https://api.github.com/repos/inei49984-ai/shatter-arena/tarball/main', { headers: { 'User-Agent': 'Shatter-Arena-Updater', 'Accept': 'application/vnd.github+json' } });
    if (!response.ok || !response.body) throw new Error(`GitHubから更新を取得できませんでした (HTTP ${response.status})`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 200 * 1024 * 1024) throw new Error('更新ファイルが大きすぎます');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    await execFileAsync('tar', ['-xzf', archive, '-C', extracted], { windowsHide: true, timeout: 120000 });
    const dirs = await readdir(extracted, { withFileTypes: true });
    const sourceDir = dirs.find(d => d.isDirectory());
    if (!sourceDir) throw new Error('更新ファイルの形式が正しくありません');
    const source = path.join(extracted, sourceDir.name);
    const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
    if (manifest.name !== 'shatter-arena') throw new Error('別のアプリの更新は適用できません');
    const files = ['server.js', 'restart-server.js', 'package.json', 'README.md', '.gitignore', 'package-lock.json'];
    const backedUp = new Set();
    for (const name of [...files, 'public']) {
      try {
        if (name === 'public') await cp(path.join(ROOT, name), path.join(backup, name), { recursive: true });
        else await copyFile(path.join(ROOT, name), path.join(backup, name));
        backedUp.add(name);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    try {
      for (const name of files.slice(0, 5)) await copyFile(path.join(source, name), path.join(ROOT, name));
      await cp(path.join(source, 'public'), path.join(ROOT, 'public'), { recursive: true, force: true });
      if (process.platform === 'win32') {
        await execFileAsync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd install --no-audit --no-fund'], { cwd: ROOT, windowsHide: true, timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
      } else {
        await execFileAsync('npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
      }
    } catch (error) {
      for (const name of [...files, 'public']) {
        const target = path.join(ROOT, name);
        await rm(target, { recursive: true, force: true });
        if (backedUp.has(name)) {
          if (name === 'public') await cp(path.join(backup, name), target, { recursive: true });
          else await copyFile(path.join(backup, name), target);
        }
      }
      throw error;
    }
    return manifest.version;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
app.post('/update', async (req, res) => {
  if (HOSTED) return res.status(409).json({ ok: false, error: 'ホスティング版はGitHubから自動デプロイされます' });
  const origin = req.get('origin');
  if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ ok: false, error: '更新リクエストを拒否しました' });
  if (updating) return res.status(409).json({ ok: false, error: '更新はすでに実行中です' });
  updating = true;
  try {
    const version = await applyGithubUpdate();
    res.json({ ok: true, version, restarting: true });
    setTimeout(() => {
      spawn(process.execPath, [path.join(ROOT, 'restart-server.js'), String(PORT)], { cwd: ROOT, stdio: 'inherit', windowsHide: false });
      setTimeout(() => process.exit(0), 500);
    }, 800);
  } catch (error) {
    updating = false;
    console.error('Self-update failed:', error);
    res.status(500).json({ ok: false, error: error.message || '更新に失敗しました' });
  }
});

const rooms = new Map();
const models = new Set(['soldier', 'super', 'thomas']);
const cleanName = (v) => String(v || 'PLAYER').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) || 'PLAYER';
const cleanRoom = (v) => String(v || 'ARENA').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'ARENA';
function snapshot(room) { return Object.fromEntries([...room.players].map(([id, p]) => [id, p])); }
function broadcast(room) { io.to(room.code).emit('state', snapshot(room)); }

io.on('connection', (socket) => {
  socket.on('join', (payload = {}, ack = () => {}) => {
    if (socket.data.room) return ack({ ok: false, error: 'すでに参加しています' });
    const code = cleanRoom(payload.room);
    let room = rooms.get(code);
    if (!room) { room = { code, players: new Map() }; rooms.set(code, room); }
    if (room.players.size >= 12) return ack({ ok: false, error: 'この部屋は満員です（最大12人）' });
    const model = models.has(payload.model) ? payload.model : 'soldier';
    const idx = room.players.size;
    const player = { name: cleanName(payload.name), model, x: Math.cos(idx * 1.7) * 5, z: Math.sin(idx * 1.7) * 5, yaw: 0, hp: 100, score: 0, color: ['#70e1ff','#ffb35c','#ce8aff','#ff718b','#93f18d'][idx % 5], lastMove: 0, lastShot: 0 };
    room.players.set(socket.id, player); socket.data.room = code;
    socket.join(code); ack({ ok: true, id: socket.id, code }); broadcast(room);
    socket.to(code).emit('feed', `${player.name} が参戦`);
  });

  socket.on('move', (p = {}) => {
    const room = rooms.get(socket.data.room); const me = room?.players.get(socket.id); if (!me) return;
    const now = Date.now(); if (now - me.lastMove < 35) return; me.lastMove = now;
    me.x = Math.max(-18, Math.min(18, Number(p.x) || 0)); me.z = Math.max(-18, Math.min(18, Number(p.z) || 0));
    me.yaw = Number.isFinite(p.yaw) ? p.yaw : me.yaw;
    socket.to(room.code).emit('move', { id: socket.id, x: me.x, z: me.z, yaw: me.yaw });
  });

  socket.on('shoot', (p = {}) => {
    const room = rooms.get(socket.data.room); const me = room?.players.get(socket.id); if (!me) return;
    const now = Date.now(); if (now - me.lastShot < 320) return; me.lastShot = now;
    const yaw = Number.isFinite(p.yaw) ? p.yaw : me.yaw;
    let target = null, best = 2.1;
    for (const [id, other] of room.players) {
      if (id === socket.id || other.hp <= 0) continue;
      const dx = other.x - me.x, dz = other.z - me.z, dist = Math.hypot(dx, dz);
      if (dist > 22) continue;
      const aim = Math.atan2(dx, dz); const delta = Math.atan2(Math.sin(aim-yaw), Math.cos(aim-yaw));
      if (Math.abs(delta) < .14 + .45 / Math.max(1, dist) && dist < best + 1.8) { target = [id, other]; best = dist; }
    }
    if (target) {
      const [id, victim] = target; victim.hp = Math.max(0, victim.hp - 34);
      if (victim.hp === 0) { me.score++; io.to(room.code).emit('feed', `${me.name} が ${victim.name} を撃破`); victim.hp = 100; victim.x = -victim.x * .6; victim.z = -victim.z * .6; }
      broadcast(room); io.to(room.code).emit('hit', { from: socket.id, to: id });
    }
    socket.to(room.code).emit('shot', { id: socket.id, yaw, x: me.x, z: me.z });
  });

  socket.on('disconnect', () => {
    const code = socket.data.room; const room = rooms.get(code); if (!room) return;
    const old = room.players.get(socket.id); room.players.delete(socket.id);
    if (old) io.to(code).emit('feed', `${old.name} が退出`);
    if (!room.players.size) rooms.delete(code); else broadcast(room);
  });
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Shatter Arena listening on http://localhost:${PORT}`);
  const addresses = Object.values(os.networkInterfaces()).flat().filter(info => info && !info.internal && (info.family === 'IPv4' || info.family === 4)).map(info => `http://${info.address}:${PORT}`);
  for (const address of [...new Set(addresses)]) console.log(`LAN play: ${address}`);
});
