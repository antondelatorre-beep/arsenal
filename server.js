const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const G = require('./shared.js');

const app = express();
const srv = http.createServer(app);
const io = new Server(srv, { cors: { origin: '*' } });

app.get('/', (q, r) => r.sendFile(path.join(__dirname, 'index.html')));
app.get('/shared.js', (q, r) => r.sendFile(path.join(__dirname, 'shared.js')));
app.get('/health', (q, r) => r.send('ok'));

const W = G.W, NG = G.NG;
const MODES = { classic: { kills: 20, time: 600 }, timed: { kills: 25, time: 600 }, tdm: { kills: 30, time: 480 } };
const PAL = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#4cc9f0', '#9b5de5', '#f72585', '#90be6d', '#ffffff', '#ff9f1c', '#00f5d4', '#8d99ae'];
const BOTNAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Ghost', 'Hawk', 'Iron', 'Jackal'];
const rooms = {};
let uid = 1;
const rnd = n => Math.floor(Math.random() * n);
const humans = r => Object.values(r.ps).filter(p => !p.bot);

function getRoom(mode, map) {
  const key = mode + '|' + map;
  if (!rooms[key]) rooms[key] = { key, mode, map, m: G.maps[map], ps: {}, st: mode === 'tdm' ? 'wait' : 'play', endAt: Date.now() + MODES[mode].time * 1000, nextAt: Date.now() + 30000, ts: { red: 0, blue: 0 }, timedGun: rnd(NG), overAt: 0, tick: 0 };
  return rooms[key];
}
function pickColor(r, p) {
  const used = new Set(Object.values(r.ps).filter(q => q !== p).map(q => q.color));
  const free = PAL.filter(c => !used.has(c)); const a = free.length ? free : PAL; return a[rnd(a.length)];
}
function assignTeam(r, p) {
  if (r.mode !== 'tdm') { p.team = null; p.color = pickColor(r, p); return; }
  const cnt = { red: 0, blue: 0 };
  for (const q of Object.values(r.ps)) if (q !== p && q.team) cnt[q.team]++;
  p.team = cnt.red < cnt.blue ? 'red' : cnt.blue < cnt.red ? 'blue' : (rnd(2) ? 'red' : 'blue');
  p.color = p.team === 'red' ? '#e53935' : '#1e88e5';
}
function newP(id, name, bot) {
  return { id, name, bot, team: null, color: '#fff', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: .4, h: 1.8, onGround: false, yaw: 0, pitch: 0, cur: 0, main: 0, crouch: 0, hp: 100, alive: true, kills: 0, deaths: 0, respawnAt: 0, inv: 0, tgt: null, retarget: 0, nextShot: 0, seed: Math.random() * 10, lastJump: 0, side: 1 };
}
function spawn(r, p) {
  const sp = r.m.spawns; let best = sp[0], bd = -1;
  for (let i = 0; i < 5; i++) {
    const s = sp[rnd(sp.length)]; let md = 1e9;
    for (const q of Object.values(r.ps)) { if (q === p || !q.alive || (r.mode === 'tdm' && q.team === p.team)) continue; md = Math.min(md, Math.hypot(q.x - s[0], q.z - s[2])); }
    if (md > bd) { bd = md; best = s; }
  }
  p.x = best[0]; p.y = best[1]; p.z = best[2]; p.vx = p.vy = p.vz = 0; p.hp = 100; p.alive = true; p.yaw = Math.random() * 6.28; p.pitch = 0; p.crouch = 0; p.h = 1.8;
  p.main = r.mode === 'timed' ? r.timedGun : rnd(NG); p.cur = p.main; p.inv = Date.now() + 2000;
}
function respawn(r, p) {
  spawn(r, p);
  if (!p.bot) io.to(p.id).emit('respawn', { x: p.x, y: p.y, z: p.z, yaw: p.yaw, main: p.main });
}
function board(r) {
  const now = Date.now();
  return { ps: Object.values(r.ps).map(p => ({ id: p.id, n: p.name, t: p.team, c: p.color, k: p.kills, d: p.deaths, b: p.bot ? 1 : 0 })), ts: r.ts, st: r.st, mode: r.mode, rem: Math.max(0, r.endAt - now), nrem: r.mode === 'timed' ? Math.max(0, r.nextAt - now) : 0, tk: MODES[r.mode].kills, hn: humans(r).length };
}
const sendBoard = r => io.to(r.key).emit('board', board(r));

function addBot(r) {
  const id = 'b' + (uid++);
  const p = newP(id, 'Bot ' + BOTNAMES[rnd(BOTNAMES.length)], true);
  r.ps[id] = p; assignTeam(r, p); spawn(r, p);
}
function adjustBots(r) {
  if (r.mode === 'tdm') { for (const id of Object.keys(r.ps)) if (r.ps[id].bot) delete r.ps[id]; return; }
  const h = humans(r).length, bots = Object.values(r.ps).filter(p => p.bot);
  const want = Math.max(0, 4 - h);
  while (bots.length > want) { const b = bots.pop(); delete r.ps[b.id]; }
  for (let i = bots.length; i < want; i++) addBot(r);
}

