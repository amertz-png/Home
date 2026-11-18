// Breach Night — a mixed-reality home-defence zombie shooter for the Quest browser (WebXR).
// Doorways are cut into your real walls; the dead come down dark corridors behind them.
import * as THREE from 'three';
import { makeRenderer, fitToWindow, xrSupport, startXR, Controllers, makePanel, Sfx, clamp } from '../lib/xrkit.js';
import { WEAPONS, ZTYPES, DIFFICULTY, waveSpec, pickType } from './data.js';

const MAXZ = 32, DOOR_W = 0.95, DOOR_H = 2.05, CORRIDOR = 8, PLANKS = 5, PLANK_HP = 3;
const params = new URLSearchParams(location.search);
const opt = { difficulty: 'normal', laser: true, depth: false, bot: params.has('bot') };

const renderer = makeRenderer({ alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
camera.rotation.order = 'YXZ'; camera.position.set(0, 1.6, 0); scene.add(camera);
fitToWindow(renderer, camera);
const sfx = new Sfx();
const controllers = new Controllers(renderer, scene);
scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2a22, 1.5));
const key = new THREE.DirectionalLight(0xfff1dd, 1.2); key.position.set(1, 4, 2); scene.add(key);

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const headPos = V(); // player head, world

// Preview-only backdrop (desktop / plain VR): passthrough replaces this on the headset.
const previewEnv = new THREE.Group(); scene.add(previewEnv);
previewEnv.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2).translate(0, -0.01, 0), new THREE.MeshLambertMaterial({ color: 0x3b3f44 })));
const PREVIEW_BG = new THREE.Color(0x565c63);

// =====================================================================================
// Room: walls (depth-only occluders with doorways cut out), corridors, planks
// =====================================================================================
const room = new THREE.Group(); scene.add(room);
const breaches = [];
const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
const corridorMat = new THREE.MeshBasicMaterial({ color: 0x06080b, depthWrite: false, side: THREE.DoubleSide });
const floorMat = new THREE.MeshBasicMaterial({ color: 0x0d1116 });
const frameMat = new THREE.MeshLambertMaterial({ color: 0x3b2a1c });
const plankMat = new THREE.MeshLambertMaterial({ color: 0x8a6238 });
const plankGeo = new THREE.BoxGeometry(DOOR_W + 0.28, 0.15, 0.03);
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#0a1420'); gr.addColorStop(0.55, '#2c4a66'); gr.addColorStop(1, '#0c1a14');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const glowMat = new THREE.MeshBasicMaterial({ map: glowTex });

// walls: [{c:Vector3 (centre, floor level), n:Vector3 (unit, into the room), w, h}]
function buildRoom(walls) {
  room.clear(); breaches.length = 0;
  const usable = walls.filter((w) => w.w >= 1.5).sort((a, b) => b.w - a.w);
  let doors = 0;
  for (const wall of walls) {
    const right = V().crossVectors(UP, wall.n).normalize();
    const us = [];
    if (usable.includes(wall) && doors < 6) {
      const span = wall.w / 2 - 0.75;
      if (wall.w > 5.2 && doors < 5) { us.push(-wall.w / 4 + (Math.random() - 0.5) * 0.5, wall.w / 4 + (Math.random() - 0.5) * 0.5); } else us.push((Math.random() * 2 - 1) * span * 0.6);
      doors += us.length;
    }
    us.sort((a, b) => a - b);
    // depth-only wall: overlapping panels left/right of each doorway plus a lintel above it
    const H = Math.max(wall.h, 2.6), W = wall.w, wg = new THREE.Group();
    wg.matrixAutoUpdate = false; wg.matrix.makeBasis(right, UP, wall.n).setPosition(wall.c.x, 0, wall.c.z); room.add(wg);
    const panel = (x0, x1, y0, y1) => {
      if (x1 - x0 < 0.001) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), occluderMat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.renderOrder = -10; m.frustumCulled = false; wg.add(m);
    };
    let edge = -W / 2;
    for (const u of us) { panel(edge, u - DOOR_W / 2, 0, H); panel(u - DOOR_W / 2 - 0.02, u + DOOR_W / 2 + 0.02, DOOR_H, H); edge = u + DOOR_W / 2; }
    panel(edge, W / 2, 0, H);
    for (const u of us) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false; g.matrix.makeBasis(right, UP, wall.n).setPosition(wall.c.x + right.x * u, 0, wall.c.z + right.z * u);
      room.add(g);
      // the opening: a black backdrop drawn first without depth, so everything in the corridor paints over it
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H), corridorMat); hole.position.set(0, DOOR_H / 2, -0.004); hole.renderOrder = -20; g.add(hole);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.2, CORRIDOR).rotateX(-Math.PI / 2), floorMat); floor.position.set(0, 0.002, -CORRIDOR / 2 - 0.02); g.add(floor);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), glowMat); glow.position.set(0, 1.3, -CORRIDOR); g.add(glow);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.09, DOOR_H + 0.09, 0.06), frameMat), fr = fl.clone(), ft = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.18, 0.09, 0.06), frameMat);
      fl.position.set(-DOOR_W / 2 - 0.045, DOOR_H / 2, 0.02); fr.position.set(DOOR_W / 2 + 0.045, DOOR_H / 2, 0.02); ft.position.set(0, DOOR_H + 0.045, 0.02); g.add(fl, fr, ft);
      const planks = [];
      for (let i = 0; i < PLANKS; i++) {
        const p = new THREE.Mesh(plankGeo, plankMat); p.position.set((Math.random() - 0.5) * 0.06, 0.32 + i * 0.36, 0.05); p.rotation.z = (Math.random() - 0.5) * 0.2;
        g.add(p); planks.push({ mesh: p, hp: PLANK_HP });
      }
      breaches.push({ pos: V().set(wall.c.x + right.x * u, 0, wall.c.z + right.z * u), n: wall.n.clone(), right: right.clone(), planks, group: g, queue: 0 });
    }
  }
  // shuffle so the first live doorways are not always on the widest wall
  for (let i = breaches.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [breaches[i], breaches[j]] = [breaches[j], breaches[i]]; }
}
function fallbackWalls(cx, cz, half = 2.6) {
  return [[0, -1], [0, 1], [1, 0], [-1, 0]].map(([x, z]) => ({ c: V().set(cx + x * half, 0, cz + z * half), n: V().set(-x, 0, -z), w: half * 2, h: 2.7 }));
}
// Convert WebXR detected planes into wall rectangles.
function wallsFromPlanes(frame, refSpace) {
  const raw = [];
  if (!frame.detectedPlanes) return raw;
  frame.detectedPlanes.forEach((plane) => {
    const pose = frame.getPose(plane.planeSpace, refSpace); if (!pose) return;
    _m.fromArray(pose.transform.matrix);
    const n = V().set(0, 1, 0).transformDirection(_m);
    const label = plane.semanticLabel || '';
    if (Math.abs(n.y) > 0.35) return;
    if (label && !/wall/.test(label)) return;
    n.y = 0; n.normalize();
    const right = V().crossVectors(UP, n).normalize();
    let s0 = Infinity, s1 = -Infinity, y0 = Infinity, y1 = -Infinity; const o = V().setFromMatrixPosition(_m);
    for (const p of plane.polygon) {
      _a.set(p.x, p.y, p.z).applyMatrix4(_m);
      const s = _b.copy(_a).sub(o).dot(right); s0 = Math.min(s0, s); s1 = Math.max(s1, s); y0 = Math.min(y0, _a.y); y1 = Math.max(y1, _a.y);
    }
    if (!label && y1 - y0 < 1.5) return;
    const mid = (s0 + s1) / 2;
    raw.push({ c: V().set(o.x + right.x * mid, 0, o.z + right.z * mid), n, w: s1 - s0, h: y1 });
  });
  if (raw.length) {
    const cen = V(); raw.forEach((w) => cen.add(w.c)); cen.multiplyScalar(1 / raw.length);
    raw.forEach((w) => { if (_a.copy(cen).sub(w.c).dot(w.n) < 0) w.n.negate(); });
  }
  return raw;
}

