// Room understanding for Breach Night — turns WebXR detected planes into walls, real door/window
// openings and wall-mount slots. Pure maths (no three.js, no DOM) so it is unit-tested in Node.
//
// A wall is {cx, cz, nx, nz, w, h}: centre on the floor, unit normal pointing INTO the room, width, height.
// Its "right" vector is (nz, 0, -nx); a point at lateral offset u is (cx + nz*u, cz - nx*u).
// An opening is {wall (index), u, y0, w, h, kind: 'door'|'window', real}.

const WALL_LABELS = new Set(['wall', 'wall face', 'invisible wall face', 'inner wall face']);
export const labelKind = (label) => {
  const l = (label || '').toLowerCase();
  if (WALL_LABELS.has(l)) return 'wall';
  if (l.includes('door')) return 'door';
  if (l.includes('window')) return 'window';
  return l ? 'other' : '';
};

// plane: {label, m (16 numbers, column-major pose of the plane space), poly: [{x,y,z}] in plane space}
function planeRect(plane) {
  const m = plane.m;
  let nx = m[4], ny = m[5], nz = m[6];
  if (Math.abs(ny) > 0.35) return null; // not vertical
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const rx = nz, rz = -nx, ox = m[12], oy = m[13], oz = m[14];
  let s0 = Infinity, s1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of plane.poly) {
    const wx = m[0] * p.x + m[4] * p.y + m[8] * p.z + ox, wy = m[1] * p.x + m[5] * p.y + m[9] * p.z + oy, wz = m[2] * p.x + m[6] * p.y + m[10] * p.z + oz;
    const s = (wx - ox) * rx + (wz - oz) * rz;
    s0 = Math.min(s0, s); s1 = Math.max(s1, s); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
  }
  if (!isFinite(s0)) return null;
  const mid = (s0 + s1) / 2;
  return { cx: ox + rx * mid, cz: oz + rz * mid, nx, nz, w: s1 - s0, y0, y1 };
}

// head: {x, z} — the player stands inside the room, so wall normals are flipped to face them.
export function parseRoom(planes, head) {
  const found = { wall: 0, door: 0, window: 0, other: 0, total: planes.length };
  const walls = [], rawOpen = [];
  for (const pl of planes) {
    const kind = labelKind(pl.label);
    const r = planeRect(pl);
    if (kind === 'other') { found.other++; continue; }
    if (!r) continue;
    if (kind === 'wall' || (kind === '' && r.y1 - r.y0 >= 1.8)) {
      if (r.w < 0.3) continue;
      found.wall++;
      if ((head.x - r.cx) * r.nx + (head.z - r.cz) * r.nz < 0) { r.nx = -r.nx; r.nz = -r.nz; }
      walls.push({ cx: r.cx, cz: r.cz, nx: r.nx, nz: r.nz, w: r.w, h: r.y1 });
    } else if (kind === 'door' || kind === 'window') {
      found[kind]++;
      rawOpen.push({ ...r, kind });
    }
  }
  const openings = [];
  for (const o of rawOpen) {
    let y0 = Math.max(0, o.y0), h = o.y1 - y0, kind = o.kind;
    if (y0 < 0.3) { h += y0; y0 = 0; kind = 'door'; }
    else if (kind === 'door') kind = 'window'; // a "door" that starts well above the floor climbs like a window
    if (o.w < 0.4 || h < 0.5) continue;
    let best = -1, bestD = 0.4;
    walls.forEach((w, i) => {
      const dx = o.cx - w.cx, dz = o.cz - w.cz, dist = Math.abs(dx * w.nx + dz * w.nz), par = Math.abs(o.nx * w.nx + o.nz * w.nz), lat = Math.abs(dx * w.nz - dz * w.nx);
      if (par > 0.8 && dist < bestD && lat <= w.w / 2 + 0.25) { best = i; bestD = dist; }
    });
    if (best < 0) { // no wall behind it in the scan: give the opening its own strip of wall
      let nx = o.nx, nz = o.nz;
      if ((head.x - o.cx) * nx + (head.z - o.cz) * nz < 0) { nx = -nx; nz = -nz; }
      walls.push({ cx: o.cx, cz: o.cz, nx, nz, w: o.w + 0.3, h: Math.max(2.4, y0 + h + 0.2) });
      best = walls.length - 1;
    }
    const w = walls[best], u = (o.cx - w.cx) * w.nz - (o.cz - w.cz) * w.nx;
    const half = Math.min(o.w, w.w - 0.04) / 2, uc = Math.max(-w.w / 2 + half + 0.02, Math.min(w.w / 2 - half - 0.02, u));
    openings.push({ wall: best, u: uc, y0, w: half * 2, h: Math.min(h, 2.6), kind, real: true });
  }
  // drop duplicates (a door and its frame are often both in the scan)
  openings.sort((a, b) => b.w * b.h - a.w * a.h);
  const kept = [];
  for (const o of openings) {
    const clash = kept.some((k) => k.wall === o.wall && Math.abs(k.u - o.u) < (k.w + o.w) / 2 - Math.min(k.w, o.w) * 0.5);
    if (!clash) kept.push(o);
  }
  kept.sort((a, b) => (a.kind === b.kind ? b.w * b.h - a.w * a.h : a.kind === 'door' ? -1 : 1));
  return { walls, openings: kept.slice(0, 6), found };
}

