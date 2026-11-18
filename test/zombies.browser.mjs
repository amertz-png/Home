// Self-playing desktop run: loads the game with ?bot=1 and reports state every few seconds.
import { createRequire } from 'node:module'; const { chromium } = createRequire(process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules/')('playwright');
const out = process.argv[2], N = Number(process.argv[3] || 5), url = process.env.URL || 'http://localhost:8766';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(url + '/zombies/?bot=1'); await pg.waitForTimeout(1500);
const snap = () => pg.evaluate(() => { const z = window.__z; return { state: z.G.state, round: z.G.round, hp: Math.round(z.G.hp), pts: z.G.points, kills: z.G.kills, alive: z.alive, open: z.R.openings.length, st: z.R.stations.length, zs: z.zombies.filter((q) => q.state !== 'dead').map((q) => q.state[0] + ':' + q.typeName).join(',') }; });
const log = [];
for (let i = 0; i < N; i++) { await pg.waitForTimeout(5000); log.push(await snap()); await pg.screenshot({ path: `${out}/z-${i}.png` }); }
console.log(log.map((l) => JSON.stringify(l)).join('\n')); console.log('errors:', errs.slice(0, 8)); await b.close();
