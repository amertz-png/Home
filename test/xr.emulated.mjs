// Drives both apps through a real WebXR session using Meta's IWER emulator (Quest 3 profile).
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(process.env.NODE_GLOBAL || '/usr/lib/node_modules/')('playwright');
const iwer = fs.readFileSync(process.argv[2] + '/node_modules/iwer/build/iwer.min.js', 'utf8');
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
async function open(url) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(iwer + ';const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d; d.position.set(0, 1.6, 0);');
  await pg.goto(url); await pg.waitForTimeout(1200);
  return { pg, errs };
}
// ---- zombies in immersive-ar ----
{
  const { pg, errs } = await open('http://localhost:8765/zombies/');
  await pg.click('#enter-ar'); await pg.waitForTimeout(1500);
  const s1 = await pg.evaluate(() => ({ state: window.__z.G.state, presenting: window.__z.renderer.xr.isPresenting, blend: window.__z.renderer.xr.getSession()?.environmentBlendMode }));
  await pg.waitForTimeout(6000);
  const s2 = await pg.evaluate(() => { const z = window.__z, d = window.__xr; d.controllers.right.position.set(0.25, 1.3, -0.3); d.controllers.left.position.set(-0.25, 1.3, -0.3); return { state: z.G.state, breaches: z.breaches.length, hands: z.hands.map((h) => h.ctrl.connected + ':' + h.ctrl.handedness + ':' + h.wi) }; });
  await pg.waitForTimeout(500);
  const ammo0 = await pg.evaluate(() => { const z = window.__z; window.__xr.controllers.right.updateButtonValue('trigger', 1); return z.hands.map((h) => h.st[h.wi].ammo); });
  await pg.waitForTimeout(400);
  const ammo1 = await pg.evaluate(() => { const z = window.__z, c = window.__xr.controllers.right; c.updateButtonValue('trigger', 0); c.updateAxes('thumbstick', 1, 0); return z.hands.map((h) => h.st[h.wi].ammo); });
  await pg.waitForTimeout(300);
  const wi = await pg.evaluate(() => { window.__xr.controllers.right.updateAxes('thumbstick', 0, 0); return window.__z.hands.map((h) => h.ctrl.handedness + ':' + window.__z.WEAPONS[h.wi].name); });
  await pg.waitForTimeout(12000);
  const s3 = await pg.evaluate(() => ({ state: window.__z.G.state, wave: window.__z.G.wave, alive: window.__z.alive }));
  await pg.screenshot({ path: process.argv[2] + '/xr-z.png' });
  console.log('zombies AR:', JSON.stringify({ s1, s2, ammo0, ammo1, wi, s3, errs: errs.slice(0, 5) }));
  await pg.close();
}
// ---- golf in immersive-vr ----
{
  const { pg, errs } = await open('http://localhost:8765/golf/');
  await pg.click('#enter-vr'); await pg.waitForTimeout(2500);
  // hold the right controller like a club pointing down at the ball, keep still, then sweep through
  const r = await pg.evaluate(async () => {
    const g = window.__golf, d = window.__xr, c = d.controllers.right, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    g.setMode('putt'); await sleep(300);
    const st = g.stage; st.updateMatrixWorld(true);
    const toWorld = (x, y, z) => new g.THREE.Vector3(x, y, z).applyMatrix4(st.matrixWorld);
    // putter straight down: grip 0.86 m above the head, shaft along -Z of the controller => pitch -90deg
    c.quaternion.set(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    const aim = g.P.ideal.aim, sp = g.P.ideal.speed / 1.6, dx = Math.sin(aim), dz = -Math.cos(aim);
    // calibrate: where does the club head actually end up for a commanded controller position?
    const tipOf = () => { let tip = null; g.clubHand.grip.traverse((o) => { if (o.type === 'Object3D' && o.parent && o.parent.children.length === 4) tip = o; }); const v = new g.THREE.Vector3(); tip.getWorldPosition(v); return st.worldToLocal(v); };
    let p0 = toWorld(0, 0.89, -0.3 * dz); c.position.set(p0.x, p0.y, p0.z); await sleep(300);
    const tl = tipOf(), off = { x: tl.x - 0, y: tl.y - 0.03, z: tl.z - -0.3 * dz };
    const t0 = performance.now();
    while (performance.now() - t0 < 1600) {
      const u = (performance.now() - t0) / 1000, s = u < 0.8 ? -0.3 : -0.3 + (u - 0.8) * sp;
      const p = toWorld(dx * s - off.x, 0.89 - off.y, dz * s - off.z + (-0.3 * dz - 0) * 0); c.position.set(p.x, p.y, p.z); await sleep(8);
    }
    await sleep(6000);
    return { off, demo: g.S.demo, mode: g.S.mode, clubParented: !!g.clubHand, last: g.P.last, attempts: g.P.attempts, makes: g.P.makes, stage: [st.position.x.toFixed(2), st.position.z.toFixed(2), st.rotation.y.toFixed(2)] };
  });
  await pg.screenshot({ path: process.argv[2] + '/xr-g.png' });
  console.log('golf VR:', JSON.stringify({ r, errs: errs.slice(0, 5) }));
  await pg.close();
}
await b.close();
