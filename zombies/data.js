// Game data for Breach Night — pure data so the page and tests can read it too.

// kind: hitscan | proj | cone | beam | chain | melee
// price: wall-buy cost (0 = starting gear). crate: can come out of the Mystery Crate.
// reserve: spare magazines carried (Infinity = never runs out).
export const WEAPONS = [
  { id: 'pistol', name: 'P-9 Sidearm', kind: 'hitscan', cls: 'ballistic', price: 0, crate: false, auto: false, rpm: 450, dmg: 30, pellets: 1, spread: 0.006, mag: 12, reserve: Infinity, reload: 1.1, range: 40, kick: 0.6, note: 'Starting pistol. Never runs out of spare magazines.', snd: { f: 2600, d: 0.09, low: 190 } },
  { id: 'machete', name: 'Machete', kind: 'melee', cls: 'melee', price: 0, crate: false, dmg: 150, range: 0.6, mag: 0, reserve: 0, reload: 0, rpm: 0, kick: 0, note: 'Starting blade. Swing it — melee kills pay the most.', snd: { f: 900, d: 0.08, low: 0 } },
  { id: 'revolver', name: 'Bulldog .44', kind: 'hitscan', cls: 'ballistic', price: 750, crate: true, auto: false, rpm: 170, dmg: 125, pellets: 1, spread: 0.004, mag: 6, reserve: 8, reload: 1.7, range: 50, kick: 1.3, pierce: 1, note: 'Hand cannon. Punches through two.', snd: { f: 1500, d: 0.16, low: 110 } },
  { id: 'sawed', name: 'Twin Barrel', kind: 'hitscan', cls: 'ballistic', price: 900, crate: true, auto: false, rpm: 260, dmg: 24, pellets: 14, spread: 0.11, mag: 2, reserve: 20, reload: 1.3, range: 9, kick: 1.6, note: 'Two shells, fourteen pellets each.', snd: { f: 900, d: 0.24, low: 80 } },
  { id: 'smg', name: 'Viper SMG', kind: 'hitscan', cls: 'ballistic', price: 1000, crate: true, auto: true, rpm: 850, dmg: 18, pellets: 1, spread: 0.022, mag: 32, reserve: 6, reload: 1.3, range: 30, kick: 0.35, note: 'Fast and light.', snd: { f: 3000, d: 0.06, low: 220 } },
  { id: 'nailer', name: 'Nailer', kind: 'hitscan', cls: 'ballistic', price: 1100, crate: true, auto: true, rpm: 520, dmg: 22, pellets: 1, spread: 0.012, mag: 50, reserve: 5, reload: 1.6, range: 25, kick: 0.25, pin: 1.2, note: 'Framing nails. Every hit pins a zombie in place.', snd: { f: 4200, d: 0.04, low: 300 } },
  { id: 'pump', name: 'Ripsaw 12G', kind: 'hitscan', cls: 'ballistic', price: 1200, crate: true, auto: false, rpm: 75, dmg: 22, pellets: 9, spread: 0.07, mag: 6, reserve: 8, reload: 1.9, range: 12, kick: 1.4, note: 'Pump shotgun. Clears a doorway.', snd: { f: 1100, d: 0.22, low: 90 } },
  { id: 'dmr', name: 'Longshot DMR', kind: 'hitscan', cls: 'ballistic', price: 1600, crate: true, auto: false, rpm: 230, dmg: 150, pellets: 1, spread: 0.002, mag: 10, reserve: 6, reload: 1.7, range: 60, kick: 1.0, pierce: 2, note: 'Marksman rifle. Pierces three.', snd: { f: 1800, d: 0.14, low: 120 } },
  { id: 'ar', name: 'Warden AR', kind: 'hitscan', cls: 'ballistic', price: 1800, crate: true, auto: true, rpm: 600, dmg: 32, pellets: 1, spread: 0.012, mag: 30, reserve: 7, reload: 1.5, range: 50, kick: 0.45, note: 'Balanced automatic rifle.', snd: { f: 2200, d: 0.08, low: 160 } },
  { id: 'katana', name: 'Plasma Edge', kind: 'melee', cls: 'energy', price: 2000, crate: true, dmg: 420, range: 0.85, mag: 0, reserve: 0, reload: 0, rpm: 0, kick: 0, glow: 0x66e0ff, note: 'Energy blade. Cuts through anything it touches.', snd: { f: 2400, d: 0.1, low: 0 } },
  { id: 'flame', name: 'Dragon', kind: 'cone', cls: 'ballistic', price: 2500, crate: true, auto: true, rpm: 1300, dmg: 110, drain: 22, spread: 0.2, mag: 100, reserve: 3, reload: 2.0, range: 4.4, kick: 0.1, note: 'Flamethrower. Burns over time.', snd: { f: 700, d: 0.12, low: 0 } },
  { id: 'plasma', name: 'Plasma Repeater', kind: 'proj', proj: 'plasma', cls: 'energy', price: 2800, crate: true, auto: true, rpm: 420, dmg: 85, radius: 0.9, speed: 22, mag: 40, reserve: 4, reload: 1.8, range: 40, kick: 0.3, glow: 0x5dff9a, note: 'Bolts of green plasma that splash on impact.', snd: { f: 1900, d: 0.12, low: 420, slide: 0.3 } },
  { id: 'gl', name: 'Thumper', kind: 'proj', proj: 'grenade', cls: 'ballistic', price: 3000, crate: true, auto: false, rpm: 70, dmg: 260, radius: 2.4, speed: 15, mag: 6, reserve: 4, reload: 2.2, range: 30, kick: 1.2, note: 'Grenade launcher. 2.4 m blast.', snd: { f: 500, d: 0.18, low: 80 } },
  { id: 'lmg', name: 'Hailstorm', kind: 'hitscan', cls: 'ballistic', price: 3500, crate: true, auto: true, rpm: 1400, dmg: 16, pellets: 1, spread: 0.03, mag: 150, reserve: 3, reload: 3.0, range: 35, kick: 0.22, spin: 0.45, note: 'Rotary cannon. Spins up, then shreds.', snd: { f: 2600, d: 0.045, low: 240 } },
  { id: 'xbow', name: 'Boltcaster', kind: 'proj', proj: 'bolt', cls: 'ballistic', price: 0, crate: true, auto: false, rpm: 80, dmg: 300, radius: 2.0, speed: 30, mag: 5, reserve: 5, reload: 1.8, range: 40, kick: 0.5, note: 'Crossbow. Bolts stick, beep, then detonate.', snd: { f: 600, d: 0.1, low: 150 } },
  { id: 'disc', name: 'Ripper', kind: 'proj', proj: 'disc', cls: 'energy', price: 0, crate: true, auto: false, rpm: 120, dmg: 190, speed: 16, bounces: 5, mag: 8, reserve: 4, reload: 1.6, range: 30, kick: 0.6, glow: 0xffb13a, note: 'Saw disc that ricochets between up to six zombies.', snd: { f: 3200, d: 0.14, low: 500, slide: 2 } },
  { id: 'cryo', name: 'Cryo Blaster', kind: 'cone', cone: 'cryo', cls: 'energy', price: 0, crate: true, auto: true, rpm: 1300, dmg: 25, drain: 20, spread: 0.24, mag: 100, reserve: 3, reload: 2.0, range: 5, kick: 0.1, glow: 0x8fe9ff, note: 'Freezes zombies solid. Frozen ones shatter in one hit.', snd: { f: 5200, d: 0.12, low: 0 } },
  { id: 'lance', name: 'Photon Lance', kind: 'beam', cls: 'energy', price: 0, crate: true, auto: true, rpm: 1300, dmg: 90, drain: 14, mag: 100, reserve: 3, reload: 1.9, range: 40, kick: 0.05, glow: 0xff4fd8, note: 'Continuous beam. Damage ramps up the longer you hold.', snd: { f: 1200, d: 0.1, low: 0 } },
  { id: 'arc', name: 'Arc Caster', kind: 'chain', cls: 'energy', price: 0, crate: true, auto: false, rpm: 110, dmg: 220, chain: 6, mag: 10, reserve: 4, reload: 1.9, range: 14, kick: 0.9, glow: 0x7fd4ff, note: 'Lightning that jumps to six more zombies.', snd: { f: 6000, d: 0.25, low: 70 } },
  { id: 'rail', name: 'Railgun', kind: 'hitscan', cls: 'energy', price: 0, crate: true, auto: false, rpm: 50, dmg: 480, pellets: 1, spread: 0, mag: 4, reserve: 5, reload: 2.0, range: 60, kick: 1.3, pierce: 99, beam: true, glow: 0x4fc3ff, note: 'Pierces every zombie in the line.', snd: { f: 5200, d: 0.3, low: 60 } },
  { id: 'orb', name: 'Singularity Projector', kind: 'proj', proj: 'orb', cls: 'energy', price: 0, crate: true, auto: false, rpm: 30, dmg: 200, radius: 3.6, speed: 9, mag: 2, reserve: 3, reload: 2.6, range: 30, kick: 1.0, glow: 0xb06bff, note: 'Opens a small black hole that drags the horde in, then implodes.', snd: { f: 300, d: 0.5, low: 40 } },
];
export const WI = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));