// =====================================================================================
// Zombies — five instanced meshes draw the whole horde
// =====================================================================================
const zMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const inst = (geo, n, mat = zMat) => {
  const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, _col.set(0xffffff)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m;
};
const torsoM = inst(new THREE.BoxGeometry(0.44, 0.62, 0.26).translate(0, 0.31, 0), MAXZ);
const headM = inst(new THREE.BoxGeometry(0.25, 0.27, 0.25).translate(0, 0.135, 0), MAXZ);
const eyeM = inst(new THREE.BoxGeometry(0.17, 0.035, 0.02).translate(0, 0.16, 0.127), MAXZ, new THREE.MeshBasicMaterial({ color: 0xffffff }));
const armM = inst(new THREE.BoxGeometry(0.12, 0.6, 0.12).translate(0, -0.3, 0), MAXZ * 2);
const legM = inst(new THREE.BoxGeometry(0.17, 0.82, 0.19).translate(0, -0.41, 0), MAXZ * 2);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const zombies = [];
for (let i = 0; i < MAXZ; i++) zombies.push({ i, state: 'dead', m: new THREE.Matrix4(), pos: V(), head: V(), chestA: V(), chestB: V(), skin: new THREE.Color(), cloth: new THREE.Color() });
let aliveCount = 0;

function spawnZombie(typeName, br, hpMul) {
  const z = zombies.find((q) => q.state === 'dead'); if (!z) return null;
  const T = ZTYPES[typeName], D = DIFFICULTY[opt.difficulty];
  Object.assign(z, {
    state: 'approach', type: T, typeName, br, hp: T.hp * hpMul, maxHp: T.hp * hpMul, speed: T.speed * D.speed * (0.88 + Math.random() * 0.24),
    lat: (Math.random() - 0.5) * (DOOR_W - 0.4), depth: CORRIDOR - 0.6 - Math.random(), yaw: 0, pitch: T.crawl ? 1.3 : 0,
    phase: Math.random() * 6, atk: 0.4 + Math.random() * 0.5, flash: 0, slow: 0, burn: 0, meleeCd: 0, dieT: 0, swing: 0, scale: T.scale * (0.95 + Math.random() * 0.1), dark: 0.3,
  });
  z.skin.set(T.skin); z.cloth.set(T.cloth[Math.floor(Math.random() * T.cloth.length)]);
  aliveCount++; return z;
}
const alive = (z) => z.state !== 'dead' && z.state !== 'dying';

