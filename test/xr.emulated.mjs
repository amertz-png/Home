// Drives Breach Night through a real WebXR session using Meta's IWER emulator (Quest 3 profile),
// with a synthetic room scan: four walls, one door, one window, a couch and a floor.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const { chromium } = createRequire(process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules/')('playwright');
const iwer = fs.readFileSync((process.env.IWER || process.argv[2] + '/node_modules/iwer') + '/build/iwer.min.js', 'utf8'), url = process.env.URL || 'http://localhost:8766';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.addInitScript(iwer + `;(() => {
  const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d; d.position.set(0.3, 1.6, 0.2);
  const quat = (xa, ya, za) => { // rotation matrix columns -> quaternion
    const m00 = xa[0], m10 = xa[1], m20 = xa[2], m01 = ya[0], m11 = ya[1], m21 = ya[2], m02 = za[0], m12 = za[1], m22 = za[2], tr = m00 + m11 + m22; let x, y, z, w;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return { x, y, z, w };
  };
  const vert = (label, cx, cy, cz, yaw, w, h) => { const t = [Math.cos(yaw), 0, -Math.sin(yaw)], n = [Math.sin(yaw), 0, Math.cos(yaw)], dn = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]].map((v) => -v);
    const z = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]; // x cross y, keeps it right-handed
    return new IWER.NativePlane(new IWER.XRRigidTransform({ x: cx, y: cy, z: cz, w: 1 }, quat(t, n, z)), [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]].map(([x, zz]) => ({ x, y: 0, z: zz, w: 1 })), label); };
  const planes = [vert('wall', 0, 1.25, -2.5, 0, 4, 2.5), vert('wall', 0, 1.25, 2.5, Math.PI, 4, 2.5), vert('wall', -2, 1.25, 0, Math.PI / 2, 5, 2.5), vert('wall', 2, 1.25, 0, -Math.PI / 2, 5, 2.5),
    vert('door', 1, 1.0, -2.49, 0, 0.9, 2.0), vert('window', -1.99, 1.5, 0.8, Math.PI / 2, 1.4, 1.0), vert('couch', 0, 0.4, 1.5, 0, 2, 0.8),
    new IWER.NativePlane(new IWER.XRRigidTransform({ x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0, w: 1 }), [[-2, -2.5], [2, -2.5], [2, 2.5], [-2, 2.5]].map(([x, z]) => ({ x, y: 0, z, w: 1 })), 'floor')];
  const base = { trackedPlanes: new Set(planes), trackedMeshes: new Set(), environmentCanvas: document.createElement('canvas') };
  d[IWER.P_DEVICE].sem = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => undefined) }); // the emulator only needs the planes; stub the rest
})();`);
await pg.goto(url + '/zombies/'); await pg.waitForTimeout(1200);
const ev = (f, a) => pg.evaluate(f, a);
await pg.click('#enter-ar'); await pg.waitForTimeout(3500);
const scan = await ev(() => { const z = window.__z; return { state: z.G.state, info: z.R.info, real: z.R.real, found: z.R.found, walls: z.R.walls.length, openings: z.R.openings.map((o) => ({ kind: o.kind, x: +o.pos.x.toFixed(2), z: +o.pos.z.toFixed(2), w: +o.w.toFixed(2), h: +o.h.toFixed(2), y0: +o.y0.toFixed(2), n: [+o.n.x.toFixed(1), +o.n.z.toFixed(1)], planks: o.planks.length })), stations: z.R.stations.length, menu: z.menu.visible && z.menu.page }; });
console.log('scan:', JSON.stringify(scan));
assert.equal(scan.state, 'menu'); assert.equal(scan.menu, 'main'); assert.ok(scan.real, 'uses the real door and window'); assert.equal(scan.walls, 4); assert.equal(scan.openings.length, 2);
const door = scan.openings.find((o) => o.kind === 'door'), win = scan.openings.find((o) => o.kind === 'window');
assert.ok(Math.abs(door.x - 1) < 0.05 && Math.abs(door.z + 2.5) < 0.05 && door.n[1] === 1, 'door sits on the real door, facing in');
assert.ok(Math.abs(win.x + 2) < 0.05 && Math.abs(win.z - 0.8) < 0.05 && win.n[0] === 1 && Math.abs(win.y0 - 1) < 0.03, 'window sits on the real window');
await pg.screenshot({ path: process.argv[2] + '/xr-menu.png' });
// point the right controller at a menu button and pull the trigger
// The emulator's target-ray pose is offset from the pose we command, so aim in two steps: command, measure, correct.
const press = async (px, py) => {
  const aimAt = (corr) => ev(([px, py, corr]) => { const z = window.__z, T = z.THREE, c = window.__xr.controllers.right, ui = z.menu.ui, h = z.hands.find((x) => x.ctrl.handedness === 'right');
    const target = ui.mesh.localToWorld(new T.Vector3((px / 1300 - 0.5) * 1.3, (0.5 - py / 860) * 0.86, 0)), eye = new T.Vector3(0.5, 1.35, 0.1);
    c.position.set(eye.x, eye.y, eye.z); window.__xr.controllers.left.position.set(0.0, 1.0, 0.3); window.__xr.controllers.left.quaternion.set(0.7071, 0, 0, 0.7071);
    const from = corr ? h.aim.getWorldPosition(new T.Vector3()) : eye, want = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(from, target, new T.Vector3(0, 1, 0)));
    if (corr) { const cmd = new T.Quaternion(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w), act = h.aim.getWorldQuaternion(new T.Quaternion()), off = cmd.clone().invert().multiply(act); want.multiply(off.invert()); }
    c.quaternion.set(want.x, want.y, want.z, want.w); }, [px, py, corr]);
  await aimAt(false); await pg.waitForTimeout(250); await aimAt(true); await pg.waitForTimeout(250); await aimAt(true); await pg.waitForTimeout(300);
  await ev(() => window.__xr.controllers.right.updateButtonValue('trigger', 1)); await pg.waitForTimeout(200); await ev(() => window.__xr.controllers.right.updateButtonValue('trigger', 0)); await pg.waitForTimeout(250); };