export function fallbackRoom(cx, cz, half = 2.6) {
  return [[0, -1], [0, 1], [1, 0], [-1, 0]].map(([x, z]) => ({ cx: cx + x * half, cz: cz + z * half, nx: -x, nz: -z, w: half * 2, h: 2.7 }));
}

// Used only when the scan has no doors or windows: board up believable ones on the widest walls.
export function virtualOpenings(walls, rnd = Math.random) {
  const order = walls.map((w, i) => i).filter((i) => walls[i].w >= 1.7).sort((a, b) => walls[b].w - walls[a].w).slice(0, 4);
  return order.map((wi, k) => {
    const door = k % 2 === 0, w = door ? 0.95 : 1.15, span = walls[wi].w / 2 - w / 2 - 0.35;
    return { wall: wi, u: (rnd() * 2 - 1) * Math.max(0, span) * 0.7, y0: door ? 0 : 0.95, w, h: door ? 2.05 : 1.05, kind: door ? 'door' : 'window', real: false };
  });
}

// Evenly spaced wall-mount positions that keep clear of openings and corners.
export function layoutSlots(walls, openings, spacing = 0.85, margin = 0.3) {
  const perWall = walls.map((w, wi) => {
    let free = [[-w.w / 2 + 0.35, w.w / 2 - 0.35]];
    for (const o of openings) {
      if (o.wall !== wi) continue;
      const a = o.u - o.w / 2 - margin - 0.3, b = o.u + o.w / 2 + margin + 0.3, next = [];
      for (const [s, e] of free) { if (b <= s || a >= e) next.push([s, e]); else { if (a > s) next.push([s, a]); if (b < e) next.push([b, e]); } }
      free = next;
    }
    const out = [];
    for (const [s, e] of free) {
      const L = e - s; if (L < 0) continue;
      const n = Math.max(1, Math.floor(L / spacing) + 1), step = n > 1 ? L / (n - 1) : 0;
      for (let i = 0; i < n; i++) { const u = n > 1 ? s + i * step : (s + e) / 2; out.push({ wall: wi, u, x: w.cx + w.nz * u, z: w.cz - w.nx * u, nx: w.nx, nz: w.nz }); }
    }
    return out;
  });
  // round-robin across walls so the important items end up spread around the room
  const slots = []; let more = true;
  for (let i = 0; more; i++) { more = false; for (const list of perWall) { if (i < list.length) { slots.push(list[(i % 2 ? list.length - 1 - (i >> 1) : i >> 1)]); more = true; } } }
  return slots;
}

// Depth-only wall panels around the openings: [{x0, x1, y0, y1}] in wall-local coordinates.
export function wallPanels(wall, openings, wi) {
  const mine = openings.filter((o) => o.wall === wi).sort((a, b) => a.u - b.u);
  const H = Math.max(wall.h, 2.4, ...mine.map((o) => o.y0 + o.h + 0.05)), out = [];
  let edge = -wall.w / 2;
  for (const o of mine) {
    const a = o.u - o.w / 2, b = o.u + o.w / 2;
    if (a > edge) out.push({ x0: edge, x1: a, y0: 0, y1: H });
    out.push({ x0: a - 0.02, x1: b + 0.02, y0: o.y0 + o.h, y1: H });
    if (o.y0 > 0.01) out.push({ x0: a - 0.02, x1: b + 0.02, y0: 0, y1: o.y0 });
    edge = Math.max(edge, b);
  }
  if (wall.w / 2 > edge) out.push({ x0: edge, x1: wall.w / 2, y0: 0, y1: H });
  return { panels: out, H };
}