function updateZombies(dt, t) {
  const D = DIFFICULTY[opt.difficulty];
  for (const z of zombies) {
    if (z.state === 'dead') continue;
    const T = z.type; let moving = 0;
    z.flash = Math.max(0, z.flash - dt * 6); z.slow = Math.max(0, z.slow - dt); z.meleeCd = Math.max(0, z.meleeCd - dt);
    const spd = z.speed * (z.slow > 0 ? 0.35 : 1);
    if (z.burn > 0 && alive(z)) {
      z.burn -= dt; damage(z, 22 * dt, false, null, true);
      if (Math.random() < dt * 14) fire.emit(z.pos.x + (Math.random() - 0.5) * 0.3, z.pos.y + 0.4 + Math.random() * 1.1 * z.scale, z.pos.z + (Math.random() - 0.5) * 0.3, 0, 0.9, 0, 0.35, 1, 0.5 + Math.random() * 0.3, 0.1);
      if (!alive(z) && z.state !== 'dying') continue;
    }
    const br = z.br;
    if (z.state === 'approach' || z.state === 'bash' || z.state === 'enter') {
      const planksLeft = br.planks.some((p) => p.hp > 0);
      if (z.state === 'approach') {
        let blocked = false;
        for (const o of zombies) { if (o !== z && o.br === br && (o.state === 'approach' || o.state === 'bash') && o.depth < z.depth && z.depth - o.depth < 0.6 && Math.abs(o.lat - z.lat) < 0.42) { blocked = true; break; } }
        if (!blocked) { z.depth -= spd * dt; moving = 1; }
        if (z.depth <= 0.5) { z.depth = 0.5; z.state = planksLeft ? 'bash' : 'enter'; }
      } else if (z.state === 'bash') {
        if (!planksLeft) z.state = 'enter';
        else if ((z.atk -= dt) <= 0) {
          z.atk = 0.85 + Math.random() * 0.3; z.swing = 1;
          const live = br.planks.filter((p) => p.hp > 0), p = live[Math.floor(Math.random() * live.length)];
          hitPlank(br, p, T.plank);
        }
      } else {
        z.depth -= spd * dt; z.lat *= 1 - Math.min(1, dt * 3); moving = 1;
        if (z.depth <= -0.45) z.state = 'hunt';
      }
      z.pos.set(br.pos.x + br.right.x * z.lat - br.n.x * z.depth, 0, br.pos.z + br.right.z * z.lat - br.n.z * z.depth);
      z.yaw = Math.atan2(br.n.x, br.n.z);
      z.dark = clamp(1 - z.depth / (CORRIDOR + 1), 0.22, 1);
    } else if (z.state === 'hunt') {
      const dx = headPos.x - z.pos.x, dz = headPos.z - z.pos.z, dist = Math.hypot(dx, dz) || 1e-3;
      const reach = T.crawl ? 1.85 : 0.95 * z.scale + 0.1; // crawlers' heads lead their feet
      if (dist > reach) { z.pos.x += (dx / dist) * spd * dt; z.pos.z += (dz / dist) * spd * dt; moving = 1; }
      else if ((z.atk -= dt) <= 0) { z.atk = 1.0; z.swing = 1; hurtPlayer(T.dmg * D.dmg, z.pos); }
      let dy = Math.atan2(dx, dz) - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.yaw += dy * Math.min(1, dt * 6);
      z.dark = 1;
    } else if (z.state === 'dying') {
      z.dieT += dt;
      if (!T.crawl) z.pitch = -Math.min(Math.PI / 2, z.dieT * z.dieT * 9);
      if (z.dieT > 1.1) z.pos.y = -(z.dieT - 1.1) * 0.5;
      if (z.dieT > 2.0) { z.state = 'dead'; z.pos.y = 0; hideZombie(z); continue; }
    }
    z.swing = Math.max(0, z.swing - dt * 3.2);
    z.phase += dt * (moving ? spd * 4.2 + 1.5 : 1.2);
    poseZombie(z, moving);
  }
  // keep hunters from stacking up
  for (let i = 0; i < MAXZ; i++) {
    const a = zombies[i]; if (a.state !== 'hunt') continue;
    for (let j = i + 1; j < MAXZ; j++) {
      const b = zombies[j]; if (b.state !== 'hunt') continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz, min = 0.5;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), p = (min - d) / d * 0.5; a.pos.x -= dx * p; a.pos.z -= dz * p; b.pos.x += dx * p; b.pos.z += dz * p; }
    }
  }
  for (const m of [torsoM, headM, eyeM, armM, legM]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
}
function hideZombie(z) {
  torsoM.setMatrixAt(z.i, ZERO); headM.setMatrixAt(z.i, ZERO); eyeM.setMatrixAt(z.i, ZERO);
  for (let k = 0; k < 2; k++) { armM.setMatrixAt(z.i * 2 + k, ZERO); legM.setMatrixAt(z.i * 2 + k, ZERO); }
}
const _eu = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _s = V();
function poseZombie(z, moving) {
  const T = z.type, i = z.i, s = z.scale;
  _q.setFromEuler(_eu.set(z.pitch, z.yaw, 0)); _s.set(s * T.wide, s, s * (T.boom ? 1.5 : 1));
  z.m.compose(z.pos, _q, _s);
  const lean = T.crawl ? 0 : 0.18 + z.swing * 0.25, ph = z.phase, dying = z.state === 'dying';
  const ny = 0.82 + 0.62 * Math.cos(lean), nz = 0.62 * Math.sin(lean), sy = 0.82 + 0.55 * Math.cos(lean), sz = 0.55 * Math.sin(lean);
  _m.makeRotationX(lean).setPosition(0, 0.82, 0); torsoM.setMatrixAt(i, _m2.multiplyMatrices(z.m, _m));
  _m.makeRotationX(lean * 0.5 + (dying ? 0 : Math.sin(ph * 0.7) * 0.08)).setPosition(0, ny, nz); _m2.multiplyMatrices(z.m, _m); headM.setMatrixAt(i, _m2); eyeM.setMatrixAt(i, _m2);
  for (let k = 0; k < 2; k++) {
    const sg = k ? 1 : -1;
    let aa = T.crawl ? -2.7 + sg * 0.45 * Math.sin(ph) : -1.35 + 0.14 * Math.sin(ph * 0.5 + k * 2) - z.swing * 0.9 * Math.sin(z.swing * Math.PI);
    if (dying) aa = -0.4;
    _m.makeRotationX(aa).setPosition(sg * 0.29, sy, sz); armM.setMatrixAt(i * 2 + k, _m2.multiplyMatrices(z.m, _m));
    const la = dying || T.crawl ? 0.05 * sg : sg * 0.5 * Math.sin(ph) * (moving ? 1 : 0.15);
    _m.makeRotationX(la).setPosition(sg * 0.115, 0.82, 0); legM.setMatrixAt(i * 2 + k, _m2.multiplyMatrices(z.m, _m));
  }
  // hit zones
  z.head.set(0, ny + 0.14, nz + 0.03).applyMatrix4(z.m); z.chestA.set(0, 0.25, 0).applyMatrix4(z.m); z.chestB.set(0, 1.32, nz * 0.8).applyMatrix4(z.m);
  // colours: corridor darkness, hit flash, burning
  const k = z.dark, f = z.flash, burn = z.burn > 0 ? 0.5 : 0;
  const tint = (c) => { _col.copy(c).multiplyScalar(k); if (burn) _col.lerp(_e_orange, burn); if (f > 0) _col.lerp(_white, f * 0.8); return _col; };
  torsoM.setColorAt(i, tint(z.cloth)); headM.setColorAt(i, tint(z.skin));
  eyeM.setColorAt(i, dying ? _col.set(0x221111) : _col.set(T.boom ? 0xb6ff3a : T === ZTYPES.brute ? 0xff3322 : 0xffd23a));
  tint(z.skin); armM.setColorAt(i * 2, _col); armM.setColorAt(i * 2 + 1, _col);
  _col.copy(z.cloth).multiplyScalar(k * 0.7); if (f > 0) _col.lerp(_white, f * 0.8); legM.setColorAt(i * 2, _col); legM.setColorAt(i * 2 + 1, _col);
}
const _white = new THREE.Color(0xffffff), _e_orange = new THREE.Color(0xff7a1a);

function hitPlank(br, p, amount) {
  p.hp -= amount; p.mesh.rotation.z += (Math.random() - 0.5) * 0.25;
  _a.copy(p.mesh.position).applyMatrix4(br.group.matrix);
  if (p.hp <= 0) {
    p.mesh.visible = false; sfx.burst(0.16, { freq: 1500, gain: 0.5, pos: _a }); sfx.tone(140, 0.12, { slideTo: 60, gain: 0.4, type: 'square', pos: _a });
    for (let i = 0; i < 14; i++) blood.emit(_a.x + (Math.random() - 0.5) * 0.8 * Math.abs(br.right.x), _a.y, _a.z + (Math.random() - 0.5) * 0.8 * Math.abs(br.right.z), br.n.x * (1 + Math.random() * 2), Math.random() * 2, br.n.z * (1 + Math.random() * 2), 0.55, 0.38, 0.2, 0.9);
  } else { sfx.tone(95, 0.1, { slideTo: 55, gain: 0.5, type: 'triangle', pos: _a }); sfx.burst(0.05, { freq: 500, gain: 0.3, pos: _a }); }
}
function repairAll() { for (const br of breaches) for (const p of br.planks) { p.hp = PLANK_HP; p.mesh.visible = true; } }

// Ray vs zombie. Returns hits sorted by distance: [{z, t, head}]
function raySeg(o, d, a, b) { // -> [dist^2, tRay]
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const B = d.x * vx + d.y * vy + d.z * vz, C = vx * vx + vy * vy + vz * vz, Dd = d.x * wx + d.y * wy + d.z * wz, E = vx * wx + vy * wy + vz * wz, den = C - B * B;
  let t = den < 1e-8 ? 0 : clamp((E - B * Dd) / den, 0, 1), s = B * t - Dd;
  if (s < 0) { s = 0; t = clamp(E / C, 0, 1); }
  const px = wx + d.x * s - vx * t, py = wy + d.y * s - vy * t, pz = wz + d.z * s - vz * t;
  return [px * px + py * py + pz * pz, s];
}
const hitsBuf = [];
function rayZombies(o, d, range) {
  hitsBuf.length = 0;
  for (const z of zombies) {
    if (!alive(z)) continue;
    const s = z.scale, hr = 0.17 * s, br = 0.25 * s * Math.max(1, z.type.wide * 0.8);
    _e.copy(z.head).sub(o); const tca = _e.dot(d), d2 = _e.lengthSq() - tca * tca;
    let best = null;
    if (tca > 0 && d2 < hr * hr) { const t = tca - Math.sqrt(hr * hr - d2); if (t < range) best = { z, t, head: true }; }
    const [bd2, bt] = raySeg(o, d, z.chestA, z.chestB);
    if (bd2 < br * br) { const t = bt - Math.sqrt(br * br - bd2); if (t > 0 && t < range && (!best || t < best.t - 0.05)) best = { z, t, head: false }; }
    if (best) hitsBuf.push(best);
  }
  return hitsBuf.sort((p, q) => p.t - q.t);
}

