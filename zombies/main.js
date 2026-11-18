// Breach Night — mixed-reality round-based zombie survival for the Quest browser (WebXR).
// The dead come through the real doors and windows of your room; points buy guns, perks and upgrades off your walls.
import * as THREE from 'three';
import { makeRenderer, fitToWindow, xrSupport, startXR, Controllers, UIPanel, makePanel, roundRect, Sfx, clamp } from '../lib/xrkit.js?v=2';
import { WEAPONS, WI, WALL_ORDER, CRATE_PRICE, BENCH_PRICES, BENCH_MULT, AMMO_PRICE_FRAC, PERKS, POWERUPS, POINTS, ZTYPES, DIFFICULTY, roundSpec, pickType } from './data.js?v=2';
import { parseRoom, fallbackRoom, virtualOpenings, layoutSlots, wallPanels } from './room.js?v=2';
import { TEX, FOG, portalMaterial, Horde, Particles, Decals, Debris, GlowSegs, buildGun, bakeModel, merge } from './gfx.js?v=2';

const MAXZ = 32, LANE = 9, PLANK_HP = 3;
const params = new URLSearchParams(location.search);
const opt = { difficulty: 'normal', dot: true, depth: false, bot: params.has('bot') };

const renderer = makeRenderer({ alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
camera.rotation.order = 'YXZ'; camera.position.set(0, 1.6, 0); scene.add(camera);
fitToWindow(renderer, camera);
const sfx = new Sfx();
const controllers = new Controllers(renderer, scene);
scene.add(new THREE.HemisphereLight(0xe2ebff, 0x5a5044, 2.3));
const keyLight = new THREE.DirectionalLight(0xfff0dc, 2.2); keyLight.position.set(1.5, 4, 2); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x7fb0ff, 1.4); rimLight.position.set(-2, 2.5, -3); scene.add(rimLight);
const flashLight = new THREE.PointLight(0xffc070, 0, 7, 1.6); scene.add(flashLight);

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _g = V(), _m = new THREE.Matrix4(), _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const headPos = V(), headDir = V();

// Preview-only backdrop (desktop / plain VR): passthrough replaces this on the headset.
const previewEnv = new THREE.Group(); scene.add(previewEnv);
previewEnv.add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2).translate(0, -0.01, 0), new THREE.MeshLambertMaterial({ color: 0x4a4640 })));
const PREVIEW_BG = new THREE.Color(0x6b6862);

// effects
const horde = new Horde(scene, MAXZ);
const blood = new Particles(scene, 500, 0.07, false, 0.95), smoke = new Particles(scene, 300, 0.16, false, 0.4), glow = new Particles(scene, 600, 0.1, true);
const splats = new Decals(scene, TEX.splat, 28, 40, 0.9), holes = new Decals(scene, TEX.hole, 48, 30, 1);
const debris = new Debris(scene, 48), segs = new GlowSegs(scene, 96);

// =====================================================================================
// Room
// =====================================================================================
const room = new THREE.Group(); scene.add(room);
const R = { walls: [], openings: [], stations: [], info: 'No room yet', real: false, found: null };
const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
const woodMat = new THREE.MeshLambertMaterial({ map: TEX.wood, color: 0xd9c4a8 }), frameMat = new THREE.MeshLambertMaterial({ map: TEX.wood, color: 0x8a7460 });
const glassMat = new THREE.MeshPhongMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.32, shininess: 90, side: THREE.DoubleSide, depthWrite: false });
const basis = (obj, right, n, x, y, z) => { obj.matrixAutoUpdate = false; obj.matrix.makeBasis(right, UP, n).setPosition(x, y, z); obj.matrixWorldNeedsUpdate = true; };

function buildRoom(walls, openings, info) {
  room.clear(); R.walls = []; R.openings = []; R.stations = []; R.info = info; holes.clear(); splats.clear();
  walls.forEach((w, wi) => {
    const n = V().set(w.nx, 0, w.nz), right = V().set(w.nz, 0, -w.nx), c = V().set(w.cx, 0, w.cz), { panels, H } = wallPanels(w, openings, wi);
    const wg = new THREE.Group(); basis(wg, right, n, c.x, 0, c.z); room.add(wg);
    for (const p of panels) { if (p.x1 - p.x0 < 0.002 || p.y1 - p.y0 < 0.002) continue; const m = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0, p.y1 - p.y0), occluderMat); m.position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0); m.renderOrder = -10; m.frustumCulled = false; wg.add(m); }
    R.walls.push({ c, n, right, w: w.w, h: H, open: [] });
  });
  for (const o of openings) {
    const wall = R.walls[o.wall], pos = V().copy(wall.c).addScaledVector(wall.right, o.u), g = new THREE.Group(); basis(g, wall.right, wall.n, pos.x, 0, pos.z); room.add(g);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), portalMaterial(pos, wall.right, wall.n)); portal.position.set(0, o.y0 + o.h / 2, -0.004); portal.renderOrder = -20; g.add(portal);
    // frame (one merged mesh)
    const F = 0.085, parts = [new THREE.BoxGeometry(F, o.h + F, 0.07).translate(-o.w / 2 - F / 2, o.y0 + o.h / 2 + F / 2, 0.02), new THREE.BoxGeometry(F, o.h + F, 0.07).translate(o.w / 2 + F / 2, o.y0 + o.h / 2 + F / 2, 0.02), new THREE.BoxGeometry(o.w + F * 2 + 0.06, F, 0.08).translate(0, o.y0 + o.h + F / 2, 0.025)];
    if (o.y0 > 0.01) parts.push(new THREE.BoxGeometry(o.w + F * 2 + 0.1, 0.05, 0.14).translate(0, o.y0 - 0.025, 0.05));
    g.add(new THREE.Mesh(merge(parts), frameMat));
    if (o.kind === 'window') { // a few shards of broken glass left in the frame
      const sh = [];
      for (let i = 0; i < 5; i++) { const side = i % 2 ? 1 : -1, y = o.y0 + (i < 2 ? 0 : o.h) + (i < 2 ? 1 : -1) * 0.0, s = new THREE.Shape(), bw = 0.12 + Math.random() * 0.2, bh = 0.12 + Math.random() * 0.22; const x = side * (o.w / 2) * (0.35 + Math.random() * 0.65), dir = i < 2 ? 1 : -1; s.moveTo(x - bw / 2, y); s.lineTo(x + bw / 2, y); s.lineTo(x + (Math.random() - 0.5) * bw, y + dir * bh); sh.push(new THREE.ShapeGeometry(s)); }
      const glass = new THREE.Mesh(merge(sh), glassMat); glass.position.z = 0.0; glass.renderOrder = 3; g.add(glass);
    }
    const n = clamp(Math.round(o.h / 0.36), 2, 6), planks = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.3, 0.155, 0.034), woodMat); p.position.set((Math.random() - 0.5) * 0.06, o.y0 + (i + 0.5) * (o.h / n), 0.07 + (i % 2) * 0.012); p.rotation.z = (Math.random() - 0.5) * 0.2;
      p.userData.home = p.position.clone(); p.userData.rz = p.rotation.z; g.add(p); planks.push({ mesh: p, hp: PLANK_HP });
    }
    const op = { pos, n: wall.n, right: wall.right, w: o.w, h: o.h, y0: o.y0, kind: o.kind, real: o.real, planks, group: g, u: o.u, wall };
    R.openings.push(op); wall.open.push(op);
  }
  buildStations(layoutSlots(walls, openings));
}

// Ray vs room walls. Returns distance to the first solid wall (Infinity if the ray leaves through an opening or hits nothing).
const wallHitInfo = { n: V(), p: V() };
function wallHit(o, d, maxT = 60) {
  let best = Infinity;
  for (const w of R.walls) {
    const dn = d.dot(w.n); if (dn > -1e-4) continue; // only walls we are looking at from inside
    const t = _g.copy(w.c).sub(o).dot(w.n) / dn; if (t <= 0.01 || t >= best || t > maxT) continue;
    _g.copy(o).addScaledVector(d, t); const y = _g.y, u = _g.sub(w.c).dot(w.right);
    if (Math.abs(u) > w.w / 2 || y < 0 || y > w.h) continue;
    if (w.open.some((op) => Math.abs(u - op.u) < op.w / 2 && y > op.y0 && y < op.y0 + op.h)) return Infinity; // straight out through a doorway or window
    best = t; wallHitInfo.n.copy(w.n); wallHitInfo.p.copy(o).addScaledVector(d, t);
  }
  return best;
}

// ---- wall stations: weapon buys, Mystery Crate, Overclock bench, perk dispensers
const displayCache = new Map();
const displayGun = (wi) => { if (!displayCache.has(wi)) displayCache.set(wi, bakeModel(buildGun(WEAPONS[wi]))); return displayCache.get(wi); };
function buildStations(slots) {
  const order = WALL_ORDER.slice(0, slots.length);
  order.forEach((key, i) => {
    const s = slots[i], [kind, id] = key.includes(':') ? key.split(':') : [key, ''], n = V().set(s.nx, 0, s.nz), right = V().set(s.nz, 0, -s.nx);
    const g = new THREE.Group(); basis(g, right, n, s.x + n.x * 0.012, 1.32, s.z + n.z * 0.012); room.add(g);
    const panel = makePanel(0.6, 0.42, 640, { transparent: true }); g.add(panel.mesh);
    const st = { kind, id, wi: kind === 'w' ? WI[id] : -1, g, panel, pos: V().set(s.x + n.x * 0.1, 1.32, s.z + n.z * 0.1), n, hot: 0, key: '', busy: 0, show: null };
    if (kind === 'w') { st.show = displayGun(st.wi).clone(); st.show.position.set(0, -0.005, 0.06); g.add(st.show); }
    if (kind === 'crate') { const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.16), woodMat); box.position.set(0, -0.03, 0.08); g.add(box); st.box = box; st.slot = new THREE.Group(); st.slot.position.set(0, 0.2, 0.1); g.add(st.slot); }
    if (kind === 'bench') { const b = new THREE.Mesh(merge([new THREE.BoxGeometry(0.34, 0.04, 0.14).translate(0, -0.02, 0.08), new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, 0.05, 0.08), new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0.05, 0.14)]), new THREE.MeshPhongMaterial({ color: 0x7a5cff, emissive: 0x2a1466, shininess: 60 })); b.position.y = 0.02; g.add(b); st.box = b; }
    R.stations.push(st);
  });
  R.stations.forEach(drawStation);
}
function stationOffer(st, h) { // -> {label, price, ok, why}
  if (st.kind === 'w') {
    const w = WEAPONS[st.wi], it = G.inv.find((q) => q.wi === st.wi);
    if (!it) return { label: `Buy ${w.name}`, price: w.price };
    if (w.kind === 'melee') return { label: `${w.name} owned`, price: -1 };
    const full = it.ammo >= magOf(it) && it.reserve >= reserveMax(it);
    return full ? { label: 'Ammo full', price: -1 } : { label: `Refill ${w.name} ammo`, price: Math.round(w.price * AMMO_PRICE_FRAC * (it.tier ? 3 : 1) / 50) * 50 };
  }
  if (st.kind === 'crate') return st.busy > 0 ? { label: 'Rolling…', price: -1 } : { label: 'Mystery Crate — random weapon', price: CRATE_PRICE };
  if (st.kind === 'bench') {
    const it = h && G.inv[h.slot]; if (!it) return { label: 'Overclock the weapon in your hand', price: BENCH_PRICES[0] };
    if (it.tier >= 2) return { label: `${WEAPONS[it.wi].name} is maxed`, price: -1 };
    return { label: `Overclock ${WEAPONS[it.wi].name} → tier ${it.tier + 1}`, price: BENCH_PRICES[it.tier] };
  }
  const p = PERKS[st.id]; return G.perks[st.id] ? { label: `${p.name} active`, price: -1 } : { label: `${p.name} — ${p.note}`, price: p.price };
}
function drawStation(st) {
  const o = stationOffer(st, null), key = `${o.label}|${o.price}|${st.hot > 0}`; if (key === st.key) return; st.key = key;
  const c = st.panel.ctx, W = st.panel.w, H = st.panel.h, accent = st.kind === 'w' ? '#ffcf4a' : st.kind === 'crate' ? '#ff5ad1' : st.kind === 'bench' ? '#9a7bff' : '#' + PERKS[st.id].color.toString(16).padStart(6, '0');
  c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(12,13,16,0.86)'; roundRect(c, 4, 4, W - 8, H - 8, 18); c.fill();
  c.lineWidth = st.hot > 0 ? 9 : 4; c.strokeStyle = accent; roundRect(c, 6, 6, W - 12, H - 12, 16); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f2f4f7';
  const title = st.kind === 'w' ? WEAPONS[st.wi].name : st.kind === 'crate' ? 'MYSTERY CRATE' : st.kind === 'bench' ? 'OVERCLOCK' : PERKS[st.id].name.toUpperCase();
  c.font = '800 34px system-ui,sans-serif'; c.fillText(title, W / 2, 36, W - 30);
  if (st.kind === 'perk') { c.fillStyle = accent; c.beginPath(); c.arc(W / 2, H / 2 - 4, 54, 0, 7); c.fill(); c.fillStyle = '#101114'; c.font = '900 64px system-ui,sans-serif'; c.fillText(PERKS[st.id].name[0], W / 2, H / 2); c.fillStyle = '#cfd5dc'; c.font = '500 22px system-ui,sans-serif'; c.fillText(PERKS[st.id].note, W / 2, H - 78, W - 30); }
  if (st.kind === 'crate') { c.fillStyle = accent; c.font = '900 70px system-ui,sans-serif'; c.fillText('?', W / 2, 96); }
  if (st.kind === 'bench') { c.fillStyle = '#cfd5dc'; c.font = '500 22px system-ui,sans-serif'; c.fillText('Upgrades the gun you point with', W / 2, 74, W - 30); }
  c.fillStyle = o.price < 0 ? '#8fd6a0' : accent; c.font = '800 40px system-ui,sans-serif';
  c.fillText(o.price < 0 ? (st.kind === 'perk' ? 'ACTIVE' : o.label.toUpperCase()) : (st.kind === 'w' && G.inv.some((q) => q.wi === st.wi) ? `AMMO  ${o.price}` : String(o.price)), W / 2, H - 38, W - 30);
  st.panel.dirty();
}

