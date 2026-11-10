(function (root) {
'use strict';
const G = {};

/* ================= WEAPONS ================= */
const D = { kind: 'hit', auto: false, dmg: 20, rate: 600, spread: 0.02, mag: 30, reload: 2, range: 100, w: 3, recoil: 0.01, pellets: 0, sniper: false, speed: 0, grav: 0, splash: 0 };
const mk = o => Object.assign({}, D, o);
const W = [
  mk({ id: 'glock17', name: 'Glock 17', dmg: 22, rate: 400, spread: .012, mag: 17, reload: 1.4, range: 90, w: .7, snd: 'pistol', recoil: .014 }),
  mk({ id: 'mpx', name: 'MPX', auto: true, dmg: 17, rate: 800, spread: .02, mag: 30, reload: 1.7, w: 2.9, snd: 'smg', recoil: .009 }),
  mk({ id: 'mp7', name: 'MP7', auto: true, dmg: 14, rate: 950, spread: .024, mag: 40, reload: 1.6, w: 1.9, snd: 'smg2', recoil: .007 }),
  mk({ id: 'p90', name: 'P90', auto: true, dmg: 13, rate: 900, spread: .022, mag: 50, reload: 2.1, w: 2.6, snd: 'smg2', recoil: .007 }),
  mk({ id: 'mp40', name: 'MP40', auto: true, dmg: 19, rate: 520, spread: .02, mag: 32, reload: 2, w: 4, snd: 'smg', recoil: .01 }),
  mk({ id: 'mg42', name: 'MG42', auto: true, dmg: 20, rate: 1150, spread: .032, mag: 100, reload: 4.2, w: 11.6, snd: 'mg', range: 130, recoil: .012 }),
  mk({ id: 'kar98k', name: 'Kar98k', dmg: 100, rate: 55, spread: .07, mag: 5, reload: 2.6, w: 3.9, snd: 'rifle', range: 400, recoil: .05, sniper: true }),
  mk({ id: 'springfield', name: 'Springfield', dmg: 100, rate: 60, spread: .07, mag: 5, reload: 2.8, w: 4.0, snd: 'rifle', range: 400, recoil: .05, sniper: true }),
  mk({ id: 'cockatoo', name: 'Cockatoo Launcher', kind: 'proj', dmg: 95, splash: 5.5, speed: 26, grav: 5, rate: 45, mag: 2, reload: 3, w: 6.2, snd: 'launch', recoil: .04 }),
  mk({ id: 'rpg7', name: 'RPG-7', kind: 'proj', dmg: 120, splash: 6.5, speed: 42, rate: 40, mag: 1, reload: 3.3, w: 6.3, snd: 'launch', recoil: .05 }),
  mk({ id: 'rem870', name: 'Remington 870', pellets: 9, dmg: 13, spread: .055, rate: 75, mag: 6, reload: 2.6, w: 3.6, snd: 'shotgun', range: 45, recoil: .04 }),
  mk({ id: 'dbl', name: 'Double Barrel', pellets: 10, dmg: 14, spread: .065, rate: 150, mag: 2, reload: 2.2, w: 3.2, snd: 'shotgun', range: 40, recoil: .05 }),
  mk({ id: 'knife', name: 'Knife', kind: 'melee', dmg: 55, rate: 110, mag: 0, reload: 0, w: .4, range: 2.8, snd: 'knife' })
];
G.W = W; G.NG = 12; G.KNIFE = 12;
// heavier weapon = slower. knife ~11.4 m/s, MG42 5.4 m/s
G.speedOf = i => Math.max(5.4, 11.6 - W[i].w * 0.55);

/* ================= PHYSICS ================= */
G.GRAV = 14; G.JUMP = 8.8;
G.hit = function (b, x, y, z, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const k = boxes[i];
    if (x + b.r > k.x0 && x - b.r < k.x1 && z + b.r > k.z0 && z - b.r < k.z1 && y + b.h > k.y0 + 0.001 && y < k.y1 - 0.001) return k;
  }
  return null;
};
function stepTop(b, x, y, z, boxes) {
  let top = -1e9;
  for (const k of boxes) {
    if (x + b.r > k.x0 && x - b.r < k.x1 && z + b.r > k.z0 && z - b.r < k.z1 && y + b.h > k.y0 + 0.001 && y < k.y1 - 0.001) top = Math.max(top, k.y1);
  }
  return top - y <= 0.62 ? top : null;
}
G.move = function (b, dt, boxes, floorY) {
  let nx = b.x + b.vx * dt;
  if (G.hit(b, nx, b.y, b.z, boxes)) {
    const top = b.onGround ? stepTop(b, nx, b.y, b.z, boxes) : null;
    if (top !== null && !G.hit(b, nx, top, b.z, boxes)) { b.x = nx; b.y = top; } else b.vx = 0;
  } else b.x = nx;
  let nz = b.z + b.vz * dt;
  if (G.hit(b, b.x, b.y, nz, boxes)) {
    const top = b.onGround ? stepTop(b, b.x, b.y, nz, boxes) : null;
    if (top !== null && !G.hit(b, b.x, top, nz, boxes)) { b.z = nz; b.y = top; } else b.vz = 0;
  } else b.z = nz;
  const ny = b.y + b.vy * dt;
  b.onGround = false; b.gb = null;
  const k = G.hit(b, b.x, ny, b.z, boxes);
  if (k) {
    if (b.vy <= 0) {
      let best = -1e9, bk = null;
      for (const q of boxes) {
        if (b.x + b.r > q.x0 && b.x - b.r < q.x1 && b.z + b.r > q.z0 && b.z - b.r < q.z1 && ny + b.h > q.y0 + 0.001 && ny < q.y1 - 0.001 && q.y1 <= b.y + 0.7 && q.y1 > best) { best = q.y1; bk = q; }
      }
      if (bk) { b.y = best; b.vy = 0; b.onGround = true; b.gb = bk; } else { b.vy = 0; }
    } else {
      let low = 1e9;
      for (const q of boxes) {
        if (b.x + b.r > q.x0 && b.x - b.r < q.x1 && b.z + b.r > q.z0 && b.z - b.r < q.z1 && ny + b.h > q.y0 + 0.001 && ny < q.y1 - 0.001 && q.y0 >= b.y + b.h - 0.1 && q.y0 < low) low = q.y0;
      }
      if (low < 1e8) b.y = low - b.h - 0.001;
      b.vy = 0;
    }
  } else if (floorY !== null && floorY !== undefined && ny <= floorY) {
    b.y = floorY; b.vy = 0; b.onGround = true; b.gb = null;
  } else b.y = ny;
};
G.rayBoxes = function (o, d, maxT, boxes) {
  let best = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const k = boxes[i];
    let t0 = 0, t1 = Math.min(maxT, best), ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const oo = a === 0 ? o.x : a === 1 ? o.y : o.z, dd = a === 0 ? d.x : a === 1 ? d.y : d.z;
      const lo = a === 0 ? k.x0 : a === 1 ? k.y0 : k.z0, hi = a === 0 ? k.x1 : a === 1 ? k.y1 : k.z1;
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) ok = false; }
      else {
        let ta = (lo - oo) / dd, tb = (hi - oo) / dd; if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
};
G.raySphere = function (o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return -1;
  const s = Math.sqrt(disc); let t = -b - s; if (t < 0) t = -b + s;
  return t >= 0 ? t : -1;
};

