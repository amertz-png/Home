import { createRequire } from 'node:module'; const { chromium } = createRequire(process.env.NODE_GLOBAL || '/usr/lib/node_modules/')('playwright');
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('http://localhost:8765/zombies/?bot=1'); await pg.waitForTimeout(6000);
// jump to a busy wave so every weapon has targets
await pg.evaluate(() => { const z = window.__z; z.G.wave = 5; });
const res = [];
for (let wi = 0; wi < 10; wi++) {
  const before = await pg.evaluate((wi) => { const z = window.__z; z.selectWeapon(z.hands[0], wi); return z.G.kills; }, wi);
  await pg.waitForTimeout(7000);
  if (wi === 7 || wi === 8 || wi === 6) await pg.screenshot({ path: out + '/z-w' + wi + '.png' });
  const r = await pg.evaluate(() => { const z = window.__z; return { kills: z.G.kills, wave: z.G.wave, hp: Math.round(z.G.hp), alive: z.alive, fps: 0 }; });
  res.push(WEAPONS_NAME(wi) + ': +' + (r.kills - before) + ' kills, wave ' + r.wave + ', hp ' + r.hp + ', alive ' + r.alive);
}
function WEAPONS_NAME(i) { return ['Pistol', 'Revolver', 'SMG', 'Shotgun', 'AR', 'Minigun', 'Railgun', 'GL', 'Flame', 'Machete'][i]; }
console.log(res.join('\n'));
// now stop doing damage: the horde must break in and finish the player
await pg.evaluate(() => { const z = window.__z; z.WEAPONS.forEach((w) => { w.dmg = 0; }); z.opt.bot = false; z.hands[0].trig = false; });
let last; const t0 = Date.now(); const seen = new Set();
while (Date.now() - t0 < 120000) {
  await pg.waitForTimeout(3000);
  last = await pg.evaluate(() => { const z = window.__z; return { state: z.G.state, hp: Math.round(z.G.hp), alive: z.alive, st: z.zombies.filter((q) => q.state !== 'dead').map((q) => q.state), planks: z.breaches.map((b) => b.planks.filter((p) => p.hp > 0).length).join('') }; });
  last.st.forEach((s) => seen.add(s));
  if (last.state === 'over') break;
}
await pg.screenshot({ path: out + '/z-over.png' });
console.log('no-damage run ->', JSON.stringify({ state: last.state, hp: last.hp, planks: last.planks }), 'states seen:', [...seen].join(','), 'in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
console.log('errors:', errs.slice(0, 6)); await b.close();