// =====================================================================================
// Zombies
// =====================================================================================
const zombies = [];
for (let i = 0; i < MAXZ; i++) zombies.push({ i, state: 'dead', pos: V(), head: V(), chestA: V(), chestB: V(), skin: new THREE.Color(), shirt: new THREE.Color(), pants: new THREE.Color() });
let aliveCount = 0;
const alive = (z) => z.state !== 'dead' && z.state !== 'dying';
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function spawnZombie(typeName, op, hpMul) {
  const z = zombies.find((q) => q.state === 'dead'); if (!z) return null;
  const T = ZTYPES[typeName], D = DIFFICULTY[opt.difficulty], poses = [1.45, 1.45, 1.0, 0.35];
  Object.assign(z, {
    state: 'approach', type: T, typeName, op, hp: T.hp * hpMul, speed: T.speed * D.speed * (0.88 + Math.random() * 0.24), runner: typeName === 'runner',
    lat: (Math.random() - 0.5) * Math.max(0.1, op.w - 0.5), depth: LANE - Math.random() * 1.5, yaw: 0, climb: 0, moving: 1,
    phase: Math.random() * 6, atk: 0.4 + Math.random() * 0.5, flash: 0, flinch: 0, slow: 0, burn: 0, chill: 0, frozen: 0, fuse: 0, fuseDmg: 0, meleeCd: 0, dieT: 0, dieDir: -1, swing: 0, fog: 0.85,
    scale: T.scale * (0.94 + Math.random() * 0.12), tilt: (Math.random() - 0.5) * 0.7, armL: pick(poses), armR: pick(poses), limp: Math.random() < 0.3, headless: false, lastHand: null,
  });
  if (Math.random() < 0.12) z[Math.random() < 0.5 ? 'armL' : 'armR'] = -99; // some arrive already missing an arm
  z.skin.set(T.skin).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.08); z.shirt.set(pick(T.shirt)); z.pants.set(pick(T.pants));
  aliveCount++; return z;
}

function updateZombies(dt, t) {
  const D = DIFFICULTY[opt.difficulty];
  for (const z of zombies) {
    if (z.state === 'dead') continue;
    const T = z.type; z.moving = 0;
    z.flash = Math.max(0, z.flash - dt * 6); z.flinch *= Math.max(0, 1 - dt * 7); z.slow = Math.max(0, z.slow - dt); z.meleeCd = Math.max(0, z.meleeCd - dt); z.swing = Math.max(0, z.swing - dt * 3.2);
    if (alive(z)) {
      if (z.burn > 0) { z.burn -= dt; hurtZombie(z, 26 * dt, { silent: true }); if (Math.random() < dt * 16) glow.emit(z.chestB.x + (Math.random() - 0.5) * 0.3, z.chestB.y - 0.5 + Math.random() * 0.8, z.chestB.z + (Math.random() - 0.5) * 0.3, 0, 1, 0, 1, 0.5 + Math.random() * 0.3, 0.1, 0.4, -0.5); }
      if (z.frozen > 0) z.frozen -= dt; else z.chill = Math.max(0, z.chill - dt * 0.25);
      if (z.fuse > 0) { const before = z.fuse; z.fuse -= dt; if (Math.floor(before * 5) !== Math.floor(z.fuse * 5)) sfx.tone(1800, 0.03, { gain: 0.25, pos: z.chestB }); if (z.fuse <= 0) explode(z.chestB, 2.0, z.fuseDmg, 0xffa040, z.lastHand); }
    }
    if (alive(z)) {
      const stopped = z.frozen > 0, spd = stopped ? 0 : z.speed * (z.slow > 0 ? 0.3 : 1) * (1 - z.chill * 0.6), op = z.op;
      if (z.state === 'approach' || z.state === 'bash' || z.state === 'enter') {
        const planksLeft = op.planks.some((p) => p.hp > 0);
        if (z.state === 'approach') {
          let blocked = false;
          for (const o of zombies) { if (o !== z && o.op === op && (o.state === 'approach' || o.state === 'bash') && o.depth < z.depth && z.depth - o.depth < 0.6 && Math.abs(o.lat - z.lat) < 0.45) { blocked = true; break; } }
          if (!blocked && spd > 0) { z.depth -= spd * dt; z.moving = 1; }
          if (z.depth <= 0.55) { z.depth = 0.55; z.state = planksLeft ? 'bash' : 'enter'; }
        } else if (z.state === 'bash') {
          if (!planksLeft) z.state = 'enter';
          else if (!stopped && (z.atk -= dt) <= 0) { z.atk = 0.9 + Math.random() * 0.35; z.swing = 1; hitPlank(op, pick(op.planks.filter((p) => p.hp > 0)), T.plank); }
        } else {
          z.depth -= Math.max(0.5, spd) * dt * (op.y0 > 0 ? 0.7 : 1) * (stopped ? 0 : 1); z.lat *= 1 - Math.min(1, dt * 3); z.moving = 1;
          z.climb = op.y0 > 0 && !T.crawl ? op.y0 * clamp(1 - Math.abs(z.depth) / 0.55, 0, 1) : 0;
          if (z.depth <= -0.55) { z.state = 'hunt'; z.climb = 0; }
        }
        z.pos.set(op.pos.x + op.right.x * z.lat - op.n.x * z.depth, 0, op.pos.z + op.right.z * z.lat - op.n.z * z.depth);
        z.yaw = Math.atan2(op.n.x, op.n.z); z.fog = clamp((z.depth - 1) / (LANE - 1), 0, 0.88);
      } else { // hunt
        const dx = headPos.x - z.pos.x, dz = headPos.z - z.pos.z, dist = Math.hypot(dx, dz) || 1e-3, reach = T.crawl ? 1.85 : 0.95 * z.scale + 0.1;
        if (dist > reach) { z.pos.x += (dx / dist) * spd * dt; z.pos.z += (dz / dist) * spd * dt; z.moving = spd > 0 ? 1 : 0; }
        else if (!stopped && (z.atk -= dt) <= 0) { z.atk = 1.1; z.swing = 1; hurtPlayer(T.dmg * D.dmg, z.pos); }
        let dy = Math.atan2(dx, dz) - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); if (!stopped) z.yaw += dy * Math.min(1, dt * 6); z.fog = 0;
      }
      if (!stopped) z.phase += dt * (z.moving ? spd * 4.4 + 1.2 : 1.4);
    } else { // dying
      z.dieT += dt;
      if (z.headless && z.dieT < 0.7 && Math.random() < dt * 40) blood.emit(z.chestB.x, z.chestB.y + 0.1, z.chestB.z, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 0.5, 0.02, 0.02, 0.8);
      if (z.dieT > 0.45 && !z.splat && z.state === 'dying' && z.fog < 0.2) { z.splat = true; splats.add(_a.set((z.head.x + z.pos.x) / 2, 0, (z.head.z + z.pos.z) / 2), UP, 0.7 + Math.random() * 0.5); }
      if (z.dieT > 4.5) { z.state = 'dead'; horde.hide(z.i); continue; }
    }
    horde.pose(z);
  }
  for (let i = 0; i < MAXZ; i++) { // keep hunters from stacking up
    const a = zombies[i]; if (a.state !== 'hunt') continue;
    for (let j = i + 1; j < MAXZ; j++) {
      const b = zombies[j]; if (b.state !== 'hunt') continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz, min = 0.55;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), p = (min - d) / d * 0.5; a.pos.x -= dx * p; a.pos.z -= dz * p; b.pos.x += dx * p; b.pos.z += dz * p; }
    }
  }
  horde.commit();
}
function hitPlank(op, p, amount) {
  p.hp -= amount; p.mesh.rotation.z += (Math.random() - 0.5) * 0.3; p.mesh.position.z = p.mesh.userData.home.z + 0.02;
  _a.copy(p.mesh.position).applyMatrix4(op.group.matrix);
  if (p.hp <= 0) {
    p.mesh.visible = false; sfx.burst(0.18, { freq: 1500, gain: 0.55, pos: _a }); sfx.tone(140, 0.14, { slideTo: 55, gain: 0.45, type: 'square', pos: _a });
    for (let i = 0; i < 10; i++) smoke.emit(_a.x + op.right.x * (Math.random() - 0.5) * op.w, _a.y, _a.z + op.right.z * (Math.random() - 0.5) * op.w, op.n.x * (0.5 + Math.random() * 2), Math.random() * 2, op.n.z * (0.5 + Math.random() * 2), 0.5, 0.36, 0.22, 0.8, 6);
    for (let i = 0; i < 3; i++) debris.spawn(_b.copy(_a).addScaledVector(op.right, (Math.random() - 0.5) * op.w), _c.copy(op.n).multiplyScalar(1 + Math.random() * 2).setY(1 + Math.random()), 0.03, 0.2 + Math.random() * 0.25, 0.1, 0x7a5632);
  } else { sfx.tone(95, 0.11, { slideTo: 50, gain: 0.5, type: 'triangle', pos: _a }); sfx.burst(0.05, { freq: 500, gain: 0.3, pos: _a }); smoke.emit(_a.x, _a.y, _a.z, op.n.x, 0.5, op.n.z, 0.5, 0.4, 0.28, 0.5, 3); }
}
function repairPlank(p) { p.hp = PLANK_HP; p.mesh.visible = true; p.mesh.position.copy(p.mesh.userData.home); p.mesh.rotation.z = p.mesh.userData.rz; }
function repairAll() { for (const op of R.openings) op.planks.forEach(repairPlank); }

// Ray vs horde. Returns hits sorted by distance: [{z, t, head}]
function raySeg(o, d, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
  const B = d.x * vx + d.y * vy + d.z * vz, C = vx * vx + vy * vy + vz * vz, Dd = d.x * wx + d.y * wy + d.z * wz, E = vx * wx + vy * wy + vz * wz, den = C - B * B;
  let t = den < 1e-8 ? 0 : clamp((E - B * Dd) / den, 0, 1), s = B * t - Dd;
  if (s < 0) { s = 0; t = clamp(E / C, 0, 1); }
  const px = wx + d.x * s - vx * t, py = wy + d.y * s - vy * t, pz = wz + d.z * s - vz * t;
  return [px * px + py * py + pz * pz, s];
}
const hitsBuf = [];
function rayZombies(o, d, range, fat = 0) {
  hitsBuf.length = 0;
  for (const z of zombies) {
    if (!alive(z)) continue;
    const s = z.scale, hr = 0.16 * s + fat, br = 0.24 * s * Math.max(1, z.type.wide * 0.8) + fat;
    _e.copy(z.head).sub(o); const tca = _e.dot(d), d2 = _e.lengthSq() - tca * tca;
    let best = null;
    if (!z.headless && tca > 0 && d2 < hr * hr) { const t = tca - Math.sqrt(hr * hr - d2); if (t < range) best = { z, t, head: true }; }
    const [bd2, bt] = raySeg(o, d, z.chestA, z.chestB);
    if (bd2 < br * br) { const t = bt - Math.sqrt(br * br - bd2); if (t > 0 && t < range && (!best || t < best.t - 0.05)) best = { z, t, head: false }; }
    if (best) hitsBuf.push(best);
  }
  return hitsBuf.sort((p, q) => p.t - q.t);
}
const pointSegDist = (a, b, p) => { _d.copy(b).sub(a); const t = clamp(_e.copy(p).sub(a).dot(_d) / Math.max(1e-6, _d.lengthSq()), 0, 1); return _e.copy(a).addScaledVector(_d, t).distanceTo(p); };