/* ================= MAP HELPERS ================= */
function rng(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function mkMap(o) {
  const m = Object.assign({ boxes: [], deco: [], spawns: [], killY: -30, ground: null, water: null }, o);
  m.box = function (x, y, z, w, h, d, c, mat) {
    m.boxes.push({ x: x, y: y, z: z, w: w, h: h, d: d, c: c, mat: mat || '', x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 });
  };
  return m;
}
function wallX(m, xa, xb, z, y0, h, t, c, gaps, mat) {
  gaps = (gaps || []).slice().sort((a, b) => a.c - b.c); let cur = xa;
  for (const g of gaps) {
    const g0 = g.c - g.w / 2, g1 = g.c + g.w / 2, bot = g.y || 0, top = g.t || 2.5;
    if (g0 > cur) m.box((cur + g0) / 2, y0, z, g0 - cur, h, t, c, mat);
    if (bot > 0) m.box(g.c, y0, z, g.w, bot, t, c, mat);
    if (h > top) m.box(g.c, y0 + top, z, g.w, h - top, t, c, mat);
    cur = g1;
  }
  if (xb > cur) m.box((cur + xb) / 2, y0, z, xb - cur, h, t, c, mat);
}
function wallZ(m, za, zb, x, y0, h, t, c, gaps, mat) {
  gaps = (gaps || []).slice().sort((a, b) => a.c - b.c); let cur = za;
  for (const g of gaps) {
    const g0 = g.c - g.w / 2, g1 = g.c + g.w / 2, bot = g.y || 0, top = g.t || 2.5;
    if (g0 > cur) m.box(x, y0, (cur + g0) / 2, t, h, g0 - cur, c, mat);
    if (bot > 0) m.box(x, y0, g.c, t, bot, g.w, c, mat);
    if (h > top) m.box(x, y0 + top, g.c, t, h - top, g.w, c, mat);
    cur = g1;
  }
  if (zb > cur) m.box(x, y0, (cur + zb) / 2, t, h, zb - cur, c, mat);
}
const off = (a, o) => (a || []).map(g => Object.assign({}, g, { c: g.c + o }));
// gp: {n,s,e,w:[{c:offset,w,y?,t?}]}
function building(m, x, z, w, d, y0, h, c, gp, mat) {
  gp = gp || {}; const t = 0.4;
  wallX(m, x - w / 2, x + w / 2, z - d / 2, y0, h, t, c, off(gp.n, x), mat);
  wallX(m, x - w / 2, x + w / 2, z + d / 2, y0, h, t, c, off(gp.s, x), mat);
  wallZ(m, z - d / 2 + t / 2, z + d / 2 - t / 2, x - w / 2, y0, h, t, c, off(gp.w, z), mat);
  wallZ(m, z - d / 2 + t / 2, z + d / 2 - t / 2, x + w / 2, y0, h, t, c, off(gp.e, z), mat);
}
function stairs(m, x, y0, z, dir, n, w, c) {
  const rise = 0.4, run = 0.8;
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * rise, o = i * run + run / 2; let px = x, pz = z, bw = w, bd = w;
    if (dir === '+x') { px = x + o; bw = run; } else if (dir === '-x') { px = x - o; bw = run; }
    else if (dir === '+z') { pz = z + o; bd = run; } else { pz = z - o; bd = run; }
    m.box(px, y0, pz, bw, h, bd, c, 'metal');
  }
}
function ring(m, half, h, t, c, gapS, mat) {
  wallX(m, -half, half, -half, 0, h, t, c, null, mat);
  wallX(m, -half, half, half, 0, h, t, c, gapS, mat);
  wallZ(m, -half, half, -half, 0, h, t, c, null, mat);
  wallZ(m, -half, half, half, 0, h, t, c, null, mat);
}
function free(rects, x, z, pad) { for (const r of rects) if (x > r[0] - pad && x < r[1] + pad && z > r[2] - pad && z < r[3] + pad) return false; return true; }

