import assert from 'node:assert/strict';
import { parseRoom, layoutSlots, virtualOpenings, wallPanels, fallbackRoom, labelKind } from '../zombies/room.js';

// Build a Quest-style vertical plane: plane-space Y is the normal, polygon lies in plane XZ.
function plane(label, cx, cy, cz, yaw, w, h, flip = false) {
  const tx = Math.cos(yaw), tz = -Math.sin(yaw);        // horizontal tangent
  let nx = Math.sin(yaw), nz = Math.cos(yaw); if (flip) { nx = -nx; nz = -nz; }
  const m = [tx, 0, tz, 0, nx, 0, nz, 0, 0, -1, 0, 0, cx, cy, cz, 1]; // col2 = down
  return { label, m, poly: [{ x: -w / 2, y: 0, z: -h / 2 }, { x: w / 2, y: 0, z: -h / 2 }, { x: w / 2, y: 0, z: h / 2 }, { x: -w / 2, y: 0, z: h / 2 }, { x: -w / 2, y: 0, z: -h / 2 }] };
}
const rot = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
for (const A of [0, 0.5, 2.1]) {
  // 4 m x 5 m room, 2.5 m ceiling, rotated by A, centred at (1, -2)
  const P = (label, lx, ly, lz, yaw, w, h, flip) => { const [x, z] = rot(lx, lz, A); return plane(label, x + 1, ly, z - 2, yaw + A, w, h, flip); };
  const planes = [
    P('wall', 0, 1.25, -2.5, 0, 4, 2.5), P('wall', 0, 1.25, 2.5, Math.PI, 4, 2.5, true), // one normal deliberately facing out
    P('wall', -2, 1.25, 0, Math.PI / 2, 5, 2.5), P('wall', 2, 1.25, 0, -Math.PI / 2, 5, 2.5),
    P('door', 1, 1.0, -2.49, 0, 0.9, 2.0), P('window', -1.98, 1.5, 0.8, Math.PI / 2, 1.4, 1.0),
    P('door frame', 1, 1.02, -2.48, 0, 1.0, 2.04),
    { label: 'floor', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, -2, 1], poly: [{ x: -2, y: 0, z: -2.5 }, { x: 2, y: 0, z: 2.5 }] },
    P('couch', 0, 0.4, 1, 0, 2, 0.8), P('wall art', 1.9, 1.5, 1, -Math.PI / 2, 0.6, 0.4),
  ];
  const r = parseRoom(planes, { x: 1.2, z: -1.8 });
  assert.equal(r.walls.length, 4, 'four walls'); assert.equal(r.openings.length, 2, 'door + window, frame de-duplicated');
  for (const w of r.walls) assert.ok((1 - w.cx) * w.nx + (-2 - w.cz) * w.nz > 0, 'normals face into the room');
  const door = r.openings.find((o) => o.kind === 'door'), win = r.openings.find((o) => o.kind === 'window');
  assert.ok(door && win);
  assert.ok(Math.abs(door.w - 1.0) < 0.11 && door.y0 === 0 && Math.abs(door.h - 2.04) < 0.06, `door size ${door.w} ${door.h}`);
  assert.ok(Math.abs(win.w - 1.4) < 0.02 && Math.abs(win.y0 - 1.0) < 0.02 && Math.abs(win.h - 1.0) < 0.02, 'window size');
  // opening world position must match where the real door is
  const dw = r.walls[door.wall], [ex, ez] = rot(1, -2.5, A);
  assert.ok(Math.hypot(dw.cx + dw.nz * door.u - (ex + 1), dw.cz - dw.nx * door.u - (ez - 2)) < 0.05, 'door position');
  const ww = r.walls[win.wall], [wx, wz] = rot(-2, 0.8, A);
  assert.ok(Math.hypot(ww.cx + ww.nz * win.u - (wx + 1), ww.cz - ww.nx * win.u - (wz - 2)) < 0.05, 'window position');
  const slots = layoutSlots(r.walls, r.openings);
  assert.ok(slots.length >= 12, 'enough wall slots: ' + slots.length);
  for (const s of slots) for (const o of r.openings) if (o.wall === s.wall) assert.ok(Math.abs(s.u - o.u) > o.w / 2 + 0.5, 'slots keep clear of openings');
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) if (slots[i].wall === slots[j].wall) assert.ok(Math.abs(slots[i].u - slots[j].u) > 0.7, 'slots do not overlap');
  const wp = wallPanels(ww, r.openings, win.wall);
  assert.equal(wp.panels.length, 4, 'window wall: left, above, below, right');
  assert.equal(r.found.other, 3);
}
// No doors/windows labelled -> virtual ones; no planes at all -> nothing
{
  const walls = fallbackRoom(0, 0), v = virtualOpenings(walls, () => 0.5);
  assert.equal(v.length, 4); assert.ok(v.some((o) => o.kind === 'door') && v.some((o) => o.kind === 'window'));
  assert.equal(parseRoom([], { x: 0, z: 0 }).walls.length, 0);
  assert.equal(labelKind('wall art'), 'other'); assert.equal(labelKind('wall face'), 'wall'); assert.equal(labelKind('Door Frame'), 'door');
}
// A lone door with no wall behind it in the scan still becomes an entry
{
  const r = parseRoom([plane('door', 0, 1, -3, 0, 0.9, 2)], { x: 0, z: 0 });
  assert.equal(r.openings.length, 1); assert.ok(r.walls[0].nz > 0);
}
console.log('room parsing OK');
