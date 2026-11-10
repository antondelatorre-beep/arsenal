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
const BOTNAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Ghost', 'Hawk', 'Iron', 'Jackal', 'Kilo', 'Lima'];
const rooms = {};
let uid = 1;
const rnd = n => Math.floor(Math.random() * n);
const humans = r => Object.values(r.ps).filter(p => !p.bot);
const total = r => Object.keys(r.ps).length;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return d; };

function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = ''; for (let i = 0; i < 4; i++) c += A[rnd(A.length)]; } while (rooms[c]); return c; }
function makeRoom(o) {
  const mode = MODES[o.mode] ? o.mode : 'classic', map = G.maps[o.map] ? o.map : 'rig', code = genCode();
  const r = { key: code, code, name: String(o.name || 'Server').replace(/[^\w \-]/g, '').slice(0, 20) || 'Server', mode, map, m: G.maps[map], max: Math.max(1, Math.min(16, o.max | 0 || 8)), botsN: Math.max(0, Math.min(16, o.bots | 0)), priv: !!o.priv, ps: {}, st: 'play', endAt: Date.now() + MODES[mode].time * 1000, nextAt: Date.now() + 30000, ts: { red: 0, blue: 0 }, timedGun: rnd(NG), overAt: 0, tick: 0 };
  r.st = mode === 'tdm' ? 'wait' : 'play';
  r.pk = (G.maps[map].pickups || []).map(p => ({ x: p[0], y: p[1], z: p[2], t: p[3], a: 1, at: 0 }));
  rooms[code] = r; return r;
}
function findQuick(mode, map) {
  for (const r of Object.values(rooms)) if (!r.priv && r.quick && r.mode === mode && r.map === map && humans(r).length < r.max) return r;
  const r = makeRoom({ name: 'Public ' + mode + ' ' + map, mode, map, max: 8, bots: mode === 'tdm' ? 0 : 4 }); r.quick = true; return r;
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
  return { id, name, bot, team: null, color: '#fff', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: .4, h: 1.8, onGround: false, yaw: 0, pitch: 0, cur: 0, main: 0, crouch: 0, hp: 100, alive: true, kills: 0, deaths: 0, respawnAt: 0, inv: 0, spd: 0, lastShot: 0, lastSt: Date.now(), seed: Math.random() * 10, lastJump: 0, side: 1, mode: 'patrol' };
}
function spawn(r, p) {
  const sp = r.m.spawns; let best = sp[0], bd = -1;
  for (let i = 0; i < 5; i++) {
    const s = sp[rnd(sp.length)]; let md = 1e9;
    for (const q of Object.values(r.ps)) { if (q === p || !q.alive || (r.mode === 'tdm' && q.team === p.team)) continue; md = Math.min(md, Math.hypot(q.x - s[0], q.z - s[2])); }
    if (md > bd) { bd = md; best = s; }
  }
  p.x = best[0]; p.y = best[1]; p.z = best[2]; p.vx = p.vy = p.vz = 0; p.hp = 100; p.alive = true; p.yaw = Math.random() * 6.28; p.pitch = 0; p.crouch = 0; p.h = 1.8; p.spd = 0;
  p.main = r.mode === 'timed' ? r.timedGun : rnd(NG); p.cur = p.main; p.inv = Date.now() + 2000;
  p.mode = 'patrol'; p.wp = null; p.ls = null; p.tgt = null; p.ammo = undefined; p.res = 0; p.relAt = 0; p.alertPos = null;
}
function respawn(r, p) { spawn(r, p); if (!p.bot) io.to(p.id).emit('respawn', { x: p.x, y: p.y, z: p.z, yaw: p.yaw, main: p.main }); }
function board(r) {
  const now = Date.now();
  return { ps: Object.values(r.ps).map(p => ({ id: p.id, n: p.name, t: p.team, c: p.color, k: p.kills, d: p.deaths, b: p.bot ? 1 : 0 })), ts: r.ts, st: r.st, mode: r.mode, rem: Math.max(0, r.endAt - now), nrem: r.mode === 'timed' ? Math.max(0, r.nextAt - now) : 0, tk: MODES[r.mode].kills, n: total(r), hn: humans(r).length };
}
const sendBoard = r => io.to(r.key).emit('board', board(r));

function addBot(r) {
  const id = 'b' + (uid++);
  const p = newP(id, 'Bot ' + BOTNAMES[rnd(BOTNAMES.length)], true);
  r.ps[id] = p; assignTeam(r, p); spawn(r, p);
}
function adjustBots(r) {
  const h = humans(r).length, bots = Object.values(r.ps).filter(p => p.bot);
  const want = r.botsN > 0 ? Math.max(0, r.botsN - h) : 0;
  while (bots.length > want) { const b = bots.pop(); delete r.ps[b.id]; }
  for (let i = bots.length; i < want; i++) addBot(r);
}