// =====================================================================================
// Effects: particles, tracers, explosions
// =====================================================================================
class Particles {
  constructor(n, size, additive) {
    this.n = n; this.p = new Float32Array(n * 3).fill(-999); this.c = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.g = new Float32Array(n); this.k = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive, sizeAttenuation: true }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life, grav = 9.8) {
    const i = this.k; this.k = (i + 1) % this.n;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.c.set([r, g, b], i * 3); this.life[i] = life; this.g[i] = grav;
  }
  update(dt) {
    const { p, v, life } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt; const j = i * 3;
      if (life[i] <= 0) { p[j + 1] = -999; continue; }
      v[j + 1] -= this.g[i] * dt; p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] < 0.01 && this.g[i] > 0) { p[j + 1] = 0.01; v[j] = v[j + 1] = v[j + 2] = 0; }
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}
const blood = new Particles(500, 0.035, false), fire = new Particles(500, 0.11, true);
function bloodBurst(p, dir, n, r = 0.5, g = 0.02, b = 0.02) {
  for (let i = 0; i < n; i++) blood.emit(p.x, p.y, p.z, dir.x * 1.5 + (Math.random() - 0.5) * 2.4, Math.random() * 2.2, dir.z * 1.5 + (Math.random() - 0.5) * 2.4, r * (0.6 + Math.random() * 0.4), g, b, 0.9 + Math.random() * 0.6);
}
const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const tracers = Array.from({ length: 28 }, () => {
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; m.frustumCulled = false; scene.add(m); return { m, life: 0, max: 1 };
});
let tracerK = 0;
function tracer(from, to, color = 0xffe9a8, width = 0.008, life = 0.06) {
  const tr = tracers[tracerK]; tracerK = (tracerK + 1) % tracers.length;
  tr.m.position.copy(from); tr.m.lookAt(to); tr.m.scale.set(width, width, from.distanceTo(to)); tr.m.material.color.set(color); tr.m.material.opacity = 1; tr.m.visible = true; tr.life = tr.max = life;
}
const booms = Array.from({ length: 5 }, () => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; scene.add(m); return { m, t: 0, r: 1 };
});
let boomK = 0;
function explode(at, radius, dmg, color = 0xffa040) {
  const p = at.clone(); // callers pass temps; chain explosions re-enter this function
  const b = booms[boomK]; boomK = (boomK + 1) % booms.length; b.m.position.copy(p); b.m.material.color.set(color); b.t = 0.0001; b.r = radius; b.m.visible = true;
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, u = Math.random() * 4; fire.emit(p.x, p.y + 0.2, p.z, Math.cos(a) * u, Math.random() * 4, Math.sin(a) * u, 1, 0.45 + Math.random() * 0.3, 0.1, 0.35 + Math.random() * 0.4, 2); }
  sfx.burst(0.7, { freq: 900, slideTo: 80, gain: 1.0, pos: p }); sfx.tone(90, 0.5, { slideTo: 30, gain: 0.9, type: 'triangle', pos: p });
  for (const h of hands) rumble(h, 0.9, 120);
  const pc = p; // already a private copy
  for (const z of zombies) {
    if (!alive(z)) continue;
    const d = _d.copy(z.chestB).sub(pc).length();
    if (d < radius) damage(z, dmg * (1 - 0.7 * d / radius), false, null);
  }
  return pc;
}

// =====================================================================================
// Player, weapons, hands
// =====================================================================================
const G = { state: 'menu', wave: 0, spec: null, toSpawn: 0, spawnT: 0, timer: 0, hp: 100, lastHurt: -99, score: 0, kills: 0, heads: 0, chain: 0, chainT: 0, best: 0, t: 0, desktop: false };
try { G.best = +localStorage.getItem('breach-night-best') || 0; } catch { /* storage unavailable */ }