// =====================================================================================
// Damage, points, power-ups
// =====================================================================================
const G = { state: 'menu', round: 0, spec: null, toSpawn: 0, spawnT: 0, timer: 0, hp: 100, maxHp: 100, lastHurt: -99, points: 0, earned: 0, kills: 0, heads: 0, best: 0, t: 0, desktop: false, inv: [], perks: {}, insta: 0, double: 0, drops: 0, paused: false };
try { G.best = +localStorage.getItem('breach-night-best-round') || 0; } catch { /* storage unavailable */ }
const hands = [];
function award(n, at) { const v = n * (G.double > G.t ? 2 : 1); G.points += v; G.earned += v; if (at) popup(`+${v}`, at); }

// opts: {head, point, dir, silent, hand, melee, noPoints}
function hurtZombie(z, amount, o = {}) {
  if (!alive(z)) return;
  if (z.frozen > 0) amount *= 4;
  if (G.insta > G.t && !o.silent) amount = 1e6;
  z.hp -= amount; if (o.hand) z.lastHand = o.hand;
  if (!o.silent) {
    z.flash = 1; z.flinch = (Math.random() < 0.5 ? -1 : 1) * 0.6; z.slow = Math.max(z.slow, 0.2);
    if (o.point) { blood.burst(o.point, o.head ? 10 : 6, 2.2, 0.55, 0.02, 0.02, 0.9, 9.8, 0.6); if (z.state === 'hunt' && Math.random() < 0.35) splats.add(_f.set(o.point.x + (Math.random() - 0.5) * 0.5, 0, o.point.z + (Math.random() - 0.5) * 0.5), UP, 0.2 + Math.random() * 0.3); }
    if (z.hp > 0 && !o.noPoints) award(POINTS.hit);
  }
  if (z.hp <= 0) killZombie(z, o);
}
function killZombie(z, o = {}) {
  const frozen = z.frozen > 0;
  z.state = 'dying'; z.dieT = 0; z.splat = false; z.dieDir = Math.random() < 0.7 ? -1 : 1; aliveCount--; G.kills++; if (o.head) { G.heads++; z.headless = true; }
  if (!o.noPoints) award(o.melee ? POINTS.melee : o.head ? POINTS.head : POINTS.kill, z.head);
  sfx.tone(130 + Math.random() * 40, 0.32, { slideTo: 50, gain: 0.35, type: 'sawtooth', pos: z.head });
  if (o.head) { blood.burst(z.head, 22, 3, 0.55, 0.02, 0.02, 1.1, 9.8, 1.5); sfx.burst(0.1, { freq: 500, gain: 0.5, pos: z.head }); }
  if (frozen) { glow.burst(z.chestB, 30, 3.5, 0.6, 0.9, 1, 0.7, 6, 1); sfx.burst(0.25, { freq: 6000, gain: 0.5, type: 'highpass', pos: z.chestB }); z.dieT = 4.2; }
  if (z.type.boom) { const p = explode(z.chestB, 1.9, 280, 0xb6ff3a, null); if (p.distanceTo(headPos) < 1.9) hurtPlayer(16 * DIFFICULTY[opt.difficulty].dmg, p); }
  maybeDrop(z);
}
const booms = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; scene.add(m); return { m, t: 0, r: 1 }; });
let boomK = 0;
function explode(at, radius, dmg, color = 0xffa040, hand = null) {
  const p = at.clone(), b = booms[boomK]; boomK = (boomK + 1) % booms.length; b.m.position.copy(p); b.m.material.color.set(color); b.t = 0.0001; b.r = radius; b.m.visible = true;
  _col.set(color); glow.burst(p, 40, 5, _col.r, _col.g * 0.8, _col.b * 0.6, 0.55, 3, 1.5); smoke.burst(p, 14, 2.5, 0.25, 0.24, 0.22, 1.4, -0.6, 0.8);
  flashLight.position.copy(p); flashLight.color.set(color); flashLight.intensity = 9;
  sfx.burst(0.7, { freq: 900, slideTo: 80, gain: 1.0, pos: p }); sfx.tone(90, 0.5, { slideTo: 30, gain: 0.9, type: 'triangle', pos: p });
  for (const h of hands) rumble(h, 0.9, 120);
  if (p.y < 1.3) splats.add(_f.set(p.x, 0, p.z), UP, 0.9);
  for (const z of zombies) { if (!alive(z)) continue; const d = z.chestB.distanceTo(p); if (d < radius) hurtZombie(z, dmg * (1 - 0.7 * d / radius), { hand, silent: false }); }
  return p;
}

// ---- floating +points
const popups = Array.from({ length: 8 }, () => { const p = makePanel(0.26, 0.1, 500, { depthTest: false }); p.mesh.visible = false; p.mesh.renderOrder = 40; scene.add(p.mesh); return { p, t: 0 }; });
let popK = 0;
function popup(text, at) {
  const q = popups[popK]; popK = (popK + 1) % popups.length; const c = q.p.ctx; c.clearRect(0, 0, q.p.w, q.p.h);
  c.font = '900 40px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(text, q.p.w / 2, q.p.h / 2); c.fillStyle = '#ffd84a'; c.fillText(text, q.p.w / 2, q.p.h / 2); q.p.dirty();
  q.p.mesh.position.copy(at); q.p.mesh.position.y += 0.25; q.t = 0.9; q.p.mesh.visible = true;
  const s = clamp(at.distanceTo(headPos) * 0.45, 0.6, 3); q.p.mesh.scale.setScalar(s);
}

// ---- power-up drops
const drops = Array.from({ length: 4 }, () => { const p = makePanel(0.34, 0.34, 400); p.mesh.visible = false; scene.add(p.mesh); return { p, life: 0, kind: '', pos: V() }; });
function maybeDrop(z) {
  if (G.state !== 'wave' || G.drops >= 3 || Math.random() > 0.045) return;
  const d = drops.find((q) => q.life <= 0); if (!d) return;
  const kinds = Object.keys(POWERUPS).filter((k) => !drops.some((q) => q.life > 0 && q.kind === k)); d.kind = pick(kinds); G.drops++;
  if (z.state === 'dying' && z.fog === 0 && z.depth < 0) d.pos.set(z.pos.x, 1.1, z.pos.z); else d.pos.copy(z.op.pos).addScaledVector(z.op.n, 0.8).setY(1.1);
  const P = POWERUPS[d.kind], c = d.p.ctx, W = d.p.w, hex = '#' + P.color.toString(16).padStart(6, '0'); c.clearRect(0, 0, W, W);
  const gr = c.createRadialGradient(W / 2, W / 2, 10, W / 2, W / 2, W / 2); gr.addColorStop(0, hex); gr.addColorStop(0.55, 'rgba(20,20,20,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, W, W);
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 24px system-ui,sans-serif'; const words = P.name.split(' '); words.forEach((wd, i) => c.fillText(wd, W / 2, W / 2 + (i - (words.length - 1) / 2) * 26)); d.p.dirty();
  d.life = 22; d.p.mesh.visible = true; d.p.mesh.position.copy(d.pos); sfx.tone(660, 0.2, { gain: 0.3 }); sfx.tone(990, 0.3, { gain: 0.3, when: 0.15 });
}
function collectDrop(d) {
  d.life = 0; d.p.mesh.visible = false; const P = POWERUPS[d.kind];
  say(P.name, '', 2.2, '#' + P.color.toString(16).padStart(6, '0')); sfx.tone(523, 0.12, { gain: 0.4 }); sfx.tone(659, 0.12, { gain: 0.4, when: 0.1 }); sfx.tone(784, 0.3, { gain: 0.4, when: 0.2 });
  if (d.kind === 'ammo') G.inv.forEach((it) => { it.ammo = magOf(it); it.reserve = reserveMax(it); });
  if (d.kind === 'insta') G.insta = G.t + P.time;
  if (d.kind === 'double') G.double = G.t + P.time;
  if (d.kind === 'boards') { repairAll(); award(200); }
  if (d.kind === 'nuke') { for (const z of zombies) if (alive(z)) { z.burn = 2; killZombie(z, { noPoints: true }); } award(POINTS.nuke); flashLight.position.copy(headPos); flashLight.color.set(0xffffff); flashLight.intensity = 12; }
}
function updateDrops(dt, t) {
  for (const d of drops) {
    if (d.life <= 0) continue;
    d.life -= dt; const m = d.p.mesh; m.position.y = d.pos.y + Math.sin(t * 2.4) * 0.06; m.lookAt(headPos.x, m.position.y, headPos.z); m.visible = d.life > 5 || Math.sin(t * 14) > -0.2;
    if (Math.random() < dt * 8) { _col.set(POWERUPS[d.kind].color); glow.emit(d.pos.x + (Math.random() - 0.5) * 0.3, d.pos.y - 0.2, d.pos.z + (Math.random() - 0.5) * 0.3, 0, 0.6, 0, _col.r, _col.g, _col.b, 0.7, -0.3); }
    if (Math.hypot(headPos.x - d.pos.x, headPos.z - d.pos.z) < 0.85) collectDrop(d);
    for (const h of hands) { h.aim.getWorldPosition(_a); if (_a.distanceTo(m.position) < 0.3) collectDrop(d); }
    if (d.life <= 0) m.visible = false;
  }
}
function rayDrops(o, d) { for (const q of drops) { if (q.life <= 0) continue; _e.copy(q.p.mesh.position).sub(o); const tca = _e.dot(d); if (tca > 0 && _e.lengthSq() - tca * tca < 0.07) { collectDrop(q); return true; } } return false; }

// ---- player
const vignette = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, map: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 22, 64, 64, 64);
  gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, 'rgba(190,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})() }));
vignette.position.z = -0.3; vignette.renderOrder = 50; camera.add(vignette);
function hurtPlayer(amount, from) {
  if (G.state !== 'wave' && G.state !== 'intermission') return;
  G.hp -= amount; G.lastHurt = G.t; vignette.material.opacity = 0.9;
  sfx.tone(160, 0.2, { slideTo: 70, gain: 0.6, type: 'sawtooth' }); sfx.burst(0.12, { freq: 600, gain: 0.5 });
  for (const h of hands) rumble(h, 1, 150);
  if (G.hp <= 0) {
    if (G.perks.wind) { // Second Wind: back on your feet with a shockwave
      delete G.perks.wind; G.hp = G.maxHp * 0.5; say('SECOND WIND', 'You are back up — the perk is spent', 3, '#4f9fe0'); explode(_a.copy(headPos).setY(1), 3.2, 900, 0x4f9fe0, null); R.stations.forEach(drawStation);
    } else { G.hp = 0; gameOver(); }
  }
}