/* ================= MAP: OIL RIG ================= */
function rigTile(m, v, F) {
  m.box(0, 3.5, 0, 64, .5, 64, '#5e676f', 'metal'); // deck top y=4
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * 26, -16, sz * 26, 5, 19.5, 5, '#c47a24', 'metal');
  for (let i = -3; i <= 3; i++) m.deco.push({ t: 'box', x: i * 9, y: 2.5, z: 0, w: 1, h: .9, d: 64, c: '#444b52' });
  const R = (x, z, w, d) => m.box(x, 4, z, w, 1.1, d, '#e0b52c', 'metal');
  if (F.n) R(0, -31.7, 64, .4); if (F.w) R(-31.7, 0, .4, 64); if (F.e) { R(31.7, -13, .4, 38); R(31.7, 23, .4, 18); } if (F.s) { R(-18, 31.7, 28, .4); R(20, 31.7, 24, .4); }
  // upper deck (top y=8.8)
  m.box(16, 8.4, -19, 28, .4, 22, '#6b747c', 'metal');
  for (const cx of [3.5, 28.5]) for (const cz of [-29, -9]) m.box(cx, 4, cz, 1.2, 4.4, 1.2, '#c47a24', 'metal');
  stairs(m, -7.4, 4, -12, '+x', 12, 3.2, '#80888f');
  stairs(m, 26, 4, 1.6, '-z', 12, 3, '#80888f');
  m.box(16, 8.8, -30, 28, 1.1, .3, '#e0b52c', 'metal'); m.box(30, 8.8, -19, .3, 1.1, 22, '#e0b52c', 'metal'); m.box(13.5, 8.8, -8, 17, 1.1, .3, '#e0b52c', 'metal');
  // helipad (top y=8)
  m.box(-22, 7.6, 18, 14, .4, 14, '#6f777e', 'metal');
  for (const cx of [-28.5, -15.5]) for (const cz of [11.5, 24.5]) m.box(cx, 4, cz, 1, 3.6, 1, '#c47a24', 'metal');
  stairs(m, -7, 4, 18, '-x', 10, 3.4, '#80888f');
  m.box(-29.2, 8, 18, .3, 1, 14, '#e0b52c', 'metal');
  m.deco.push({ t: 'cyl', x: -22, y: 8, z: 18, r: 6, h: .05, c: '#2f5f3f' }, { t: 'box', x: -22, y: 8.06, z: 18, w: .8, h: .02, d: 6, c: '#f2f2f2' }, { t: 'box', x: -24, y: 8.06, z: 18, w: .8, h: .02, d: 6, c: '#f2f2f2' }, { t: 'box', x: -23, y: 8.06, z: 18, w: 2.4, h: .02, d: .8, c: '#f2f2f2' });
  // cabin with walkable roof
  building(m, -17, -8, 14, 9, 4, 3.4, '#cfd3d6', { s: [{ c: -3, w: 2, t: 2.6 }, { c: 3.5, w: 1.6, y: 1, t: 2.2 }], w: [{ c: 0, w: 2, t: 2.6 }], n: [{ c: -4, w: 1.6, y: 1, t: 2.2 }, { c: 4, w: 1.6, y: 1, t: 2.2 }] }, 'metal');
  m.box(-17, 7.4, -8, 14.8, .3, 9.8, '#7d848b', 'metal');
  stairs(m, -2.8, 4, -8, '-x', 9, 2.6, '#80888f');
  // containers, tanks, pipes
  const C = (x, y, z, rot, c) => m.box(x, y, z, rot ? 2.5 : 6, 2.6, rot ? 6 : 2.5, c, 'metal');
  C(8, 4, 10, 0, '#b23a2e'); C(8, 6.6, 10, 0, '#2e6db2'); C(14, 4, 13, 1, '#d9a21b'); C(-4, 4, 22, 0, '#2f8f5b'); C(2, 4, 28, 1, '#b23a2e');
  C(-12, 4, -24, 0, '#6b6b6b'); C(-12, 6.6, -24, 1, '#b23a2e'); C(18, 4, -4, 1, '#2e6db2'); C(-26, 4, 2, 1, '#d9a21b');
  for (const p of [[-27, -29], [-27, -22]]) { m.box(p[0], 4, p[1], 4.4, 4.6, 4.4, '#c9ced2', 'metal'); m.deco.push({ t: 'cyl', x: p[0], y: 4, z: p[1], r: 2.4, h: 4.6, c: '#c9ced2' }); }
  m.box(22, 4, 14, .9, 1.2, 12, '#8b5a2b', 'metal'); m.box(22, 4, 26, .9, 1.2, 4, '#8b5a2b', 'metal');
  m.deco.push({ t: 'beam', a: [22, 5.2, 8], b: [22, 5.2, 28], r: .35, c: '#9c6a3a' });
  // derrick
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = -8 + sx * 3, lz = -22 + sz * 3;
    m.box(lx, 4, lz, .8, 6, .8, '#e0b52c', 'metal');
    m.deco.push({ t: 'beam', a: [lx, 10, lz], b: [-8, 46, -22], r: .22, c: '#e0b52c' });
    m.deco.push({ t: 'beam', a: [lx, 10, lz], b: [-8 - sx * 3, 10, -22 + sz * 3], r: .12, c: '#e0b52c' });
    m.deco.push({ t: 'beam', a: [lx * 0.5 - 4, 26, lz * 0.5 - 11], b: [-8 - sx * 1.2, 26, -22 + sz * -1.2], r: .1, c: '#d4a62a' });
  }
  m.deco.push({ t: 'cyl', x: -8, y: 4, z: -22, r: .5, h: 40, c: '#555' });
  // flare stack + crane
  m.deco.push({ t: 'cyl', x: -30, y: 4, z: 30, r: .5, h: 26, c: '#888' }, { t: 'sph', x: -30, y: 31, z: 30, r: 1.4, c: '#ff8a1c' });
  m.box(28, 4, 22, 3, 5, 3, '#e0b52c', 'metal');
  m.deco.push({ t: 'beam', a: [28, 9, 22], b: [12, 24, 22], r: .35, c: '#e0b52c' }, { t: 'beam', a: [28, 9, 22], b: [28, 22, 22], r: .3, c: '#e0b52c' }, { t: 'beam', a: [28, 22, 22], b: [12, 24, 22], r: .12, c: '#444' });
  m.spawns = [[2, 4.1, 2], [-4, 4.1, -3], [20, 4.1, 16], [-26, 4.1, 26], [29, 4.1, 8], [-28, 4.1, -14], [-4, 4.1, 28 - 8], [10, 4.1, -20], [24, 4.1, -20], [16, 8.9, -19], [8, 8.9, -14], [-22, 8.1, 18], [-17, 7.8, -8]];
  m.perches = [[[-9, 4, -12], [3.5, 8.9, -12], [12, 8.9, -18]], [[-5, 4, 18], [-20, 8.1, 18]], [[-1, 4, -8], [-16, 7.8, -8]], [[26, 4, 4], [26, 8.9, -12], [20, 8.9, -18]]];
}