function buildGun(w) {
  const g = new THREE.Group(), M = w.model, mat = new THREE.MeshLambertMaterial({ color: M.color }), dark = new THREE.MeshLambertMaterial({ color: 0x17181b });
  const box = (x, y, z, px, py, pz, m = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), m); b.position.set(px, py, pz); g.add(b); return b; };
  if (w.kind === 'melee') {
    box(0.03, 0.035, 0.14, 0, 0, 0.02, dark); box(0.07, 0.02, 0.015, 0, 0, -0.055, dark);
    const blade = box(0.006, 0.055, M.blade, 0, 0.008, -0.06 - M.blade / 2, new THREE.MeshLambertMaterial({ color: M.color, emissive: 0x222426 }));
    blade.rotation.x = -0.03; g.userData.muzzle = 0.06 + M.blade; return g;
  }
  const [bw, bh, bl] = M.body;
  box(bw, bh, bl, 0, 0, -bl / 2 + 0.05);
  const grip = box(bw * 0.85, M.grip, 0.04, 0, -bh / 2 - M.grip / 2 + 0.01, 0.03, dark); grip.rotation.x = 0.25;
  const br = M.barrelR || 0.011, front = -bl + 0.05;
  if (M.multi) for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, M.barrel, 6).rotateX(Math.PI / 2), dark); c.position.set(Math.cos(i * 1.047) * 0.028, Math.sin(i * 1.047) * 0.028, front - M.barrel / 2); g.add(c); }
  else { const c = new THREE.Mesh(new THREE.CylinderGeometry(br, br, M.barrel, 10).rotateX(Math.PI / 2), dark); c.position.set(0, bh * 0.15, front - M.barrel / 2); g.add(c); }
  if (M.mag) box(bw * 0.7, M.mag, 0.035, 0, -bh / 2 - M.mag / 2, -bl * 0.45, dark);
  if (M.stock) box(bw * 0.8, bh * 0.8, M.stock, 0, -0.01, 0.05 + M.stock / 2, dark);
  if (M.drum) { const d = new THREE.Mesh(new THREE.CylinderGeometry(M.drum, M.drum, 0.05, 12).rotateX(Math.PI / 2), dark); d.position.set(0, -0.01, -bl * 0.5); g.add(d); }
  if (M.tank) { const d = new THREE.Mesh(new THREE.CylinderGeometry(M.tank, M.tank, 0.2, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xb9461f })); d.position.set(0, -bh / 2 - M.tank, -bl * 0.45); g.add(d); }
  if (M.glow) box(bw + 0.004, 0.012, bl * 0.8, 0, bh * 0.2, -bl / 2 + 0.03, new THREE.MeshBasicMaterial({ color: M.glow }));
  g.userData.muzzle = -front + M.barrel;
  return g;
}
function makeHand(aim, ctrl) {
  const root = new THREE.Group(); aim.add(root);
  const guns = WEAPONS.map((w) => { const g = buildGun(w); g.visible = false; root.add(g); return g; });
  const hud = makePanel(0.12, 0.066, 2400); hud.mesh.position.set(0, 0.085, 0.03); hud.mesh.rotation.x = -0.6; root.add(hud.mesh);
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1, 5).rotateX(Math.PI / 2).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.45, depthWrite: false })); root.add(laser);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); flash.visible = false; root.add(flash);
  return { aim, ctrl, root, guns, hud, laser, flash, wi: -1, st: WEAPONS.map((w) => ({ ammo: w.mag, reloadT: 0 })), cool: 0, spin: 0, kick: 0, flashT: 0, hudKey: '', tip: V(), tipPrev: V(), tipOk: false, repairT: 0, flameSnd: 0,
    trig: false, trigDown: false, squeeze: false, reloadDown: false, cycle: 0 };
}
const hands = [];
function selectWeapon(h, wi) {
  h.wi = (wi + WEAPONS.length) % WEAPONS.length; h.guns.forEach((g, i) => { g.visible = i === h.wi; });
  const w = WEAPONS[h.wi], mz = h.guns[h.wi].userData.muzzle; h.laser.position.set(0, w.model.body ? w.model.body[1] * 0.15 : 0, -mz); h.laser.scale.z = 14; h.flash.position.set(0, 0.008, -mz - 0.02);
  h.spin = 0; h.tipOk = false; sfx.tone(520, 0.03, { gain: 0.12 }); sfx.tone(780, 0.03, { gain: 0.1, when: 0.04 });
}
function rumble(h, s, ms) { if (h.ctrl) controllers.pulse(h.ctrl, s, ms); }
function drawHud(h) {
  const w = WEAPONS[h.wi], st = h.st[h.wi];
  const ammo = w.kind === 'melee' ? '∞' : st.reloadT > 0 ? 'RELOAD' : `${st.ammo}/${w.mag}`;
  const k = `${h.wi}|${ammo}|${Math.ceil(G.hp)}|${G.wave}|${G.score}`;
  if (k === h.hudKey) return; h.hudKey = k;
  const c = h.hud.ctx, W = h.hud.w, H = h.hud.h; c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(8,10,12,0.78)'; c.fillRect(0, 0, W, H);
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#cfd6dd'; c.font = '600 30px system-ui,sans-serif'; c.fillText(w.name, 10, 24);
  c.textAlign = 'right'; c.fillStyle = st.reloadT > 0 ? '#ffb84a' : st.ammo <= w.mag * 0.25 && w.mag ? '#ff6a5a' : '#ffffff'; c.font = `800 ${ammo.length > 5 ? 34 : 46}px system-ui,sans-serif`; c.fillText(ammo, W - 10, 80);
  c.textAlign = 'left'; c.fillStyle = G.hp > 50 ? '#7df0a0' : G.hp > 25 ? '#ffd166' : '#ff5a4a'; c.font = '800 42px system-ui,sans-serif'; c.fillText(`♥${Math.ceil(G.hp)}`, 10, 80);
  c.fillStyle = '#9aa6b2'; c.font = '600 26px system-ui,sans-serif'; c.fillText(`Wave ${G.wave}`, 10, 136); c.textAlign = 'right'; c.fillText(String(G.score), W - 10, 136);
  h.hud.dirty();
}