// Wall-mounted things, in the order they claim wall space. w:<id> = weapon buy.
export const WALL_ORDER = ['w:smg', 'crate', 'w:pump', 'perk:iron', 'w:ar', 'bench', 'perk:hands', 'w:revolver', 'perk:wind', 'w:dmr', 'perk:overdrive', 'w:sawed', 'w:flame', 'perk:pockets', 'w:nailer', 'w:plasma', 'w:katana', 'w:gl', 'w:lmg'];
export const CRATE_PRICE = 950;
export const BENCH_PRICES = [5000, 10000]; // Overclock tier 1, tier 2
export const BENCH_MULT = [1, 2, 3.2];
export const AMMO_PRICE_FRAC = 0.4;

export const PERKS = {
  iron: { name: 'Iron Skin', price: 2500, color: 0xd9483b, note: 'Health 100 → 220' },
  hands: { name: 'Quick Hands', price: 3000, color: 0x4fbf6b, note: 'Reload twice as fast' },
  overdrive: { name: 'Overdrive', price: 2000, color: 0xe7a23a, note: 'Fire rate +33%' },
  wind: { name: 'Second Wind', price: 1500, color: 0x4f9fe0, note: 'Get back up once with a shockwave' },
  pockets: { name: 'Deep Pockets', price: 4000, color: 0xa56be0, note: 'Carry a fourth gun' },
};

