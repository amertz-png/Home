// Pure golf maths (no three.js, no DOM) so it can be unit-tested in Node.
// Coordinates are "stage local": ball starts at the origin, target line is -Z, Y is up, metres/seconds.

const G = 9.81;
const len3 = (x, y, z) => Math.hypot(x, y, z);

// ---------------- Swing tempo detector ----------------
// Feed it the club-head and hand positions every frame. It emits:
//   {type:'ready'}  club settled behind the ball
//   {type:'start'}  takeaway detected
//   {type:'top'}    transition detected
//   {type:'swing', back, down, ratio, headSpeed, hit, vx, vy, vz}  at impact (or whiff)
//   {type:'reset'}  swing abandoned
export class TempoDetector {
  constructor(opts = {}) {
    this.o = Object.assign({
      addressRadius: 0.4,   // head must be this close (horizontal) to the ball to address it
      stillSpeed: 0.3,      // m/s head speed counted as "still"
      stillTime: 0.35,      // s of stillness to arm
      startSpeed: 0.5,      // m/s head speed that starts a backswing
      minBack: 0.25,        // s minimum backswing before a top can be detected
      minRise: 0.3,         // m the head must rise above address before a top can be detected
      hitRadius: 0.1,       // m head-to-ball distance that counts as contact
    }, opts);
    this.reset();
  }
  reset() {
    this.state = 'idle'; this.buf = []; this.stillSince = -1; this.lastStill = 0;
    this.t0 = 0; this.t1 = 0; this.addr = null; this.minHand = Infinity; this.minHandT = 0;
    this.peakBack = 0; this.peakHead = 0; this.prevD = Infinity; this.closeT = 0; this.closeV = null; this.followUntil = 0;
  }
  // head, hand, ball: {x,y,z}
  feed(t, head, hand, ball) {
    const b = this.buf;
    b.push({ t, hx: head.x, hy: head.y, hz: head.z, ax: hand.x, ay: hand.y, az: hand.z });
    while (b.length > 2 && t - b[0].t > 0.25) b.shift();
    if (b.length < 3) return null;
    // velocity over roughly the last 35 ms
    let k = b.length - 2;
    while (k > 0 && t - b[k].t < 0.03) k--;
    const p = b[k], dt = Math.max(1e-4, t - p.t);
    const vx = (head.x - p.hx) / dt, vy = (head.y - p.hy) / dt, vz = (head.z - p.hz) / dt;
    const headSpeed = len3(vx, vy, vz);
    const handSpeed = len3((hand.x - p.ax) / dt, (hand.y - p.ay) / dt, (hand.z - p.az) / dt);
    const dxz = Math.hypot(head.x - ball.x, head.z - ball.z);
    const d3 = len3(head.x - ball.x, head.y - ball.y, head.z - ball.z);
    const o = this.o;

    switch (this.state) {
      case 'idle': {
        const settled = dxz < o.addressRadius && head.y < 0.4 && headSpeed < o.stillSpeed;
        if (!settled) { this.stillSince = -1; return null; }
        if (this.stillSince < 0) this.stillSince = t;
        if (t - this.stillSince >= o.stillTime) {
          this.state = 'ready'; this.lastStill = t;
          this.addr = { hx: head.x, hy: head.y, hz: head.z, ay: hand.y };
          return { type: 'ready' };
        }
        return null;
      }
      case 'ready': {
        if (headSpeed < o.stillSpeed * 0.7) {
          this.lastStill = t;
          this.addr = { hx: head.x, hy: head.y, hz: head.z, ay: hand.y };
        }
        const moved = len3(head.x - this.addr.hx, head.y - this.addr.hy, head.z - this.addr.hz);
        if (headSpeed > o.startSpeed && moved > 0.06) {
          this.state = 'back'; this.t0 = this.lastStill;
          this.minHand = Infinity; this.peakBack = 0;
          return { type: 'start' };
        }
        if (dxz > o.addressRadius * 1.6 && headSpeed < o.startSpeed) { this.state = 'idle'; this.stillSince = -1; }
        return null;
      }
      case 'back': {
        if (t - this.t0 > 3.5) { this.reset(); return { type: 'reset' }; }
        this.peakBack = Math.max(this.peakBack, handSpeed);
        const risen = head.y - this.addr.hy > o.minRise || hand.y - this.addr.ay > o.minRise * 0.6;
        if (t - this.t0 > o.minBack && risen) {
          if (handSpeed < this.minHand) { this.minHand = handSpeed; this.minHandT = t; }
          // transition: hands slowed right down, then are clearly accelerating again
          if (this.minHand < Math.max(0.6, this.peakBack * 0.5) && handSpeed > this.minHand + 0.7 && handSpeed > this.minHand * 1.6) {
            this.state = 'down'; this.t1 = this.minHandT; this.peakHead = 0; this.prevD = d3; this.closeT = t; this.closeV = null;
            return { type: 'top' };
          }
        }
        return null;
      }
      case 'down': {
        if (t - this.t1 > 1.6) { this.reset(); return { type: 'reset' }; }
        this.peakHead = Math.max(this.peakHead, headSpeed);
        // closest approach of this frame's head segment to the ball
        const q = b[b.length - 2];
        const sx = head.x - q.hx, sy = head.y - q.hy, sz = head.z - q.hz, sl = sx * sx + sy * sy + sz * sz;
        let u = sl > 0 ? ((ball.x - q.hx) * sx + (ball.y - q.hy) * sy + (ball.z - q.hz) * sz) / sl : 0;
        u = Math.max(0, Math.min(1, u));
        const cd = len3(q.hx + sx * u - ball.x, q.hy + sy * u - ball.y, q.hz + sz * u - ball.z);
        const hit = cd < o.hitRadius;
        if (cd < this.prevD) { this.prevD = cd; this.closeT = q.t + (t - q.t) * u; this.closeV = { vx, vy, vz, s: headSpeed }; }
        // whiff: head came low and near, and is now moving away again
        const whiff = !hit && this.closeV && this.prevD < 0.45 && d3 > this.prevD + 0.25;
        if (hit || whiff) {
          const t2 = hit ? q.t + (t - q.t) * u : this.closeT;
          const v = hit ? { vx, vy, vz, s: headSpeed } : this.closeV;
          const back = this.t1 - this.t0, down = Math.max(0.02, t2 - this.t1);
          this.state = 'follow'; this.followUntil = t + 0.9;
          return { type: 'swing', back, down, ratio: back / down, headSpeed: v.s, peakHead: this.peakHead, hit, vx: v.vx, vy: v.vy, vz: v.vz };
        }
        return null;
      }
      case 'follow':
        if (t >= this.followUntil) { this.state = 'idle'; this.stillSince = -1; }
        return null;
    }
    return null;
  }
}