const grenades = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2f3b2a, emissive: 0x331100 })); m.visible = false; scene.add(m); return { m, v: V(), life: 0 }; });
const muzzle = V(), aimDir = V(), aimRight = V(), aimUp = V();
function aimVectors(h) {
  const e = h.aim.matrixWorld.elements;
  aimRight.set(e[0], e[1], e[2]).normalize(); aimUp.set(e[4], e[5], e[6]).normalize(); aimDir.set(-e[8], -e[9], -e[10]).normalize();
  muzzle.set(e[12], e[13], e[14]).addScaledVector(aimDir, h.guns[h.wi].userData.muzzle).addScaledVector(aimUp, 0.008);
}
function shotSound(w) {
  const s = w.snd; sfx.burst(s.d, { freq: s.f, slideTo: s.f * 0.3, gain: 0.55 });
  if (s.low) sfx.tone(s.low, s.d * 1.1, { slideTo: s.low * 0.45, gain: 0.5, type: 'triangle' });
}
function fireWeapon(h, w, st) {
  aimVectors(h);
  st.ammo--; h.kick = Math.min(1.5, h.kick + w.kick); h.flashT = 0.05; rumble(h, 0.35 + w.kick * 0.5, 30 + w.kick * 40); shotSound(w);
  if (w.kind === 'grenade') {
    const g = grenades.find((q) => q.life <= 0) || grenades[0]; g.m.position.copy(muzzle); g.v.copy(aimDir).multiplyScalar(15).addScaledVector(UP, 1.6); g.life = 3; g.m.visible = true; g.w = w; return;
  }
  for (let p = 0; p < w.pellets; p++) {
    const a = Math.random() * 6.283, r = Math.tan(w.spread) * Math.sqrt(Math.random());
    _a.copy(aimDir).addScaledVector(aimRight, Math.cos(a) * r).addScaledVector(aimUp, Math.sin(a) * r).normalize();
    const hits = rayZombies(muzzle, _a, w.range);
    let end = w.range > 30 ? 30 : w.range;
    if (w.kind === 'rail') {
      for (const hit of hits.slice()) { _b.copy(muzzle).addScaledVector(_a, hit.t); damage(hit.z, w.dmg * (hit.head ? 2 : 1), hit.head, _b, false, _a); }
      tracer(muzzle, _b.copy(muzzle).addScaledVector(_a, end), 0x66ccff, 0.03, 0.22);
    } else {
      if (hits.length) { const hit = hits[0]; end = hit.t; _b.copy(muzzle).addScaledVector(_a, hit.t); damage(hit.z, w.dmg * (hit.head ? 2.5 : 1), hit.head, _b, false, _a); }
      if (p % 3 === 0) tracer(muzzle, _b.copy(muzzle).addScaledVector(_a, end));
    }
  }
}
function flameTick(h, w, st, dt, t) {
  aimVectors(h);
  st.ammo = Math.max(0, st.ammo - 22 * dt);
  for (let i = 0; i < 3; i++) { _a.copy(aimDir).addScaledVector(aimRight, (Math.random() - 0.5) * 0.3).addScaledVector(aimUp, (Math.random() - 0.5) * 0.3); const s = 6 + Math.random() * 2; fire.emit(muzzle.x, muzzle.y, muzzle.z, _a.x * s, _a.y * s + 0.4, _a.z * s, 1, 0.5 + Math.random() * 0.35, 0.12, 0.45 + Math.random() * 0.2, -0.6); }
  const cos = Math.cos(w.spread);
  for (const z of zombies) {
    if (!alive(z)) continue;
    _b.copy(z.chestB).sub(muzzle); const d = _b.length();
    if (d < w.range && _b.dot(aimDir) / d > cos) { z.burn = 3; damage(z, w.dmg * dt, false, null, true); }
  }
  if (t > h.flameSnd) { h.flameSnd = t + 0.09; sfx.burst(0.14, { freq: 700, gain: 0.3, type: 'bandpass', q: 0.4 }); rumble(h, 0.25, 60); }
}
function updateHand(h, dt, t) {
  const playing = G.state === 'wave' || G.state === 'intermission';
  if (h.wi < 0) selectWeapon(h, hands.indexOf(h) === 0 ? 0 : 3);
  if (h.cycle) selectWeapon(h, h.wi + h.cycle);
  const w = WEAPONS[h.wi], st = h.st[h.wi], gun = h.guns[h.wi];
  h.cool -= dt; h.kick = Math.max(0, h.kick - dt * 7); gun.rotation.x = h.kick * 0.12; gun.position.z = h.kick * 0.012;
  h.flashT -= dt; h.flash.visible = h.flashT > 0; if (h.flash.visible) h.flash.scale.setScalar(0.7 + Math.random() * 0.9);
  h.laser.visible = opt.laser && w.kind !== 'melee' && w.kind !== 'flame';
  if (w.kind === 'melee') {
    aimVectors(h); h.tip.copy(muzzle);
    if (h.tipOk && playing) {
      const speed = h.tip.distanceTo(h.tipPrev) / Math.max(dt, 1e-3);
      if (speed > 1.6) {
        const e = h.aim.matrixWorld.elements; _a.set(e[12], e[13], e[14]).addScaledVector(aimDir, 0.08);
        for (const z of zombies) {
          if (!alive(z) || z.meleeCd > 0) continue;
          const hd = raySegDist(_a, h.tip, z.head), bd = segSegDist(_a, h.tip, z.chestA, z.chestB), s = z.scale;
          const head = hd < 0.2 * s, body = bd < 0.28 * s * z.type.wide;
          if (head || body) { z.meleeCd = 0.35; damage(z, w.dmg * (head ? 2 : 1) * clamp(speed / 3, 0.6, 1.6), head, head ? z.head : h.tip, false, aimRight); rumble(h, 1, 60); sfx.burst(0.08, { freq: 900, gain: 0.5 }); }
        }
      }
    }
    h.tipPrev.copy(h.tip); h.tipOk = true;
  } else if (playing) {
    if (st.reloadT > 0) { st.reloadT -= dt; if (st.reloadT <= 0) { st.ammo = w.mag; sfx.tone(900, 0.03, { gain: 0.2 }); sfx.tone(1300, 0.03, { gain: 0.2, when: 0.05 }); rumble(h, 0.4, 30); } }
    else if ((h.reloadDown && st.ammo < w.mag) || st.ammo <= 0) { st.reloadT = w.reload; sfx.tone(400, 0.05, { gain: 0.15 }); }
    else if (w.kind === 'flame') { if (h.trig) flameTick(h, w, st, dt, t); }
    else {
      if (w.spin) h.spin = clamp(h.spin + (h.trig ? dt : -dt * 2), 0, w.spin);
      const want = w.auto ? h.trig && (!w.spin || h.spin >= w.spin) : h.trigDown;
      if (want && h.cool <= 0) { fireWeapon(h, w, st); h.cool = 60 / w.rpm; }
    }
  }
  // hold grip next to a doorway to hammer planks back on
  if (h.squeeze && playing) {
    const e = h.aim.matrixWorld.elements; _a.set(e[12], 0, e[14]);
    const br = breaches.find((b) => _b.copy(b.pos).sub(_a).length() < 1.15);
    if (br && (h.repairT -= dt) <= 0) {
      const p = br.planks.find((q) => q.hp <= 0) || br.planks.find((q) => q.hp < PLANK_HP);
      if (p) { p.hp = PLANK_HP; p.mesh.visible = true; h.repairT = 0.55; rumble(h, 0.8, 50); sfx.tone(220, 0.05, { gain: 0.5, type: 'square' }); sfx.burst(0.04, { freq: 2200, gain: 0.3 }); }
    }
  } else h.repairT = 0;
  drawHud(h);
}
function raySegDist(a, b, p) { // distance from point p to segment ab
  _d.copy(b).sub(a); const t = clamp(_e.copy(p).sub(a).dot(_d) / Math.max(1e-6, _d.lengthSq()), 0, 1);
  return _e.copy(a).addScaledVector(_d, t).distanceTo(p);
}
function segSegDist(a, b, c, d) { // coarse: sample the blade against the body segment
  let m = Infinity; for (let i = 0; i <= 4; i++) { _c.copy(a).lerp(b, i / 4); m = Math.min(m, raySegDist(c, d, _c)); } return m;
}
function updateGrenades(dt) {
  for (const g of grenades) {
    if (g.life <= 0) continue;
    g.life -= dt; g.v.y -= 9.8 * dt; g.m.position.addScaledVector(g.v, dt);
    let hit = g.m.position.y < 0.05 || g.life <= 0;
    if (!hit) for (const z of zombies) { if (alive(z) && raySegDist(z.chestA, z.chestB, g.m.position) < 0.35 * z.scale) { hit = true; break; } }
    if (hit) { g.life = 0; g.m.visible = false; g.m.position.y = Math.max(0.1, g.m.position.y); explode(g.m.position, g.w.radius, g.w.dmg); }
  }
}

