// Golf Range Tools — swing tempo trainer + putting-line practice green (WebXR, Quest browser).
import * as THREE from 'three';
import { makeRenderer, fitToWindow, xrSupport, startXR, Controllers, UIPanel, makePanel, Sfx, clamp } from '../lib/xrkit.js';
import { TempoDetector, TEMPOS, tempoVerdict, CLUBS, simulateFlight, makeGreen, simulatePutt, solveIdeal, HOLE_R, BALL_R } from './physics.js';

const YD = 0.9144, FT = 0.3048, MPH = 2.23694;
const S = { // settings + session state
  mode: 'tempo', rightHanded: true, shaftTilt: 0, lenOverride: { tempo: 0, putt: 0 },
  tempoIdx: 1, clubIdx: 0,
  distFt: 6, breakIdx: 0, slopePct: 2, stimp: 11, showLine: true,
  ar: false, demo: false,
};
const BREAKS = [
  { name: 'Flat', dir: null }, { name: 'L→R', dir: [1, 0] }, { name: 'R→L', dir: [-1, 0] },
  { name: 'Uphill', dir: [0, 1] }, { name: 'Downhill', dir: [0, -1] },
];

const renderer = makeRenderer({ alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
fitToWindow(renderer, camera);
const sfx = new Sfx();
const controllers = new Controllers(renderer, scene);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a6b3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 8, 2); scene.add(sun);

const stage = new THREE.Group(); scene.add(stage); // local frame: ball at origin, target = -Z

// ---------- Environment (hidden in passthrough) ----------
const env = new THREE.Group(); stage.add(env);
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(450, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f8f45 }));
  ground.position.y = -0.005; env.add(ground);
  const fairway = new THREE.Mesh(new THREE.PlaneGeometry(60, 330).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4fa653 }));
  fairway.position.set(0, -0.003, -160); env.add(fairway);
  for (let yd = 50; yd <= 300; yd += 50) {
    const z = -yd * YD;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.position.set(0, 0.01, z); env.add(ring);
    const p = makePanel(8, 3.2, 40); const c = p.ctx;
    c.fillStyle = '#fff'; c.font = '700 96px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(yd), p.w / 2, p.h / 2);
    p.dirty(); p.mesh.position.set(-11, 2.4, z); env.add(p.mesh);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    pole.position.set(0, 1.5, z); env.add(pole);
  }
}
const SKY = new THREE.Color(0x8ec5ee);

// ---------- Mat, ball, club ----------
const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f5a33 }));
mat.position.set(-0.35, 0.001, 0); stage.add(mat);
const targetLine = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 1.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
targetLine.position.set(0, 0.003, 0); stage.add(targetLine);
const ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 });
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), ballMat); stage.add(ball);
const readyRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x55ff88 }));
readyRing.position.y = 0.004; readyRing.visible = false; stage.add(readyRing);

const club = new THREE.Group();
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8).rotateX(Math.PI / 2).translate(0, 0, -0.5), new THREE.MeshLambertMaterial({ color: 0xc8ccd2 }));
const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.26, 10).rotateX(Math.PI / 2).translate(0, 0, -0.08), new THREE.MeshLambertMaterial({ color: 0x1b1b1d }));
const headMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
const head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), headMat);
const tip = new THREE.Object3D();
club.add(shaft, handle, head, tip);
const demoGrip = new THREE.Object3D(); stage.add(demoGrip);
let clubLen = 1;
function clubLength() {
  return S.lenOverride[S.mode] || (S.mode === 'putt' ? 0.86 : CLUBS[S.clubIdx].length);
}
function refreshClub() {
  clubLen = clubLength();
  club.rotation.x = -S.shaftTilt * Math.PI / 180;
  shaft.scale.z = clubLen;
  if (S.mode === 'putt') head.scale.set(0.11, 0.026, 0.034); else if (S.clubIdx === 0) head.scale.set(0.11, 0.06, 0.09); else head.scale.set(0.075, 0.045, 0.03);
  head.position.set(0, 0, -clubLen); tip.position.set(0, 0, -clubLen);
}