// Tour-tempo style presets: frames at 30 fps (backswing / downswing)
export const TEMPOS = [
  { name: '21/7', back: 21 / 30, down: 7 / 30 },
  { name: '24/8', back: 24 / 30, down: 8 / 30 },
  { name: '27/9', back: 27 / 30, down: 9 / 30 },
];

export function tempoVerdict(ratio) {
  if (ratio >= 2.7 && ratio <= 3.3) return { text: 'Smooth — right on 3:1', good: true };
  if (ratio < 2.7) return { text: ratio < 2.2 ? 'Rushed backswing — slow the takeaway' : 'A touch quick going back', good: false };
  return { text: ratio > 3.8 ? 'Long backswing or snatched transition' : 'A touch slow going back', good: false };
}

// ---------------- Full-swing ball flight (estimate) ----------------
export const CLUBS = [
  { name: 'Driver', length: 1.14, smash: 1.45, launch: 12, cl: 0.17 },
  { name: '7 Iron', length: 0.94, smash: 1.33, launch: 18, cl: 0.19 },
  { name: 'Wedge', length: 0.89, smash: 1.16, launch: 28, cl: 0.2 },
];

// Returns {points:[{x,y,z,t}], carry (m), side (m, + = right of target), apex, time}
export function simulateFlight(headSpeed, dirX, dirZ, club) {
  const speed = headSpeed * club.smash, la = club.launch * Math.PI / 180;
  const hl = Math.hypot(dirX, dirZ) || 1;
  let vx = (dirX / hl) * speed * Math.cos(la), vz = (dirZ / hl) * speed * Math.cos(la), vy = speed * Math.sin(la);
  let x = 0, y = 0.02, z = 0, t = 0, apex = 0;
  const k = 1.2 * Math.PI * 0.02135 * 0.02135 / (2 * 0.0459), cd = 0.24, dt = 1 / 120;
  const points = [{ x, y, z, t }];
  while (t < 12) {
    const v = len3(vx, vy, vz), vh = Math.hypot(vx, vz) || 1e-6;
    const lift = k * club.cl * v * v * Math.min(1, v / 30); // lift fades as the ball slows
    // lift acts perpendicular to velocity, in the vertical plane of travel
    const ax = -k * cd * v * vx - lift * (vy / v) * (vx / vh);
    const az = -k * cd * v * vz - lift * (vy / v) * (vz / vh);
    const ay = -G - k * cd * v * vy + lift * (vh / v);
    vx += ax * dt; vy += ay * dt; vz += az * dt;
    x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
    apex = Math.max(apex, y);
    if (y <= 0) { y = 0; points.push({ x, y, z, t }); break; }
    if (points.length < 400 && Math.round(t / dt) % 4 === 0) points.push({ x, y, z, t });
  }
  return { points, carry: Math.hypot(x, z), forward: -z, side: x, apex, time: t, ballSpeed: speed };
}

// ---------------- Putting ----------------
export const HOLE_R = 0.054;
export const BALL_R = 0.02135;

// Deceleration of a rolling ball for a given stimpmeter reading (feet).
export function stimpDecel(stimpFt) { return (1.83 * 1.83) / (2 * stimpFt * 0.3048); }