function damage(z, amount, head, point, silent = false, dir = null) {
  if (!alive(z)) return;
  z.hp -= amount;
  if (!silent) { z.flash = 1; z.slow = Math.max(z.slow, 0.22); if (point) bloodBurst(point, dir || UP, head ? 9 : 5); }
  if (z.hp <= 0) killZombie(z, head);
}
function killZombie(z, head) {
  z.state = 'dying'; z.dieT = 0; aliveCount--; G.kills++; if (head) G.heads++;
  G.chain = G.t - G.chainT < 3 ? G.chain + 1 : 1; G.chainT = G.t;
  G.score += Math.round((z.type.score + (head ? 50 : 0)) * Math.min(3, 1 + 0.1 * (G.chain - 1)));
  sfx.tone(130 + Math.random() * 40, 0.3, { slideTo: 50, gain: 0.35, type: 'sawtooth', pos: z.head });
  if (head) bloodBurst(z.head, UP, 16);
  if (z.type.boom) {
    const p = explode(z.chestB, 1.9, 260, 0xb6ff3a);
    if (p.distanceTo(headPos) < 1.9) hurtPlayer(14 * DIFFICULTY[opt.difficulty].dmg, p);
  }
}
const vignette = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, map: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  gr.addColorStop(0, 'rgba(180,0,0,0)'); gr.addColorStop(1, 'rgba(200,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})() }));
vignette.position.z = -0.3; vignette.renderOrder = 50; camera.add(vignette);
function hurtPlayer(amount, from) {
  if (G.state !== 'wave' && G.state !== 'intermission') return;
  G.hp -= amount; G.lastHurt = G.t; vignette.material.opacity = 0.9;
  sfx.tone(160, 0.2, { slideTo: 70, gain: 0.6, type: 'sawtooth' }); sfx.burst(0.12, { freq: 600, gain: 0.5 });
  for (const h of hands) rumble(h, 1, 150);
  if (G.hp <= 0) { G.hp = 0; gameOver(); }
}

// =====================================================================================
// Banner + game flow
// =====================================================================================
const banner = makePanel(1.7, 0.6, 600, { depthTest: false }); banner.mesh.renderOrder = 60; banner.mesh.visible = false; scene.add(banner.mesh);
let bannerUntil = 0;
function say(title, sub = '', secs = 3, color = '#ffffff') {
  const c = banner.ctx, W = banner.w, H = banner.h; c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(8,8,10,0.72)'; c.fillRect(0, 0, W, H); c.fillStyle = '#b3392c'; c.fillRect(0, 0, W, 8);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.font = '800 120px system-ui,sans-serif'; c.fillText(title, W / 2, sub ? H * 0.38 : H / 2, W - 40);
  if (sub) { c.fillStyle = '#d5dbe2'; c.font = '500 46px system-ui,sans-serif'; c.fillText(sub, W / 2, H * 0.76, W - 40); }
  banner.dirty();
  camera.getWorldDirection(_a); _a.y = 0; if (_a.lengthSq() < 0.01) _a.set(0, 0, -1); _a.normalize();
  banner.mesh.position.copy(headPos).addScaledVector(_a, 1.9); banner.mesh.position.y = headPos.y + 0.15; banner.mesh.lookAt(headPos.x, headPos.y + 0.15, headPos.z);
  banner.mesh.visible = true; bannerUntil = secs > 0 ? G.t + secs : Infinity;
}
function newGame() {
  for (const z of zombies) { if (z.state !== 'dead') { z.state = 'dead'; hideZombie(z); } }
  aliveCount = 0; Object.assign(G, { wave: 0, hp: 100, score: 0, kills: 0, heads: 0, chain: 0, lastHurt: -99 });
  for (const h of hands) { h.st.forEach((s, i) => { s.ammo = WEAPONS[i].mag; s.reloadT = 0; }); h.hudKey = ''; }
  grenades.forEach((g) => { g.life = 0; g.m.visible = false; });
  repairAll(); nextWave();
}
function nextWave() {
  G.wave++; G.spec = waveSpec(G.wave, DIFFICULTY[opt.difficulty]); G.toSpawn = G.spec.count; G.spawnT = 0; G.state = 'intermission'; G.timer = G.wave === 1 ? 5 : 7;
  repairAll(); if (G.wave > 1) G.hp = Math.min(100, G.hp + 25);
  const live = Math.min(breaches.length, G.spec.breaches);
  say(`WAVE ${G.wave}`, G.wave === 1 ? 'Flick the stick to switch weapons — they are coming through the doorways' : `${G.spec.count} incoming · ${live} doorway${live > 1 ? 's' : ''} live · barricades rebuilt`, 4);
  sfx.tone(196, 0.5, { gain: 0.35, type: 'sawtooth' }); sfx.tone(147, 0.8, { gain: 0.35, type: 'sawtooth', when: 0.45 });
}
function gameOver() {
  G.state = 'over'; G.timer = 1.5;
  if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('breach-night-best', String(G.best)); } catch { /* storage unavailable */ } }
  say('OVERRUN', `Wave ${G.wave} · ${G.kills} kills · Score ${G.score} · Best ${G.best} — ${G.desktop ? 'press Enter' : 'pull both triggers'} to go again`, 0, '#ff5a4a');
  sfx.tone(110, 1.4, { slideTo: 40, gain: 0.6, type: 'sawtooth' });
}
let groanT = 0;
function updateGame(dt, t) {
  if (G.state === 'intermission') { if ((G.timer -= dt) <= 0) G.state = 'wave'; }
  if (G.state === 'wave') {
    if (G.toSpawn > 0 && (G.spawnT -= dt) <= 0 && aliveCount < G.spec.maxAlive && breaches.length) {
      const live = Math.min(breaches.length, G.spec.breaches), br = breaches[Math.floor(Math.random() * live)];
      if (spawnZombie(pickType(G.spec.weights), br, G.spec.hpMul)) { G.toSpawn--; G.spawnT = G.spec.interval * (0.6 + Math.random() * 0.8); }
    }
    if (G.toSpawn <= 0 && aliveCount <= 0) { G.score += 250 * G.wave; nextWave(); }
    if (t > groanT && aliveCount > 0) {
      groanT = t + 0.8 + Math.random() * 1.8;
      const live = zombies.filter(alive), z = live[Math.floor(Math.random() * live.length)];
      if (z) { const f = 60 + Math.random() * 50; sfx.tone(f, 0.7, { slideTo: f * 0.75, gain: 0.3, type: 'sawtooth', pos: z.head }); sfx.burst(0.6, { freq: 380, q: 3, type: 'bandpass', gain: 0.25, pos: z.head }); }
    }
  }
  if (G.state === 'wave' || G.state === 'intermission') { if (G.t - G.lastHurt > 6 && G.hp < 100) G.hp = Math.min(100, G.hp + 4 * dt); }
  if (G.state === 'over') { G.timer -= dt; if (G.timer <= 0 && hands.length && hands.every((h) => h.trig)) newGame(); }
  vignette.material.opacity = Math.max(G.hp < 30 && G.state !== 'over' ? 0.25 + 0.1 * Math.sin(t * 6) : 0, vignette.material.opacity - dt * 1.6);
  if (banner.mesh.visible && G.t > bannerUntil) banner.mesh.visible = false;
}