// =====================================================================================
// Weapons
// =====================================================================================
const magOf = (it) => Math.round(WEAPONS[it.wi].mag * (it.tier ? 1.5 : 1));
const reserveMax = (it) => (WEAPONS[it.wi].reserve === Infinity ? Infinity : magOf(it) * WEAPONS[it.wi].reserve);
const dmgOf = (it) => WEAPONS[it.wi].dmg * BENCH_MULT[it.tier];
function giveWeapon(wi, h) { // returns the inventory item; swaps out a gun if the bag is full
  const w = WEAPONS[wi]; let it = G.inv.find((q) => q.wi === wi);
  if (!it) {
    it = { wi, tier: 0, ammo: 0, reserve: 0 };
    if (w.kind === 'melee') { const old = G.inv.findIndex((q) => WEAPONS[q.wi].kind === 'melee'); if (old >= 0) G.inv[old] = it; else G.inv.push(it); }
    else {
      const guns = G.inv.filter((q) => WEAPONS[q.wi].kind !== 'melee'), cap = G.perks.pockets ? 4 : 3;
      if (guns.length >= cap) { const held = h && G.inv[h.slot], drop = held && WEAPONS[held.wi].kind !== 'melee' ? held : guns.find((q) => !hands.some((x) => G.inv[x.slot] === q)) || guns[guns.length - 1]; G.inv[G.inv.indexOf(drop)] = it; }
      else G.inv.push(it);
    }
  }
  it.ammo = magOf(it); it.reserve = reserveMax(it);
  if (h) equip(h, G.inv.indexOf(it)); hands.forEach((x) => { if (x.slot >= G.inv.length) equip(x, 0); else if (x !== h) equip(x, x.slot); });
  return it;
}
function makeHand(aim, ctrl) {
  const root = new THREE.Group(); aim.add(root);
  const hud = makePanel(0.13, 0.075, 2400); hud.mesh.position.set(0, 0.105, 0.04); hud.mesh.rotation.x = -0.6; root.add(hud.mesh);
  const flash = new THREE.Group(); for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: TEX.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); if (i === 1) q.rotation.y = Math.PI / 2; if (i === 2) q.rotation.x = Math.PI / 2; flash.add(q); } flash.visible = false; root.add(flash);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.03, 0.042, 0.036), new THREE.MeshLambertMaterial({ color: 0x2e2a26 })); glove.position.set(0, -0.05, 0.004); root.add(glove);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true, opacity: 0.9 })); dot.renderOrder = 30; dot.visible = false; scene.add(dot);
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xbfe8ff })); laser.visible = false; aim.add(laser);
  return { aim, ctrl, root, hud, flash, dot, laser, models: new Map(), gun: null, slot: -1, cool: 0, spin: 0, ramp: 0, rz: 0, rv: 0, rp: 0, rpv: 0, slideT: 0, pumpT: 0, drumA: 0, flashT: 0, reloadT: 0, reloadLen: 1, magDropped: false, hudKey: '', tip: V(), tipPrev: V(), tipOk: false, repairT: 0, coneSnd: 0, target: null,
    trig: false, trigDown: false, squeeze: false, squeezeDown: false, reloadDown: false, cycle: 0, stick: false, stickDown: false };
}
function equip(h, slot) {
  h.slot = slot; const it = G.inv[slot]; if (!it) return;
  const key = it.wi + ':' + it.tier; let m = h.models.get(key);
  if (!m) { m = buildGun(WEAPONS[it.wi], it.tier); h.models.set(key, m); h.root.add(m); }
  h.models.forEach((g) => { g.visible = g === m; }); h.gun = m; const [mu, mv] = m.userData.muzzle; h.flash.position.set(0, mv, -mu - 0.05);
  h.spin = 0; h.ramp = 0; h.tipOk = false; h.reloadT = 0; h.hudKey = '';
}
function cycleWeapon(h, dir) {
  const n = G.inv.length, other = hands.find((x) => x !== h);
  for (let k = 1; k < n; k++) { const s = (h.slot + dir * k + n * 4) % n; if (!other || other.slot !== s) { equip(h, s); sfx.tone(520, 0.03, { gain: 0.12 }); sfx.tone(780, 0.03, { gain: 0.1, when: 0.04 }); return; } }
  if (other) { const s = h.slot; equip(h, other.slot); equip(other, s); sfx.tone(520, 0.03, { gain: 0.12 }); }
}
function rumble(h, s, ms) { if (h.ctrl) controllers.pulse(h.ctrl, s, ms); }
function drawHud(h) {
  const it = G.inv[h.slot]; if (!it) return; const w = WEAPONS[it.wi];
  const ammo = w.kind === 'melee' ? '' : h.reloadT > 0 ? 'RELOAD' : `${Math.ceil(it.ammo)}`, res = w.kind === 'melee' ? '' : it.reserve === Infinity ? '∞' : String(Math.ceil(it.reserve));
  const buffs = (G.insta > G.t ? ` INSTA ${Math.ceil(G.insta - G.t)}` : '') + (G.double > G.t ? ` 2X ${Math.ceil(G.double - G.t)}` : '');
  const k = `${it.wi}|${it.tier}|${ammo}|${res}|${Math.ceil(G.hp)}|${G.maxHp}|${G.round}|${G.points}|${buffs}|${Object.keys(G.perks).join()}`;
  if (k === h.hudKey) return; h.hudKey = k;
  const c = h.hud.ctx, W = h.hud.w, H = h.hud.h; c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(8,9,11,0.8)'; roundRect(c, 0, 0, W, H, 14); c.fill();
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = it.tier === 2 ? '#ff7ad9' : it.tier === 1 ? '#ffb347' : '#cfd6dd'; c.font = '600 24px system-ui,sans-serif'; c.fillText(('★'.repeat(it.tier) + ' ' + w.name).trim(), 10, 20, W - 100);
  c.textAlign = 'right'; c.fillStyle = '#9aa6b2'; c.fillText(`R${G.round}`, W - 10, 20);
  c.fillStyle = h.reloadT > 0 ? '#ffb84a' : it.ammo <= magOf(it) * 0.25 ? '#ff6a5a' : '#ffffff'; c.font = `800 ${ammo.length > 4 ? 30 : 54}px system-ui,sans-serif`; c.textAlign = 'left'; c.fillText(ammo, 10, 68); const aw = c.measureText(ammo).width;
  if (res && h.reloadT <= 0) { c.fillStyle = '#9aa6b2'; c.font = '600 26px system-ui,sans-serif'; c.fillText('/ ' + res, 18 + aw, 76); }
  c.textAlign = 'right'; c.fillStyle = '#ffd84a'; c.font = '800 46px system-ui,sans-serif'; c.fillText(String(G.points), W - 10, 70);
  // health bar + perks + buffs
  const bw = W - 20, frac = clamp(G.hp / G.maxHp, 0, 1); c.fillStyle = '#2a2d33'; roundRect(c, 10, 104, bw, 16, 8); c.fill(); c.fillStyle = frac > 0.5 ? '#63d98a' : frac > 0.25 ? '#ffd166' : '#ff5a4a'; if (frac > 0.02) { roundRect(c, 10, 104, bw * frac, 16, 8); c.fill(); }
  let x = 10; for (const id of Object.keys(G.perks)) { c.fillStyle = '#' + PERKS[id].color.toString(16).padStart(6, '0'); c.beginPath(); c.arc(x + 12, 150, 12, 0, 7); c.fill(); c.fillStyle = '#111'; c.font = '900 18px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText(PERKS[id].name[0], x + 12, 151); x += 30; }
  c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = '800 22px system-ui,sans-serif'; c.fillText(buffs.trim(), W - 10, 151);
  h.hud.dirty();
}

// generic projectile pool (grenades, bolts, plasma, discs, singularity orbs)
const projs = Array.from({ length: 18 }, () => {
  const g = new THREE.Group(), parts = {
    grenade: new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshPhongMaterial({ color: 0x3b4a33, shininess: 30 })),
    bolt: new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 6).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xb9c0c8, emissive: 0x331100 })),
    plasma: new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9dffc4 })),
    disc: new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.006, 16), new THREE.MeshBasicMaterial({ color: 0xffc35a })),
    orb: new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: 0x08040e })),
  };
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0xb06bff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); parts.orb.add(ring);
  for (const k in parts) g.add(parts[k]); g.visible = false; scene.add(g);
  return { g, parts, ring, v: V(), life: 0, type: '', hit: new Set() };
});
function launch(type, h, it, w) {
  const p = projs.find((q) => q.life <= 0) || projs[0];
  p.type = type; p.life = type === 'orb' ? 0.9 : type === 'plasma' ? 1.8 : 3; p.hole = 0; p.it = it; p.w = w; p.hand = h; p.dmg = dmgOf(it); p.bounces = w.bounces || 0; p.hit.clear();
  p.g.position.copy(muzzle); p.v.copy(aimDir).multiplyScalar(w.speed); if (type === 'grenade') p.v.y += 1.6;
  for (const k in p.parts) p.parts[k].visible = k === type; p.g.visible = true; p.g.scale.setScalar(1);
  if (type === 'bolt') p.g.lookAt(_a.copy(muzzle).add(aimDir));
}
function updateProjectiles(dt, t) {
  for (const p of projs) {
    if (p.life <= 0) continue;
    const pos = p.g.position;
    if (p.hole > 0) { // open singularity: drag the horde in, then implode
      p.hole -= dt; p.ring.rotation.x += dt * 5; p.ring.rotation.y += dt * 7; p.g.scale.setScalar(2 + Math.sin(t * 20) * 0.15);
      for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283, r = 1.5 + Math.random(); glow.emit(pos.x + Math.cos(a) * r, pos.y + (Math.random() - 0.5) * 1.5, pos.z + Math.sin(a) * r, -Math.cos(a) * 4, 0, -Math.sin(a) * 4, 0.7, 0.35, 1, 0.35, 0); }
      for (const z of zombies) { if (!alive(z)) continue; const d = z.chestB.distanceTo(pos); if (d < p.w.radius) { hurtZombie(z, p.dmg * dt, { silent: true, hand: p.hand }); z.slow = 0.3; if (z.state === 'hunt') { z.pos.x += (pos.x - z.pos.x) * Math.min(1, dt * 2.2); z.pos.z += (pos.z - z.pos.z) * Math.min(1, dt * 2.2); } } }
      if (p.hole <= 0) { p.life = 0; p.g.visible = false; explode(pos, p.w.radius * 0.8, p.dmg * 3, 0xb06bff, p.hand); }
      continue;
    }
    p.life -= dt; const step = p.v.length() * dt; _a.copy(p.v).normalize();
    let impact = false, struck = null;
    const hits = rayZombies(pos, _a, step + 0.15, p.type === 'disc' ? 0.12 : 0.05);
    for (const hit of hits) { if (!p.hit.has(hit.z)) { struck = hit; break; } }
    if (!struck && wallHit(pos, _a, step + 0.05) < step + 0.05) impact = true;
    if (p.type === 'grenade' || p.type === 'bolt') p.v.y -= (p.type === 'bolt' ? 2.5 : 9.8) * dt;
    pos.addScaledVector(p.v, dt); if (pos.y < 0.05) { pos.y = 0.05; impact = true; }
    if (p.type === 'plasma') glow.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.3, 1, 0.55, 0.18, 0);
    if (p.type === 'disc') { p.parts.disc.rotation.y += dt * 40; glow.emit(pos.x, pos.y, pos.z, 0, 0, 0, 1, 0.6, 0.15, 0.12, 0); }
    if (p.type === 'orb') { p.ring.rotation.x += dt * 4; glow.emit(pos.x, pos.y, pos.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.6, 0.3, 1, 0.3, 0); }
    if (p.type === 'bolt') p.g.lookAt(_b.copy(pos).add(p.v));
    const done = () => { p.life = 0; p.g.visible = false; };
    if (p.type === 'disc') {
      if (struck) {
        hurtZombie(struck.z, p.dmg * (struck.head ? 2 : 1), { head: struck.head, point: struck.head ? struck.z.head : struck.z.chestB, hand: p.hand }); p.hit.add(struck.z); sfx.burst(0.06, { freq: 3500, gain: 0.3, pos });
        let next = null, nd = 5.5; for (const z of zombies) { if (!alive(z) || p.hit.has(z)) continue; const d = z.chestB.distanceTo(pos); if (d < nd) { nd = d; next = z; } }
        if (next && p.bounces-- > 0) { p.v.copy(next.chestB).sub(pos).normalize().multiplyScalar(p.w.speed); p.life = 2; } else done();
      } else if (impact || p.life <= 0) { glow.burst(pos, 8, 2, 1, 0.6, 0.2, 0.3, 4); done(); }
    } else if (p.type === 'bolt') {
      if (struck) { hurtZombie(struck.z, 60, { point: pos, hand: p.hand }); if (alive(struck.z)) { struck.z.fuse = 0.9; struck.z.fuseDmg = p.dmg; struck.z.lastHand = p.hand; } else explode(pos, p.w.radius, p.dmg, 0xffa040, p.hand); done(); }
      else if (impact || p.life <= 0) { explode(pos, p.w.radius, p.dmg, 0xffa040, p.hand); done(); }
    } else if (p.type === 'orb') {
      if (struck || impact || p.life <= 0) { p.life = 9; p.hole = 3.2; pos.y = Math.max(pos.y, 0.9); p.v.set(0, 0, 0); sfx.tone(60, 3.2, { slideTo: 200, gain: 0.7, type: 'sawtooth', pos }); }
    } else if (struck || impact || p.life <= 0) { explode(pos, p.w.radius, p.dmg, p.type === 'plasma' ? 0x5dff9a : 0xffa040, p.hand); done(); }
  }
}