// green: {decel, ax, az}  (ax, az = downhill acceleration from slope)
export function makeGreen(stimpFt, slopePct, downhillX, downhillZ) {
  const a = (5 / 7) * G * (slopePct / 100), l = Math.hypot(downhillX, downhillZ) || 1;
  return { decel: stimpDecel(stimpFt), ax: a * downhillX / l, az: a * downhillZ / l, stimp: stimpFt, slope: slopePct };
}

// Advance a ball {x,z,vx,vz} by dt. Returns false once it has stopped.
export function stepBall(b, dt, green) {
  const v = Math.hypot(b.vx, b.vz);
  if (v < 0.015) { b.vx = 0; b.vz = 0; return false; }
  const dv = green.decel * dt;
  const f = Math.max(0, v - dv) / v;
  b.vx = b.vx * f + green.ax * dt; b.vz = b.vz * f + green.az * dt;
  b.x += b.vx * dt; b.z += b.vz * dt;
  return true;
}

// Does a ball at distance d from the hole centre, moving at speed v, drop?
export function captured(d, v) {
  if (d > HOLE_R) return false;
  const u = d / HOLE_R;
  return v < 1.45 * (1 - u * u) + 0.12;
}

// Roll a putt out. hole: {x,z}. Returns the outcome with measurements used for feedback.
export function simulatePutt(start, vx, vz, green, hole, { capture = true, keepPath = true } = {}) {
  const b = { x: start.x, z: start.z, vx, vz }, dt = 1 / 240;
  const hx = hole.x - start.x, hz = hole.z - start.z, D = Math.hypot(hx, hz) || 1e-6, ux = hx / D, uz = hz / D;
  const path = keepPath ? [{ x: b.x, z: b.z }] : null;
  let holed = false, crossed = false, lateralAtLine = 0, speedAtLine = 0, t = 0, n = 0, minD = Infinity;
  let prevAlong = 0, prevLat = 0;
  while (t < 30) {
    const moving = stepBall(b, dt, green);
    t += dt; n++;
    const rx = b.x - start.x, rz = b.z - start.z;
    const along = rx * ux + rz * uz, lat = rx * -uz + rz * ux; // lat > 0 = right of the ball→hole line
    const d = Math.hypot(b.x - hole.x, b.z - hole.z);
    minD = Math.min(minD, d);
    if (!crossed && along >= D) {
      crossed = true;
      const f = (D - prevAlong) / Math.max(1e-9, along - prevAlong);
      lateralAtLine = prevLat + (lat - prevLat) * f;
      speedAtLine = Math.hypot(b.vx, b.vz);
    }
    prevAlong = along; prevLat = lat;
    if (capture && captured(d, Math.hypot(b.vx, b.vz))) { holed = true; b.x = hole.x; b.z = hole.z; if (path) path.push({ x: b.x, z: b.z }); break; }
    if (path && n % 8 === 0) path.push({ x: b.x, z: b.z });
    if (!moving) break;
  }
  if (path && !holed) path.push({ x: b.x, z: b.z });
  const ex = b.x - start.x, ez = b.z - start.z;
  return {
    holed, path, end: { x: b.x, z: b.z }, time: t, minD, crossed, lateralAtLine, speedAtLine,
    endAlong: ex * ux + ez * uz - D,           // + = finished past the hole
    endLateral: ex * -uz + ez * ux,            // + = right
    distance: D,
  };
}

// Find the start direction and speed that hole the putt and would finish ~35 cm past on a miss.
export function solveIdeal(start, hole, green, pastM = 0.35) {
  const hx = hole.x - start.x, hz = hole.z - start.z, base = Math.atan2(hx, -hz); // angle from -Z, + toward +X
  const vTarget = Math.sqrt(2 * green.decel * pastM);
  const run = (aim, speed) => simulatePutt(start, Math.sin(aim) * speed, -Math.cos(aim) * speed, green, hole, { capture: false, keepPath: false });
  let aim = base, speed = Math.sqrt(2 * green.decel * (Math.hypot(hx, hz) + pastM));
  for (let round = 0; round < 6; round++) {
    let lo = 0.1, hi = 9;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2, r = run(aim, mid);
      if (r.crossed && r.speedAtLine > vTarget) hi = mid; else lo = mid;
    }
    speed = (lo + hi) / 2;
    let a0 = aim - 0.6, a1 = aim + 0.6; // lateral increases with aim
    for (let i = 0; i < 22; i++) {
      const mid = (a0 + a1) / 2, r = run(mid, speed);
      const lat = r.crossed ? r.lateralAtLine : r.endLateral;
      if (lat > 0) a1 = mid; else a0 = mid;
    }
    aim = (a0 + a1) / 2;
  }
  const vx = Math.sin(aim) * speed, vz = -Math.cos(aim) * speed;
  const sim = simulatePutt(start, vx, vz, green, hole, { capture: false });
  return { aim, base, speed, vx, vz, path: sim.path, breakDeg: (aim - base) * 180 / Math.PI };
}