/* ================= MAP: VILLAGE ================= */
function villageTile(m, v) {
  const R = rng(11 + v * 13), used = [];
  m.deco.push({ t: 'box', x: 0, y: .02, z: 0, w: 7, h: .05, d: 120, c: '#a08c6a' }, { t: 'box', x: 0, y: .02, z: 6, w: 120, h: .05, d: 6, c: '#a08c6a' });
  const H = (x, z, w, d, c, rc, gp, h) => {
    h = h || 3.2; building(m, x, z, w, d, 0, h, c, gp, 'wood');
    m.deco.push({ t: 'pyr', x: x, y: h, z: z, w: w + 1.2, d: d + 1.2, h: 2.8, c: rc }, { t: 'box', x: x + w / 4, y: h + 1, z: z, w: .8, h: 2.2, d: .8, c: '#8a7f78' });
    used.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
  };
  const dE = { e: [{ c: 0, w: 1.8, t: 2.5 }], s: [{ c: -2.5, w: 1.4, y: 1, t: 2.2 }], n: [{ c: 0, w: 1.4, y: 1, t: 2.2 }] };
  const dW = { w: [{ c: 0, w: 1.8, t: 2.5 }], s: [{ c: 2.5, w: 1.4, y: 1, t: 2.2 }], n: [{ c: 0, w: 1.4, y: 1, t: 2.2 }] };
  H(-18, -26, 10, 8, '#d9cba7', '#9c3f2b', dE); H(-20, -9, 9, 8, '#c9b79a', '#6f3b2e', dE); H(-18, 20, 10, 8, '#e0d3b4', '#8c4a2a', dE); H(-22, 38, 9, 8, '#d3c4a0', '#7a3b2e', dE);
  H(18, -30, 11, 9, '#e0d5b8', '#42627e', dW); H(20, -11, 9, 8, '#cdbd9e', '#9c3f2b', dW); H(20, 20, 10, 9, '#d9cba7', '#5a4a3c', dW); H(23, 38, 9, 8, '#c9b79a', '#8c4a2a', dW);
  // barn
  building(m, -42, -4, 12, 18, 0, 5, '#8c3b2a', { n: [{ c: 0, w: 4, t: 3.6 }], s: [{ c: 0, w: 4, t: 3.6 }], e: [{ c: 5, w: 2, t: 2.6 }] }, 'wood');
  m.deco.push({ t: 'pyr', x: -42, y: 5, z: -4, w: 13, d: 19, h: 4, c: '#4a4a4a' }); used.push([-48, -36, -13, 5]);
  m.box(-42, 0, -4, 1.5, 1.4, 1.5, '#d8b55a'); // hay inside
  // church + free-standing bell tower with stairs
  building(m, 0, -48, 10, 14, 0, 6, '#dcd8cf', { s: [{ c: 0, w: 2.4, t: 3.2 }], w: [{ c: -3, w: 1.2, y: 1.2, t: 3.4 }, { c: 3, w: 1.2, y: 1.2, t: 3.4 }], e: [{ c: -3, w: 1.2, y: 1.2, t: 3.4 }, { c: 3, w: 1.2, y: 1.2, t: 3.4 }] }, 'concrete');
  m.deco.push({ t: 'pyr', x: 0, y: 6, z: -48, w: 11, d: 15, h: 4.5, c: '#4a3a34' });
  m.box(9, 0, -40, 4, 6.4, 4, '#cfcac0', 'concrete'); m.deco.push({ t: 'pyr', x: 9, y: 6.4, z: -40, w: 4.6, d: 4.6, h: 5, c: '#4a3a34' });
  m.box(7.2, 6.4, -40, .3, 1, 4, '#cfcac0'); m.box(10.8, 6.4, -40, .3, 1, 4, '#cfcac0'); m.box(9, 6.4, -42, 4, 1, .3, '#cfcac0');
  stairs(m, 9, 0, -25.2, '-z', 16, 2.2, '#b9b4aa'); used.push([7, 11, -42, -24], [-5, 5, -56, -40]);
  // well on the plaza
  m.box(0, 0, 6, 2.6, 1, 2.6, '#8f8a80', 'concrete'); m.deco.push({ t: 'cyl', x: 0, y: 0, z: 6, r: 1.5, h: 1, c: '#8f8a80' }, { t: 'beam', a: [-1.3, 0, 6], b: [-1.3, 3, 6], r: .12, c: '#5a3a1a' }, { t: 'beam', a: [1.3, 0, 6], b: [1.3, 3, 6], r: .12, c: '#5a3a1a' }, { t: 'pyr', x: 0, y: 3, z: 6, w: 3.4, d: 2.4, h: 1.2, c: '#7a3b2e' });
  used.push([-3, 3, 3, 9]);
  // truck
  m.box(-9, .7, -38, 2.4, 1.5, 6, '#3f6b3a'); m.box(-9, .7, -34.2, 2.4, 2, 2, '#2f5a2a'); m.deco.push({ t: 'box', x: -9, y: 0, z: -36, w: 2.8, h: .9, d: 5, c: '#1a1a1a' }); used.push([-11, -7, -41, -33]);
  // fences
  const F = (x, z, w, d) => m.box(x, 0, z, w, 1.1, d, '#8a6a3f', 'wood');
  F(-30, -16, .25, 14); F(-26, -23.5, 8, .25); F(30, -20, .25, 16); F(26, 28, 12, .25); F(-30, 28, .25, 14);
  // spawns
  m.spawns = [[0, 0, -30], [0, 0, -14], [0, 0, 20], [0, 0, 44], [-8, 0, 6], [8, 0, 6], [-30, 0, 6], [30, 0, 6], [-10, 0, 50], [10, 0, -22], [-34, 0, -16], [30, 0, -2], [45, 0, 6], [-50, 0, 20]];
  for (const s of m.spawns) used.push([s[0] - 2, s[0] + 2, s[2] - 2, s[2] + 2]);
  // trees, crates, hay
  for (let i = 0; i < 60; i++) {
    const x = (R() - .5) * 112, z = (R() - .5) * 112;
    if (Math.abs(x) < 5 || Math.abs(z - 6) < 5 || !free(used, x, z, 3)) continue;
    m.box(x, 0, z, .8, 3.6, .8, '#5b3d22', 'wood');
    const s = 2 + R() * 1.2; m.deco.push({ t: 'sph', x: x, y: 4.6, z: z, r: s, c: R() < .5 ? '#2f6b2a' : '#3b7a2c' }, { t: 'sph', x: x + .6, y: 5.8, z: z + .4, r: s * .7, c: '#357428' });
    used.push([x - 1, x + 1, z - 1, z + 1]);
  }
  for (let i = 0; i < 22; i++) {
    const x = (R() - .5) * 108, z = (R() - .5) * 108;
    if (Math.abs(x) < 5 || Math.abs(z - 6) < 5 || !free(used, x, z, 2)) continue;
    const hay = R() < .4, s = 1.2 + R() * .5;
    m.box(x, 0, z, hay ? 1.8 : s, hay ? 1.3 : s, hay ? 1.8 : s, hay ? '#d8b55a' : '#9b6b3a', hay ? '' : 'wood');
    if (R() < .4) m.box(x + .2, hay ? 1.3 : s, z, 1.1, 1.1, 1.1, '#a87a45', 'wood');
    used.push([x - 1.5, x + 1.5, z - 1.5, z + 1.5]);
  }
  m.perches = [[[9, 0, -23], [9, 6.5, -40]]];
}