export const POWERUPS = {
  ammo: { name: 'MAX AMMO', color: 0x4fe07a },
  insta: { name: 'INSTA-KILL', color: 0xffffff, time: 25 },
  double: { name: 'DOUBLE POINTS', color: 0xffd23a, time: 25 },
  nuke: { name: 'NUKE', color: 0xff6a3a },
  boards: { name: 'CARPENTER', color: 0xc9925a },
};

export const POINTS = { hit: 10, kill: 60, head: 100, melee: 130, plank: 10, nuke: 400, start: 500 };

// wide: body width multiplier, crawl: drags itself along the floor, boom: explodes on death
export const ZTYPES = {
  walker: { hp: 100, speed: 0.72, scale: 1.0, wide: 1, dmg: 20, plank: 1, skin: 0x7f9a6a, shirt: [0x4a5568, 0x6b5340, 0x55633f, 0x61486a, 0x7a3b33, 0x8a8f96], pants: [0x4a5a72, 0x6a5a48, 0x555b66], eye: 0xffd23a },
  runner: { hp: 60, speed: 1.9, scale: 0.94, wide: 0.9, dmg: 16, plank: 1, skin: 0x9aa35f, shirt: [0x7b2f2f, 0x2f4d7b, 0xb9b3a2], pants: [0x4b5160, 0x6b6b4c], eye: 0xff8a2a },
  crawler: { hp: 75, speed: 0.95, scale: 0.96, wide: 1, dmg: 18, plank: 1, skin: 0x8a987a, shirt: [0x7a7a6c, 0x8a5d5d], pants: [0x50505a], eye: 0xffd23a, crawl: true },
  brute: { hp: 480, speed: 0.58, scale: 1.3, wide: 1.35, dmg: 45, plank: 3, skin: 0x64806c, shirt: [0x5a5f6e, 0x6e5444], pants: [0x3e424c], eye: 0xff2a1a },
  bloater: { hp: 180, speed: 0.62, scale: 1.08, wide: 1.5, dmg: 24, plank: 1, skin: 0xa9b45f, shirt: [0x9a9a3f, 0x7f8a4a], pants: [0x5a5a38], eye: 0xb6ff3a, boom: true },
};

export const DIFFICULTY = {
  easy: { hp: 0.8, speed: 0.9, dmg: 0.6, count: 0.8 },
  normal: { hp: 1, speed: 1, dmg: 1, count: 1 },
  insane: { hp: 1.3, speed: 1.2, dmg: 1.5, count: 1.4 },
};

// What round n (1-based) looks like.
export function roundSpec(n, diff = DIFFICULTY.normal) {
  const weights = {
    walker: 1,
    runner: n >= 3 ? Math.min(0.9, 0.15 * (n - 1)) : 0,
    crawler: n >= 2 ? 0.25 : 0,
    brute: n >= 5 ? Math.min(0.3, 0.06 * (n - 3)) : 0,
    bloater: n >= 4 ? 0.18 : 0,
  };
  return {
    count: Math.round((5 + 3 * n + 0.15 * n * n) * diff.count),
    interval: Math.max(0.35, 2.0 - 0.13 * n),
    maxAlive: Math.min(28, 6 + 2 * n),
    hpMul: diff.hp * (n < 10 ? 1 + 0.12 * (n - 1) : 2.08 * Math.pow(1.1, n - 10)),
    weights,
  };
}

export function pickType(weights, rnd = Math.random) {
  let total = 0; for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return 'walker';
}
