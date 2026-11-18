// Game data for Breach Night — pure data so the page and tests can read it too.

// kind: hitscan | rail | grenade | flame | melee
export const WEAPONS = [
  { name: 'Pistol', kind: 'hitscan', auto: false, rpm: 420, dmg: 34, pellets: 1, spread: 0.006, mag: 15, reload: 0.9, range: 40, kick: 0.5, note: 'Fast, accurate sidearm',
    model: { body: [0.03, 0.045, 0.17], barrel: 0.03, grip: 0.09, color: 0x2a2d33 }, snd: { f: 2600, d: 0.09, low: 190 } },
  { name: 'Revolver', kind: 'hitscan', auto: false, rpm: 150, dmg: 115, pellets: 1, spread: 0.004, mag: 6, reload: 1.4, range: 50, kick: 1.0, note: 'One-shot headshots',
    model: { body: [0.035, 0.05, 0.14], barrel: 0.13, grip: 0.1, color: 0x8a8f99, drum: 0.028 }, snd: { f: 1500, d: 0.16, low: 120 } },
  { name: 'SMG', kind: 'hitscan', auto: true, rpm: 800, dmg: 17, pellets: 1, spread: 0.022, mag: 36, reload: 1.2, range: 30, kick: 0.3, note: 'Spray for close quarters',
    model: { body: [0.04, 0.06, 0.26], barrel: 0.08, grip: 0.09, color: 0x30343a, mag: 0.13 }, snd: { f: 3000, d: 0.06, low: 220 } },
  { name: 'Shotgun', kind: 'hitscan', auto: false, rpm: 80, dmg: 20, pellets: 9, spread: 0.07, mag: 6, reload: 1.6, range: 12, kick: 1.2, note: '9 pellets — clears a doorway',
    model: { body: [0.045, 0.06, 0.34], barrel: 0.3, grip: 0.09, color: 0x4a3323, stock: 0.2 }, snd: { f: 1100, d: 0.22, low: 90 } },
  { name: 'Assault Rifle', kind: 'hitscan', auto: true, rpm: 580, dmg: 30, pellets: 1, spread: 0.012, mag: 30, reload: 1.4, range: 50, kick: 0.4, note: 'Balanced automatic',
    model: { body: [0.04, 0.065, 0.36], barrel: 0.22, grip: 0.09, color: 0x353a2f, mag: 0.15, stock: 0.18 }, snd: { f: 2200, d: 0.08, low: 160 } },
  { name: 'Minigun', kind: 'hitscan', auto: true, rpm: 1500, dmg: 13, pellets: 1, spread: 0.03, mag: 200, reload: 2.6, range: 35, kick: 0.2, spin: 0.45, note: 'Spins up, then shreds',
    model: { body: [0.09, 0.1, 0.3], barrel: 0.34, grip: 0.09, color: 0x55595f, multi: true }, snd: { f: 2600, d: 0.045, low: 240 } },
  { name: 'Railgun', kind: 'rail', auto: false, rpm: 50, dmg: 320, pellets: 1, spread: 0, mag: 4, reload: 1.9, range: 60, kick: 1.1, note: 'Pierces the whole line',
    model: { body: [0.05, 0.07, 0.42], barrel: 0.3, grip: 0.09, color: 0x1e3350, glow: 0x4fc3ff, stock: 0.16 }, snd: { f: 5200, d: 0.3, low: 60 } },
  { name: 'Grenade Launcher', kind: 'grenade', auto: false, rpm: 65, dmg: 170, pellets: 1, spread: 0, mag: 6, reload: 2.1, range: 30, kick: 1.0, radius: 2.3, note: 'Arcing blast, 2.3 m radius',
    model: { body: [0.06, 0.08, 0.26], barrel: 0.2, barrelR: 0.03, grip: 0.09, color: 0x3d4a38, drum: 0.05, stock: 0.16 }, snd: { f: 500, d: 0.18, low: 80 } },
  { name: 'Flamethrower', kind: 'flame', auto: true, rpm: 1300, dmg: 95, pellets: 1, spread: 0.2, mag: 100, reload: 2.0, range: 4.2, kick: 0.1, note: 'Cone of fire, burns over time',
    model: { body: [0.06, 0.07, 0.3], barrel: 0.26, barrelR: 0.018, grip: 0.09, color: 0x7a3b22, tank: 0.05 }, snd: { f: 700, d: 0.12, low: 0 } },
  { name: 'Machete', kind: 'melee', auto: false, rpm: 0, dmg: 130, pellets: 1, spread: 0, mag: 0, reload: 0, range: 0.7, kick: 0, note: 'Swing it — never runs dry',
    model: { blade: 0.55, color: 0xc9ced6 }, snd: { f: 900, d: 0.08, low: 0 } },
];

// wide: body width multiplier, crawl: drags itself along the floor, boom: explodes on death
export const ZTYPES = {
  walker: { hp: 100, speed: 0.75, scale: 1.0, wide: 1, dmg: 10, plank: 1, score: 100, skin: 0x6f8f5a, cloth: [0x3c4656, 0x5a4636, 0x49553d, 0x55405a] },
  runner: { hp: 55, speed: 1.9, scale: 0.93, wide: 0.9, dmg: 8, plank: 1, score: 130, skin: 0x8a9a55, cloth: [0x6b2f2f, 0x2f4d6b] },
  crawler: { hp: 70, speed: 0.95, scale: 0.95, wide: 1, dmg: 9, plank: 1, score: 120, skin: 0x7f8f6a, cloth: [0x40403a], crawl: true },
  brute: { hp: 440, speed: 0.6, scale: 1.28, wide: 1.4, dmg: 24, plank: 3, score: 350, skin: 0x5f7a66, cloth: [0x2b2b30, 0x3a2a22] },
  bloater: { hp: 170, speed: 0.65, scale: 1.08, wide: 1.6, dmg: 12, plank: 1, score: 220, skin: 0x9aa35a, cloth: [0x6a6a2a], boom: true },
};

export const DIFFICULTY = {
  easy: { hp: 0.8, speed: 0.9, dmg: 0.6, count: 0.8 },
  normal: { hp: 1, speed: 1, dmg: 1, count: 1 },
  insane: { hp: 1.35, speed: 1.2, dmg: 1.6, count: 1.4 },
};

// What wave n (1-based) looks like. Enemy variety ramps with the wave; weapons are never gated.
export function waveSpec(n, diff = DIFFICULTY.normal) {
  const weights = {
    walker: 1,
    runner: n >= 2 ? Math.min(0.8, 0.18 * n) : 0,
    crawler: n >= 3 ? 0.3 : 0,
    brute: n >= 4 ? Math.min(0.35, 0.08 * (n - 3)) : 0,
    bloater: n >= 5 ? 0.2 : 0,
  };
  return {
    count: Math.round((6 + 4 * n) * diff.count),
    interval: Math.max(0.4, 1.7 - 0.12 * n),
    maxAlive: Math.min(28, 8 + 2 * n),
    hpMul: diff.hp * (1 + 0.05 * (n - 1)),
    breaches: 1 + n, // how many doorways are live this wave (capped by the room)
    weights,
  };
}

export function pickType(weights, rnd = Math.random) {
  let total = 0; for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return 'walker';
}