/* ================= MAP: ZOO ================= */
function zooTile(m, v) {
  const R = rng(23 + v * 17), used = [];
  m.deco.push({ t: 'box', x: 0, y: .02, z: 0, w: 7, h: .05, d: 120, c: '#d2c29a' }, { t: 'box', x: 0, y: .02, z: 0, w: 120, h: .05, d: 7, c: '#d2c29a' }, { t: 'cyl', x: 0, y: 0, z: 0, r: 11, h: .06, c: '#d9caa3' });
  m.box(0, 0, 0, 5, .9, 5, '#9aa4ad', 'concrete'); m.deco.push({ t: 'cyl', x: 0, y: 0, z: 0, r: 3.2, h: 1, c: '#9aa4ad' }, { t: 'cyl', x: 0, y: .9, z: 0, r: 2.6, h: .1, c: '#5bbad5' }, { t: 'cyl', x: 0, y: .9, z: 0, r: .3, h: 2.2, c: '#9aa4ad' });
  used.push([-12, 12, -12, 12]);
  const pen = (x, z, w, d, gp) => { building(m, x, z, w, d, 0, 2.1, '#46545e', gp, 'metal'); used.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]); };
  // NW elephants
  pen(-28, -28, 26, 24, { e: [{ c: 6, w: 5, t: 2.1 }], s: [{ c: 6, w: 5, t: 2.1 }] });
  const ele = (x, z) => {
    for (const lx of [-1.6, 1.6]) for (const lz of [-.8, .8]) m.box(x + lx, 0, z + lz, .8, 1.4, .8, '#7f848c');
    m.box(x, 1.4, z, 5, 2.6, 2.4, '#8a8f98'); m.box(x + 3.1, 1.9, z, 1.6, 1.9, 1.7, '#8a8f98');
    m.deco.push({ t: 'box', x: x + 3.8, y: .4, z: z, w: .55, h: 1.9, d: .55, c: '#80858d' }, { t: 'box', x: x + 2.6, y: 2.2, z: z + 1.1, w: .9, h: 1.5, d: .2, c: '#7a7f87' }, { t: 'box', x: x + 2.6, y: 2.2, z: z - 1.1, w: .9, h: 1.5, d: .2, c: '#7a7f87' }, { t: 'box', x: x + 3.9, y: 1.7, z: z + .6, w: .8, h: .12, d: .12, c: '#f4f0e0' }, { t: 'box', x: x - 2.6, y: 3.2, z: z, w: .12, h: 1.3, d: .12, c: '#7a7f87' });
  };
  ele(-30, -30); ele(-22, -22);
  m.box(-36, 0, -22, 3, 1.6, 3, '#6f6a60'); m.box(-20, 0, -34, 3, 1.2, 3, '#6f6a60');
  // NE giraffes
  pen(28, -28, 26, 24, { w: [{ c: 6, w: 5, t: 2.1 }], s: [{ c: -6, w: 5, t: 2.1 }] });
  const gir = (x, z) => {
    for (const lx of [-1, 1]) for (const lz of [-.4, .4]) m.box(x + lx, 0, z + lz, .35, 2.4, .35, '#e0a63d');
    m.box(x, 2.4, z, 3, 1.5, 1.2, '#e0a63d'); m.box(x + 1.4, 3.9, z, .55, 4.2, .55, '#e0a63d');
    m.deco.push({ t: 'box', x: x + 1.8, y: 7.7, z: z, w: 1, h: .5, d: .5, c: '#e0a63d' }, { t: 'box', x: x + 1.3, y: 8.1, z: z, w: .1, h: .3, d: .1, c: '#6b4a1a' });
    for (let i = 0; i < 5; i++) m.deco.push({ t: 'box', x: x - 1 + i * .6, y: 2.9 + (i % 2) * .5, z: z + .62, w: .4, h: .4, d: .05, c: '#7a4a1a' }, { t: 'box', x: x - 1 + i * .6, y: 2.9 + (i % 2) * .5, z: z - .62, w: .4, h: .4, d: .05, c: '#7a4a1a' });
  };
  gir(24, -30); gir(34, -22); m.box(22, 0, -20, 2.2, 1, 2.2, '#6f6a60');
  // SW lions on rocks
  pen(-28, 28, 26, 24, { e: [{ c: -6, w: 5, t: 2.1 }], n: [{ c: 6, w: 5, t: 2.1 }] });
  m.box(-30, 0, 30, 7, 1.2, 6, '#7d7468'); m.box(-30, 1.2, 30, 4.5, 1.2, 4, '#857b6e'); m.box(-30, 2.4, 30, 2.4, 1.2, 2.6, '#8d8376');
  m.box(-22, 0, 24, 3, 1, 3, '#7d7468');
  for (const p of [[-30, 33.4], [-22.5, 24]]) m.deco.push({ t: 'box', x: p[0], y: 1.0, z: p[1], w: 1.5, h: .8, d: .7, c: '#d0a35b' }, { t: 'sph', x: p[0] + .7, y: 1.5, z: p[1], r: .55, c: '#7a4a1a' });
  // SE monkeys + penguins
  pen(28, 28, 26, 24, { w: [{ c: -6, w: 5, t: 2.1 }], n: [{ c: -6, w: 5, t: 2.1 }] });
  for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.box(22 + q[0] * 3.6, 0, 30 + q[1] * 3.6, .5, 2, .5, '#8b5a2b', 'wood');
  m.box(22, 2, 30, 8, .3, 8, '#9b6a3b', 'wood'); m.box(33, 3.8, 30, 4, .3, 4, '#9b6a3b', 'wood'); m.box(33, 0, 30, .5, 3.8, .5, '#8b5a2b', 'wood');
  m.deco.push({ t: 'beam', a: [22, 2.3, 30], b: [33, 3.8, 30], r: .1, c: '#d8c47a' });
  m.deco.push({ t: 'box', x: 32, y: .03, z: 22, w: 10, h: .06, d: 6, c: '#5bbad5' });
  for (let i = 0; i < 6; i++) { const px = 28 + i * 1.2, pz = 25 + (i % 2) * 1.6; m.deco.push({ t: 'box', x: px, y: 0, z: pz, w: .4, h: .9, d: .3, c: '#15181c' }, { t: 'box', x: px, y: .1, z: pz - .12, w: .3, h: .6, d: .08, c: '#f4f4f4' }); }
  m.box(36, 0, 24, 2.4, 1, 2.4, '#e6eef2');
  // buildings
  const roofB = (x, z, w, d, c, rc) => { m.deco.push({ t: 'pyr', x: x, y: 3.4, z: z, w: w + 1, d: d + 1, h: 2.2, c: rc }); used.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]); };
  building(m, -14, 12, 10, 8, 0, 3.4, '#e8d8b0', { n: [{ c: 0, w: 2, t: 2.6 }], w: [{ c: 0, w: 1.6, y: 1, t: 2.2 }], e: [{ c: 0, w: 1.6, y: 1, t: 2.2 }] }, 'wood'); roofB(-14, 12, 10, 8, 0, '#9c3f2b');
  for (const t of [[-14, 19], [-8, 19], [-20, 19]]) { m.box(t[0], 0, t[1], 1.6, 1, 1.6, '#c9a56a', 'wood'); m.deco.push({ t: 'cyl', x: t[0], y: 1, z: t[1], r: .08, h: 2, c: '#555' }, { t: 'pyr', x: t[0], y: 3, z: t[1], w: 3, d: 3, h: .7, c: ['#d33', '#37a', '#3a5'][Math.floor(R() * 3)] }); }
  building(m, 14, 12, 12, 9, 0, 4, '#7fb7d9', { n: [{ c: 0, w: 2.4, t: 2.8 }], w: [{ c: 0, w: 2, t: 2.6 }] }, 'concrete'); m.box(14, 4, 12, 12.8, .3, 9.8, '#6aa3c6', 'concrete');
  stairs(m, 28, 0, 12, '-x', 10, 3, '#9aa4ad'); used.push([8, 28, 7, 17]);
  building(m, 14, -12, 11, 8, 0, 3.4, '#6f9a5a', { s: [{ c: 0, w: 2, t: 2.6 }], w: [{ c: 0, w: 1.6, y: 1, t: 2.2 }] }, 'wood'); roofB(14, -12, 11, 8, 0, '#44663a');
  building(m, -14, -12, 9, 8, 0, 3.4, '#d6a65a', { s: [{ c: 0, w: 2, t: 2.6 }], e: [{ c: 0, w: 1.6, y: 1, t: 2.2 }] }, 'wood'); roofB(-14, -12, 9, 8, 0, '#8c3b2a');
  // spawns
  m.spawns = [[0, 0, -20], [0, 0, 20], [0, 0, 40], [-20, 0, 0], [20, 0, 0], [40, 0, 0], [-42, 0, 0], [0, 0, -42], [-8, 0, 8], [5, 0, -8], [30, 0, 4], [-30, 0, -4], [6, 0, 52], [-6, 0, 30]];
  for (const s of m.spawns) used.push([s[0] - 2, s[0] + 2, s[2] - 2, s[2] + 2]);
  for (let i = 0; i < 40; i++) {
    const x = (R() - .5) * 112, z = (R() - .5) * 112;
    if (Math.abs(x) < 5 || Math.abs(z) < 5 || !free(used, x, z, 3)) continue;
    m.box(x, 0, z, .8, 3.4, .8, '#5b3d22', 'wood');
    const s = 2 + R() * 1.2; m.deco.push({ t: 'sph', x: x, y: 4.4, z: z, r: s, c: R() < .5 ? '#2f7a3a' : '#4a8f2c' });
    used.push([x - 1, x + 1, z - 1, z + 1]);
  }
  for (let i = 0; i < 14; i++) {
    const x = (R() - .5) * 100, z = (R() - .5) * 100;
    if (!free(used, x, z, 2)) continue;
    m.box(x, 0, z, 1.6, .5, .6, '#8a5a2b', 'wood'); used.push([x - 1, x + 1, z - 1, z + 1]);
  }
  for (const l of [[-6, -6], [6, 6], [-6, 6], [6, -6], [0, -30], [0, 30], [-30, 0], [30, 0]]) m.deco.push({ t: 'cyl', x: l[0] * 1.0 + 3.8, y: 0, z: l[1] * 1.0 + 3.8, r: .1, h: 4, c: '#333' }, { t: 'sph', x: l[0] + 3.8, y: 4.2, z: l[1] + 3.8, r: .35, c: '#fff6c0' });
  m.perches = [[[31, 0, 12], [14, 4.4, 12]]];
}

