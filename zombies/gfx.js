// Graphics for Breach Night: procedural textures, the instanced zombie rig, gun models and pooled effects.
import * as THREE from 'three';

// ---------------------------------------------------------------- helpers
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function merge(geos) { // concatenates non-indexed position/normal/color (+uv when every part has one)
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g)), hasUv = parts.every((g) => g.attributes.uv);
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = hasUv ? new Float32Array(n * 2) : null; let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    if (uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
// Bake a whole model (e.g. a gun) into one vertex-coloured mesh: one draw call for wall displays.
const displayMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export function bakeModel(root, fitLength = 0.44) {
  root.updateMatrixWorld(true); const geos = [], inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), c = new THREE.Color();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    c.copy(m.material.color); if (m.material.isMeshBasicMaterial) c.multiplyScalar(1.6);
    const col = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); geos.push(g);
  });
  const geo = merge(geos); geo.computeBoundingBox(); const bb = geo.boundingBox, len = bb.max.z - bb.min.z, s = Math.min(1.4, fitLength / len);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2).scale(s, s, s).rotateY(-Math.PI / 2); // lie flat along the wall, muzzle to the right
  return new THREE.Mesh(geo, displayMat);
}
// Lumpy, hand-made look: push vertices along their normals with stable noise, then paint grime into vertex colours.
function organic(geo, amp, seed, paint) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.round(x * 500) + seed, l = Math.round(y * 500), m = Math.round(z * 500);
    const d = (hash3(k, l, m) - 0.5) * 2 * amp;
    p.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
    const c = paint ? paint(x, y, z, hash3(Math.round(x * 14) + seed, Math.round(y * 14), Math.round(z * 14))) : [1, 1, 1];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- textures
export const TEX = {
  wood: canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const y = Math.random() * h; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,18,8' : '150,110,70'},${0.12 + Math.random() * 0.25})`; g.lineWidth = 0.5 + Math.random() * 1.5; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 8, w * 0.7, y + (Math.random() - 0.5) * 8, w, y + (Math.random() - 0.5) * 6); g.stroke(); }
    for (let i = 0; i < 3; i++) { const x = Math.random() * w, y = 10 + Math.random() * (h - 20); g.fillStyle = 'rgba(35,20,10,0.75)'; g.beginPath(); g.ellipse(x, y, 7 + Math.random() * 5, 3 + Math.random() * 2, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(30,18,8,0.5)'; for (let r = 1; r < 4; r++) { g.beginPath(); g.ellipse(x, y, 8 + r * 5, 4 + r * 2.4, 0, 0, 7); g.stroke(); } }
    const e = g.createLinearGradient(0, 0, 0, h); e.addColorStop(0, 'rgba(0,0,0,0.45)'); e.addColorStop(0.15, 'rgba(0,0,0,0)'); e.addColorStop(0.85, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = e; g.fillRect(0, 0, w, h);
    for (const x of [9, 20, w - 20, w - 9]) for (const y of [h * 0.3, h * 0.72]) { g.fillStyle = '#1a1612'; g.beginPath(); g.arc(x, y + (x % 7) - 3, 2.6, 0, 7); g.fill(); g.fillStyle = 'rgba(200,200,200,0.35)'; g.beginPath(); g.arc(x - 0.8, y + (x % 7) - 3.8, 0.9, 0, 7); g.fill(); }
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(70,10,8,0.5)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 2 + Math.random() * 6, Math.random() * 3, 0, 7); g.fill(); }
  }),
  soft: canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
  flash: canvasTex(128, 128, (g) => {
    g.translate(64, 64); const r = g.createRadialGradient(0, 0, 0, 0, 0, 60); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,225,150,0.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = r; g.beginPath(); const n = 9; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 6.283, rad = i % 2 ? 14 + Math.random() * 8 : 40 + Math.random() * 22; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); g.fill();
    g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill();
  }),
  splat: canvasTex(128, 128, (g) => {
    g.fillStyle = 'rgba(120,8,8,0.95)';
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, d = Math.random() * Math.random() * 52, r = 3 + Math.random() * (22 - d * 0.3); g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, Math.max(1.5, r), 0, 7); g.fill(); }
    g.fillStyle = 'rgba(60,2,2,0.6)'; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(64 + (Math.random() - 0.5) * 50, 64 + (Math.random() - 0.5) * 50, 2 + Math.random() * 8, 0, 7); g.fill(); }
  }),
  hole: canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.3, 'rgba(15,12,10,0.95)'); r.addColorStop(0.5, 'rgba(60,55,50,0.5)'); r.addColorStop(1, 'rgba(90,85,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(20,18,16,0.7)'; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.283; g.lineWidth = 0.6 + Math.random(); g.beginPath(); g.moveTo(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 8); g.lineTo(32 + Math.cos(a + 0.2) * (16 + Math.random() * 12), 32 + Math.sin(a + 0.2) * (16 + Math.random() * 12)); g.stroke(); }
  }),
  shadow: canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,0.6)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
  // moonlit yard seen through the openings
  outside: canvasTex(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#04070f'); sky.addColorStop(0.45, '#0e1d33'); sky.addColorStop(0.72, '#2b4a63'); sky.addColorStop(0.8, '#3d5f73'); sky.addColorStop(1, '#16242c'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.4, 1.4); }
    const mx = 700, my = 120, halo = g.createRadialGradient(mx, my, 10, mx, my, 190); halo.addColorStop(0, 'rgba(230,240,255,0.55)'); halo.addColorStop(1, 'rgba(230,240,255,0)'); g.fillStyle = halo; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eef3fb'; g.beginPath(); g.arc(mx, my, 34, 0, 7); g.fill(); g.fillStyle = 'rgba(160,175,200,0.5)'; g.beginPath(); g.arc(mx - 10, my - 6, 8, 0, 7); g.arc(mx + 12, my + 10, 5, 0, 7); g.fill();
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(40,60,85,0.35)'; g.beginPath(); g.ellipse(Math.random() * w, 60 + Math.random() * 160, 120 + Math.random() * 160, 14 + Math.random() * 16, 0, 0, 7); g.fill(); }
    const hz = h * 0.8; // far tree line
    g.fillStyle = '#12222b'; g.beginPath(); g.moveTo(0, hz); for (let x = 0; x <= w; x += 8) g.lineTo(x, hz - 26 - Math.random() * 34 - 16 * Math.sin(x * 0.02)); g.lineTo(w, hz); g.fill();
    const tree = (x, s) => { g.strokeStyle = '#05090c'; const br = (x0, y0, a, len, wd) => { if (len < 7) return; const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); br(x1, y1, a - 0.35 - Math.random() * 0.4, len * 0.7, wd * 0.65); br(x1, y1, a + 0.3 + Math.random() * 0.4, len * 0.68, wd * 0.65); }; br(x, hz + 14, -Math.PI / 2 + (Math.random() - 0.5) * 0.2, 70 * s, 9 * s); };
    for (let i = 0; i < 9; i++) tree(30 + i * 118 + Math.random() * 50, 0.9 + Math.random() * 0.8);
    g.fillStyle = '#070c10'; for (let x = 0; x < w; x += 26) { g.fillRect(x, hz - 16 + Math.sin(x) * 3, 5, 40); } g.fillRect(0, hz - 4, w, 4); g.fillRect(0, hz + 8, w, 3);
    const fog = g.createLinearGradient(0, hz - 70, 0, h); fog.addColorStop(0, 'rgba(70,105,125,0)'); fog.addColorStop(0.5, 'rgba(70,105,125,0.55)'); fog.addColorStop(1, 'rgba(22,36,44,1)'); g.fillStyle = fog; g.fillRect(0, hz - 70, w, h - hz + 70);
  }, true),
};
export const FOG = new THREE.Color(0x20343f);

