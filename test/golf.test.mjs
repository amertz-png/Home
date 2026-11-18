import assert from 'node:assert/strict';
import { TempoDetector, simulateFlight, CLUBS, makeGreen, simulatePutt, solveIdeal, stimpDecel } from '../golf/physics.js';

// Synthetic swing: head/hand trajectory with known backswing/downswing times.
export function fakeSwing(tb, td, { club = 1.0, miss = 0 } = {}) {
  // angle of the club in the swing plane: 0 at address (pointing down), grows to 3.4 rad at the top.
  const smooth = (u) => u * u * (3 - 2 * u);
  return (t) => { // t = seconds since takeaway; negative = still at address
    let ang;
    if (t <= 0) ang = 0;
    else if (t < tb) ang = 3.4 * smooth(t / tb);
    else if (t < tb + td) { const u = (t - tb) / td; ang = 3.4 * (1 - u * u); }
    else { const u = t - tb - td; ang = -Math.min(3.2, (2 * 3.4 / td) * u * (1 - Math.min(0.9, u * 1.5) / 2)); }
    // hands move on a small arc, head on a big one (swing plane = Y/Z, slightly raised hands)
    const hand = { x: -0.55 + miss, y: 0.85 + 0.45 * (1 - Math.cos(ang * 0.7)), z: 0.35 * Math.sin(ang * 0.7) };
    const head = { x: hand.x + 0.55 * Math.cos(ang * 0.25), y: hand.y - club * Math.cos(ang) * 0.83, z: hand.z + club * Math.sin(ang) };
    return { head, hand };
  };
}

function runSwing(tb, td, opts) {
  const det = new TempoDetector(), f = fakeSwing(tb, td, opts), ball = { x: 0, y: 0.02, z: 0 };
  const a = f(-1).head; ball.x = a.x - (opts?.miss || 0); ball.y = Math.max(0.02, a.y); ball.z = a.z;
  const events = [];
  for (let i = 0; i < 90 * 4; i++) {
    const t = i / 90, s = f(t - 1.0);
    const e = det.feed(t, s.head, s.hand, ball);
    if (e) events.push(e);
  }
  return events;
}

for (const [tb, td] of [[0.7, 7 / 30], [0.8, 8 / 30], [0.9, 0.3], [1.1, 0.3]]) {
  const ev = runSwing(tb, td);
  const types = ev.map((e) => e.type);
  assert.deepEqual(types.slice(0, 4), ['ready', 'start', 'top', 'swing'], `sequence for ${tb}/${td}: ${types}`);
  const s = ev.find((e) => e.type === 'swing');
  assert.ok(s.hit, 'should hit the ball');
  assert.ok(Math.abs(s.back - tb) < 0.09, `back ${s.back.toFixed(3)} vs ${tb}`);
  assert.ok(Math.abs(s.down - td) < 0.06, `down ${s.down.toFixed(3)} vs ${td}`);
  console.log(`tempo ${tb.toFixed(2)}/${td.toFixed(2)} -> back ${s.back.toFixed(2)} down ${s.down.toFixed(2)} ratio ${s.ratio.toFixed(2)} head ${s.headSpeed.toFixed(1)} m/s`);
}
// A swing that passes 25 cm from the ball is a whiff but still timed
{
  const ev = runSwing(0.8, 8 / 30, { miss: 0.25 });
  const s = ev.find((e) => e.type === 'swing');
  assert.ok(s && !s.hit, 'whiff detected');
}
// Standing still never fires
{
  const det = new TempoDetector(); let n = 0;
  for (let i = 0; i < 400; i++) { const e = det.feed(i / 90, { x: 0, y: 0.03, z: 0.05 }, { x: -0.5, y: 0.9, z: 0 }, { x: 0, y: 0.02, z: 0 }); if (e && e.type !== 'ready') n++; }
  assert.equal(n, 0);
}

// Ball flight sanity: carry in a believable range
const yd = (m) => m / 0.9144;
const drv = simulateFlight(46, 0, -1, CLUBS[0]), i7 = simulateFlight(38, 0, -1, CLUBS[1]), wd = simulateFlight(33, 0, -1, CLUBS[2]);
console.log(`driver 103mph -> ${yd(drv.carry).toFixed(0)} yd, apex ${drv.apex.toFixed(0)} m | 7i 85mph -> ${yd(i7.carry).toFixed(0)} yd | wedge 74mph -> ${yd(wd.carry).toFixed(0)} yd`);
assert.ok(yd(drv.carry) > 215 && yd(drv.carry) < 275, 'driver carry');
assert.ok(yd(i7.carry) > 140 && yd(i7.carry) < 185, '7i carry');
assert.ok(yd(wd.carry) > 85 && yd(wd.carry) < 135, 'wedge carry');
assert.ok(Math.abs(drv.side) < 0.01);

// Putting: stimp definition holds on a flat green
{
  const g = makeGreen(10, 0, 1, 0), r = simulatePutt({ x: 0, z: 0 }, 0, -1.83, g, { x: 5, z: 50 });
  assert.ok(Math.abs(-r.end.z - 10 * 0.3048) < 0.05, `stimp roll ${-r.end.z}`);
  assert.ok(Math.abs(stimpDecel(10) - 0.549) < 0.01);
}
// Ideal line holes the putt for every setting, and breaks the right way
for (const ft of [3, 6, 10, 15, 20]) for (const slope of [0, 1, 2, 3]) for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const stimp of [9, 11, 13]) {
  const g = makeGreen(stimp, slope, dir[0], dir[1]), hole = { x: 0, z: -ft * 0.3048 };
  const s = solveIdeal({ x: 0, z: 0 }, hole, g);
  const r = simulatePutt({ x: 0, z: 0 }, s.vx, s.vz, g, hole);
  assert.ok(r.holed, `ideal putt should drop: ${ft}ft ${slope}% dir ${dir} stimp ${stimp} (minD ${r.minD.toFixed(3)})`);
  if (slope > 0 && dir[0] !== 0) assert.ok(Math.sign(s.breakDeg) === -dir[0], 'aim uphill of the hole');
}
// A straight putt hit dead weight at the hole drops; one hit far too hard lips out
{
  const g = makeGreen(10, 0, 1, 0), hole = { x: 0, z: -3 };
  assert.ok(simulatePutt({ x: 0, z: 0 }, 0, -Math.sqrt(2 * g.decel * 3.2), g, hole).holed);
  assert.ok(!simulatePutt({ x: 0, z: 0 }, 0, -4.5, g, hole).holed);
}
console.log('golf physics OK');