await press(650, 430); const tut = await ev(() => window.__z.menu.page); assert.equal(tut, 'controls', 'tutorial opens from the menu');
await pg.screenshot({ path: process.argv[2] + '/xr-tutorial.png' });
await press(190, 797); assert.equal(await ev(() => window.__z.menu.page), 'main');
await press(650, 337); const started = await ev(() => { const z = window.__z; return { state: z.G.state, menu: z.menu.visible, hands: z.hands.map((h) => h.ctrl.handedness + ':' + z.WEAPONS[z.G.inv[h.slot].wi].id) }; });
console.log('started:', JSON.stringify(started)); assert.equal(started.state, 'intermission'); assert.ok(started.hands.includes('right:pistol') && started.hands.includes('left:machete'));
// fire three rounds, then reload on A
const rh = () => ev(() => { const z = window.__z, h = z.hands.find((x) => x.ctrl.handedness === 'right'); return { ammo: z.G.inv[h.slot].ammo, reloading: h.reloadT > 0, weapon: z.WEAPONS[z.G.inv[h.slot].wi].id }; });
for (let i = 0; i < 3; i++) { await ev(() => window.__xr.controllers.right.updateButtonValue('trigger', 1)); await pg.waitForTimeout(180); await ev(() => window.__xr.controllers.right.updateButtonValue('trigger', 0)); await pg.waitForTimeout(180); }
const fired = await rh(); assert.equal(fired.ammo, 9, 'three shots fired');
await ev(() => window.__xr.controllers.right.updateButtonValue('a-button', 1)); await pg.waitForTimeout(250); const rel = await rh(); await ev(() => window.__xr.controllers.right.updateButtonValue('a-button', 0));
assert.ok(rel.reloading, 'A starts a reload'); await pg.screenshot({ path: process.argv[2] + '/xr-reload.png' }); await pg.waitForTimeout(1400); assert.equal((await rh()).ammo, 12, 'reload refills the magazine');
await ev(() => window.__xr.controllers.right.updateButtonValue('b-button', 1)); await pg.waitForTimeout(200); await ev(() => window.__xr.controllers.right.updateButtonValue('b-button', 0)); assert.equal((await rh()).weapon, 'machete', 'B swaps weapons');
await ev(() => window.__xr.controllers.right.updateButtonValue('thumbstick', 1)); await pg.waitForTimeout(250); await ev(() => window.__xr.controllers.right.updateButtonValue('thumbstick', 0));
assert.deepEqual(await ev(() => [window.__z.G.paused, window.__z.menu.page]), [true, 'pause'], 'stick click pauses');
await ev(() => window.__xr.controllers.right.updateButtonValue('thumbstick', 1)); await pg.waitForTimeout(250); await ev(() => window.__xr.controllers.right.updateButtonValue('thumbstick', 0));
// let a round run: zombies must only ever appear at the door or the window, and stay outside until the boards go
await ev(() => { window.__seen = new Set(); window.__bad = 0; const z = window.__z; setInterval(() => { for (const q of z.zombies) { if (q.state === 'dead') continue; window.__seen.add(q.op.kind); if ((q.state === 'approach' || q.state === 'bash') && (q.pos.x > -2 && q.pos.x < 2 && q.pos.z > -2.5 && q.pos.z < 2.5)) window.__bad++; } }, 100); });
await pg.waitForTimeout(26000);
const run = await ev(() => { const z = window.__z; return { state: z.G.state, round: z.G.round, alive: z.alive, seen: [...window.__seen], bad: window.__bad, hp: Math.round(z.G.hp), states: z.zombies.filter((q) => q.state !== 'dead').map((q) => q.state[0] + ':' + q.op.kind[0]).join(' ') }; });
await pg.screenshot({ path: process.argv[2] + '/xr-run.png' });
console.log('run:', JSON.stringify(run)); assert.equal(run.bad, 0, 'nobody inside the room before breaking through'); assert.ok(run.seen.length >= 1);
console.log('errors:', errs.slice(0, 6)); assert.equal(errs.length, 0); await b.close(); console.log('XR emulated run OK');