/* ================= 2x2 TILING (maps are 2x bigger, each quarter mirrored for variety) ================= */
function tileOf(m, ox, oz, sx, sz) {
  return {
    spawns: [], perches: [],
    box(x, y, z, w, h, d, c, mat) { m.box(ox + sx * x, y, oz + sz * z, w, h, d, c, mat); },
    deco: { push() { for (const d of arguments) { const e = Object.assign({}, d); if (e.a) { e.a = [ox + sx * e.a[0], e.a[1], oz + sz * e.a[2]]; e.b = [ox + sx * e.b[0], e.b[1], oz + sz * e.b[2]]; } else { e.x = ox + sx * e.x; e.z = oz + sz * e.z; } m.deco.push(e); } } }
  };
}
function assemble(props, tileFn, T, half) {
  const m = mkMap(props); m.half = half; m.pickups = []; m.perches = []; let n = 0;
  const kind = () => ((n++ % 3) === 0 ? 'med' : 'ammo');
  for (let k = 0; k < 4; k++) {
    const ox = (k & 1 ? 1 : -1) * T, oz = (k & 2 ? 1 : -1) * T, sx = (k & 1) ? -1 : 1, sz = (k & 2) ? -1 : 1, t = tileOf(m, ox, oz, sx, sz);
    const outer = (o, sgn) => (sgn < 0 && o < 0) || (sgn > 0 && o > 0);
    const F = { n: outer(oz, -sz), s: outer(oz, sz), w: outer(ox, -sx), e: outer(ox, sx) };
    tileFn(t, k, F);
    const P = w => [ox + sx * w[0], w[1], oz + sz * w[2]];
    t.spawns.forEach((s, i) => { const p = P(s); if (i % 2) m.pickups.push([p[0], p[1], p[2], kind()]); else m.spawns.push(p); });
    for (const plan of t.perches) { const pl = plan.map(P); m.perches.push(pl); const e = pl[pl.length - 1]; m.pickups.push([e[0], e[1], e[2], kind()]); }
  }
  return m;
}
const mapRig = assemble({ name: 'Oil Rig', floorY: null, killY: 0.8, water: '#1b6694', skyTop: '#3f8fd6', skyBot: '#d3e8f5', fog: '#c3dcec', surface: 'metal' }, rigTile, 32, 66);
const mapVillage = assemble({ name: 'Village', floorY: 0, ground: '#5f9138', skyTop: '#4a97df', skyBot: '#dcf0fb', fog: '#d3e8f4', surface: 'grass' }, villageTile, 60, 120);
const mapZoo = assemble({ name: 'Zoo', floorY: 0, ground: '#78a84d', skyTop: '#58a6e8', skyBot: '#e3f3fc', fog: '#d6ebf7', surface: 'gravel' }, zooTile, 60, 120);
// village: outer wall + main roads + market square
ring(mapVillage, 120, 3, .8, '#8d8f8a', null, 'concrete');
mapVillage.deco.push({ t: 'box', x: 0, y: .03, z: 0, w: 9, h: .05, d: 240, c: '#a8946f' }, { t: 'box', x: 0, y: .03, z: 0, w: 240, h: .05, d: 9, c: '#a8946f' }, { t: 'cyl', x: 0, y: 0, z: 0, r: 12, h: .06, c: '#b5a47e' });
mapVillage.box(0, 0, 0, 3.4, 1.1, 3.4, '#8f8a80', 'concrete'); mapVillage.deco.push({ t: 'cyl', x: 0, y: 0, z: 0, r: 2, h: 1.1, c: '#8f8a80' }, { t: 'cyl', x: 0, y: 1.1, z: 0, r: 1.6, h: .05, c: '#4a90c0' });
for (const s of [[8, 0, 8], [-8, 0, -8], [8, 0, -8], [-8, 0, 8], [30, 0, 0], [-30, 0, 0], [0, 0, 30], [0, 0, -30]]) mapVillage.spawns.push(s);
// zoo: outer wall with entrance gate, boulevards, central fountain
ring(mapZoo, 120, 3, .8, '#4a4d52', [{ c: 0, w: 12, t: 3 }], 'metal');
mapZoo.box(-5, 0, 118.6, 2, 6, 2, '#a8553a', 'concrete'); mapZoo.box(5, 0, 118.6, 2, 6, 2, '#a8553a', 'concrete'); mapZoo.box(0, 5.2, 118.6, 12, 1.2, 1.4, '#a8553a', 'concrete');
mapZoo.deco.push({ t: 'box', x: 0, y: 5.4, z: 117.8, w: 8, h: .8, d: .2, c: '#f2c230' }, { t: 'box', x: 0, y: .03, z: 0, w: 9, h: .05, d: 240, c: '#dccda4' }, { t: 'box', x: 0, y: .03, z: 0, w: 240, h: .05, d: 9, c: '#dccda4' }, { t: 'cyl', x: 0, y: 0, z: 0, r: 14, h: .06, c: '#e4d6ae' });
mapZoo.box(0, 0, 0, 6, 1, 6, '#9aa4ad', 'concrete'); mapZoo.deco.push({ t: 'cyl', x: 0, y: 0, z: 0, r: 4, h: 1.1, c: '#9aa4ad' }, { t: 'cyl', x: 0, y: 1, z: 0, r: 3.4, h: .1, c: '#5bbad5' }, { t: 'cyl', x: 0, y: 1, z: 0, r: .4, h: 3, c: '#9aa4ad' });
for (const s of [[10, 0, 10], [-10, 0, -10], [10, 0, -10], [-10, 0, 10], [0, 0, 100], [0, 0, 60], [40, 0, 0], [-40, 0, 0]]) mapZoo.spawns.push(s);
G.maps = { rig: mapRig, village: mapVillage, zoo: mapZoo };
G.rng = rng;

if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.G = G;
})(typeof window !== 'undefined' ? window : this);
