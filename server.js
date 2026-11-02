import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';

const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 1e6 });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true }));

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

http.listen(PORT, '0.0.0.0', () => console.log(`Shatter Arena listening on ${PORT}`));