function applyDamage(r, v, a, dmg, w, head) {
  if (!v.alive || r.st !== 'play') return;
  const now = Date.now(); if (now < v.inv) return;
  if (a !== v && r.mode === 'tdm' && a.team === v.team) return;
  if (a === v) dmg *= 0.5;
  v.hp -= dmg;
  if (!v.bot) io.to(v.id).emit('hp', { hp: Math.max(0, Math.round(v.hp)), f: a.id });
  if (v.hp <= 0) {
    v.alive = false; v.hp = 0; v.deaths++; v.respawnAt = now + 3000;
    if (a !== v) {
      a.kills++; if (r.mode === 'tdm') r.ts[a.team]++;
      if (r.mode === 'classic') {
        let g = rnd(NG); if (g === a.main) g = (g + 1 + rnd(NG - 1)) % NG;
        a.main = g; a.cur = g; if (!a.bot) io.to(a.id).emit('gun', { main: g });
      }
    }
    io.to(r.key).emit('kill', { k: a.id, v: v.id, w: w, h: head ? 1 : 0, s: a === v ? 1 : 0 });
    sendBoard(r);
  }
}

function startMatch(r) {
  const cfg = MODES[r.mode], now = Date.now();
  r.ts = { red: 0, blue: 0 }; r.st = 'play'; r.endAt = now + cfg.time * 1000; r.nextAt = now + 30000; r.timedGun = rnd(NG);
  for (const p of Object.values(r.ps)) { p.kills = 0; p.deaths = 0; assignTeam(r, p); }
  for (const p of Object.values(r.ps)) respawn(r, p);
  sendBoard(r);
}
function endMatch(r) {
  r.st = 'over'; r.overAt = Date.now() + 9000;
  let winner = 'Draw';
  if (r.mode === 'tdm') { if (r.ts.red > r.ts.blue) winner = 'RED TEAM'; else if (r.ts.blue > r.ts.red) winner = 'BLUE TEAM'; }
  else { const top = Object.values(r.ps).sort((a, b) => b.kills - a.kills)[0]; if (top && top.kills > 0) winner = top.name; }
  io.to(r.key).emit('over', { w: winner });
  sendBoard(r);
}

function botThink(r, b, dt, now) {
  if (!b.alive || r.st !== 'play') return;
  if (!b.tgt || now > b.retarget || !r.ps[b.tgt] || !r.ps[b.tgt].alive) {
    let best = null, bd = 1e9;
    for (const q of Object.values(r.ps)) { if (q === b || !q.alive) continue; const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < bd) { bd = d; best = q; } }
    b.tgt = best ? best.id : null; b.retarget = now + 1500;
  }
  const t = r.ps[b.tgt]; if (!t) return;
  const dx = t.x - b.x, dz = t.z - b.z, dist = Math.hypot(dx, dz) || 1;
  b.yaw = Math.atan2(-dx, -dz);
  b.pitch = Math.atan2((t.y + 1.3) - (b.y + 1.5), dist);
  const want = dist > 14 ? 1 : (dist < 6 ? -.6 : 0), strafe = Math.sin(now / 700 + b.seed) * .5 * b.side;
  const fx = dx / dist, fz = dz / dist, sx = -fz, sz = fx, spd = G.speedOf(b.main) * .7;
  b.vx = (fx * want + sx * strafe) * spd; b.vz = (fz * want + sz * strafe) * spd;
  b.vy -= G.GRAV * dt;
  const px = b.x, pz = b.z;
  G.move(b, dt, r.m.boxes, r.m.floorY);
  if (Math.hypot(b.x - px, b.z - pz) < spd * dt * .15 && want !== 0 && b.onGround && now - b.lastJump > 700) { b.vy = G.JUMP; b.lastJump = now; b.side = -b.side; }
  const hh = r.m.half - 1; b.x = Math.max(-hh, Math.min(hh, b.x)); b.z = Math.max(-hh, Math.min(hh, b.z));
  if (b.y < r.m.killY) { applyDamage(r, b, b, 999, 0, false); return; }
  b.cur = b.main;
  if (now > b.nextShot && dist < 50) {
    const o = { x: b.x, y: b.y + 1.6, z: b.z }, ty = t.y + 1.2;
    let dx2 = t.x - o.x, dy2 = ty - o.y, dz2 = t.z - o.z; const L = Math.hypot(dx2, dy2, dz2) || 1; dx2 /= L; dy2 /= L; dz2 /= L;
    const d = { x: dx2, y: dy2, z: dz2 };
    if (G.rayBoxes(o, d, L, r.m.boxes) >= L - .5) {
      b.nextShot = now + 350 + Math.random() * 600;
      const w = W[b.main];
      io.to(r.key).emit('fx', { id: b.id, w: b.main, o: [o.x, o.y, o.z], d: [dx2, dy2, dz2], e: [o.x + dx2 * L, o.y + dy2 * L, o.z + dz2 * L] });
      if (Math.random() < Math.max(.15, .55 - dist / 120)) applyDamage(r, t, b, Math.min(25, w.dmg * (w.pellets ? 2.5 : 1)), b.main, false);
    }
  }
}