// =====================================================================================
// Main loop
// =====================================================================================
let scan = null; // room scanning state while in XR
const look = { yaw: 0, pitch: 0 }, keys = {}; let mouseDown = false, wheel = 0;
function readInput() {
  if (G.desktop) {
    const h = hands[0]; if (!h) return;
    if (opt.bot) {
      let best = null, bd = Infinity; for (const z of zombies) { if (!alive(z)) continue; const d = z.head.distanceTo(headPos); if (d < bd) { bd = d; best = z; } }
      if (best) camera.lookAt(best.chestB);
      converge(h);
      const trig = !!best; h.trigDown = trig && (!h.trig || !WEAPONS[h.wi].auto); h.trig = trig; h.cycle = 0; h.reloadDown = false;
      if (G.state === 'over') h.trig = true;
      return;
    }
    camera.rotation.set(look.pitch, look.yaw, 0); converge(h);
    h.trigDown = mouseDown && !h.trig; h.trig = mouseDown; h.squeeze = !!keys.KeyF; h.reloadDown = !!keys.KeyR; keys.KeyR = false;
    h.cycle = wheel || (keys.KeyE ? 1 : keys.KeyQ ? -1 : 0); wheel = 0; keys.KeyE = keys.KeyQ = false;
    for (let n = 0; n < 10; n++) if (keys['Digit' + ((n + 1) % 10)]) { selectWeapon(h, n); keys['Digit' + ((n + 1) % 10)] = false; }
    return;
  }
  controllers.update();
  hands.forEach((h) => { const c = h.ctrl; h.trig = c.trig; h.trigDown = c.trigDown; h.squeeze = c.squeeze; h.reloadDown = c.aDown || c.bDown; h.cycle = c.flickX || -c.flickY; h.root.visible = c.connected; });
}
// Desktop only: turn the gun so its barrel points at whatever the screen centre is on.
function converge(h) {
  camera.updateMatrixWorld(); camera.getWorldDirection(_a); _b.setFromMatrixPosition(camera.matrixWorld);
  const hits = rayZombies(_b, _a, 60), dist = hits.length ? hits[0].t : 12;
  h.aim.lookAt(_b.addScaledVector(_a, dist)); h.aim.rotateY(Math.PI);
}
let lastT = 0;
renderer.setAnimationLoop((time, frame) => {
  const t = time / 1000, dt = Math.min(0.05, t - lastT || 0.016); lastT = t; G.t = t;
  camera.updateMatrixWorld(); camera.getWorldPosition(headPos);
  if (renderer.xr.isPresenting) { const xc = renderer.xr.getCamera(); headPos.setFromMatrixPosition(xc.matrixWorld); }
  sfx.setListener(renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);
  if (scan && frame) updateScan(frame, dt);
  if (G.state !== 'menu') {
    readInput();
    for (const h of hands) { h.aim.updateWorldMatrix(true, false); if (G.desktop || h.ctrl.connected) updateHand(h, dt, t); }
    if (G.state !== 'scan') { updateGame(dt, t); updateGrenades(dt); if (G.state !== 'over') updateZombies(dt, t); }
    blood.update(dt); fire.update(dt);
    for (const tr of tracers) { if (tr.life > 0) { tr.life -= dt; tr.m.material.opacity = Math.max(0, tr.life / tr.max); if (tr.life <= 0) tr.m.visible = false; } }
    for (const b of booms) { if (b.t > 0) { b.t += dt; const u = b.t / 0.3; b.m.scale.setScalar(b.r * Math.min(1, u * 1.2)); b.m.material.opacity = Math.max(0, 0.8 * (1 - u)); if (u >= 1) { b.t = 0; b.m.visible = false; } } }
  }
  renderer.render(scene, camera);
});

function updateScan(frame, dt) {
  scan.t += dt;
  const ref = renderer.xr.getReferenceSpace();
  const walls = wallsFromPlanes(frame, ref);
  if (walls.length >= 2 && scan.t > 1.2) return finishScan(walls, `${walls.length} walls found — the doorways are in your real walls`);
  if (scan.t > 2.5 && !scan.asked && scan.session.initiateRoomCapture) {
    scan.asked = true; scan.t = 0; say('ROOM SETUP', 'Scan your room when the headset asks, then come back', 0);
    scan.session.initiateRoomCapture().catch(() => {}).finally(() => { scan && (scan.t = 0, scan.after = true); });
  }
  if (scan.t > (scan.asked && !scan.after ? 90 : 4)) finishScan(fallbackWalls(headPos.x, headPos.z), 'No room scan — using a free-standing arena around you');
}
function finishScan(walls, msg) {
  scan = null; buildRoom(walls); newGame(); say('WAVE 1', msg, 5);
}

// =====================================================================================
// Page UI + session start
// =====================================================================================
const overlay = document.getElementById('overlay'), statusEl = document.getElementById('status');
function readOptions() {
  opt.difficulty = document.getElementById('opt-diff').value; opt.laser = document.getElementById('opt-laser').value === 'on'; opt.depth = document.getElementById('opt-depth').value === 'on';
}
function clearHands() { hands.forEach((h) => h.root.removeFromParent()); hands.length = 0; }
async function enter(mode) {
  readOptions(); sfx.resume();
  try {
    const session = await startXR(renderer, mode, { optional: ['plane-detection', 'mesh-detection', 'anchors'], depth: opt.depth && mode === 'immersive-ar' });
    G.desktop = false; clearHands(); controllers.hands.forEach((c) => hands.push(makeHand(c.ray, c)));
    const ar = mode === 'immersive-ar'; scene.background = ar ? null : PREVIEW_BG; previewEnv.visible = !ar;
    overlay.style.display = 'none'; G.state = 'scan'; scan = { t: 0, asked: false, after: false, session };
    say('SCANNING', 'Looking for your walls…', 0);
    session.addEventListener('end', () => { scan = null; G.state = 'menu'; overlay.style.display = ''; banner.mesh.visible = false; scene.background = PREVIEW_BG; previewEnv.visible = true; });
  } catch (err) { statusEl.textContent = 'Could not start: ' + err.message; }
}
function startDesktop() {
  readOptions(); sfx.resume(); G.desktop = true; clearHands();
  const aim = new THREE.Object3D(); aim.position.set(0.2, -0.17, -0.42); camera.add(aim); hands.push(makeHand(aim, null));
  scene.background = PREVIEW_BG; previewEnv.visible = true; overlay.style.display = 'none';
  camera.position.set(0, 1.6, 0); camera.updateMatrixWorld(); headPos.set(0, 1.6, 0);
  buildRoom(fallbackWalls(0, 0)); newGame();
  if (!opt.bot) renderer.domElement.requestPointerLock?.();
  if (!document.getElementById('xhair')) { const x = document.createElement('div'); x.id = 'xhair'; x.style.cssText = 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;outline:2px solid rgba(0,0,0,.5);z-index:1;pointer-events:none'; document.body.appendChild(x); }
}
document.getElementById('enter-ar').onclick = () => enter('immersive-ar');
document.getElementById('enter-vr').onclick = () => enter('immersive-vr');
document.getElementById('enter-desktop').onclick = startDesktop;
xrSupport().then((s) => {
  document.getElementById('enter-ar').disabled = !s.ar; document.getElementById('enter-vr').disabled = !s.vr;
  statusEl.textContent = s.ar ? 'Headset detected — mixed reality is ready.' : s.vr ? 'This headset has no passthrough mode in the browser — VR mode will work.' : 'No headset detected. Open this page in the Meta Quest Browser, or try the desktop preview.';
});
scene.background = PREVIEW_BG;
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement) { look.yaw -= e.movementX * 0.0022; look.pitch = clamp(look.pitch - e.movementY * 0.0022, -1.4, 1.4); } });
renderer.domElement.addEventListener('mousedown', () => { if (G.desktop && !opt.bot && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); mouseDown = true; });
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('wheel', (e) => { wheel = Math.sign(e.deltaY); });
window.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Enter' && G.state === 'over' && G.desktop) newGame(); });
window.addEventListener('keyup', (e) => { if (e.code === 'KeyF') keys.KeyF = false; });

// weapon table on the start page
const wt = document.getElementById('weapons');
if (wt) wt.innerHTML = '<tr><th>#</th><th>Weapon</th><th>What it does</th></tr>' + WEAPONS.map((w, i) => `<tr><td>${(i + 1) % 10}</td><td>${w.name}</td><td>${w.note}</td></tr>`).join('');
if (opt.bot) startDesktop();
window.__z = { G, zombies, breaches, hands, opt, WEAPONS, selectWeapon, room, camera, renderer, scene, get alive() { return aliveCount; } }; // test hook
