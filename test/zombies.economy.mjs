// Exercises points, wall buys, the crate, overclocking, perks, every weapon, power-ups and game over.
import { createRequire } from 'node:module'; const { chromium } = createRequire(process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules/')('playwright');
import assert from 'node:assert/strict';
const out = process.argv[2] || '.', url = process.env.URL || 'http://localhost:8766';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(url + '/zombies/?bot=1'); await pg.waitForTimeout(1500);
const ev = (f, a) => pg.evaluate(f, a);
// --- buying
const buy = await ev(() => {
  const z = window.__z, h = z.hands[0], G = z.G, st = (k, id) => z.R.stations.find((s) => s.kind === k && (!id || s.id === id)), r = {};
  r.start = { pts: G.points, inv: G.inv.map((i) => z.WEAPONS[i.wi].id) };
  G.points = 100; z.interact(st('w', 'smg'), h); r.poor = { pts: G.points, has: G.inv.some((i) => i.wi === z.WI.smg) };
  G.points = 20000; z.interact(st('w', 'smg'), h); r.smg = { pts: G.points, held: z.WEAPONS[G.inv[h.slot].wi].id, ammo: G.inv[h.slot].ammo };
  z.interact(st('w', 'pump'), h); z.interact(st('w', 'ar'), h); z.interact(st('w', 'revolver'), h); r.bag = G.inv.map((i) => z.WEAPONS[i.wi].id);
  const before = G.points; z.interact(st('bench'), h); z.interact(st('bench'), h); z.interact(st('bench'), h); r.bench = { spent: before - G.points, tier: G.inv[h.slot].tier, mag: G.inv[h.slot].ammo };
  G.points = 50000; for (const id of ['iron', 'hands', 'overdrive', 'wind', 'pockets']) if (st('perk', id)) z.interact(st('perk', id), h); r.perks = Object.keys(G.perks); r.hp = G.maxHp;
  G.points = 5000; z.interact(st('crate'), h); r.crateBusy = st('crate').busy > 0; r.stations = z.R.stations.map((s) => s.kind + ':' + (s.id || ''));
  return r;
});
await pg.waitForTimeout(3200);
const crate = await ev(() => { const z = window.__z; return { inv: z.G.inv.map((i) => z.WEAPONS[i.wi].id), pts: z.G.points }; });
console.log(JSON.stringify(buy)); console.log('after crate', JSON.stringify(crate));
assert.deepEqual(buy.start.inv, ['pistol', 'machete']); assert.equal(buy.poor.has, false); assert.equal(buy.poor.pts, 100);
assert.equal(buy.smg.held, 'smg'); assert.equal(buy.smg.pts, 19000); assert.equal(buy.bench.spent, 15000); assert.equal(buy.bench.tier, 2);
assert.ok(buy.bag.filter((x) => x !== 'machete').length === 3, 'three-gun bag'); assert.equal(buy.hp, 220); assert.ok(buy.crateBusy);
assert.equal(crate.pts, 5000 - 950); assert.ok(crate.inv.length >= 5, 'deep pockets allows a fourth gun');
// --- every weapon, on a busy round
await ev(() => { const z = window.__z; z.G.round = 6; z.G.hp = 1e7; z.G.maxHp = 1e7; });
const res = [];
for (const id of ['pistol', 'revolver', 'sawed', 'smg', 'nailer', 'pump', 'dmr', 'ar', 'flame', 'plasma', 'gl', 'lmg', 'xbow', 'disc', 'cryo', 'lance', 'arc', 'rail', 'orb']) {
  const k0 = await ev((id) => { const z = window.__z, h = z.hands[0]; z.G.inv = [{ wi: z.WI[id], tier: 0, ammo: 0, reserve: 0 }]; const it = z.giveWeapon(z.WI[id], h); it.reserve = 9999; return z.G.kills; }, id);
  await pg.waitForTimeout(6000);
  if (['arc', 'orb', 'plasma', 'cryo', 'lance', 'flame'].includes(id)) await pg.screenshot({ path: `${out}/w-${id}.png` });
  const r = await ev(() => { const z = window.__z; return { kills: z.G.kills, pts: z.G.points, round: z.G.round, alive: z.alive }; });
  res.push(`${id}:+${r.kills - k0}`);
}
console.log(res.join(' '));
// --- stop shooting: they must break in and end the run (Second Wind fires first)
await ev(() => { const z = window.__z; z.opt.bot = false; z.hands[0].trig = false; z.G.maxHp = 100; z.G.hp = 100; z.G.perks = { wind: true }; z.WEAPONS.forEach((w) => { w.dmg = 0; }); });
let last; const t0 = Date.now(); let sawWind = false;
while (Date.now() - t0 < 150000) { await pg.waitForTimeout(2500); last = await ev(() => { const z = window.__z; return { state: z.G.state, hp: Math.round(z.G.hp), wind: !!z.G.perks.wind, menu: z.menu.visible && z.menu.page }; }); if (!last.wind) sawWind = true; if (last.state === 'over') break; }
await pg.screenshot({ path: `${out}/z-over.png` });
console.log('undefended ->', JSON.stringify(last), 'second wind used:', sawWind, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
assert.equal(last.state, 'over'); assert.equal(last.menu, 'over'); assert.ok(sawWind);
console.log('errors:', errs.slice(0, 8)); assert.equal(errs.length, 0); await b.close(); console.log('economy OK');
