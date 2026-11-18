import { createRequire } from 'node:module'; const { chromium } = createRequire(process.env.NODE_GLOBAL || '/usr/lib/node_modules/')('playwright');
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('http://localhost:8765/zombies/?bot=1'); await pg.waitForTimeout(1000);
const snap = () => pg.evaluate(() => { const z = window.__z; return { state: z.G.state, wave: z.G.wave, hp: Math.round(z.G.hp), score: z.G.score, kills: z.G.kills, heads: z.G.heads, alive: z.alive, t: +z.G.t.toFixed(1), states: z.zombies.filter((q) => q.state !== 'dead').map((q) => q.state + ':' + q.typeName).join(',') }; });
const log = [];
for (let i = 0; i < Number(process.argv[3] || 6); i++) {
  await pg.waitForTimeout(5000); log.push(await snap());
  if (i === 2) await pg.screenshot({ path: out + '/z-1.png' });
  if (i === 3) await pg.evaluate(() => { const z = window.__z; z.selectWeapon(z.hands[0], Number(new URLSearchParams(location.search).get('w') || 4)); });
}
await pg.screenshot({ path: out + '/z-2.png' });
console.log(log.map((l) => JSON.stringify(l)).join('\n')); console.log('errors:', errs.slice(0, 6)); await b.close();
