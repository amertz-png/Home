// Shared WebXR helpers for the Quest apps: session start, controllers, canvas panels, synth audio.
import * as THREE from 'three';

export function makeRenderer({ alpha = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0';
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function fitToWindow(renderer, camera) {
  const fit = () => {
    if (renderer.xr.isPresenting) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', fit);
  fit();
}

export async function xrSupport() {
  const out = { ar: false, vr: false };
  if (!navigator.xr) return out;
  try { out.ar = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* unsupported */ }
  try { out.vr = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* unsupported */ }
  return out;
}

export async function startXR(renderer, mode, { optional = [], depth = false, foveation = 1 } = {}) {
  const init = { requiredFeatures: ['local-floor'], optionalFeatures: [...optional] };
  if (depth) {
    init.optionalFeatures.push('depth-sensing');
    init.depthSensing = { usagePreference: ['gpu-optimized'], dataFormatPreference: ['unsigned-short', 'float32'] };
  }
  const session = await navigator.xr.requestSession(mode, init);
  renderer.xr.setFoveation(foveation);
  await renderer.xr.setSession(session);
  return session;
}

// ---------- Controllers ----------
// Wraps the two XR controllers and exposes per-frame button state with edge detection.
export class Controllers {
  constructor(renderer, parent) {
    this.renderer = renderer;
    this.hands = [];
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const h = {
        index: i, ray, grip, connected: false, handedness: 'none', gamepad: null,
        trig: false, trigDown: false, trigUp: false, trigValue: 0,
        squeeze: false, squeezeDown: false,
        a: false, aDown: false, b: false, bDown: false,
        sx: 0, sy: 0, flickX: 0, flickY: 0, _fx: 0, _fy: 0,
      };
      ray.addEventListener('connected', (e) => {
        h.connected = true; h.handedness = e.data.handedness; h.gamepad = e.data.gamepad || null;
      });
      ray.addEventListener('disconnected', () => { h.connected = false; h.gamepad = null; });
      parent.add(ray); parent.add(grip);
      this.hands.push(h);
    }
  }
  byHand(side) { return this.hands.find((h) => h.connected && h.handedness === side) || null; }
  update() {
    for (const h of this.hands) {
      const gp = h.gamepad;
      const btn = (i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
      const trig = btn(0), squeeze = btn(1), a = btn(4), b = btn(5);
      h.trigDown = trig && !h.trig; h.trigUp = !trig && h.trig; h.trig = trig;
      h.trigValue = gp && gp.buttons[0] ? gp.buttons[0].value : 0;
      h.squeezeDown = squeeze && !h.squeeze; h.squeeze = squeeze;
      h.aDown = a && !h.a; h.a = a;
      h.bDown = b && !h.b; h.b = b;
      h.sx = gp && gp.axes.length > 3 ? gp.axes[2] : 0;
      h.sy = gp && gp.axes.length > 3 ? gp.axes[3] : 0;
      // flick: fires once (-1 / +1) when the stick crosses 0.6, re-arms below 0.3
      const fx = Math.abs(h.sx) > 0.6 ? Math.sign(h.sx) : Math.abs(h.sx) < 0.3 ? 0 : h._fx;
      h.flickX = fx !== 0 && h._fx === 0 ? fx : 0; h._fx = fx;
      const fy = Math.abs(h.sy) > 0.6 ? Math.sign(h.sy) : Math.abs(h.sy) < 0.3 ? 0 : h._fy;
      h.flickY = fy !== 0 && h._fy === 0 ? fy : 0; h._fy = fy;
    }
  }
  pulse(h, strength = 0.5, ms = 40) {
    const act = h && h.gamepad && h.gamepad.hapticActuators && h.gamepad.hapticActuators[0];
    if (act && act.pulse) { try { act.pulse(Math.min(1, strength), ms); } catch { /* no haptics */ } }
  }
}

// ---------- Canvas text panels ----------
export function makePanel(wMeters, hMeters, pxPerMeter = 800, { transparent = true, depthTest = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(wMeters * pxPerMeter); canvas.height = Math.round(hMeters * pxPerMeter);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent, depthTest, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wMeters, hMeters), mat);
  return { mesh, canvas, ctx, tex, w: canvas.width, h: canvas.height, wm: wMeters, hm: hMeters, dirty() { tex.needsUpdate = true; } };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// A panel with clickable buttons, driven by a controller ray.
// draw(ctx, panel) paints the background/content; buttons are {x,y,w,h,label,onClick,on?:()=>bool} in canvas px.
export class UIPanel {
  constructor(wm, hm, pxPerMeter = 800) {
    this.p = makePanel(wm, hm, pxPerMeter);
    this.mesh = this.p.mesh;
    this.buttons = [];
    this.draw = null;
    this.hover = null;
    this.theme = { bg: 'rgba(14,20,18,0.92)', btn: '#22312b', btnOn: '#2f8f5b', btnHover: '#3b5247', text: '#eef5f0', dim: '#9db3a7' };
    this._ray = new THREE.Ray(); this._inv = new THREE.Matrix4(); this._pt = new THREE.Vector3();
    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.cursor.renderOrder = 10; this.cursor.visible = false;
    this.mesh.add(this.cursor);
  }
  redraw() {
    const { ctx, w, h } = this.p, t = this.theme;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = t.bg; roundRect(ctx, 0, 0, w, h, 28); ctx.fill();
    if (this.draw) this.draw(ctx, this.p);
    for (const b of this.buttons) {
      const on = b.on ? b.on() : false;
      ctx.fillStyle = on ? t.btnOn : (this.hover === b ? t.btnHover : t.btn);
      roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fill();
      ctx.fillStyle = t.text; ctx.font = `600 ${b.font || 26}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(typeof b.label === 'function' ? b.label() : b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
    this.p.dirty();
  }
  // origin/dir in world space. Returns hit distance or -1. Call click() on trigger edge.
  pointAt(origin, dir) {
    this.mesh.updateWorldMatrix(true, false);
    this._inv.copy(this.mesh.matrixWorld).invert();
    this._ray.origin.copy(origin).applyMatrix4(this._inv);
    this._ray.direction.copy(dir).transformDirection(this._inv);
    const o = this._ray.origin, d = this._ray.direction;
    let hit = null, dist = -1;
    if (Math.abs(d.z) > 1e-5) {
      const t = -o.z / d.z;
      if (t > 0) {
        const x = o.x + d.x * t, y = o.y + d.y * t;
        if (Math.abs(x) <= this.p.wm / 2 && Math.abs(y) <= this.p.hm / 2) {
          dist = t;
          this.cursor.position.set(x, y, 0.002);
          const px = (x / this.p.wm + 0.5) * this.p.w, py = (0.5 - y / this.p.hm) * this.p.h;
          hit = this.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
        }
      }
    }
    this.cursor.visible = dist > 0;
    if (hit !== this.hover) { this.hover = hit; this.redraw(); }
    return dist;
  }
  click() { if (this.hover && this.hover.onClick) { this.hover.onClick(); this.redraw(); return true; } return false; }
}

// ---------- Synth audio (no asset files) ----------
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.noise = null; }
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  _out(pos) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.2; p.rolloffFactor = 1.1;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.master);
    return p;
  }
  setListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener, e = camera.matrixWorld.elements;
    if (l.positionX) {
      l.positionX.value = e[12]; l.positionY.value = e[13]; l.positionZ.value = e[14];
      l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
      l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
    }
  }
  tone(freq, dur = 0.12, { type = 'sine', gain = 0.3, when = 0, slideTo = 0, pos = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.t + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this._out(pos)); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  burst(dur = 0.15, { gain = 0.5, freq = 1800, q = 0.7, type = 'lowpass', slideTo = 0, when = 0, pos = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.t + when, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; s.loop = true; s.loopStart = Math.random();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this._out(pos)); s.start(t0, Math.random()); s.stop(t0 + dur + 0.02);
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