// View of the yard through an opening: parallax-correct, drawn first without depth so the horde paints over it.
export function portalMaterial(origin, right, normal) {
  return new THREE.ShaderMaterial({
    depthWrite: false, side: THREE.DoubleSide,
    uniforms: { map: { value: TEX.outside }, uO: { value: origin.clone() }, uR: { value: right.clone() }, uN: { value: normal.clone() }, uFog: { value: FOG } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D map; uniform vec3 uO, uR, uN, uFog; varying vec3 vW;
      void main(){
        vec3 d = normalize(vW - cameraPosition); float dn = dot(d, -uN); vec3 col = uFog;
        if (dn > 0.02) {
          float tB = 16.0 / dn, tG = d.y < -0.002 ? -vW.y / d.y : 1e9;
          if (tG < tB) { vec3 q = vW + d * tG; float dist = dot(q - uO, -uN), lat = dot(q - uO, uR);
            float n = sin(lat * 7.0 + sin(dist * 3.0)) * sin(dist * 5.0 + lat * 2.0);
            vec3 dirt = vec3(0.010, 0.014, 0.011) + 0.004 * n; float path = smoothstep(1.3, 0.5, abs(lat)); dirt = mix(dirt, vec3(0.026, 0.023, 0.018), path * 0.7);
            col = mix(dirt, uFog, clamp(dist / 13.0, 0.0, 1.0)); }
          else { vec3 q = vW + d * tB; vec2 uv = vec2(dot(q - uO, uR) / 34.0 + 0.5, clamp(q.y / 11.0 + 0.2, 0.0, 1.0)); col = texture2D(map, uv).rgb; }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- zombie rig
// Rigid body segments, each one InstancedMesh for the whole horde (11 draw calls total).
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), WHITE = new THREE.Color(0xffffff), EMBER = new THREE.Color(0xff7a1a), ICE = new THREE.Color(0x9fe6ff);
const cloth = (x, y, z, n) => { const g = 0.72 + n * 0.28; return n < 0.16 ? [g * 0.75, g * 0.2, g * 0.18] : n > 0.9 ? [g * 0.5, g * 0.48, g * 0.45] : [g, g, g]; };
const skinP = (x, y, z, n) => { const g = 0.7 + n * 0.3; return n < 0.14 ? [g * 0.75, g * 0.28, g * 0.25] : n > 0.86 ? [g * 0.62, g * 0.68, g * 0.6] : [g, g, g]; };

function zombieGeometry() {
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 2, 7).translate(0, -len / 2, 0);
  const G = {};
  G.torso = organic(merge([
    new THREE.CylinderGeometry(0.19, 0.15, 0.46, 8, 3).translate(0, 0.23, 0).scale(1, 1, 0.64),
    new THREE.SphereGeometry(1, 8, 5).scale(0.27, 0.085, 0.125).translate(0, 0.435, 0),
    new THREE.CylinderGeometry(0.045, 0.055, 0.1, 6).translate(0, 0.5, 0.005),
  ]), 0.012, 1, (x, y, z, n) => (y > 0.47 ? [0.9, 0.95, 0.85] : cloth(x, y, z, n)));
  G.pelvis = organic(new THREE.SphereGeometry(1, 8, 6).scale(0.17, 0.11, 0.125), 0.008, 2, cloth);
  G.head = organic(new THREE.IcosahedronGeometry(0.11, 1).scale(0.86, 1.08, 0.98).translate(0, 0.125, 0.012), 0.007, 3, (x, y, z, n) => {
    const socket = Math.abs(Math.abs(x) - 0.04) < 0.026 && y > 0.115 && y < 0.17 && z > 0.06, mouth = Math.abs(x) < 0.045 && y < 0.085 && y > 0.04 && z > 0.06, scalp = y > 0.19;
    return socket || mouth ? [0.14, 0.06, 0.06] : scalp ? [0.45, 0.42, 0.38] : skinP(x, y, z, n);
  });
  G.jaw = organic(new THREE.BoxGeometry(0.105, 0.04, 0.095, 2, 1, 2).translate(0, -0.02, 0.045), 0.004, 4, (x, y, z, n) => (y > -0.008 ? [0.85, 0.82, 0.7] : skinP(x, y, z, n)));
  G.eyes = merge([new THREE.SphereGeometry(0.016, 6, 5).translate(0.04, 0.142, 0.1), new THREE.SphereGeometry(0.016, 6, 5).translate(-0.04, 0.142, 0.1)]);
  G.upperArm = organic(cap(0.05, 0.25), 0.007, 5, cloth);
  G.forearm = organic(merge([
    cap(0.04, 0.23), new THREE.BoxGeometry(0.075, 0.1, 0.032).translate(0, -0.3, 0),
    new THREE.BoxGeometry(0.016, 0.075, 0.018).translate(-0.026, -0.38, 0.008), new THREE.BoxGeometry(0.016, 0.085, 0.018).translate(0, -0.385, 0.01), new THREE.BoxGeometry(0.016, 0.07, 0.018).translate(0.026, -0.375, 0.008),
  ]), 0.005, 6, (x, y, z, n) => (y < -0.34 ? [0.5, 0.3, 0.28] : skinP(x, y, z, n)));
  G.thigh = organic(cap(0.078, 0.4), 0.008, 7, cloth);
  G.shin = organic(merge([cap(0.056, 0.4), new THREE.BoxGeometry(0.1, 0.07, 0.25).translate(0, -0.465, 0.06)]), 0.006, 8, (x, y, z, n) => (y < -0.42 ? [0.22, 0.2, 0.2] : cloth(x, y, z, n)));
  return G;
}

export class Horde {
  constructor(scene, max) {
    this.max = max; const G = zombieGeometry();
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mk = (geo, n, mat = lit) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < n; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, WHITE); } m.instanceColor.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
    this.torso = mk(G.torso, max); this.pelvis = mk(G.pelvis, max); this.head = mk(G.head, max); this.jaw = mk(G.jaw, max);
    this.eyes = mk(G.eyes, max, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.upperArm = mk(G.upperArm, max * 2); this.forearm = mk(G.forearm, max * 2); this.thigh = mk(G.thigh, max * 2); this.shin = mk(G.shin, max * 2);
    this.shadow = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), max, new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, color: 0x000000 }));
    this.all = [this.torso, this.pelvis, this.head, this.jaw, this.eyes, this.upperArm, this.forearm, this.thigh, this.shin, this.shadow];
    this.root = new THREE.Matrix4(); this.torsoM = new THREE.Matrix4(); this.headM = new THREE.Matrix4(); this.limb = new THREE.Matrix4(); this.out = new THREE.Matrix4();
  }
  hide(i) {
    for (const m of [this.torso, this.pelvis, this.head, this.jaw, this.eyes, this.shadow]) m.setMatrixAt(i, ZERO);
    for (const m of [this.upperArm, this.forearm, this.thigh, this.shin]) { m.setMatrixAt(i * 2, ZERO); m.setMatrixAt(i * 2 + 1, ZERO); }
  }
  commit() { for (const m of this.all) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }
  // local = parent * T(x,y,z) * R(rx,ry,rz)
  _chain(parent, x, y, z, rx, ry, rz, target) { _q.setFromEuler(_e.set(rx, ry, rz)); _t.compose(_s.set(x, y, z), _q, _s2); return target.multiplyMatrices(parent, _t); }
  pose(z) {
    const T = z.type, i = z.i, s = z.scale, ph = z.phase, dying = z.state === 'dying', mv = z.frozen > 0 ? 0 : z.moving, crawl = !!T.crawl;
    // ---- root
    let pitch = crawl ? 1.36 : 0, roll = 0, yoff = z.climb || 0;
    const fall = dying ? Math.min(1, z.dieT * z.dieT * 5) : 0;
    if (dying && !crawl) pitch = z.dieDir * fall * 1.5; if (dying && crawl) yoff -= Math.max(0, z.dieT - 2.5) * 0.3;
    if (dying && z.dieT > 2.5 && !crawl) yoff -= (z.dieT - 2.5) * 0.25;
    if (!dying && !crawl) { roll = Math.sin(ph) * 0.07 * mv + z.flinch * 0.25; pitch += z.climb ? 0.75 : 0; }
    _q.setFromEuler(_e.set(pitch, z.yaw, roll)); _s.set(s * T.wide, s, s * (T.boom ? 1.45 : 1));
    this.root.compose(_s2.set(z.pos.x, z.pos.y + yoff, z.pos.z), _q, _s);
    _s2.set(1, 1, 1);
    const R = this.root, lean = crawl ? 0.1 : 0.2 + z.swing * 0.3 + (T === undefined ? 0 : 0) + (z.runner ? 0.25 : 0);
    const bob = crawl || dying ? 0 : Math.abs(Math.sin(ph)) * 0.025 * mv;
    // ---- torso, pelvis, head
    this._chain(R, 0, 0.99 + bob, 0, lean, Math.sin(ph) * 0.12 * mv + z.flinch * 0.6, -roll * 0.5, this.torsoM); this.torso.setMatrixAt(i, this.torsoM);
    this._chain(R, 0, 0.95 + bob, 0, lean * 0.3, 0, 0, this.out); this.pelvis.setMatrixAt(i, this.out);
    const nod = dying ? 0.5 * fall * -z.dieDir : Math.sin(ph * 0.5 + i) * 0.08;
    this._chain(this.torsoM, 0, 0.53, 0.012, (crawl ? -1.0 : -lean * 0.5) + nod, Math.sin(ph * 0.31 + i * 1.7) * 0.2, z.tilt, this.headM);
    if (z.headless) { this.head.setMatrixAt(i, ZERO); this.jaw.setMatrixAt(i, ZERO); this.eyes.setMatrixAt(i, ZERO); }
    else {
      this.head.setMatrixAt(i, this.headM); this.eyes.setMatrixAt(i, this.headM);
      this._chain(this.headM, 0, 0.062, 0.012, dying ? 0.5 : 0.25 + 0.2 * Math.abs(Math.sin(ph * 0.8 + i)) + z.swing * 0.4, 0, 0, this.out); this.jaw.setMatrixAt(i, this.out);
    }
    // ---- arms
    for (let k = 0; k < 2; k++) {
      const sg = k ? 1 : -1, idx = i * 2 + k, reach = k ? z.armR : z.armL;
      if (reach < -90) { this.upperArm.setMatrixAt(idx, ZERO); this.forearm.setMatrixAt(idx, ZERO); continue; } // torn off
      let a, el;
      if (dying) { a = -0.5 - fall * 0.8 * sg * 0.3; el = -0.3; }
      else if (crawl) { a = -2.75 + sg * 0.5 * Math.sin(ph); el = -0.5 - 0.4 * Math.sin(ph + sg); }
      else { a = -reach + 0.16 * Math.sin(ph * 0.5 + k * 2.1) + 0.25 * sg * Math.sin(ph) * mv * (1 - reach / 1.5) - z.swing * 1.1 * Math.sin(z.swing * Math.PI); el = -0.25 - reach * 0.25 - z.swing * 0.5; }
      this._chain(this.torsoM, sg * 0.245, 0.425, 0, a, 0, sg * (0.12 + (dying ? fall * 0.6 : 0)), this.limb); this.upperArm.setMatrixAt(idx, this.limb);
      this._chain(this.limb, 0, -0.27, 0, el, 0, 0, this.out); this.forearm.setMatrixAt(idx, this.out);
    }
    // ---- legs
    for (let k = 0; k < 2; k++) {
      const sg = k ? 1 : -1, idx = i * 2 + k, sw = Math.sin(ph + (k ? Math.PI : 0));
      let th = 0, kn = 0.05;
      if (dying) { th = -pitch * 0.25 + sg * 0.12 * fall; kn = 0.5 * fall; }
      else if (crawl) { th = 0.1 * sg; kn = 0.15 + 0.1 * sg; }
      else if (z.climb) { th = -1.1 + 0.5 * sw; kn = 1.2; }
      else { th = -(0.42 * sw) * mv - lean * 0.6; kn = (0.15 + 0.55 * Math.max(0, Math.sin(ph + (k ? Math.PI : 0) + 1.9))) * mv + 0.08; if (z.limp && k === 0) { th *= 0.4; kn = 0.05; } }
      this._chain(R, sg * 0.1, 0.93 + bob, 0, th, 0, sg * 0.03, this.limb); this.thigh.setMatrixAt(idx, this.limb);
      this._chain(this.limb, 0, -0.42, 0, kn, 0, 0, this.out); this.shin.setMatrixAt(idx, this.out);
    }
    // ---- hit zones (world)
    z.head.set(0, 0.125, 0.012).applyMatrix4(this.headM); z.chestA.set(0, 0.3, 0).applyMatrix4(R); z.chestB.set(0, 0.42, 0).applyMatrix4(this.torsoM);
    // ---- shadow
    if (dying && z.dieT > 2.5) this.shadow.setMatrixAt(i, ZERO);
    else { const sx = (z.head.x + z.pos.x) / 2, sz = (z.head.z + z.pos.z) / 2, ss = (crawl || dying ? 1.5 : 0.95) * s * T.wide; this.shadow.setMatrixAt(i, _m.makeScale(ss, 1, ss).setPosition(sx, 0.006, sz)); }
    // ---- colours: fog outside, hit flash, burning, frozen
    const fog = z.fog, f = z.flash;
    const tint = (base, mul = 1) => { _c.copy(base).multiplyScalar(mul); if (z.burn > 0) _c.lerp(EMBER, 0.45); if (z.frozen > 0) _c.lerp(ICE, 0.7); else if (z.chill > 0) _c.lerp(ICE, z.chill * 0.5); if (fog > 0) _c.lerp(FOG, fog); if (f > 0) _c.lerp(WHITE, f * 0.7); return _c; };
    this.torso.setColorAt(i, tint(z.shirt)); this.pelvis.setColorAt(i, tint(z.pants));
    tint(z.skin); this.head.setColorAt(i, _c); this.jaw.setColorAt(i, _c); this.forearm.setColorAt(i * 2, _c); this.forearm.setColorAt(i * 2 + 1, _c);
    tint(z.shirt, 0.92); this.upperArm.setColorAt(i * 2, _c); this.upperArm.setColorAt(i * 2 + 1, _c);
    tint(z.pants); this.thigh.setColorAt(i * 2, _c); this.shin.setColorAt(i * 2 + 1, _c); this.thigh.setColorAt(i * 2 + 1, _c); this.shin.setColorAt(i * 2, _c);
    _c.set(dying ? 0x1a0d0d : T.eye); if (!dying && fog > 0) _c.lerp(_c2.set(T.eye).multiplyScalar(0.75), fog); this.eyes.setColorAt(i, _c);
    this.shadow.setColorAt(i, _c.set(0x000000));
  }
}
const _s2 = new THREE.Vector3(1, 1, 1);