function tick(r) {
  const now = Date.now(), dt = .05; r.tick++;
  if (r.st === 'wait') { if (r.mode === 'tdm' && humans(r).length >= 4) startMatch(r); }
  else if (r.st === 'play') {
    if (r.mode === 'tdm' && humans(r).length < 4) { r.st = 'wait'; sendBoard(r); }
    else {
      if (r.mode === 'timed' && now >= r.nextAt) {
        r.nextAt = now + 30000; r.timedGun = rnd(NG);
        for (const p of Object.values(r.ps)) { p.main = r.timedGun; p.cur = p.main; }
        io.to(r.key).emit('gun', { main: r.timedGun, nrem: 30000 });
      }
      const cfg = MODES[r.mode];
      const top = r.mode === 'tdm' ? Math.max(r.ts.red, r.ts.blue) : Math.max(0, ...Object.values(r.ps).map(p => p.kills));
      if (now >= r.endAt || top >= cfg.kills) endMatch(r);
    }
  } else if (r.st === 'over' && now >= r.overAt) {
    if (r.mode === 'tdm' && humans(r).length < 4) { r.st = 'wait'; for (const p of Object.values(r.ps)) { p.kills = 0; p.deaths = 0; respawn(r, p); } r.ts = { red: 0, blue: 0 }; sendBoard(r); }
    else startMatch(r);
  }
  for (const p of Object.values(r.ps)) {
    if (!p.alive && now >= p.respawnAt && r.st !== 'over') respawn(r, p);
    if (p.bot) botThink(r, p, dt, now);
  }
  const arr = Object.values(r.ps).map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2), p.cur, p.crouch ? 1 : 0, Math.round(p.hp), p.alive ? 1 : 0]);
  io.to(r.key).emit('snap', { ps: arr });
  if (r.tick % 40 === 0) sendBoard(r);
}
setInterval(() => { for (const k in rooms) tick(rooms[k]); }, 50);

const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
io.on('connection', s => {
  let r = null, p = null;
  s.on('join', d => {
    if (r || !d) return;
    const mode = MODES[d.mode] ? d.mode : 'classic', map = G.maps[d.map] ? d.map : 'rig';
    r = getRoom(mode, map);
    const name = String(d.name || 'Soldier').replace(/[^\w \-]/g, '').slice(0, 14) || 'Soldier';
    p = newP(s.id, name, false); r.ps[s.id] = p; assignTeam(r, p); spawn(r, p); s.join(r.key); adjustBots(r);
    s.emit('init', { id: s.id, mode, map, x: p.x, y: p.y, z: p.z, yaw: p.yaw, main: p.main, team: p.team, color: p.color });
    sendBoard(r);
  });
  s.on('st', a => {
    if (!p || !p.alive || !Array.isArray(a)) return;
    const hh = r.m.half + 1;
    p.x = Math.max(-hh, Math.min(hh, num(a[0], p.x))); p.y = num(a[1], p.y); p.z = Math.max(-hh, Math.min(hh, num(a[2], p.z)));
    p.yaw = num(a[3], 0); p.pitch = num(a[4], 0); const c = a[5] | 0; p.cur = (c >= 0 && c <= 12) ? c : p.cur; p.crouch = a[6] ? 1 : 0;
  });
  s.on('hit', d => {
    if (!p || !p.alive || !d) return;
    const v = r.ps[d.t], w = d.w | 0, wd = W[w]; if (!v || !wd) return;
    let max = wd.kind === 'melee' ? wd.dmg : wd.kind === 'proj' ? wd.dmg * 1.05 : wd.dmg * (wd.pellets || 1) * 2;
    const dmg = Math.min(num(d.dmg, 0), max); if (dmg <= 0) return;
    if (wd.kind === 'melee' && Math.hypot(v.x - p.x, v.z - p.z) > 5) return;
    applyDamage(r, v, p, dmg, w, !!d.head);
  });
  s.on('fx', d => {
    if (!p || !p.alive || !d || !Array.isArray(d.o) || !Array.isArray(d.d)) return;
    s.to(r.key).emit('fx', { id: s.id, w: d.w | 0, o: d.o.slice(0, 3).map(Number), d: d.d.slice(0, 3).map(Number), e: Array.isArray(d.e) ? d.e.slice(0, 3).map(Number) : null });
  });
  s.on('fell', () => { if (p && p.alive && p.y < r.m.killY + 3) applyDamage(r, p, p, 999, 0, false); });
  s.on('disconnect', () => {
    if (!r) return;
    delete r.ps[s.id];
    if (!humans(r).length) { delete rooms[r.key]; return; }
    adjustBots(r); sendBoard(r);
  });
});

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log('Arsenal Rush listening on ' + PORT));