const muzzle = V(), aimDir = V(), aimRight = V(), aimUp = V(), aimPos = V();
function aimVectors(h) {
  const e = h.aim.matrixWorld.elements, [mu, mv] = h.gun.userData.muzzle;
  aimRight.set(e[0], e[1], e[2]).normalize(); aimUp.set(e[4], e[5], e[6]).normalize(); aimDir.set(-e[8], -e[9], -e[10]).normalize(); aimPos.set(e[12], e[13], e[14]);
  muzzle.copy(aimPos).addScaledVector(aimDir, mu).addScaledVector(aimUp, mv);
}
function shotSound(w) {
  const s = w.snd; sfx.burst(s.d, { freq: s.f, slideTo: s.f * (s.slide || 0.3), gain: 0.55 });
  if (s.low) sfx.tone(s.low, s.d * 1.1, { slideTo: s.low * 0.45, gain: 0.5, type: w.cls === 'energy' ? 'sawtooth' : 'triangle' });
}
function bulletImpact(dir, t) { // dust, sparks and a hole where a round meets a wall
  const p = wallHitInfo.p, n = wallHitInfo.n; holes.add(p, n, 0.07 + Math.random() * 0.04);
  for (let i = 0; i < 4; i++) smoke.emit(p.x, p.y, p.z, n.x * (0.3 + Math.random()) + (Math.random() - 0.5) * 0.6, Math.random() * 0.8, n.z * (0.3 + Math.random()) + (Math.random() - 0.5) * 0.6, 0.6, 0.58, 0.55, 0.5 + Math.random() * 0.4, 1.5);
  if (Math.random() < 0.5) glow.burst(p, 3, 2.5, 1, 0.8, 0.4, 0.15, 6, 0.5);
}
function fireWeapon(h, it, w) {
  aimVectors(h);
  it.ammo--; h.rv += w.kick * 1.6; h.rpv += w.kick * 7; h.flashT = w.cls === 'energy' ? 0.04 : 0.06; h.slideT = 1; if (h.gun.userData.roles.pump.length) h.pumpT = 0.0001; h.drumA += Math.PI / 3;
  rumble(h, 0.35 + w.kick * 0.5, 30 + w.kick * 40); shotSound(w);
  if (w.cls !== 'energy') { flashLight.position.copy(muzzle).addScaledVector(aimDir, 0.15); flashLight.color.set(0xffc070); flashLight.intensity = 5; smoke.emit(muzzle.x, muzzle.y, muzzle.z, aimDir.x * 0.6, 0.3, aimDir.z * 0.6, 0.55, 0.55, 0.55, 0.6, -0.4); }
  else { _col.set(w.glow); glow.burst(muzzle, 5, 1.5, _col.r, _col.g, _col.b, 0.2, 0, 0); }
  if (w.kind === 'hitscan' && w.cls === 'ballistic' && !['revolver', 'sawed', 'nailer'].includes(w.id)) { // eject brass
    const [eu, ev] = h.gun.userData.ejectAt; _a.copy(aimPos).addScaledVector(aimDir, eu).addScaledVector(aimUp, ev); _b.copy(aimRight).multiplyScalar(1.2 + Math.random()).addScaledVector(aimUp, 1.5 + Math.random()).addScaledVector(aimDir, -0.4);
    const sh = w.pellets > 1; debris.spawn(_a, _b, sh ? 0.018 : 0.009, sh ? 0.05 : 0.022, sh ? 0.018 : 0.009, sh ? 0xb02a22 : 0xd6a640);
  }
  const dmg = dmgOf(it);
  if (w.kind === 'proj') return launch(w.proj, h, it, w);
  if (w.kind === 'chain') { // lightning: first target near the ray, then jump
    const wt = wallHit(muzzle, aimDir), hits = rayZombies(muzzle, aimDir, Math.min(w.range, wt), 0.35);
    if (!hits.length) { segs.bolt(muzzle, _a.copy(muzzle).addScaledVector(aimDir, Math.min(6, wt)), w.glow, 0.02, 0.12, 0.3); return; }
    let cur = hits[0].z, from = _c.copy(muzzle), d = dmg; const seen = new Set();
    for (let i = 0; i <= w.chain && cur; i++) {
      seen.add(cur); segs.bolt(from, cur.chestB, w.glow, 0.035, 0.16); segs.bolt(from, cur.chestB, 0xffffff, 0.012, 0.16, 0.1); glow.burst(cur.chestB, 6, 2, 0.5, 0.8, 1, 0.25, 0);
      const at = cur.chestB.clone(); hurtZombie(cur, d, { point: at, hand: h }); cur.slow = 1.2; d *= 0.85; from = at;
      let next = null, nd = 4.5; for (const z of zombies) { if (!alive(z) || seen.has(z)) continue; const q = z.chestB.distanceTo(at); if (q < nd) { nd = q; next = z; } } cur = next;
    }
    return;
  }
  for (let p = 0; p < w.pellets; p++) {
    const a = Math.random() * 6.283, r = Math.tan(w.spread) * Math.sqrt(Math.random());
    _a.copy(aimDir).addScaledVector(aimRight, Math.cos(a) * r).addScaledVector(aimUp, Math.sin(a) * r).normalize();
    if (p === 0 && rayDrops(muzzle, _a)) continue;
    const wt = wallHit(muzzle, _a), wp = wt < Infinity ? wallHitInfo.p.clone() : null, wn = wt < Infinity ? wallHitInfo.n.clone() : null;
    const hits = rayZombies(muzzle, _a, Math.min(w.range, wt)).slice(0, 1 + (w.pierce || 0));
    for (const hit of hits) { _b.copy(muzzle).addScaledVector(_a, hit.t); hurtZombie(hit.z, dmg * (hit.head ? 2.5 : 1), { head: hit.head, point: _b, dir: _a, hand: h }); if (w.pin) hit.z.slow = w.pin; }
    if (wp && (hits.length <= (w.pierce || 0)) && wt < w.range) { wallHitInfo.p.copy(wp); wallHitInfo.n.copy(wn); bulletImpact(_a, wt); }
    if (w.beam) { const end = Math.min(wt, 40); segs.seg(muzzle, _b.copy(muzzle).addScaledVector(_a, end), w.glow, 0.05, 0.3); segs.seg(muzzle, _b, 0xffffff, 0.015, 0.3); }
  }
}
function coneTick(h, it, w, dt, t) {
  aimVectors(h); it.ammo = Math.max(0, it.ammo - w.drain * dt); const cryo = w.cone === 'cryo';
  for (let i = 0; i < 3; i++) { _a.copy(aimDir).addScaledVector(aimRight, (Math.random() - 0.5) * 0.3).addScaledVector(aimUp, (Math.random() - 0.5) * 0.3); const s = 6 + Math.random() * 2; if (cryo) glow.emit(muzzle.x, muzzle.y, muzzle.z, _a.x * s, _a.y * s, _a.z * s, 0.55, 0.85, 1, 0.5 + Math.random() * 0.2, 0.5); else glow.emit(muzzle.x, muzzle.y, muzzle.z, _a.x * s, _a.y * s + 0.4, _a.z * s, 1, 0.5 + Math.random() * 0.35, 0.12, 0.45 + Math.random() * 0.2, -0.6); }
  const cos = Math.cos(w.spread), reach = Math.min(w.range, wallHit(muzzle, aimDir) + 0.6), dmg = dmgOf(it);
  for (const z of zombies) {
    if (!alive(z)) continue;
    _b.copy(z.chestB).sub(muzzle); const d = _b.length();
    if (d < reach && _b.dot(aimDir) / d > cos) {
      if (cryo) { if (z.frozen <= 0) { z.chill = Math.min(1, z.chill + dt * 1.4); if (z.chill >= 1) { z.frozen = 4.5; z.chill = 0; sfx.burst(0.12, { freq: 7000, gain: 0.3, type: 'highpass', pos: z.chestB }); award(POINTS.hit); } } hurtZombie(z, dmg * dt / 4, { silent: true, hand: h }); }
      else { z.burn = 3; hurtZombie(z, dmg * dt, { silent: true, hand: h }); if (Math.random() < dt * 2) award(POINTS.hit); }
    }
  }
  if (t > h.coneSnd) { h.coneSnd = t + 0.09; sfx.burst(0.14, { freq: cryo ? 5200 : 700, gain: 0.3, type: cryo ? 'highpass' : 'bandpass', q: 0.4 }); rumble(h, 0.25, 60); }
}
function beamTick(h, it, w, dt, t) {
  aimVectors(h); it.ammo = Math.max(0, it.ammo - w.drain * dt); h.ramp = Math.min(1, h.ramp + dt / 1.5);
  const wt = wallHit(muzzle, aimDir), hits = rayZombies(muzzle, aimDir, Math.min(w.range, wt)), end = hits.length ? hits[0].t : Math.min(wt, 25);
  _b.copy(muzzle).addScaledVector(aimDir, end); segs.seg(muzzle, _b, w.glow, 0.012 + h.ramp * 0.03, 0.05); segs.seg(muzzle, _b, 0xffffff, 0.006 + h.ramp * 0.008, 0.05);
  if (hits.length) { const hit = hits[0]; hurtZombie(hit.z, dmgOf(it) * (1 + h.ramp * 2.2) * (hit.head ? 1.6 : 1) * dt, { silent: true, head: hit.head, hand: h }); hit.z.flash = 0.5; glow.burst(_b, 2, 2, 1, 0.4, 0.85, 0.2, 2); if (Math.random() < dt * 4) award(POINTS.hit); }
  else if (wt < 25 && Math.random() < dt * 20) glow.burst(_b, 2, 1.5, 1, 0.5, 0.9, 0.2, 3);
  if (t > h.coneSnd) { h.coneSnd = t + 0.07; sfx.tone(700 + h.ramp * 900, 0.09, { gain: 0.16, type: 'sawtooth' }); rumble(h, 0.2 + h.ramp * 0.3, 50); }
}
function startReload(h, it, w) {
  if (h.reloadT > 0 || w.kind === 'melee' || it.ammo >= magOf(it)) return;
  if (it.reserve <= 0) { sfx.tone(180, 0.08, { gain: 0.25, type: 'square' }); return; }
  h.reloadLen = h.reloadT = w.reload * (G.perks.hands ? 0.5 : 1); h.magDropped = false; h.racked = false; h.inserted = false;
  sfx.tone(420, 0.04, { gain: 0.2, type: 'square' }); sfx.burst(0.05, { freq: 2500, gain: 0.25 }); rumble(h, 0.4, 40);
}
function animateGun(h, it, w, dt, t) {
  const gun = h.gun, roles = gun.userData.roles;
  // recoil spring
  h.rv += (-h.rz * 260 - h.rv * 22) * dt; h.rz += h.rv * dt; h.rpv += (-h.rp * 220 - h.rpv * 20) * dt; h.rp += h.rpv * dt;
  let roll = 0, tilt = 0, magY = 0, magVisible = true, rack = 0;
  if (h.reloadT > 0) { // 0-0.25 drop the mag, 0.4-0.65 seat a new one, 0.78-0.95 rack
    const u = 1 - h.reloadT / h.reloadLen, ease = (x) => clamp(x, 0, 1);
    const inOut = Math.min(ease(u / 0.15), ease((1 - u) / 0.12)); roll = 0.75 * inOut; tilt = 0.35 * inOut;
    if (u < 0.25) { magY = -0.12 * ease(u / 0.2); if (u > 0.12 && !h.magDropped) { h.magDropped = true; aimVectors(h); if (roles.mag.length) debris.spawn(_a.copy(aimPos).addScaledVector(aimUp, -0.08).addScaledVector(aimDir, 0.05), _b.set((Math.random() - 0.5) * 0.4, -0.5, (Math.random() - 0.5) * 0.4), 0.028, 0.1, 0.022, w.cls === 'energy' ? 0x3b4e66 : 0x2a2c30); sfx.burst(0.04, { freq: 1800, gain: 0.3 }); } }
    else if (u < 0.4) magVisible = false;
    else if (u < 0.65) { magY = -0.14 * (1 - ease((u - 0.4) / 0.22)); if (u > 0.6 && !h.inserted) { h.inserted = true; sfx.tone(300, 0.04, { gain: 0.3, type: 'square' }); sfx.burst(0.05, { freq: 1200, gain: 0.35 }); rumble(h, 0.6, 40); } }
    if (u > 0.78 && u < 0.95) { rack = Math.sin(((u - 0.78) / 0.17) * Math.PI); if (!h.racked) { h.racked = true; sfx.burst(0.06, { freq: 3200, gain: 0.35 }); sfx.tone(900, 0.03, { gain: 0.2, when: 0.07 }); rumble(h, 0.5, 30); } }
    if (w.cls === 'energy' && Math.random() < dt * 20) { aimVectors(h); smoke.emit(aimPos.x, aimPos.y + 0.05, aimPos.z, (Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3, 0.8, 0.9, 1, 0.5, -0.5); }
  }
  gun.position.set(0, h.rp * 0.004, h.rz * 0.05); gun.rotation.set(h.rp * 0.02 + tilt, 0, roll * (h.ctrl && h.ctrl.handedness === 'left' ? -1 : 1));
  h.slideT = Math.max(0, h.slideT - dt * 14); const locked = w.kind === 'hitscan' && it.ammo <= 0 && h.reloadT <= 0 ? 1 : 0;
  for (const m of roles.slide) m.position.z = m.userData.home.z + Math.max(h.slideT, rack, locked) * 0.035;
  if (h.pumpT > 0) { h.pumpT += dt / 0.4; const k = Math.sin(clamp((h.pumpT - 0.25) / 0.75, 0, 1) * Math.PI); for (const m of roles.pump) m.position.z = m.userData.home.z + k * 0.075; if (h.pumpT > 0.6 && !h.pumped) { h.pumped = true; sfx.burst(0.05, { freq: 1400, gain: 0.3 }); sfx.burst(0.05, { freq: 1700, gain: 0.3, when: 0.12 }); } if (h.pumpT >= 1) { h.pumpT = 0; h.pumped = false; } }
  for (const m of roles.pump) if (rack) m.position.z = m.userData.home.z + rack * 0.075;
  for (const m of roles.mag) { m.position.y = m.userData.home.y + magY; m.visible = magVisible; }
  for (const m of roles.drum) m.rotation.z += (h.drumA - m.rotation.z) * Math.min(1, dt * 18);
  if (roles.spin) roles.spin.rotation.z += dt * 40 * (w.spin ? h.spin / w.spin : 0);
  for (const m of roles.disc) { m.rotation.y += dt * 12; m.visible = it.ammo > 0 && h.reloadT <= 0; }
  const gm = gun.userData.glowMat, base = it.tier === 2 ? 0xff5ad1 : it.tier === 1 ? 0xffb347 : (w.glow || 0xffffff); gm.color.set(base).multiplyScalar(h.reloadT > 0 ? 0.25 : 0.75 + 0.25 * Math.sin(t * 6) + h.ramp * 0.6 + h.slideT * 0.5);
  h.flashT -= dt; h.flash.visible = h.flashT > 0 && w.cls !== 'energy' && w.kind !== 'melee'; if (h.flash.visible) { h.flash.scale.setScalar(0.6 + Math.random() * 0.9 + w.kick * 0.4); h.flash.rotation.z = Math.random() * 6.283; }
}
function updateHand(h, dt, t) {
  const playing = (G.state === 'wave' || G.state === 'intermission') && !G.paused;
  const it = G.inv[h.slot]; if (!it || !h.gun) return;
  if (h.cycle && h.reloadT <= 0 && playing) cycleWeapon(h, h.cycle);
  const it2 = G.inv[h.slot], w = WEAPONS[it2.wi]; h.cool -= dt;
  h.dot.visible = false;
  if (playing) {
    if (w.kind === 'melee') {
      aimVectors(h); h.tip.copy(muzzle);
      if (h.tipOk) {
        const speed = h.tip.distanceTo(h.tipPrev) / Math.max(dt, 1e-3);
        if (speed > 1.6) {
          _a.copy(aimPos).addScaledVector(aimDir, h.gun.userData.bladeFrom);
          for (const z of zombies) {
            if (!alive(z) || z.meleeCd > 0) continue;
            const hd = pointSegDist(_a, h.tip, z.head); let bd = Infinity; for (let i = 0; i <= 4; i++) { _c.copy(_a).lerp(h.tip, i / 4); bd = Math.min(bd, pointSegDist(z.chestA, z.chestB, _c)); }
            const s = z.scale, head = !z.headless && hd < 0.2 * s, body = bd < 0.28 * s * z.type.wide;
            if (head || body) { z.meleeCd = 0.35; hurtZombie(z, dmgOf(it2) * (head ? 2 : 1) * clamp(speed / 3, 0.6, 1.6), { head, point: head ? z.head : h.tip, hand: h, melee: true }); rumble(h, 1, 60); sfx.burst(0.08, { freq: w.snd.f, gain: 0.5 }); if (w.glow) glow.burst(h.tip, 8, 2, 0.4, 0.9, 1, 0.25, 0); }
          }
          for (const d of drops) if (d.life > 0 && pointSegDist(_a, h.tip, d.p.mesh.position) < 0.25) collectDrop(d);
        }
      }
      h.tipPrev.copy(h.tip); h.tipOk = true;
    } else {
      if (h.reloadT > 0) { h.reloadT -= dt; if (h.reloadT <= 0) { const need = magOf(it2) - it2.ammo, take = Math.min(need, it2.reserve); it2.ammo += take; if (it2.reserve !== Infinity) it2.reserve -= take; } }
      else if (h.reloadDown) startReload(h, it2, w);
      else if (it2.ammo <= 0) { if (h.trigDown) { sfx.tone(1400, 0.02, { gain: 0.2, type: 'square' }); startReload(h, it2, w); } h.ramp = 0; }
      else if (w.kind === 'cone') { if (h.trig) coneTick(h, it2, w, dt, t); }
      else if (w.kind === 'beam') { if (h.trig) beamTick(h, it2, w, dt, t); else h.ramp = Math.max(0, h.ramp - dt * 2); }
      else {
        if (w.spin) { h.spin = clamp(h.spin + (h.trig ? dt : -dt * 2), 0, w.spin); if (h.trig && h.spin < w.spin && t > h.coneSnd) { h.coneSnd = t + 0.06; sfx.tone(200 + (h.spin / w.spin) * 500, 0.06, { gain: 0.1, type: 'sawtooth' }); } }
        const want = w.auto ? h.trig && (!w.spin || h.spin >= w.spin) : h.trigDown;
        if (want && h.cool <= 0) { fireWeapon(h, it2, w); h.cool = 60 / (w.rpm * (G.perks.overdrive ? 1.33 : 1)); }
      }
      if (opt.dot) { // red dot on whatever the barrel is pointing at
        aimVectors(h); const wt = wallHit(muzzle, aimDir), hz = rayZombies(muzzle, aimDir, Math.min(wt, 30)), d = hz.length ? hz[0].t : Math.min(wt, 30);
        if (d < 30) { h.dot.position.copy(muzzle).addScaledVector(aimDir, d - 0.02); h.dot.scale.setScalar(0.004 + d * 0.0022); h.dot.visible = true; }
      }
    }
    // wall stations + barricade repair on the grip button
    h.aim.getWorldPosition(_a); h.aim.getWorldDirection(_b).negate(); let target = null, bd = 0.3;
    for (const st of R.stations) { _c.copy(st.pos).sub(_a); const tca = _c.dot(_b); if (tca < 0.15 || tca > 6) continue; const off = Math.sqrt(Math.max(0, _c.lengthSq() - tca * tca)); if (off < bd) { bd = off; target = st; } }
    h.target = target; if (target) target.hot = 0.25;
    const near = R.openings.find((op) => Math.hypot(op.pos.x - _a.x, op.pos.z - _a.z) < 1.2 && op.planks.some((p) => p.hp < PLANK_HP));
    if (h.squeezeDown && target) interact(target, h);
    else if (h.squeeze && near && !target) {
      if ((h.repairT -= dt) <= 0) { const p = near.planks.find((q) => q.hp <= 0) || near.planks.find((q) => q.hp < PLANK_HP); if (p) { repairPlank(p); h.repairT = 0.6; rumble(h, 0.8, 50); sfx.tone(220, 0.05, { gain: 0.5, type: 'square' }); sfx.burst(0.04, { freq: 2200, gain: 0.3 }); if (G.plankPts < 60) { G.plankPts += POINTS.plank; award(POINTS.plank, _c.copy(p.mesh.position).applyMatrix4(near.group.matrix)); } } }
    } else h.repairT = 0;
  }
  animateGun(h, it2, w, dt, t); drawHud(h);
}

// ---- buying
function interact(st, h) {
  const o = stationOffer(st, h);
  const deny = (msg) => { sfx.tone(160, 0.12, { gain: 0.3, type: 'square' }); prompt.flash = G.t + 1.2; prompt.msg = msg; };
  if (o.price < 0) return deny(o.label);
  if (G.points < o.price) return deny(`Need ${o.price} points`);
  G.points -= o.price; sfx.tone(880, 0.06, { gain: 0.3 }); sfx.tone(1320, 0.12, { gain: 0.3, when: 0.07 }); rumble(h, 0.7, 80);
  if (st.kind === 'w') giveWeapon(st.wi, h);
  if (st.kind === 'perk') { G.perks[st.id] = true; if (st.id === 'iron') { G.maxHp = 220; G.hp = 220; } say(PERKS[st.id].name.toUpperCase(), PERKS[st.id].note, 2.5, '#' + PERKS[st.id].color.toString(16).padStart(6, '0')); }
  if (st.kind === 'bench') { const it = G.inv[h.slot]; it.tier++; it.ammo = magOf(it); it.reserve = reserveMax(it); equip(h, h.slot); glow.burst(st.pos, 40, 3, 0.7, 0.5, 1, 0.7, 0, 0.5); say('OVERCLOCKED', `${WEAPONS[it.wi].name} — tier ${it.tier}`, 2.5, '#9a7bff'); sfx.tone(220, 0.6, { slideTo: 1760, gain: 0.4, type: 'sawtooth' }); }
  if (st.kind === 'crate') { st.busy = 2.4; st.hand = h; st.rollT = 0; const pool = WEAPONS.map((w, i) => i).filter((i) => WEAPONS[i].crate && !G.inv.some((q) => q.wi === i)); st.result = pick(pool.length ? pool : [WI.ar]); }
  R.stations.forEach((s) => { s.key = ''; drawStation(s); }); hands.forEach((x) => { x.hudKey = ''; });
}
const prompt = makePanel(0.7, 0.12, 700, { depthTest: false }); prompt.mesh.renderOrder = 45; prompt.mesh.visible = false; scene.add(prompt.mesh); prompt.key = ''; prompt.flash = 0; prompt.msg = '';
function updateStations(dt, t) {
  let shown = null, sh = null;
  for (const st of R.stations) {
    const was = st.hot > 0; st.hot -= dt; if ((st.hot > 0) !== was || st.hot > 0) drawStation(st);
    if (st.hot > 0 && !shown) { shown = st; sh = hands.find((h) => h.target === st) || null; }
    if (st.show) st.show.rotation.y = Math.sin(t * 0.8 + st.pos.x) * 0.12;
    if (st.busy > 0) { // crate roll: flick through guns, then hand one over
      st.busy -= dt; st.rollT -= dt;
      if (st.rollT <= 0) { st.rollT = 0.12; st.slot.clear(); const pool = WEAPONS.map((w, i) => i).filter((i) => WEAPONS[i].crate); const g = displayGun(st.busy <= 0.5 ? st.result : pick(pool)).clone(); st.slot.add(g); sfx.tone(500 + Math.random() * 600, 0.04, { gain: 0.15, pos: st.pos }); }
      st.slot.position.y = 0.2 + (1 - st.busy / 2.4) * 0.08;
      if (st.busy <= 0) { st.slot.clear(); const w = WEAPONS[st.result]; giveWeapon(st.result, st.hand); say(w.name.toUpperCase(), w.note, 3, '#ff5ad1'); sfx.tone(523, 0.1, { gain: 0.35 }); sfx.tone(784, 0.1, { gain: 0.35, when: 0.1 }); sfx.tone(1046, 0.3, { gain: 0.35, when: 0.2 }); R.stations.forEach((s) => { s.key = ''; drawStation(s); }); }
    }
  }
  if (shown && G.state !== 'over') {
    const o = stationOffer(shown, sh), text = G.t < prompt.flash ? prompt.msg : o.price < 0 ? o.label : `${G.desktop ? 'F' : 'GRIP'} — ${o.label}  (${o.price})`, key = text + (G.points >= o.price);
    if (key !== prompt.key) { prompt.key = key; const c = prompt.ctx; c.clearRect(0, 0, prompt.w, prompt.h); c.fillStyle = 'rgba(8,9,11,0.85)'; roundRect(c, 0, 0, prompt.w, prompt.h, 18); c.fill(); c.fillStyle = G.t < prompt.flash ? '#ff6a5a' : o.price >= 0 && G.points < o.price ? '#ff9a8a' : '#ffffff'; c.font = '700 34px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, prompt.w / 2, prompt.h / 2, prompt.w - 24); prompt.dirty(); }
    prompt.mesh.position.copy(shown.pos).addScaledVector(shown.n, 0.12); prompt.mesh.position.y += 0.31; prompt.mesh.lookAt(headPos.x, prompt.mesh.position.y, headPos.z); prompt.mesh.visible = true;
  } else prompt.mesh.visible = false;
}

// =====================================================================================
// Banner, rounds, menu
// =====================================================================================
const banner = makePanel(1.7, 0.6, 600, { depthTest: false }); banner.mesh.renderOrder = 60; banner.mesh.visible = false; scene.add(banner.mesh);
let bannerUntil = 0; const _say = V();
function say(title, sub = '', secs = 3, color = '#ffffff') {
  const c = banner.ctx, W = banner.w, H = banner.h; c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(8,8,10,0.7)'; roundRect(c, 0, 0, W, H, 26); c.fill(); c.fillStyle = '#b3392c'; c.fillRect(40, 0, W - 80, 6);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.font = '900 120px system-ui,sans-serif'; c.fillText(title, W / 2, sub ? H * 0.38 : H / 2, W - 60);
  if (sub) { c.fillStyle = '#d5dbe2'; c.font = '500 44px system-ui,sans-serif'; c.fillText(sub, W / 2, H * 0.76, W - 60); }
  banner.dirty();
  _say.copy(headDir).setY(0); if (_say.lengthSq() < 0.01) _say.set(0, 0, -1); _say.normalize();
  banner.mesh.position.copy(headPos).addScaledVector(_say, 1.9); banner.mesh.position.y = headPos.y + 0.32; banner.mesh.lookAt(headPos.x, headPos.y + 0.32, headPos.z);
  banner.mesh.visible = true; bannerUntil = secs > 0 ? G.t + secs : Infinity;
}
function clearField() {
  for (const z of zombies) { if (z.state !== 'dead') { z.state = 'dead'; horde.hide(z.i); } } horde.commit(); aliveCount = 0;
  projs.forEach((p) => { p.life = 0; p.hole = 0; p.g.visible = false; }); drops.forEach((d) => { d.life = 0; d.p.mesh.visible = false; }); prompt.mesh.visible = false; banner.mesh.visible = false;
}
function newGame() {
  clearField(); Object.assign(G, { round: 0, hp: 100, maxHp: 100, points: POINTS.start, earned: 0, kills: 0, heads: 0, lastHurt: -99, inv: [], perks: {}, insta: 0, double: 0, paused: false });
  projs.forEach((p) => { p.life = 0; p.hole = 0; p.g.visible = false; }); drops.forEach((d) => { d.life = 0; d.p.mesh.visible = false; }); splats.clear(); holes.clear();
  G.inv.push({ wi: WI.pistol, tier: 0, ammo: WEAPONS[WI.pistol].mag, reserve: Infinity }, { wi: WI.machete, tier: 0, ammo: 0, reserve: 0 });
  const right = hands.find((h) => h.ctrl && h.ctrl.handedness === 'right') || hands[hands.length - 1], left = hands.find((h) => h !== right);
  if (right) equip(right, 0); if (left) equip(left, 1);
  R.stations.forEach((s) => { s.key = ''; s.busy = 0; if (s.slot) s.slot.clear(); drawStation(s); });
  repairAll(); menu.hide(); nextRound();
}
function nextRound() {
  G.round++; G.spec = roundSpec(G.round, DIFFICULTY[opt.difficulty]); G.toSpawn = G.spec.count; G.spawnT = 0; G.state = 'intermission'; G.timer = G.round === 1 ? 6 : 9; G.drops = 0; G.plankPts = 0;
  say(`ROUND ${G.round}`, G.round === 1 ? `Watch the ${R.openings.length} boarded openings` : `${G.spec.count} incoming — spend your points`, 4.5, '#ff5a4a');
  sfx.tone(196, 0.5, { gain: 0.35, type: 'sawtooth' }); sfx.tone(147, 0.9, { gain: 0.35, type: 'sawtooth', when: 0.45 });
}
function gameOver() {
  G.state = 'over'; G.timer = 1.2;
  if (G.round > G.best) { G.best = G.round; try { localStorage.setItem('breach-night-best-round', String(G.best)); } catch { /* storage unavailable */ } }
  sfx.tone(110, 1.4, { slideTo: 40, gain: 0.6, type: 'sawtooth' }); banner.mesh.visible = false; prompt.mesh.visible = false; menu.show('over');
}
let groanT = 0;
function updateGame(dt, t) {
  if (G.state === 'intermission') { if ((G.timer -= dt) <= 0) G.state = 'wave'; }
  if (G.state === 'wave') {
    if (G.toSpawn > 0 && (G.spawnT -= dt) <= 0 && aliveCount < G.spec.maxAlive && R.openings.length) {
      const op = pick(R.openings);
      if (spawnZombie(pickType(G.spec.weights), op, G.spec.hpMul)) { G.toSpawn--; G.spawnT = G.spec.interval * (0.6 + Math.random() * 0.8); }
    }
    if (G.toSpawn <= 0 && aliveCount <= 0) nextRound();
    if (t > groanT && aliveCount > 0) {
      groanT = t + 0.8 + Math.random() * 1.8; const z = pick(zombies.filter(alive));
      if (z) { const f = 60 + Math.random() * 50; sfx.tone(f, 0.7, { slideTo: f * 0.75, gain: 0.3, type: 'sawtooth', pos: z.head }); sfx.burst(0.6, { freq: 380, q: 3, type: 'bandpass', gain: 0.25, pos: z.head }); }
    }
  }
  if (G.state === 'wave' || G.state === 'intermission') { if (G.t - G.lastHurt > 5 && G.hp < G.maxHp) G.hp = Math.min(G.maxHp, G.hp + G.maxHp * 0.12 * dt); }
  vignette.material.opacity = Math.max(G.hp < G.maxHp * 0.3 && G.state !== 'over' && G.state !== 'menu' ? 0.25 + 0.1 * Math.sin(t * 6) : 0, vignette.material.opacity - dt * 1.6);
  if (banner.mesh.visible && G.t > bannerUntil) banner.mesh.visible = false;
}

// ---- in-headset menu + tutorial
const menu = (() => {
  const ui = new UIPanel(1.3, 0.86, 1000); ui.mesh.visible = false; ui.mesh.renderOrder = 70; ui.p.mesh.material.depthTest = false; scene.add(ui.mesh);
  Object.assign(ui.theme, { bg: 'rgba(14,10,10,0.94)', btn: '#3a2320', btnOn: '#b3392c', btnHover: '#5a322c' });
  let page = 'main';
  const W = 1300, H = 860, btn = (x, y, w, label, onClick, on, font = 30) => ({ x, y, w, h: 74, label, onClick, on, font });
  const txt = (c, s, x, y, font, color = '#eef2f5', align = 'left', maxW) => { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y, maxW); };
  // one stylised Touch controller with numbered callouts
  function pad(c, cx, cy, left) {
    const s = left ? -1 : 1;
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#3a3d45'; c.strokeStyle = '#6a6f78'; c.lineWidth = 4;
    roundRect(c, s * 40 - 38, -150, 76, 70, 22); c.fill(); c.stroke();                             // trigger (front edge)
    c.fillStyle = '#2b2d33'; c.beginPath(); c.ellipse(0, 0, 120, 105, 0, 0, 7); c.fill(); c.stroke(); // face
    roundRect(c, -52 - s * 18, 60, 104, 210, 46); c.fill(); c.stroke();                            // handle
    c.fillStyle = '#3a3d45'; roundRect(c, s * 62 - 22, 150, 44, 90, 14); c.fill(); c.stroke();     // grip (outer side)
    c.fillStyle = '#15161a'; c.beginPath(); c.arc(-s * 38, -18, 36, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#4a4e57'; c.beginPath(); c.arc(-s * 38, -18, 20, 0, 7); c.fill(); // stick
    for (const [bx, by, name] of [[s * 44, 26, left ? 'X' : 'A'], [s * 70, -34, left ? 'Y' : 'B']]) { c.fillStyle = '#15161a'; c.beginPath(); c.arc(bx, by, 22, 0, 7); c.fill(); c.stroke(); txt(c, name, bx, by + 1, '800 24px system-ui,sans-serif', '#eef2f5', 'center'); }
    c.restore();
  }
  function callout(c, x0, y0, x1, y1, title, body, align) {
    c.strokeStyle = '#ff7a66'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.fillStyle = '#ff7a66'; c.beginPath(); c.arc(x0, y0, 6, 0, 7); c.fill();
    const tx = x1 + (align === 'left' ? 12 : align === 'right' ? -12 : 0), ty = align === 'center' ? y1 + 24 : y1; txt(c, title, tx, ty - 15, '800 30px system-ui,sans-serif', '#ffffff', align, 290); txt(c, body, tx, ty + 17, '500 25px system-ui,sans-serif', '#c9d0d8', align, 290);
  }
  ui.draw = (c) => {
    if (page === 'main' || page === 'pause' || page === 'over') {
      txt(c, page === 'over' ? 'OVERRUN' : 'BREACH NIGHT', W / 2, 96, '900 96px system-ui,sans-serif', '#ff5a4a', 'center');
      if (page === 'over') {
        txt(c, `You reached round ${G.round}`, W / 2, 200, '700 46px system-ui,sans-serif', '#fff', 'center');
        txt(c, `${G.kills} kills · ${G.heads} headshots · ${G.earned} points earned · best round ${G.best}`, W / 2, 262, '500 30px system-ui,sans-serif', '#c9d0d8', 'center', W - 80);
      } else {
        txt(c, page === 'pause' ? 'Paused' : 'Hold your room. Spend your points.', W / 2, 190, '600 36px system-ui,sans-serif', '#eef2f5', 'center');
        txt(c, R.info, W / 2, 246, '500 26px system-ui,sans-serif', R.real ? '#8fd6a0' : '#ffd166', 'center', W - 80);
      }
      txt(c, 'Point at a button and pull the trigger', W / 2, H - 36, '500 24px system-ui,sans-serif', '#8d949c', 'center');
    } else if (page === 'controls') {
      txt(c, 'CONTROLS', W / 2, 52, '900 52px system-ui,sans-serif', '#ff5a4a', 'center');
      pad(c, 470, 340, true); pad(c, 830, 340, false);
      txt(c, 'LEFT', 452, 640, '800 26px system-ui,sans-serif', '#8d949c', 'center'); txt(c, 'RIGHT', 848, 640, '800 26px system-ui,sans-serif', '#8d949c', 'center');
      callout(c, 870, 215, 990, 150, 'TRIGGER', 'Fire · select in menus', 'left');
      callout(c, 900, 306, 990, 268, 'B', 'Next weapon', 'left');
      callout(c, 874, 366, 990, 386, 'A', 'Reload', 'left');
      callout(c, 892, 535, 990, 504, 'GRIP', 'Buy what you point at', 'left'); txt(c, 'Hold by boards to repair', 1002, 552, '500 25px system-ui,sans-serif', '#c9d0d8', 'left', 290);
      callout(c, 430, 215, 310, 150, 'TRIGGER', 'Fire · select in menus', 'right');
      callout(c, 400, 306, 310, 268, 'Y', 'Next weapon', 'right');
      callout(c, 426, 366, 310, 386, 'X', 'Reload', 'right');
      callout(c, 408, 535, 310, 504, 'GRIP', 'Buy · repair', 'right');
      c.strokeStyle = '#ff7a66'; c.lineWidth = 3; c.beginPath(); c.moveTo(508, 322); c.lineTo(650, 110); c.lineTo(792, 322); c.stroke();
      txt(c, 'THUMBSTICK', 650, 126, '800 30px system-ui,sans-serif', '#ffffff', 'center'); txt(c, 'Flick ← → : switch weapon', 650, 160, '500 25px system-ui,sans-serif', '#c9d0d8', 'center'); txt(c, 'Click : pause menu', 650, 192, '500 25px system-ui,sans-serif', '#c9d0d8', 'center');
      txt(c, 'Each hand holds its own weapon. Blades need a real swing, not a trigger pull.', W / 2, 700, '500 27px system-ui,sans-serif', '#c9d0d8', 'center', W - 80);
    } else if (page === 'howto') {
      txt(c, 'HOW IT WORKS', W / 2, 60, '900 56px system-ui,sans-serif', '#ff5a4a', 'center');
      const rows = [
        ['Entries', 'Zombies only come through your real doors and windows. They must smash the boards first.'],
        ['Points', '+10 a hit, +60 a kill, +100 a headshot, +130 with a blade. Repairs pay +10 a board.'],
        ['Wall buys', 'Guns hang on your walls. Point at one and squeeze GRIP to buy it — again later for ammo.'],
        ['Mystery Crate', '950 points for a random weapon, including the sci-fi ones you cannot buy anywhere else.'],
        ['Overclock', 'Point with a gun and pay 5,000 (then 10,000) for double, then triple damage and a bigger magazine.'],
        ['Perks', 'Iron Skin, Quick Hands, Overdrive, Second Wind, Deep Pockets. They last until you go down.'],
        ['Drops', 'Glowing pickups: Max Ammo, Insta-Kill, Double Points, Nuke, Carpenter. Walk into them or shoot them.'],
        ['Bag', 'Three guns plus one blade. Buying a fourth swaps out the gun in that hand.'],
      ];
      rows.forEach(([a, b], i) => { const y = 136 + i * 72; txt(c, a, 60, y, '800 28px system-ui,sans-serif', '#ffcf4a'); txt(c, b, 300, y, '500 25px system-ui,sans-serif', '#e3e7ec', 'left', W - 350); });
    }
  };
  function build() {
    const B = [], cx = W / 2 - 300;
    if (page === 'main') {
      B.push(btn(cx, 300, 600, 'START', () => newGame(), () => true, 40));
      B.push(btn(cx, 392, 600, 'TUTORIAL — CONTROLS', () => go('controls')));
      B.push(btn(cx, 484, 290, () => `Difficulty: ${opt.difficulty}`, () => { const k = Object.keys(DIFFICULTY); opt.difficulty = k[(k.indexOf(opt.difficulty) + 1) % k.length]; }, null, 26));
      B.push(btn(cx + 310, 484, 290, () => `Aim dot: ${opt.dot ? 'on' : 'off'}`, () => { opt.dot = !opt.dot; }, null, 26));
      B.push(btn(cx, 576, 600, 'RESCAN ROOM', () => rescan(), null, 26));
    } else if (page === 'pause') {
      B.push(btn(cx, 300, 600, 'RESUME', () => { G.paused = false; hide(); }, () => true, 40));
      B.push(btn(cx, 392, 600, 'TUTORIAL — CONTROLS', () => go('controls')));
      B.push(btn(cx, 484, 600, () => `Aim dot: ${opt.dot ? 'on' : 'off'}`, () => { opt.dot = !opt.dot; }, null, 26));
      B.push(btn(cx, 576, 600, 'QUIT TO MENU', () => { G.paused = false; G.state = 'menu'; clearField(); go('main'); }, null, 26));
    } else if (page === 'over') {
      B.push(btn(cx, 340, 600, 'PLAY AGAIN', () => newGame(), () => true, 40));
      B.push(btn(cx, 432, 600, 'MAIN MENU', () => { G.state = 'menu'; clearField(); go('main'); }));
    } else {
      B.push(btn(60, H - 100, 260, '← BACK', () => go(G.paused ? 'pause' : 'main'), null, 26));
      B.push(btn(W - 420, H - 100, 360, page === 'controls' ? 'HOW IT WORKS →' : '← CONTROLS', () => go(page === 'controls' ? 'howto' : 'controls'), null, 26));
    }
    ui.buttons = B; ui.redraw();
  }
  function place() { _say.copy(headDir).setY(0); if (_say.lengthSq() < 0.01) _say.set(0, 0, -1); _say.normalize(); ui.mesh.position.copy(headPos).addScaledVector(_say, 1.5); ui.mesh.position.y = Math.max(1.0, headPos.y - 0.05); ui.mesh.lookAt(headPos.x, ui.mesh.position.y, headPos.z); }
  function go(p) { page = p; build(); ui.mesh.visible = true; }
  function show(p) { place(); go(p); }
  function hide() { ui.mesh.visible = false; hands.forEach((h) => { h.laser.visible = false; }); }
  return { ui, show, hide, go, build, get visible() { return ui.mesh.visible; }, get page() { return page; } };
})();
function updateMenu() {
  if (!menu.visible) return;
  if (G.desktop) { camera.getWorldDirection(_b); if (menu.ui.pointAt(headPos, _b) > 0 && hands[0] && hands[0].trigDown) { if (menu.ui.click()) sfx.tone(700, 0.03, { gain: 0.15 }); } return; }
  let any = false;
  for (const h of hands) {
    h.laser.visible = false; if (!h.ctrl.connected || any) continue;
    h.aim.getWorldPosition(_a); h.aim.getWorldDirection(_b).negate(); const d = menu.ui.pointAt(_a, _b);
    if (d > 0) { any = true; h.laser.visible = true; h.laser.scale.z = d; if (h.trigDown) { sfx.resume(); if (menu.ui.click()) sfx.tone(700, 0.03, { gain: 0.15 }); } }
  }
}

// =====================================================================================
// Room scan
// =====================================================================================
let scan = null;
function readPlanes(frame) {
  const out = [], ref = renderer.xr.getReferenceSpace(); if (!frame || !frame.detectedPlanes || !ref) return out;
  frame.detectedPlanes.forEach((plane) => { const pose = frame.getPose(plane.planeSpace, ref); if (pose) out.push({ label: plane.semanticLabel || '', m: pose.transform.matrix, poly: plane.polygon }); });
  return out;
}
function applyScan(planes) {
  const r = parseRoom(planes, headPos); let walls = r.walls, openings = r.openings, info; R.found = r.found; R.planes = planes.length;
  if (walls.length < 2) { walls = fallbackRoom(headPos.x, headPos.z); openings = virtualOpenings(walls); R.real = false; info = planes.length ? `Room scan has ${planes.length} surfaces but no walls — using a stand-in room. Try RESCAN ROOM.` : 'No room scan found — using a stand-in room around you. Try RESCAN ROOM.'; }
  else if (!openings.length) { openings = virtualOpenings(walls); R.real = false; info = `Room scan: ${r.found.wall} walls, but no doors or windows marked — add them in Space Setup. Using boarded stand-ins.`; }
  else { R.real = true; const d = openings.filter((o) => o.kind === 'door').length, w = openings.length - d; info = `Room scan OK: ${r.found.wall} walls · ${d} door${d === 1 ? '' : 's'} · ${w} window${w === 1 ? '' : 's'} — zombies will use those`; }
  buildRoom(walls, openings, info);
}
function updateScan(frame, dt) {
  scan.t += dt; if (scan.wait) { if (scan.t > 120) { scan.wait = false; scan.t = 0; } return; }
  const planes = readPlanes(frame);
  if (planes.length && scan.t > 1.2) { const quick = parseRoom(planes, headPos); if (quick.walls.length >= 2 || scan.t > 3) return finishScan(planes); }
  if (scan.t > 2.5 && !planes.length && !scan.asked && scan.session.initiateRoomCapture) {
    scan.asked = true; scan.wait = true; say('ROOM SETUP', 'Scan your room when the headset asks, then come back', 0);
    scan.session.initiateRoomCapture().catch(() => {}).finally(() => { if (scan) { scan.t = 0; scan.wait = false; } });
  }
  if (!scan.wait && scan.t > 4.5) finishScan(planes);
}
function finishScan(planes) { scan = null; applyScan(planes); banner.mesh.visible = false; G.state = 'menu'; menu.show('main'); }
function rescan() {
  const session = renderer.xr.getSession(); if (!session) { applyScan([]); menu.build(); return; }
  menu.hide(); G.state = 'scan'; scan = { t: 0, asked: false, wait: false, session }; say('SCANNING', 'Looking for your walls, doors and windows…', 0);
  if (session.initiateRoomCapture) { scan.asked = true; scan.wait = true; session.initiateRoomCapture().catch(() => {}).finally(() => { if (scan) { scan.t = 0; scan.wait = false; } }); }
}

// =====================================================================================
// Main loop
// =====================================================================================
const look = { yaw: 0, pitch: 0 }, keys = {}; let mouseDown = false, wheel = 0;
function converge(h) { // desktop only: point the barrel at whatever the screen centre is on
  camera.updateMatrixWorld(); camera.getWorldDirection(_a); _b.setFromMatrixPosition(camera.matrixWorld);
  const hits = rayZombies(_b, _a, 60), dist = hits.length ? hits[0].t : Math.min(12, wallHit(_b, _a));
  h.aim.lookAt(_b.addScaledVector(_a, Math.max(1.5, dist))); h.aim.rotateY(Math.PI);
}
function readInput() {
  if (G.desktop) {
    const h = hands[0]; if (!h) return;
    if (opt.bot && !menu.visible) {
      let best = null, bd = Infinity; for (const z of zombies) { if (!alive(z) || z.depth > 5) continue; const d = z.head.distanceTo(headPos); if (d < bd) { bd = d; best = z; } }
      if (best) camera.lookAt(best.chestB); converge(h);
      const w = h.gun && WEAPONS[G.inv[h.slot].wi], trig = !!best; h.trigDown = trig && (!h.trig || !(w && w.auto)); h.trig = trig; h.cycle = 0; h.reloadDown = false; h.squeeze = h.squeezeDown = false; h.stickDown = false;
      return;
    }
    camera.rotation.set(look.pitch, look.yaw, 0); converge(h);
    h.trigDown = mouseDown && !h.trig; h.trig = mouseDown; const sq = !!keys.KeyF; h.squeezeDown = sq && !h.squeeze; h.squeeze = sq; h.reloadDown = !!keys.KeyR; keys.KeyR = false;
    h.cycle = wheel || (keys.KeyE ? 1 : keys.KeyQ ? -1 : 0); wheel = 0; keys.KeyE = keys.KeyQ = false; h.stickDown = !!keys.Escape || !!keys.KeyP; keys.Escape = keys.KeyP = false;
    return;
  }
  controllers.update();
  hands.forEach((h) => {
    const c = h.ctrl, gp = c.gamepad, stick = !!(gp && gp.buttons[3] && gp.buttons[3].pressed);
    h.trig = c.trig; h.trigDown = c.trigDown; h.squeezeDown = c.squeezeDown; h.squeeze = c.squeeze; h.reloadDown = c.aDown; h.cycle = c.bDown ? 1 : c.flickX; h.stickDown = stick && !h.stick; h.stick = stick; h.root.visible = c.connected;
  });
}
let lastT = 0;
renderer.setAnimationLoop((time, frame) => {
  const t = time / 1000, dt = Math.min(0.05, t - lastT || 0.016); lastT = t; G.t = t;
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera; camera.updateMatrixWorld();
  headPos.setFromMatrixPosition(cam.matrixWorld); { const e = cam.matrixWorld.elements; headDir.set(-e[8], -e[9], -e[10]).normalize(); }
  sfx.setListener(cam);
  if (scan && frame) updateScan(frame, dt);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 70);
  if (G.state !== 'menu' || hands.length) {
    readInput();
    const active = (G.state === 'wave' || G.state === 'intermission');
    if (active && hands.some((h) => h.stickDown)) { G.paused = !G.paused; if (G.paused) menu.show('pause'); else menu.hide(); }
    for (const h of hands) { h.aim.updateWorldMatrix(true, false); if (G.desktop || h.ctrl.connected) updateHand(h, dt, t); }
    updateMenu();
    if (active && !G.paused) { updateGame(dt, t); updateProjectiles(dt, t); updateZombies(dt, t); updateDrops(dt, t); updateStations(dt, t); }
    else if (G.state === 'over') { for (const z of zombies) if (z.state !== 'dead') horde.pose(z); horde.commit(); }
    blood.update(dt); smoke.update(dt); glow.update(dt); splats.update(dt); holes.update(dt); segs.update(dt);
    debris.update(dt, (d) => { if (d.s.y < 0.06) sfx.tone(3800 + Math.random() * 1500, 0.03, { gain: 0.05, pos: d.p }); });
    for (const b of booms) { if (b.t > 0) { b.t += dt; const u = b.t / 0.3; b.m.scale.setScalar(b.r * Math.min(1, u * 1.2)); b.m.material.opacity = Math.max(0, 0.75 * (1 - u)); if (u >= 1) { b.t = 0; b.m.visible = false; } } }
    for (const q of popups) { if (q.t > 0) { q.t -= dt; q.p.mesh.position.y += dt * 0.55; q.p.mesh.lookAt(headPos); q.p.mesh.material.opacity = Math.min(1, q.t * 3); if (q.t <= 0) q.p.mesh.visible = false; } }
  }
  renderer.render(scene, camera);
});

// =====================================================================================
// Page UI + session start
// =====================================================================================
const overlay = document.getElementById('overlay'), statusEl = document.getElementById('status');
function readOptions() { opt.difficulty = document.getElementById('opt-diff').value; opt.dot = document.getElementById('opt-dot').value === 'on'; opt.depth = document.getElementById('opt-depth').value === 'on'; }
function clearHands() { hands.forEach((h) => { h.root.removeFromParent(); h.dot.removeFromParent(); h.laser.removeFromParent(); }); hands.length = 0; }
async function enter(mode) {
  readOptions(); sfx.resume();
  try {
    const session = await startXR(renderer, mode, { optional: ['plane-detection', 'mesh-detection', 'anchors'], depth: opt.depth && mode === 'immersive-ar' });
    G.desktop = false; clearHands(); controllers.hands.forEach((c) => hands.push(makeHand(c.ray, c)));
    const ar = mode === 'immersive-ar'; scene.background = ar ? null : PREVIEW_BG; previewEnv.visible = !ar;
    overlay.style.display = 'none'; G.state = 'scan'; menu.hide(); scan = { t: 0, asked: false, wait: false, session };
    G.inv = [{ wi: WI.pistol, tier: 0, ammo: 12, reserve: Infinity }, { wi: WI.machete, tier: 0, ammo: 0, reserve: 0 }]; hands.forEach((h, i) => equip(h, i ? 0 : 1));
    say('SCANNING', 'Looking for your walls, doors and windows…', 0);
    session.addEventListener('end', () => { scan = null; G.state = 'menu'; menu.hide(); overlay.style.display = ''; banner.mesh.visible = false; scene.background = PREVIEW_BG; previewEnv.visible = true; });
  } catch (err) { statusEl.textContent = 'Could not start: ' + err.message; }
}
function startDesktop() {
  readOptions(); sfx.resume(); G.desktop = true; clearHands();
  const aim = new THREE.Object3D(); aim.position.set(0.2, -0.17, -0.42); camera.add(aim); hands.push(makeHand(aim, null));
  scene.background = PREVIEW_BG; previewEnv.visible = true; overlay.style.display = 'none';
  camera.position.set(0, 1.6, 0); camera.updateMatrixWorld(); headPos.set(0, 1.6, 0); headDir.set(0, 0, -1);
  applyScan([]); G.inv = [{ wi: WI.pistol, tier: 0, ammo: 12, reserve: Infinity }]; equip(hands[0], 0);
  if (opt.bot) newGame(); else { G.state = 'menu'; menu.show('main'); renderer.domElement.requestPointerLock?.(); }
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
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (e.code === 'KeyF') keys.KeyF = false; });

// weapon table on the start page
const wt = document.getElementById('weapons');
if (wt) wt.innerHTML = '<tr><th>Weapon</th><th>Where</th><th>What it does</th></tr>' + WEAPONS.map((w) => `<tr><td>${w.name}</td><td>${w.price ? 'Wall ' + w.price + (w.crate ? ' · Crate' : '') : w.crate ? 'Crate only' : 'Start'}</td><td>${w.note}</td></tr>`).join('');
if (opt.bot) startDesktop();
window.__z = { spawnZombie, horde, buildGun, THREE, G, R, zombies, hands, opt, WEAPONS, WI, menu, giveWeapon, interact, equip, newGame, applyScan, scene, camera, renderer, room, get alive() { return aliveCount; } }; // test hook