// ---------------------------------------------------------------- pooled effects
export class Particles {
  constructor(scene, n, size, additive, opacity = 1) {
    this.n = n; this.p = new Float32Array(n * 3).fill(-999); this.c = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.g = new Float32Array(n); this.k = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: TEX.soft, vertexColors: true, transparent: true, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, sizeAttenuation: true }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life, grav = 9.8) {
    const i = this.k, j = i * 3; this.k = (i + 1) % this.n;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz; this.c[j] = r; this.c[j + 1] = g; this.c[j + 2] = b; this.life[i] = life; this.g[i] = grav;
  }
  burst(p, n, speed, r, g, b, life, grav = 9.8, up = 1) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = Math.random() * 2 - 1, h = Math.sqrt(1 - e * e), s = speed * (0.3 + Math.random() * 0.7); this.emit(p.x, p.y, p.z, Math.cos(a) * h * s, e * s + up, Math.sin(a) * h * s, r * (0.7 + Math.random() * 0.3), g, b, life * (0.6 + Math.random() * 0.6), grav); } }
  update(dt) {
    const { p, v, life } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt; const j = i * 3;
      if (life[i] <= 0) { p[j + 1] = -999; continue; }
      v[j + 1] -= this.g[i] * dt; p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      if (p[j + 1] < 0.015 && this.g[i] > 0) { p[j + 1] = 0.015; v[j] = v[j + 1] = v[j + 2] = 0; }
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

// Flat textured quads stuck to floors and walls (blood pools, bullet holes).
export class Decals {
  constructor(scene, tex, n, life, opacity = 1) {
    this.n = n; this.k = 0; this.lifeMax = life; this.age = new Float32Array(n).fill(1e9); this.size = new Float32Array(n); this.q = Array.from({ length: n }, () => new THREE.Quaternion()); this.pos = Array.from({ length: n }, () => new THREE.Vector3());
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), n);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, ZERO); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
  }
  add(pos, normal, size) {
    const i = this.k; this.k = (i + 1) % this.n; this.age[i] = 0; this.size[i] = size; this.pos[i].copy(pos).addScaledVector(normal, 0.004);
    this.q[i].setFromUnitVectors(_s.set(0, 0, 1), normal); _q.setFromAxisAngle(_s.set(0, 0, 1), Math.random() * 6.283); this.q[i].multiply(_q);
  }
  clear() { this.age.fill(1e9); for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] > this.lifeMax) continue;
      this.age[i] += dt; const a = this.age[i], grow = Math.min(1, a * 6), fade = Math.min(1, (this.lifeMax - a) / 2), s = this.size[i] * grow * Math.max(0, fade);
      this.mesh.setMatrixAt(i, s > 0 ? _m.compose(this.pos[i], this.q[i], _s.set(s, s, s)) : ZERO);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Spent brass and dropped magazines.