// ---------- Flight visuals (tempo mode) ----------
const flightBall = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); flightBall.visible = false; stage.add(flightBall);
const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfff27a })); trail.frustumCulled = false; trail.visible = false; stage.add(trail);
const landLabel = makePanel(1, 0.4, 256); landLabel.mesh.visible = false; stage.add(landLabel.mesh);
let flight = null, teeBackAt = 0;

// ---------- Putting green ----------
const green = new THREE.Group(); stage.add(green);
const greenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3fa056 })); green.add(greenMesh);
const hole = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505 })); green.add(hole);
const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 6).translate(0, 0.35, 0), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })); green.add(pin);
const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1).translate(0.08, 0.64, 0), new THREE.MeshBasicMaterial({ color: 0xe23b3b, side: THREE.DoubleSide })); green.add(flag);
const ribbonMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
const idealLine = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat(0xffffff, 0.75)); green.add(idealLine);
const aimLine = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat(0x6fd3ff, 0.9)); green.add(aimLine);
const traceLine = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat(0xffd84a, 0.95)); green.add(traceLine);
const arrows = new THREE.Group(); green.add(arrows);
{
  const tri = new THREE.Shape(); tri.moveTo(0, 0.09); tri.lineTo(0.06, -0.05); tri.lineTo(0, -0.02); tri.lineTo(-0.06, -0.05); tri.closePath();
  const g = new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2); // points toward -Z
  const m = new THREE.MeshBasicMaterial({ color: 0xd8ffd8, transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 10; i++) arrows.add(new THREE.Mesh(g, m));
}
function ribbon(points, width, y) {
  const n = points.length, pos = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const p = points[i], w = width / 2;
    pos.set([p.x - dz * w, y, p.z + dx * w, p.x + dz * w, y, p.z - dx * w], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
const P = { hole: { x: 0, z: -2 }, green: null, ideal: null, roll: null, rollT0: 0, resetAt: 0, attempts: 0, makes: 0, streak: 0, best: 0, last: null, lineErr: [], paceErr: [] };
function setupPutt() {
  const D = S.distFt * FT, br = BREAKS[S.breakIdx];
  P.hole = { x: 0, z: -D };
  P.green = br.dir ? makeGreen(S.stimp, S.slopePct, br.dir[0], br.dir[1]) : makeGreen(S.stimp, 0, 1, 0);
  P.ideal = solveIdeal({ x: 0, z: 0 }, P.hole, P.green);
  const len = D + 2.0;
  greenMesh.scale.set(2.6, 1, len); greenMesh.position.set(0, 0.002, -len / 2 + 0.7);
  hole.position.set(0, 0.004, -D); pin.position.set(0, 0, -D); flag.position.set(0, 0, -D);
  idealLine.geometry.dispose(); idealLine.geometry = ribbon(P.ideal.path, 0.014, 0.006);
  const a = P.ideal.aim, L = Math.min(D + 0.3, 1.2);
  aimLine.geometry.dispose(); aimLine.geometry = ribbon([{ x: 0, z: 0 }, { x: Math.sin(a) * L, z: -Math.cos(a) * L }], 0.02, 0.008);
  arrows.visible = !!br.dir;
  if (br.dir) {
    const yaw = Math.atan2(-br.dir[0], -br.dir[1]); // rotate -Z arrow to the downhill direction
    arrows.children.forEach((m, i) => {
      const u = (Math.floor(i / 2) + 0.5) / 5;
      m.position.set(i % 2 ? 0.75 : -0.75, 0.005, 0.3 - u * (D + 0.8)); m.rotation.y = yaw;
    });
  }
  P.roll = null; traceLine.visible = false;
  P.attempts = 0; P.makes = 0; P.streak = 0; P.last = null; P.lineErr = []; P.paceErr = [];
  resetBall();
}
function resetBall() { ball.position.set(0, S.mode === 'putt' ? BALL_R : 0.03, 0); ball.visible = true; }

// ---------- Tempo state ----------
const det = new TempoDetector();
const T = { swings: [], last: null, status: 'Set the club behind the ball' };
let nextCycle = 0;
function metronome() {
  if (!sfx.ctx || S.mode !== 'tempo' || S.tempoIdx < 0) { nextCycle = 0; return; }
  const tp = TEMPOS[S.tempoIdx], now = sfx.t;
  if (!nextCycle) nextCycle = now + 0.6;
  if (now > nextCycle - 0.15) {
    const w = nextCycle - now;
    sfx.tone(330, 0.05, { when: w, gain: 0.12 });
    sfx.tone(660, 0.07, { when: w + 1.0, gain: 0.25 });
    sfx.tone(880, 0.07, { when: w + 1.0 + tp.back, gain: 0.25 });
    sfx.tone(1320, 0.09, { when: w + 1.0 + tp.back + tp.down, gain: 0.3 });
    nextCycle += 1.0 + tp.back + tp.down + 2.2;
  }
}

// ---------- Panel ----------
const panel = new UIPanel(1.0, 0.66, 1000); stage.add(panel.mesh);
function setMode(m) { S.mode = m; applyMode(); }
function applyMode() {
  const putt = S.mode === 'putt';
  green.visible = putt; mat.visible = !putt; targetLine.visible = !putt;
  flightBall.visible = false; trail.visible = false; landLabel.mesh.visible = false; flight = null; readyRing.visible = false;
  det.reset(); refreshClub();
  if (putt) setupPutt(); else resetBall();
  idealLine.visible = aimLine.visible = S.showLine;
  buildButtons();
}
function buildButtons() {
  const B = [], add = (x, y, w, label, onClick, on, font) => B.push({ x, y, w, h: 54, label, onClick, on, font });
  add(16, 16, 230, 'Tempo Trainer', () => setMode('tempo'), () => S.mode === 'tempo');
  add(256, 16, 230, 'Putting Green', () => setMode('putt'), () => S.mode === 'putt');
  add(560, 16, 130, 'Recenter', () => { needRecenter = 1; }, null, 22);
  add(700, 16, 130, () => (S.rightHanded ? 'Right-H' : 'Left-H'), () => { S.rightHanded = !S.rightHanded; needRecenter = 1; }, null, 22);
  add(840, 16, 144, () => `Shaft ${S.shaftTilt}°`, () => { S.shaftTilt = (S.shaftTilt + 15) % 60; refreshClub(); }, null, 22);
  if (S.mode === 'tempo') {
    TEMPOS.forEach((tp, i) => add(190 + i * 120, 90, 110, tp.name, () => { S.tempoIdx = i; nextCycle = 0; }, () => S.tempoIdx === i));
    add(190 + 3 * 120, 90, 110, 'Off', () => { S.tempoIdx = -1; }, () => S.tempoIdx === -1);
    CLUBS.forEach((c, i) => add(190 + i * 140, 156, 130, c.name, () => { S.clubIdx = i; S.lenOverride.tempo = 0; refreshClub(); }, () => S.clubIdx === i));
    add(700, 156, 284, 'Clear history', () => { T.swings = []; T.last = null; }, null, 22);
  } else {
    [3, 6, 10, 15, 20].forEach((d, i) => add(190 + i * 88, 90, 80, String(d), () => { S.distFt = d; setupPutt(); }, () => S.distFt === d));
    BREAKS.forEach((b, i) => add(190 + i * 128, 156, 120, b.name, () => { S.breakIdx = i; setupPutt(); }, () => S.breakIdx === i, 22));
    [1, 2, 3].forEach((p, i) => add(190 + i * 88, 222, 80, p + '%', () => { S.slopePct = p; setupPutt(); }, () => S.slopePct === p));
    [9, 11, 13].forEach((s, i) => add(640 + i * 88, 222, 80, String(s), () => { S.stimp = s; setupPutt(); }, () => S.stimp === s));
    add(190, 288, 256, () => `Aim line: ${S.showLine ? 'On' : 'Off'}`, () => { S.showLine = !S.showLine; idealLine.visible = aimLine.visible = S.showLine; }, () => S.showLine);
  }
  panel.buttons = B; panel.redraw();
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0; };
panel.draw = (c, p) => {
  const t = panel.theme;
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = t.dim; c.font = '500 24px system-ui,sans-serif';
  if (S.mode === 'tempo') {
    c.fillText('Guide tones', 20, 117); c.fillText('Club', 20, 183);
    c.fillStyle = t.dim; c.font = '500 22px system-ui,sans-serif';
    c.fillText(`Club length ${(clubLen * 39.37).toFixed(0)} in — press A/X at address to fit it to your floor`, 20, 244);
    const L = T.last;
    c.fillStyle = t.text; c.font = '700 34px system-ui,sans-serif';
    c.fillText(T.status, 20, 292);
    if (L) {
      c.font = '800 110px system-ui,sans-serif'; c.fillStyle = L.verdict.good ? '#6ff0a0' : '#ffd166';
      c.fillText(`${L.ratio.toFixed(1)} : 1`, 20, 392);
      c.font = '500 26px system-ui,sans-serif'; c.fillStyle = t.text;
      c.fillText(`Back ${L.back.toFixed(2)} s (${(L.back * 30).toFixed(0)} f)   Down ${L.down.toFixed(2)} s (${(L.down * 30).toFixed(0)} f)`, 20, 476);
      c.fillText(L.hit ? `Club ${(L.headSpeed * MPH).toFixed(0)} mph   Est. carry ${L.carryYd.toFixed(0)} yd   ${Math.abs(L.sideYd) < 1 ? 'on line' : Math.abs(L.sideYd).toFixed(0) + ' yd ' + (L.sideYd > 0 ? 'right' : 'left')}` : 'Missed the ball — tempo still timed', 20, 516);
      c.fillStyle = L.verdict.good ? '#6ff0a0' : '#ffd166'; c.fillText(L.verdict.text, 20, 556);
    }
    // history bars (ratio, 3.0 line)
    const h = T.swings.slice(-10), x0 = 560, y0 = 600, bw = 36;
    c.fillStyle = t.dim; c.font = '500 20px system-ui,sans-serif';
    c.fillText(h.length ? `Last ${h.length}: avg ${mean(h).toFixed(2)}  ±${sd(h).toFixed(2)}` : 'Swing history appears here', x0, 628);
    h.forEach((r, i) => { const bh = clamp(r, 0, 5) * 44; c.fillStyle = r >= 2.7 && r <= 3.3 ? '#2f8f5b' : '#a8842c'; c.fillRect(x0 + i * (bw + 6), y0 - bh, bw, bh); });
    c.strokeStyle = '#ffffff'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(x0 - 6, y0 - 132); c.lineTo(x0 + 10 * (bw + 6), y0 - 132); c.stroke(); c.setLineDash([]);
  } else {
    c.fillText('Distance (ft)', 20, 117); c.fillText('Break', 20, 183); c.fillText('Slope', 20, 249); c.fillText('Stimp', 540, 249);
    c.fillText('Guides', 20, 315);
    const I = P.ideal;
    c.fillStyle = t.dim; c.font = '500 22px system-ui,sans-serif';
    if (I) c.fillText(Math.abs(I.breakDeg) < 0.15 ? 'Read: straight putt' : `Read: aim ${Math.abs(Math.tan(I.aim - I.base) * S.distFt * 12).toFixed(0)} in ${I.breakDeg < 0 ? 'left' : 'right'} of the hole`, 470, 315);
    const L = P.last;
    c.fillStyle = t.text; c.font = '800 64px system-ui,sans-serif';
    c.fillText(L ? L.headline : 'Putt when ready', 20, 400);
    c.font = '500 26px system-ui,sans-serif';
    if (L) {
      c.fillStyle = Math.abs(L.lineDeg) <= 1 ? '#6ff0a0' : '#ffd166';
      c.fillText(`Start line: ${Math.abs(L.lineDeg) < 0.2 ? 'dead on' : Math.abs(L.lineDeg).toFixed(1) + '° ' + (L.lineDeg > 0 ? 'right' : 'left') + ' of the ideal line'}`, 20, 462);
      c.fillStyle = Math.abs(L.pacePct) <= 8 ? '#6ff0a0' : '#ffd166';
      c.fillText(`Pace: ${Math.abs(L.pacePct) < 2 ? 'perfect' : Math.abs(L.pacePct).toFixed(0) + '% too ' + (L.pacePct > 0 ? 'firm' : 'soft')}`, 20, 502);
      c.fillStyle = t.text; c.fillText(L.detail, 20, 542);
    }
    c.fillStyle = t.dim; c.font = '500 24px system-ui,sans-serif';
    c.fillText(`Made ${P.makes}/${P.attempts}   Streak ${P.streak}   Best ${P.best}` + (P.lineErr.length ? `   Avg line error ${mean(P.lineErr.map(Math.abs)).toFixed(1)}°` : ''), 20, 612);
  }
};

// ---------- Recentering ----------
let needRecenter = 0;
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Vector3();
function recenter() {
  camera.getWorldPosition(_p); camera.getWorldDirection(_d); _d.y = 0;
  if (_d.lengthSq() < 0.01) _d.set(0, 0, -1); _d.normalize();
  stage.position.set(_p.x + _d.x * 0.85, 0, _p.z + _d.z * 0.85);
  stage.rotation.y = S.rightHanded ? Math.atan2(-_d.z, _d.x) : Math.atan2(_d.z, -_d.x);
  placePanel(_p);
}
function placePanel(headWorld) {
  const sx = S.rightHanded ? 1 : -1;
  panel.mesh.position.set(1.45 * sx, 1.2, -0.75);
  stage.updateMatrixWorld(true);
  panel.mesh.lookAt(headWorld);
}

// ---------- Desktop demo (also used for automated tests) ----------
const demo = { t0: 0, kind: null };
function demoPose(t) { // returns {head, hand} in stage-local coordinates
  const u = t - demo.t0;
  if (S.mode === 'putt') {
    const I = P.ideal, sp = (I.speed / 1.6) * (demo.err ? demo.err.pace : 1), a = I.aim + (demo.err ? demo.err.line : 0);
    const dx = Math.sin(a), dz = -Math.cos(a);
    // back 0.25 m over 0.6 s, then through at constant speed
    let s; if (u < 0.5) s = -0.02; else if (u < 1.1) s = -0.02 - 0.23 * Math.sin(((u - 0.5) / 0.6) * Math.PI / 2); else s = -0.25 + (u - 1.1) * sp;
    s = Math.min(s, 0.35);
    const headP = { x: dx * s, y: 0.03, z: dz * s };
    return { head: headP, hand: { x: headP.x - 0.25, y: 0.85, z: headP.z } };
  }
  const tp = TEMPOS[Math.max(0, S.tempoIdx)], tb = tp.back, td = tp.down, tt = u - 1.0;
  const sm = (x) => x * x * (3 - 2 * x);
  let ang; if (tt <= 0) ang = 0; else if (tt < tb) ang = 3.4 * sm(tt / tb); else if (tt < tb + td) { const k = (tt - tb) / td; ang = 3.4 * (1 - k * k); } else { const k = tt - tb - td; ang = -Math.min(3.2, (6.8 / td) * k * (1 - Math.min(0.9, k * 1.5) / 2)); }
  const L = clubLen, hand = { x: -0.55, y: 0.03 + L * 0.83 + 0.45 * (1 - Math.cos(ang * 0.7)), z: 0.35 * Math.sin(ang * 0.7) };
  const hx = 0.55 * Math.cos(ang * 0.25), hy = -L * Math.cos(ang) * 0.83, hz = L * Math.sin(ang), n = Math.hypot(hx, hy, hz) / L;
  return { head: { x: hand.x + hx / n, y: hand.y + hy / n, z: hand.z + hz / n }, hand };
}

// ---------- Per-frame logic ----------
const headL = new THREE.Vector3(), handL = new THREE.Vector3(), prevHead = new THREE.Vector3();
const hist = []; let prevT = 0, clubHand = null;
const lasers = controllers.hands.map((h) => {
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
  l.visible = false; h.ray.add(l); return l;
});
function attachClub() {
  const want = controllers.byHand(S.rightHanded ? 'right' : 'left') || controllers.hands.find((h) => h.connected) || null;
  if (S.demo) { if (club.parent !== demoGrip) demoGrip.add(club); clubHand = null; return; }
  if (want !== clubHand || (want && club.parent !== want.grip)) { clubHand = want; if (want) want.grip.add(club); else club.removeFromParent(); }
}
function tempoEvent(e, t) {
  if (e.type === 'ready') { T.status = 'Ready — swing when you like'; readyRing.visible = true; sfx.tone(520, 0.04, { gain: 0.12 }); }
  else if (e.type === 'start') { T.status = 'Backswing…'; readyRing.visible = false; }
  else if (e.type === 'reset') { T.status = 'Set the club behind the ball'; }
  else if (e.type === 'swing') {
    const verdict = tempoVerdict(e.ratio), L = { ...e, verdict, carryYd: 0, sideYd: 0 };
    if (e.hit) {
      const hz = Math.hypot(e.vx, e.vz) > 0.5 ? [e.vx, e.vz] : [0, -1];
      const f = simulateFlight(e.headSpeed, hz[0], hz[1], CLUBS[S.clubIdx]);
      L.carryYd = f.carry / YD; L.sideYd = f.side / YD;
      flight = { f, t0: t, i: 0 }; flightBall.visible = true; trail.visible = true; landLabel.mesh.visible = false;
      ball.visible = false; teeBackAt = t + 1.2;
      sfx.burst(0.07, { freq: 3200, gain: 0.7 }); sfx.tone(240, 0.09, { slideTo: 90, gain: 0.5, type: 'triangle' });
      controllers.pulse(clubHand, 1, 70);
    } else sfx.burst(0.18, { freq: 900, gain: 0.15, type: 'bandpass' });
    T.last = L; T.swings.push(e.ratio); if (T.swings.length > 40) T.swings.shift();
    T.status = e.hit ? 'Impact' : 'Whiff';
  }
  panel.redraw();
}
function updateFlight(t) {
  if (!flight) return;
  const pts = flight.f.points, tt = (t - flight.t0);
  while (flight.i < pts.length - 2 && pts[flight.i + 1].t < tt) flight.i++;
  const a = pts[flight.i], b = pts[Math.min(pts.length - 1, flight.i + 1)], u = clamp((tt - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
  flightBall.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
  flightBall.scale.setScalar(BALL_R + flightBall.position.length() * 0.004); // keep it visible down-range
  const arr = trailGeo.attributes.position.array, n = Math.min(flight.i + 2, 400);
  for (let i = 0; i < n - 1; i++) { arr[i * 3] = pts[i].x; arr[i * 3 + 1] = pts[i].y; arr[i * 3 + 2] = pts[i].z; }
  arr[(n - 1) * 3] = flightBall.position.x; arr[(n - 1) * 3 + 1] = flightBall.position.y; arr[(n - 1) * 3 + 2] = flightBall.position.z;
  trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, n);
  if (tt >= flight.f.time && !flight.done) {
    flight.done = true;
    const c = landLabel.ctx; c.clearRect(0, 0, landLabel.w, landLabel.h);
    c.fillStyle = 'rgba(10,20,14,0.85)'; c.fillRect(0, 0, landLabel.w, landLabel.h);
    c.fillStyle = '#fff'; c.font = '700 64px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${(flight.f.carry / YD).toFixed(0)} yd`, landLabel.w / 2, landLabel.h / 2); landLabel.dirty();
    const d = Math.max(4, flight.f.carry), s = d * 0.09;
    landLabel.mesh.scale.setScalar(s); landLabel.mesh.position.copy(flightBall.position).setY(1 + s * 0.3); landLabel.mesh.visible = true;
    landLabel.mesh.lookAt(stage.localToWorld(_q.set(0, 1.5, 0)));
  }
}
function strikePutt(vx, vz, t) {
  const bvx = vx * 1.6, bvz = vz * 1.6, sp = Math.hypot(bvx, bvz);
  P.roll = { sim: simulatePutt({ x: 0, z: 0 }, bvx, bvz, P.green, P.hole), t0: t, aim: Math.atan2(bvx, -bvz), speed: sp };
  traceLine.geometry.dispose(); traceLine.geometry = ribbon(P.roll.sim.path, 0.012, 0.007); traceLine.visible = true; traceLine.geometry.setDrawRange(0, 0);
  sfx.tone(1100, 0.03, { gain: 0.3, type: 'triangle' }); sfx.burst(0.03, { freq: 2600, gain: 0.25 });
  controllers.pulse(clubHand, 0.5, 30);
}
function updatePutt(t, speedH, vx, vz) {
  const R = P.roll;
  if (!R) {
    if (t < P.resetAt) return;
    // strike: head sweeps through the ball
    const sx = headL.x - prevHead.x, sz = headL.z - prevHead.z, sl = sx * sx + sz * sz;
    let u = sl > 0 ? (-prevHead.x * sx - prevHead.z * sz) / sl : 0; u = clamp(u, 0, 1);
    const cd = Math.hypot(prevHead.x + sx * u, prevHead.z + sz * u);
    const toward = vx * -prevHead.x + vz * -prevHead.z > 0; // moving at the ball, not away on the backstroke
    if (cd < 0.055 && headL.y < 0.16 && speedH > 0.2 && toward) strikePutt(vx, vz, t);
    return;
  }
  const path = R.sim.path, f = (t - R.t0) * 30, i = Math.min(path.length - 1, Math.floor(f)), j = Math.min(path.length - 1, i + 1), u = f - Math.floor(f);
  ball.position.set(path[i].x + (path[j].x - path[i].x) * u, BALL_R, path[i].z + (path[j].z - path[i].z) * u);
  traceLine.geometry.setDrawRange(0, Math.max(0, i) * 6);
  if (f >= path.length - 1 && !R.done) {
    R.done = true; const s = R.sim, I = P.ideal;
    const lineDeg = (R.aim - I.aim) * 180 / Math.PI, pacePct = (R.speed / I.speed - 1) * 100;
    P.attempts++; P.lineErr.push(lineDeg); P.paceErr.push(pacePct);
    let headline, detail;
    if (s.holed) {
      P.makes++; P.streak++; P.best = Math.max(P.best, P.streak); headline = 'Holed it!'; ball.visible = false;
      detail = `Dropped with ${pacePct > 12 ? 'plenty of' : pacePct < -5 ? 'dying' : 'ideal'} pace`;
      sfx.tone(520, 0.12, { slideTo: 260, gain: 0.3, type: 'triangle' }); sfx.tone(180, 0.08, { when: 0.1, gain: 0.3 });
      controllers.pulse(clubHand, 0.8, 120);
    } else {
      P.streak = 0; headline = 'Missed';
      const inch = (m) => (Math.abs(m) / 0.0254).toFixed(0);
      const side = Math.abs(s.endLateral) < 0.03 ? 'on line' : `${inch(s.endLateral)} in ${s.endLateral > 0 ? 'right' : 'left'}`;
      detail = `Finished ${inch(s.endAlong)} in ${s.endAlong > 0 ? 'past' : 'short'}, ${side}`;
    }
    P.last = { headline, detail, lineDeg, pacePct };
    P.resetAt = t + 1.4; panel.redraw();
  }
  if (R.done && t >= P.resetAt) { P.roll = null; resetBall(); }
}

let lastT = 0, frameNo = 0;
renderer.setAnimationLoop((time) => {
  const t = time / 1000, dt = Math.min(0.05, t - lastT || 0.016); lastT = t; frameNo++;
  controllers.update();
  if (needRecenter && (S.demo || renderer.xr.isPresenting) && ++needRecenter > 6) { needRecenter = 0; if (!S.demo) recenter(); panel.redraw(); }
  attachClub();
  // panel pointing: either hand's ray
  controllers.hands.forEach((h, i) => {
    lasers[i].visible = false;
    if (!h.connected) return;
    h.ray.getWorldPosition(_p); h.ray.getWorldDirection(_d).negate();
    const dist = panel.pointAt(_p, _d);
    if (dist > 0) { lasers[i].visible = true; lasers[i].scale.z = dist; if (h.trigDown) { sfx.resume(); if (panel.click()) sfx.tone(700, 0.03, { gain: 0.15 }); } }
  });
  if (clubHand && clubHand.aDown) { // fit club length to the floor
    clubHand.grip.getWorldPosition(_p); tip.getWorldPosition(_q); _q.sub(_p).normalize();
    if (_q.y < -0.25) { S.lenOverride[S.mode] = clamp((_p.y - 0.03) / -_q.y, 0.5, 1.4); refreshClub(); panel.redraw(); sfx.tone(880, 0.05, { gain: 0.2 }); }
  }
  // club pose in stage-local space
  let active = false;
  if (S.demo) {
    if (demo.kind) {
      const ps = demoPose(t); handL.copy(ps.hand); headL.copy(ps.head); active = true;
      demoGrip.position.copy(handL); demoGrip.lookAt(stage.localToWorld(_q.copy(handL).multiplyScalar(2).sub(headL)));
      if (t - demo.t0 > (S.mode === 'putt' ? 2.2 : 3.2) && !P.roll) demo.kind = null;
    }
  } else if (clubHand) {
    tip.getWorldPosition(headL); stage.worldToLocal(headL); clubHand.grip.getWorldPosition(handL); stage.worldToLocal(handL); active = true;
  }
  if (active) {
    hist.push({ t, x: headL.x, z: headL.z }); while (hist.length > 2 && t - hist[0].t > 0.06) hist.shift();
    const h0 = hist[0], hd = Math.max(1e-3, t - h0.t), vx = (headL.x - h0.x) / hd, vz = (headL.z - h0.z) / hd;
    if (S.mode === 'tempo') {
      if (ball.visible) { const e = det.feed(t, headL, handL, ball.position); if (e) tempoEvent(e, t); }
    }
    if (S.mode === 'putt') updatePutt(t, Math.hypot(vx, vz), vx, vz);
    prevHead.copy(headL);
  } else if (S.mode === 'putt' && P.roll) updatePutt(t, 0, 0, 0);
  if (S.mode === 'tempo') {
    metronome(); updateFlight(t);
    if (!ball.visible && t > teeBackAt) { resetBall(); det.reset(); T.status = 'Set the club behind the ball'; panel.redraw(); }
  }
  prevT = t;
  renderer.render(scene, camera);
});

// ---------- Session start / page UI ----------
const overlay = document.getElementById('overlay'), statusEl = document.getElementById('status');
async function enter(mode) {
  sfx.resume();
  try {
    const session = await startXR(renderer, mode, { optional: ['hand-tracking'] });
    S.ar = mode === 'immersive-ar'; S.demo = false;
    scene.background = S.ar ? null : SKY; env.visible = !S.ar;
    overlay.style.display = 'none'; needRecenter = 1; applyMode();
    session.addEventListener('end', () => { overlay.style.display = ''; startDemo(); });
  } catch (err) { statusEl.textContent = 'Could not start: ' + err.message; }
}
function startDemo() {
  S.demo = true; S.ar = false; scene.background = SKY; env.visible = true;
  stage.position.set(0, 0, 0); stage.rotation.y = 0;
  camera.position.set(-1.9, 1.55, 1.7); camera.lookAt(0.5, 0.75, -1.2);
  placePanel(camera.position); applyMode();
}
document.getElementById('enter-ar').onclick = () => enter('immersive-ar');
document.getElementById('enter-vr').onclick = () => enter('immersive-vr');
xrSupport().then((s) => {
  document.getElementById('enter-ar').disabled = !s.ar; document.getElementById('enter-vr').disabled = !s.vr;
  statusEl.textContent = s.ar || s.vr ? 'Headset detected — pick a view to start.' : 'No headset detected. Open this page in the Meta Quest Browser. Desktop preview: Space = demo swing, M = switch tool.';
});
window.addEventListener('keydown', (e) => {
  if (!S.demo) return;
  sfx.resume();
  if (e.code === 'Space') { demo.kind = 'swing'; demo.t0 = lastT; demo.err = { line: (Math.random() - 0.5) * 0.04, pace: 0.95 + Math.random() * 0.12 }; det.reset(); }
  if (e.code === 'KeyM') setMode(S.mode === 'tempo' ? 'putt' : 'tempo');
});
startDemo();
window.__golf = { S, P, T, demo, setMode, stage, THREE, get clubHand() { return clubHand; }, get t() { return lastT; } }; // test hook