const PK_RESPAWN = { med: 25000, ammo: 18000 };
function takePickup(r, p, i) {
  const k = r.pk[i]; if (!k || !k.a || !p.alive) return false;
  if (Math.hypot(p.x - k.x, p.z - k.z) > 4 || Math.abs(p.y - k.y) > 3) return false;
  if (k.t === 'med') { if (p.hp >= 100) return false; p.hp = Math.min(100, p.hp + 50); }
  else if (p.bot) { const w = W[p.main]; if (p.ammo === undefined) { p.ammo = w.mag; p.res = w.mag * 2; } if (p.res >= w.mag * 4) return false; p.res = Math.min(w.mag * 4, p.res + Math.max(2, w.mag)); }
  k.a = 0; k.at = Date.now() + PK_RESPAWN[k.t]; io.to(r.key).emit('pk', { i, a: 0 });
  if (!p.bot) io.to(p.id).emit('got', { i, t: k.t, hp: Math.round(p.hp) });
  return true;
}

function applyDamage(r, v, a, dmg, w, head) {
  if (!v.alive || r.st !== 'play') return;
  const now = Date.now(); if (now < v.inv) return;
  if (a !== v && r.mode === 'tdm' && a.team === v.team) return;
  if (a === v) dmg *= 0.5;
  v.hp -= dmg;
  if (v.bot && a !== v) { v.alertPos = { x: a.x, y: a.y, z: a.z }; v.alertT0 = now; }
  if (!v.bot) io.to(v.id).emit('hp', { hp: Math.max(0, Math.round(v.hp)), f: a.id, ax: a.x, az: a.z });
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

/* ================= BOT AI ================= */
const enemiesOf = (r, b) => Object.values(r.ps).filter(q => q !== b && q.alive && !(r.mode === 'tdm' && q.team === b.team));
// vision: ~120 degree cone in front, line of sight required. Anything behind a bot is invisible to it.
function canSee(r, b, t) {
  const dx = t.x - b.x, dz = t.z - b.z, hd = Math.hypot(dx, dz); if (hd > 75) return false;
  const dot = (dx * -Math.sin(b.yaw) + dz * -Math.cos(b.yaw)) / (hd || 1); if (hd > 2 && dot < .5) return false;
  const o = { x: b.x, y: b.y + 1.6, z: b.z }, ex = t.x - o.x, ey = t.y + (t.crouch ? .7 : 1.2) - o.y, ez = t.z - o.z, L = Math.hypot(ex, ey, ez) || 1;
  return G.rayBoxes(o, { x: ex / L, y: ey / L, z: ez / L }, L, r.m.boxes) >= L - .6;
}
// hearing: gunshots (45m), or loud footsteps very close. Crouching is silent.
function canHear(b, t, now) {
  const dist = Math.hypot(t.x - b.x, t.z - b.z);
  if (t.lastShot && now - t.lastShot < 1200 && dist < 45) return true;
  if (!t.crouch && (t.spd || 0) > 3.5 && dist < 7) return true;
  return false;
}
function botFire(r, b, t, w, shots, dist) {
  const o = { x: b.x, y: b.y + 1.6, z: b.z }, moving = (t.spd || 0) > 3;
  let p = Math.max(.1, .62 - dist / 170 - (moving ? .14 : 0) - (b.onGround ? 0 : .1)); if (w.sniper) p = Math.min(.8, p + .15);
  let dmg = 0; const n = shots * (w.pellets || 1);
  for (let i = 0; i < n; i++) if (Math.random() < p * (w.pellets ? .55 : 1)) dmg += w.dmg * (w.sniper ? 1 : 1 - .5 * Math.min(1, dist / w.range));
  const cx = t.x, cy = t.y + (t.crouch ? .7 : 1.1), cz = t.z, miss = dmg > 0 ? 0 : 1.6;
  const ex = cx + (Math.random() - .5) * miss * 2, ey = cy + (Math.random() - .5) * miss, ez = cz + (Math.random() - .5) * miss * 2;
  let dx = ex - o.x, dy = ey - o.y, dz = ez - o.z; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
  io.to(r.key).emit('fx', { id: b.id, w: b.main, o: [o.x, o.y, o.z], d: [dx, dy, dz], e: [ex, ey, ez] });
  if (dmg > 0) {
    if (w.kind === 'proj') setTimeout(() => { if (rooms[r.key]) applyDamage(r, t, b, Math.min(dmg, w.dmg), b.main, false); }, dist / w.speed * 1000);
    else applyDamage(r, t, b, dmg, b.main, false);
  }
}
function botThink(r, b, dt, now) {
  if (!b.alive || r.st !== 'play') return;
  const w = W[b.main];
  if (b.ammo === undefined) { b.ammo = w.mag; b.res = w.mag * 2; b.relAt = 0; }
  if (b.relAt && now >= b.relAt) { const take = Math.min(w.mag - b.ammo, b.res); b.ammo += take; b.res -= take; b.relAt = 0; }
  const dry = b.ammo <= 0 && b.res <= 0; // out of ammo: fight with the knife and go looking for ammo
  b.cur = dry ? G.KNIFE : b.main;
  // grab nearby pickups (bots need them as much as players)
  for (let i = 0; i < r.pk.length; i++) { const k = r.pk[i]; if (k.a && Math.hypot(b.x - k.x, b.z - k.z) < 1.5 && Math.abs(b.y - k.y) < 2 && ((k.t === 'med' && b.hp < 100) || (k.t === 'ammo' && b.res < w.mag * 4))) { takePickup(r, b, i); break; } }
  // --- senses
  let seen = null, sd = 1e9, heard = null;
  for (const q of enemiesOf(r, b)) {
    const d = Math.hypot(q.x - b.x, q.z - b.z);
    if (d < sd && canSee(r, b, q)) { seen = q; sd = d; } else if (!heard && canHear(b, q, now)) heard = q;
  }
  if (seen) { if (now - (b.lastSaw || 0) > 2500) b.reactAt = now + 250 + Math.random() * 350; b.lastSaw = now; b.tgt = seen.id; b.ls = { x: seen.x, y: seen.y, z: seen.z, t: now }; }
  else if (heard && (!b.ls || now - b.ls.t > 500)) b.ls = { x: heard.x, y: heard.y, z: heard.z, t: now };
  if (b.alertPos && (!b.ls || b.ls.t < b.alertT0)) b.ls = { x: b.alertPos.x, y: b.alertPos.y, z: b.alertPos.z, t: b.alertT0 };
  // --- decide movement
  const spd = G.speedOf(b.main); let dirx = 0, dirz = 0, face = b.yaw, turnRate = 4, wantJump = false;
  const toward = (px, pz) => { const dx = px - b.x, dz = pz - b.z, d = Math.hypot(dx, dz) || 1; dirx = dx / d; dirz = dz / d; face = Math.atan2(-dx, -dz); return d; };
  if (seen) {
    const dx = seen.x - b.x, dz = seen.z - b.z, dist = Math.hypot(dx, dz) || 1, fx = dx / dist, fz = dz / dist; face = Math.atan2(-dx, -dz); turnRate = 9;
    if (b.mode === 'perch') {
      if (dist < 28 && b.y - seen.y > 2.2 && now > b.perchAt) { b.mode = 'drop'; b.dropAt = now; if (b.onGround) b.vy = G.JUMP; }
    } else if (b.mode === 'drop') { dirx = fx; dirz = fz; }
    else {
      if (b.mode === 'climb') b.mode = 'patrol';
      const ideal = dry ? 1.4 : w.sniper ? 38 : (w.pellets ? 8 : (w.kind === 'proj' ? 22 : (w.snd === 'mg' ? 24 : 13)));
      const want = dist > ideal + 4 ? 1 : (dist < ideal - 4 ? -.7 : 0), st = Math.sin(now / 650 + b.seed) * .7 * b.side;
      dirx = fx * want - fz * st; dirz = fz * want + fx * st; if (Math.random() < .012 && b.onGround) wantJump = true;
    }
  } else if (b.mode === 'drop') {
    if (b.ls) toward(b.ls.x, b.ls.z);
    if (b.onGround && now - b.dropAt > 400) { b.mode = 'patrol'; b.wp = null; }
  } else if (b.ls && now - b.ls.t < 7000 && b.mode !== 'perch') {
    if (toward(b.ls.x, b.ls.z) < 2.5) b.ls = null; turnRate = 7;
  } else if (b.mode === 'perch') {
    face = b.baseYaw + Math.sin(now / 1200 + b.seed) * 1.2; turnRate = 2.5; if (now > b.perchEnd) { b.mode = 'patrol'; b.wp = null; }
  } else {
    let wp = b.mode === 'climb' ? b.plan[b.pi] : b.wp;
    if (!wp || now > b.wpEnd) {
      const pc = r.m.perches;
      let want = null, bd = 90; // hurt -> medkit, low/out of ammo -> ammo crate
      for (const k of r.pk) { if (!k.a) continue; if ((k.t === 'med' && b.hp < 60) || (k.t === 'ammo' && b.res < w.mag)) { const d = Math.hypot(k.x - b.x, k.z - b.z); if (d < bd) { bd = d; want = k; } } }
      if (want) { b.wp = wp = [want.x, want.y, want.z]; b.mode = 'patrol'; b.wpEnd = now + 15000; }
      else if (pc && pc.length && Math.random() < .3) { b.plan = pc[rnd(pc.length)]; b.pi = 0; b.mode = 'climb'; b.wpEnd = now + 25000; wp = b.plan[0]; }
      else { const s = r.m.spawns[rnd(r.m.spawns.length)]; b.wp = wp = [s[0], s[1], s[2]]; b.mode = 'patrol'; b.wpEnd = now + 12000; }
    }
    const d = toward(wp[0], wp[2]);
    if (d < 1.3 && (b.mode !== 'climb' || Math.abs(b.y - wp[1]) < 1.6)) {
      if (b.mode === 'climb') { b.pi++; if (b.pi >= b.plan.length) { b.mode = 'perch'; b.baseYaw = b.yaw; b.perchEnd = now + 12000 + Math.random() * 8000; b.perchAt = now + 1500; } }
      else b.wp = null;
    }
    if (b.mode === 'patrol') face += Math.sin(now / 1000 + b.seed) * .5; // look around while walking
  }
  // --- apply movement (same speed as a player)
  let mx = dirx, mz = dirz; const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
  if (b.onGround) { b.vx = mx * spd; b.vz = mz * spd; } else { const k = Math.min(1, dt * 3); b.vx += (mx * spd - b.vx) * k; b.vz += (mz * spd - b.vz) * k; }
  if (wantJump && b.onGround) b.vy = G.JUMP;
  b.vy -= G.GRAV * dt;
  const px = b.x, pz = b.z;
  G.move(b, dt, r.m.boxes, r.m.floorY);
  if (L > .1 && b.onGround && Math.hypot(b.x - px, b.z - pz) < spd * dt * .15 && now - b.lastJump > (b.mode === 'drop' ? 250 : 700)) { b.vy = G.JUMP; b.lastJump = now; b.side = -b.side; }
  const lim = r.m.half - (r.map === 'rig' ? 3 : 1); b.x = Math.max(-lim, Math.min(lim, b.x)); b.z = Math.max(-lim, Math.min(lim, b.z));
  if (b.y < r.m.killY) { applyDamage(r, b, b, 999, 0, false); return; }
  b.spd = b.onGround ? Math.hypot(b.vx, b.vz) : b.spd;
  // --- turn smoothly (so sneaking up behind works)
  const rem = angDiff(b.yaw, face), step = Math.max(-turnRate * dt, Math.min(turnRate * dt, rem)); b.yaw += step;
  if (seen) { const dd = Math.hypot(seen.x - b.x, seen.z - b.z) || 1; b.pitch = Math.atan2((seen.y + 1.2) - (b.y + 1.6), dd); } else b.pitch *= .9;
  // --- shooting + reloading
  if (seen && now >= (b.reactAt || 0) && !b.relAt && Math.abs(angDiff(b.yaw, face)) < .22) {
    const dist3 = Math.hypot(seen.x - b.x, seen.y - b.y, seen.z - b.z);
    if (dry) {
      if (dist3 < 2.6 && now >= (b.nextShot || 0)) { b.nextShot = now + 550; b.lastShot = 0; io.to(r.key).emit('fx', { id: b.id, w: G.KNIFE, o: [b.x, b.y + 1.6, b.z], d: [0, 0, 0], e: null }); applyDamage(r, seen, b, W[G.KNIFE].dmg, G.KNIFE, false); }
    } else if (dist3 < w.range) {
      if (b.ammo <= 0) { if (b.res > 0) b.relAt = now + w.reload * 1000; }
      else {
        let shots = 0;
        if (w.auto) {
          b.acc = (b.acc || 0) + dt * w.rate / 60; shots = Math.floor(b.acc); b.acc -= shots;
          if (now < (b.burstPause || 0)) shots = 0; else { b.burst = (b.burst || 0) + shots; if (b.burst >= 6 + rnd(8)) { b.burst = 0; b.burstPause = now + 250 + Math.random() * 350; } }
        } else if (now >= (b.nextShot || 0)) { shots = 1; b.nextShot = now + 60000 / w.rate + Math.random() * 120; }
        shots = Math.min(shots, b.ammo);
        if (shots > 0) { b.ammo -= shots; b.lastShot = now; botFire(r, b, seen, w, shots, dist3); if (b.ammo <= 0 && b.res > 0) b.relAt = now + w.reload * 1000; }
      }
    }
  } else if (!b.relAt && b.res > 0 && b.ammo < w.mag * .3 && !seen) b.relAt = now + w.reload * 1000; // reload when out of combat
}

function tick(r) {
  const now = Date.now(), dt = .05; r.tick++;
  const tdmReady = total(r) >= 4 && humans(r).length >= 1;
  if (r.st === 'wait') { if (r.mode === 'tdm' && tdmReady) startMatch(r); }
  else if (r.st === 'play') {
    if (r.mode === 'tdm' && total(r) < 4) { r.st = 'wait'; sendBoard(r); }
    else {
      if (r.mode === 'timed' && now >= r.nextAt) {
        r.nextAt = now + 30000; r.timedGun = rnd(NG);
        for (const p of Object.values(r.ps)) { p.main = r.timedGun; p.cur = p.main; p.ammo = undefined; }
        io.to(r.key).emit('gun', { main: r.timedGun, nrem: 30000 });
      }
      const cfg = MODES[r.mode];
      const top = r.mode === 'tdm' ? Math.max(r.ts.red, r.ts.blue) : Math.max(0, ...Object.values(r.ps).map(p => p.kills));
      if (now >= r.endAt || top >= cfg.kills) endMatch(r);
    }
  } else if (r.st === 'over' && now >= r.overAt) {
    if (r.mode === 'tdm' && total(r) < 4) { r.st = 'wait'; for (const p of Object.values(r.ps)) { p.kills = 0; p.deaths = 0; respawn(r, p); } r.ts = { red: 0, blue: 0 }; sendBoard(r); }
    else startMatch(r);
  }
  for (let i = 0; i < r.pk.length; i++) { const k = r.pk[i]; if (!k.a && now >= k.at) { k.a = 1; io.to(r.key).emit('pk', { i, a: 1 }); } }
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
  s.on('list', cb => {
    if (typeof cb !== 'function') return;
    cb(Object.values(rooms).filter(x => !x.priv).map(x => ({ code: x.code, name: x.name, mode: x.mode, map: x.map, n: humans(x).length, max: x.max, bots: x.botsN })));
  });
  s.on('join', d => {
    if (r || !d) return;
    let room = null;
    if (d.code) { room = rooms[String(d.code).toUpperCase().slice(0, 4)]; if (!room) return s.emit('err', 'Server not found'); }
    else if (d.create) room = makeRoom(d.create);
    else room = findQuick(MODES[d.mode] ? d.mode : 'classic', G.maps[d.map] ? d.map : 'rig');
    if (humans(room).length >= room.max) return s.emit('err', 'Server is full');
    r = room;
    const name = String(d.name || 'Soldier').replace(/[^\w \-]/g, '').slice(0, 14) || 'Soldier';
    p = newP(s.id, name, false); r.ps[s.id] = p; assignTeam(r, p); spawn(r, p); s.join(r.key); adjustBots(r);
    s.emit('init', { pu: r.pk.map((k, i) => k.a ? -1 : i).filter(i => i >= 0), id: s.id, mode: r.mode, map: r.map, code: r.code, sname: r.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw, main: p.main, team: p.team, color: p.color });
    sendBoard(r);
  });
  s.on('st', a => {
    if (!p || !p.alive || !Array.isArray(a)) return;
    const hh = r.m.half + 1, now = Date.now(), ox = p.x, oz = p.z;
    p.x = Math.max(-hh, Math.min(hh, num(a[0], p.x))); p.y = num(a[1], p.y); p.z = Math.max(-hh, Math.min(hh, num(a[2], p.z)));
    p.yaw = num(a[3], 0); p.pitch = num(a[4], 0); const c = a[5] | 0; p.cur = (c >= 0 && c <= 12) ? c : p.cur; p.crouch = a[6] ? 1 : 0;
    const dts = Math.max(.02, (now - p.lastSt) / 1000); p.lastSt = now; p.spd += (Math.hypot(p.x - ox, p.z - oz) / dts - p.spd) * .5;
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
    const wd = W[d.w | 0]; if (wd && wd.kind !== 'melee') p.lastShot = Date.now(); // bots can hear gunshots
    s.to(r.key).emit('fx', { id: s.id, w: d.w | 0, o: d.o.slice(0, 3).map(Number), d: d.d.slice(0, 3).map(Number), e: Array.isArray(d.e) ? d.e.slice(0, 3).map(Number) : null });
  });
  s.on('pick', d => { if (!p || !d) return; takePickup(r, p, d.i | 0); });
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