export class Debris {
  constructor(scene, n) {
    this.n = n; this.k = 0; this.it = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), life: 0 }));
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x886622, shininess: 60 }), n);
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, WHITE); } this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  spawn(pos, vel, sx, sy, sz, color) {
    const d = this.it[this.k], i = this.k; this.k = (i + 1) % this.n;
    d.p.copy(pos); d.v.copy(vel); d.s.set(sx, sy, sz); d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); d.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20); d.life = 6; d.bounced = 0;
    this.mesh.setColorAt(i, _c.set(color)); this.mesh.instanceColor.needsUpdate = true; return d;
  }
  update(dt, onBounce) {
    for (let i = 0; i < this.n; i++) {
      const d = this.it[i]; if (d.life <= 0) continue;
      d.life -= dt; if (d.life <= 0) { this.mesh.setMatrixAt(i, ZERO); continue; }
      const floor = d.s.x * 0.5 + 0.002;
      if (d.p.y > floor || d.v.y > 0) {
        d.v.y -= 9.8 * dt; d.p.addScaledVector(d.v, dt); d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
        if (d.p.y <= floor && d.v.y < 0) { d.p.y = floor; if (Math.abs(d.v.y) > 0.6 && d.bounced < 3) { d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.bounced++; if (onBounce) onBounce(d); } else { d.v.set(0, 0, 0); d.r.x = Math.PI / 2; d.r.z = 0; } }
      }
      const k = d.life < 1 ? d.life : 1;
      this.mesh.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(d.r), _s.copy(d.s).multiplyScalar(k)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Glowing segments: energy beams, lightning, rail trails. Not used for ordinary bullets.
export class GlowSegs {
  constructor(scene, n) {
    this.n = n; this.k = 0; this.it = Array.from({ length: n }, () => ({ a: new THREE.Vector3(), q: new THREE.Quaternion(), len: 0, w: 0, life: 0, max: 1 }));
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, WHITE); } this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; scene.add(this.mesh);
  }
  seg(a, b, color, width, life) {
    const s = this.it[this.k], i = this.k; this.k = (i + 1) % this.n;
    s.a.copy(a); _s.copy(b).sub(a); s.len = _s.length(); if (s.len < 1e-4) return; s.q.setFromUnitVectors(_zAxis, _s.multiplyScalar(1 / s.len)); s.w = width; s.life = s.max = life;
    this.mesh.setColorAt(i, _c.set(color)); this.mesh.instanceColor.needsUpdate = true;
  }
  // jagged lightning from a to b
  bolt(a, b, color, width, life, jag = 0.18) {
    const n = Math.max(3, Math.min(9, Math.round(a.distanceTo(b) / 0.45))); let px = a.x, py = a.y, pz = a.z;
    for (let i = 1; i <= n; i++) {
      const u = i / n, j = i === n ? 0 : jag, x = a.x + (b.x - a.x) * u + (Math.random() - 0.5) * j, y = a.y + (b.y - a.y) * u + (Math.random() - 0.5) * j, z = a.z + (b.z - a.z) * u + (Math.random() - 0.5) * j;
      this.seg(_bA.set(px, py, pz), _bB.set(x, y, z), color, width, life); px = x; py = y; pz = z;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const s = this.it[i]; if (s.life <= 0) continue;
      s.life -= dt; if (s.life <= 0) { this.mesh.setMatrixAt(i, ZERO); continue; }
      const w = s.w * (s.life / s.max); this.mesh.setMatrixAt(i, _m.compose(s.a, s.q, _s.set(w, w, s.len)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const _zAxis = new THREE.Vector3(0, 0, 1), _bA = new THREE.Vector3(), _bB = new THREE.Vector3();

// ---------------------------------------------------------------- gun models
// Side profiles extruded with a bevel. u = metres forward of the hand, v = metres up. Forward is -Z.
const K = 0x1b1c1f, GM = 0x363a42, ST = 0x9299a3, WD = 0x6e4526, TN = 0x9a8a63, OL = 0x454e37, WH = 0xd9dee4;
const matCache = new Map();
const phong = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshPhongMaterial({ color: c, specular: c === WD ? 0x111111 : 0x666666, shininess: c === WD ? 8 : 45 })); return matCache.get(c); };

function builder(glowColor) {
  const root = new THREE.Group(), roles = { slide: [], mag: [], pump: [], drum: [], glow: [], spin: null, disc: [] };
  const glowMat = new THREE.MeshBasicMaterial({ color: glowColor || 0xffffff });
  let spinV = 0;
  const add = (mesh, role) => {
    if (role === 'spin') { if (!roles.spin) { roles.spin = new THREE.Group(); roles.spin.position.y = spinV; root.add(roles.spin); } mesh.position.y -= spinV; roles.spin.add(mesh); }
    else { root.add(mesh); if (role && roles[role]) roles[role].push(mesh); }
    mesh.userData.home = mesh.position.clone(); return mesh;
  };
  const mat = (col) => (col === 'glow' ? glowMat : phong(col));
  const g = {
    root, roles, glowMat, muzzle: [0.2, 0.03], ejectAt: [0.02, 0.05], bladeFrom: 0,
    P(pts, th, col, role) {
      const sh = new THREE.Shape(); pts.forEach(([u, v], i) => (i ? sh.lineTo(u, v) : sh.moveTo(u, v))); sh.closePath();
      const bv = Math.min(0.0028, th * 0.28);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: th - bv * 2, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 1, steps: 1 }).translate(0, 0, -(th - bv * 2) / 2).rotateY(Math.PI / 2);
      return add(new THREE.Mesh(geo, mat(col)), role);
    },
    B(u0, u1, v0, v1, th, col, role) { return g.P([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], th, col, role); },
    C(u0, u1, v, r, col, role, x = 0, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, u1 - u0, seg).rotateX(Math.PI / 2), mat(col)); m.position.set(x, v, -(u0 + u1) / 2); return add(m, role); },
    grip(u, len, w, th, col, rake = 0.035) { return g.P([[u, 0.004], [u - w, 0.004], [u - w - rake, -len], [u - rake, -len]], th, col); },
    X(mesh, role) { return add(mesh, role); },
    spinAxis(v) { spinV = v; },
    guard(u0 = 0.0, u1 = 0.05) { g.B(u0, u1, -0.034, -0.028, 0.012, K); g.B(u1 - 0.006, u1, -0.034, 0.0, 0.012, K); },
  };
  return g;
}
const MODELS = {
  pistol(g) { g.B(-0.055, 0.125, 0.014, 0.048, 0.027, GM, 'slide'); g.B(-0.05, 0.118, -0.006, 0.016, 0.025, K); g.grip(0, 0.1, 0.05, 0.028, K); g.B(-0.088, -0.03, -0.112, -0.098, 0.03, ST, 'mag'); g.guard(); g.C(0.118, 0.132, 0.031, 0.0065, K); g.B(-0.05, -0.04, 0.048, 0.055, 0.012, K); g.B(0.108, 0.116, 0.048, 0.055, 0.006, K); g.B(-0.03, 0.02, 0.02, 0.044, 0.029, K, 'slide'); g.muzzle = [0.134, 0.031]; g.ejectAt = [0.02, 0.05]; },
  revolver(g) { g.B(-0.045, 0.055, 0.0, 0.058, 0.024, ST); g.C(0.0, 0.048, 0.03, 0.026, GM, 'drum'); g.C(0.055, 0.21, 0.04, 0.0095, ST); g.B(0.055, 0.2, 0.014, 0.032, 0.013, ST); g.grip(-0.012, 0.105, 0.045, 0.032, WD, 0.045); g.B(-0.058, -0.04, 0.05, 0.072, 0.009, GM, 'slide'); g.guard(0.0, 0.05); g.B(0.195, 0.203, 0.05, 0.062, 0.005, K); g.muzzle = [0.212, 0.04]; },
  sawed(g) { g.C(0.04, 0.32, 0.036, 0.0125, GM, null, 0.0135); g.C(0.04, 0.32, 0.036, 0.0125, GM, null, -0.0135); g.B(-0.07, 0.06, 0.0, 0.058, 0.05, GM); g.B(0.06, 0.2, 0.004, 0.024, 0.044, WD); g.grip(-0.03, 0.12, 0.052, 0.036, WD, 0.06); g.guard(-0.02, 0.04); g.B(-0.05, -0.03, 0.058, 0.07, 0.03, ST, 'slide'); g.muzzle = [0.322, 0.036]; },
  smg(g) { g.B(-0.09, 0.17, 0.0, 0.056, 0.036, GM); g.C(0.17, 0.25, 0.03, 0.0095, K); g.C(0.2, 0.25, 0.03, 0.015, K); g.P([[0.065, 0], [0.1, 0], [0.105, -0.18], [0.07, -0.18]], 0.022, K, 'mag'); g.grip(0, 0.095, 0.046, 0.03, K); g.guard(); g.B(-0.22, -0.09, 0.036, 0.046, 0.012, K); g.B(-0.232, -0.215, -0.035, 0.052, 0.024, K); g.B(-0.07, 0.15, 0.056, 0.064, 0.016, K); g.B(0.02, 0.06, 0.03, 0.044, 0.046, ST, 'slide'); g.muzzle = [0.252, 0.03]; },
  nailer(g) { g.B(-0.07, 0.13, 0.0, 0.085, 0.052, 0xd9a514); g.B(-0.05, 0.1, 0.085, 0.1, 0.03, K); g.B(0.13, 0.185, 0.012, 0.052, 0.026, ST); g.P([[0.075, 0], [0.115, 0], [0.07, -0.16], [0.03, -0.16]], 0.02, ST, 'mag'); g.grip(-0.02, 0.105, 0.046, 0.036, K); g.C(-0.12, -0.07, 0.042, 0.027, K); g.B(0.0, 0.11, 0.03, 0.055, 0.054, K); g.guard(); g.muzzle = [0.187, 0.032]; },
  pump(g) { g.B(-0.1, 0.1, 0.0, 0.062, 0.04, GM); g.C(0.1, 0.54, 0.047, 0.0115, GM); g.C(0.1, 0.48, 0.02, 0.0115, K); g.B(0.2, 0.36, -0.002, 0.042, 0.048, WD, 'pump'); g.P([[-0.1, 0.058], [-0.1, 0.004], [-0.32, -0.045], [-0.32, 0.034]], 0.036, WD); g.grip(-0.012, 0.09, 0.046, 0.032, K, 0.04); g.guard(); g.B(0.5, 0.51, 0.058, 0.07, 0.005, K); g.muzzle = [0.542, 0.047]; g.ejectAt = [0.03, 0.05]; },
  dmr(g) { g.B(-0.1, 0.17, 0.0, 0.062, 0.036, TN); g.C(0.17, 0.64, 0.036, 0.009, K); g.B(0.17, 0.42, 0.01, 0.058, 0.042, TN); g.C(0.62, 0.68, 0.036, 0.0145, K); g.C(-0.05, 0.17, 0.1, 0.021, K); g.C(0.15, 0.19, 0.1, 0.026, K); g.C(-0.07, -0.05, 0.1, 0.024, K); g.B(-0.02, 0.0, 0.062, 0.082, 0.014, K); g.B(0.1, 0.12, 0.062, 0.082, 0.014, K); g.B(0.05, 0.1, -0.1, 0.0, 0.024, K, 'mag'); g.P([[-0.1, 0.062], [-0.1, 0.0], [-0.36, -0.035], [-0.36, 0.05]], 0.034, TN); g.grip(-0.01, 0.09, 0.046, 0.03, K); g.guard(); g.B(0.0, 0.05, 0.036, 0.05, 0.046, ST, 'slide'); g.muzzle = [0.682, 0.036]; g.ejectAt = [0.03, 0.05]; },
  ar(g) { g.B(-0.1, 0.19, 0.02, 0.072, 0.035, GM); g.B(-0.08, 0.1, -0.012, 0.022, 0.03, K); g.B(0.19, 0.43, 0.012, 0.064, 0.044, K); g.C(0.43, 0.55, 0.039, 0.0085, K); g.C(0.53, 0.575, 0.039, 0.012, K); g.P([[0.04, -0.012], [0.095, -0.012], [0.118, -0.18], [0.062, -0.18]], 0.024, GM, 'mag'); g.B(-0.31, -0.1, 0.022, 0.048, 0.022, K); g.P([[-0.31, 0.068], [-0.31, -0.045], [-0.255, -0.045], [-0.225, 0.068]], 0.035, K); g.B(0.385, 0.398, 0.064, 0.1, 0.01, K); g.C(0.0, 0.07, 0.098, 0.018, K); g.B(0.02, 0.05, 0.072, 0.082, 0.02, K); g.grip(-0.01, 0.095, 0.046, 0.03, K); g.guard(); g.B(0.02, 0.07, 0.04, 0.056, 0.042, ST, 'slide'); g.muzzle = [0.577, 0.039]; g.ejectAt = [0.04, 0.055]; },
  lmg(g) { g.B(-0.13, 0.15, -0.012, 0.092, 0.092, GM); g.spinAxis(0.04); for (let i = 0; i < 6; i++) g.X(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.36, 7).rotateX(Math.PI / 2), phong(K)), {}), 'spin').position.set(Math.cos(i * 1.047) * 0.03, Math.sin(i * 1.047) * 0.03, -0.33); g.C(0.3, 0.32, 0.04, 0.046, K, 'spin'); g.C(0.47, 0.5, 0.04, 0.046, K, 'spin'); g.B(-0.02, 0.1, -0.15, -0.012, 0.075, OL, 'mag'); g.B(-0.06, 0.08, 0.115, 0.13, 0.02, K); g.B(-0.06, -0.045, 0.09, 0.118, 0.02, K); g.B(0.065, 0.08, 0.09, 0.118, 0.02, K); g.grip(-0.04, 0.095, 0.046, 0.032, K); g.muzzle = [0.51, 0.04]; g.ejectAt = [0.05, -0.01]; },
  gl(g) { g.B(-0.09, 0.09, 0.0, 0.072, 0.042, OL); g.C(0.0, 0.11, 0.022, 0.058, GM, 'drum'); g.C(0.11, 0.35, 0.042, 0.027, K); g.C(0.33, 0.36, 0.042, 0.031, K); g.B(-0.28, -0.09, 0.02, 0.05, 0.026, K); g.B(-0.3, -0.28, -0.03, 0.062, 0.034, K); g.B(0.2, 0.245, -0.075, 0.016, 0.032, K); g.grip(-0.02, 0.095, 0.046, 0.032, K); g.B(0.0, 0.01, 0.072, 0.11, 0.01, K); g.muzzle = [0.362, 0.042]; },
  xbow(g) { g.B(-0.26, 0.32, 0.0, 0.036, 0.03, WD); for (const sg of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.022), phong(K)); l.position.set(sg * 0.14, 0.03, -0.27); l.rotation.y = sg * 0.42; g.X(l); const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.003, 0.003), phong(WH)); st.position.set(sg * 0.14, 0.04, -0.14); st.rotation.y = -sg * 0.5; g.X(st); } g.C(0.02, 0.36, 0.046, 0.0045, ST, 'mag'); g.C(0.34, 0.38, 0.046, 0.009, 0xd0661e, 'mag'); g.C(-0.06, 0.08, 0.085, 0.016, K); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.guard(); g.muzzle = [0.38, 0.046]; },
  flame(g) { g.C(-0.11, 0.13, -0.05, 0.046, 0xb3441c, 'mag'); g.C(-0.125, -0.11, -0.05, 0.03, ST, 'mag'); g.B(-0.09, 0.21, 0.0, 0.052, 0.042, GM); g.C(0.21, 0.48, 0.03, 0.0135, K); g.B(0.25, 0.41, 0.008, 0.056, 0.046, K); g.C(0.46, 0.5, 0.01, 0.006, ST); g.C(0.47, 0.5, 0.03, 0.018, K); g.grip(-0.01, 0.095, 0.046, 0.03, K); g.guard(); g.muzzle = [0.5, 0.03]; },
  plasma(g) { g.P([[-0.13, 0.0], [-0.13, 0.072], [0.1, 0.09], [0.31, 0.064], [0.31, 0.018], [0.1, -0.004]], 0.046, WH); g.B(0.08, 0.35, 0.024, 0.052, 0.03, K); g.B(-0.09, 0.27, 0.036, 0.046, 0.05, 'glow', 'glow'); g.C(0.35, 0.37, 0.038, 0.023, K); g.C(0.375, 0.39, 0.038, 0.018, 'glow', 'glow'); g.C(0.395, 0.41, 0.038, 0.013, K); g.B(0.0, 0.075, -0.075, 0.0, 0.032, K, 'mag'); g.B(0.012, 0.062, -0.065, -0.01, 0.036, 'glow', 'mag'); g.grip(-0.03, 0.095, 0.046, 0.03, K); g.muzzle = [0.412, 0.038]; },
  lance(g) { g.B(-0.11, 0.21, 0.0, 0.062, 0.038, WH); g.B(0.21, 0.62, 0.052, 0.064, 0.016, K); g.B(0.21, 0.62, 0.006, 0.018, 0.016, K); g.C(0.21, 0.6, 0.035, 0.0065, 'glow', 'glow'); g.C(0.6, 0.64, 0.035, 0.017, 'glow', 'glow'); g.C(0.3, 0.31, 0.035, 0.022, K); g.C(0.45, 0.46, 0.035, 0.022, K); g.C(-0.09, 0.03, -0.032, 0.029, K, 'mag'); g.B(-0.08, 0.18, 0.062, 0.07, 0.012, 'glow', 'glow'); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.muzzle = [0.642, 0.035]; },
  arc(g) { g.B(-0.11, 0.17, 0.0, 0.072, 0.046, 0x3a3f4a); for (const u of [0.19, 0.25, 0.31, 0.37]) g.C(u, u + 0.014, 0.036, 0.036, 0xb87333); g.C(0.17, 0.41, 0.036, 0.013, K); for (let i = 0; i < 3; i++) g.C(0.41, 0.5, 0.036 + Math.sin(i * 2.094) * 0.022, 0.0035, ST, null, Math.cos(i * 2.094) * 0.022); g.X(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), g.glowMat)), 'glow').position.set(0, 0.036, -0.47); g.C(-0.07, 0.07, 0.092, 0.02, 'glow', 'glow'); g.B(0.02, 0.085, -0.065, 0.0, 0.032, K, 'mag'); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.muzzle = [0.5, 0.036]; },
  cryo(g) { g.B(-0.09, 0.15, 0.0, 0.066, 0.046, WH); g.C(-0.07, 0.11, 0.098, 0.031, 'glow', 'mag'); g.C(-0.085, -0.07, 0.098, 0.034, K, 'mag'); g.C(0.11, 0.125, 0.098, 0.034, K, 'mag'); g.C(0.15, 0.31, 0.036, 0.02, ST); g.C(0.31, 0.35, 0.036, 0.033, ST); g.C(0.345, 0.358, 0.036, 0.027, 'glow', 'glow'); g.B(0.0, 0.1, 0.02, 0.04, 0.05, K); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.guard(); g.muzzle = [0.36, 0.036]; },
  rail(g) { g.B(0.1, 0.72, 0.056, 0.072, 0.022, GM); g.B(0.1, 0.72, 0.0, 0.016, 0.022, GM); g.B(0.12, 0.7, 0.03, 0.042, 0.009, 'glow', 'glow'); for (const u of [0.2, 0.36, 0.52, 0.68]) g.B(u, u + 0.02, -0.004, 0.076, 0.03, K); g.B(-0.15, 0.13, -0.006, 0.078, 0.046, 0x1e3350); g.C(-0.11, 0.09, 0.104, 0.019, 'glow', 'glow'); g.P([[-0.15, 0.07], [-0.15, 0.0], [-0.36, -0.03], [-0.36, 0.05]], 0.034, K); g.B(0.02, 0.085, -0.085, 0, 0.032, K, 'mag'); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.muzzle = [0.722, 0.036]; },
  disc(g) { g.B(-0.09, 0.13, 0.0, 0.062, 0.042, 0x5a4632); g.B(0.13, 0.31, 0.02, 0.032, 0.12, K); g.X(new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.006, 16), g.glowMat), 'disc').position.set(0, 0.044, -0.24); g.X(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10), phong(K)), 'disc').position.set(0, 0.044, -0.24); g.B(0.0, 0.06, -0.07, 0, 0.05, K, 'mag'); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.guard(); g.muzzle = [0.32, 0.044]; },
  orb(g) { g.P([[-0.15, 0.0], [-0.15, 0.092], [0.05, 0.112], [0.21, 0.09], [0.21, 0.0], [0.05, -0.02]], 0.062, 0x2a2333); for (const [u, r] of [[0.23, 0.052], [0.29, 0.042], [0.35, 0.032]]) g.C(u, u + 0.012, 0.046, r, K, null, 0, 16); g.X(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), g.glowMat), 'glow').position.set(0, 0.046, -0.29); g.B(-0.1, 0.16, 0.05, 0.062, 0.066, 'glow', 'glow'); g.C(-0.11, 0.0, -0.042, 0.03, 'glow', 'mag'); g.C(-0.12, -0.11, -0.042, 0.033, K, 'mag'); g.grip(-0.02, 0.095, 0.046, 0.03, K); g.muzzle = [0.38, 0.046]; },
  machete(g) { g.B(-0.07, 0.06, -0.016, 0.016, 0.03, K); g.B(0.06, 0.076, -0.032, 0.036, 0.036, GM); g.P([[0.076, -0.022], [0.076, 0.022], [0.5, 0.04], [0.6, 0.012], [0.62, -0.012], [0.5, -0.028]], 0.0045, ST); g.muzzle = [0.62, 0]; g.bladeFrom = 0.08; },
  katana(g) { g.B(-0.11, 0.06, -0.015, 0.015, 0.028, K); g.C(0.06, 0.085, 0, 0.032, ST); g.C(-0.125, -0.11, 0, 0.02, ST); g.P([[0.085, -0.013], [0.085, 0.013], [0.8, 0.009], [0.87, 0], [0.8, -0.009]], 0.007, 'glow', 'glow'); g.muzzle = [0.87, 0]; g.bladeFrom = 0.09; },
};

export function buildGun(w, tier = 0) {
  const base = w.glow || 0xffffff, g = builder(tier === 2 ? 0xff5ad1 : tier === 1 ? 0xffb347 : base);
  MODELS[w.id](g);
  if (tier > 0 && !w.glow) { // overclocked ballistic guns grow a glowing spine
    const [mu, mv] = g.muzzle; g.B(-0.04, Math.max(0.08, mu - 0.03), mv + 0.02, mv + 0.026, 0.012, 'glow', 'glow');
  }
  g.root.userData = { roles: g.roles, glowMat: g.glowMat, muzzle: g.muzzle, ejectAt: g.ejectAt, bladeFrom: g.bladeFrom };
  return g.root;
}
