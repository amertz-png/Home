# Breach Night — architecture contract (realism overhaul)

This file is the contract every module is written against. If you change an interface here, update every caller in the same change. The plan and checklist live in `/REALISM_OVERHAUL_PLAN.md`.

## 1. Ground rules

- **Platform**: WebXR `immersive-ar` in the Meta Quest Browser, three.js **r187** (`lib/three.module.js`), plain ES modules, **no build step**. Quest 3 is the floor. Forward rendering, 4x MSAA from the XR framebuffer, no multiview (every draw call is issued once per eye), no post-processing passes.
- **The camera is sacred**: nothing ever moves, shakes or re-projects the XR camera. Weight comes from weapon physics, haptics, audio and world reaction.
- **No per-frame allocation** in update paths: no `new`, array/object literals, closures, `.map/.filter/.slice`, or string building per frame. Use module-level scratch objects. Each module owns its own scratch vectors (never share temps across modules).
- **Pool and cap everything** that can grow (zombies, corpses, ragdolls, gibs, decals, particles, casings, projectiles, audio voices). Caps come from the active quality tier.
- **Fixed light count**: lights are created once; animate intensity instead of adding/removing (changing the count recompiles every lit material).
- **Data-driven**: every tunable number lives in `zombies/data/*.js`, not in logic files.
- **Module identity**: every internal import carries the same `?v=N` query (currently `?v=3`), e.g. `import { ctx } from '../core/ctx.js?v=3'`. A mismatched specifier loads a second copy of the module. `tools/version.mjs` rewrites all of them at release. Node tests import the same files without a query (pure modules must not depend on singletons created elsewhere).
- **Pure modules** (no three.js, no DOM; unit-tested in Node): `room/room.js`, `zombie/skeleton.js`, `data/*`, and any maths helpers. Keep them that way.
- `lib/xrkit.js` is shared with the golf app: do not change the behaviour of its existing exports.

## 2. Mixed-reality rendering contract (verified in Phase 0)

The framebuffer is composited over camera passthrough with **premultiplied alpha**.

- Opaque virtual surfaces must write alpha 1. Black with alpha A dims the real room to (1 − A).
- **Never use `THREE.AdditiveBlending`** for glows, flashes, beams or particles: it adds to framebuffer alpha and so darkens the passthrough behind every sprite. Use `additiveOverPassthrough(material)` from `render/mood.js` (custom blending that leaves alpha untouched).
- `MultiplyBlending` cannot tint passthrough. `ShadowMaterial`-style output (rgb 0, alpha = shadow strength) can.
- Render order (opaque list is drawn before the transparent list; each sorted by `renderOrder`):

| List | renderOrder | What | Notes |
| --- | --- | --- | --- |
| opaque | −1000 / −990 | darkness layers (`mood`) | room planes then full-view fallback |
| opaque | −980 | light-shaft erase (`mood`) | optional |
| opaque | −20 | opening "portal" planes | write alpha 1, `depthWrite: false` |
| opaque | −10 | wall occluders | `colorWrite: false`, depth only |
| opaque | 0 | zombies, guns, props, stations | alpha 1 |
| transparent | 2–4 | decals, light-shaft cards | |
| transparent | 5+ | particles, glow segments | zero-alpha additive |
| transparent | 30–70 | aim dot, prompts, HUD, banner, menu | `depthTest: false` |

- Tone mapping + grade are inline (`THREE.CustomToneMapping`, installed by `installGrade(renderer)` before the first frame). UI/emissive sprites that must not be graded set `toneMapped = false`.
- Depth-sensing occlusion stays optional and off by default (it fights with the held weapon).

## 3. Directory layout (target)

```
zombies/
  index.html            page, import map, start options
  main.js               boot, XR session, frame loop, wiring (shrinks as systems move out)
  data.js               barrel re-export of data/* (kept for compatibility)
  data/
    weapons.js          WEAPONS[] stats + recoil + handling + haptics + audio + reload + ballistics
    zombies.js          ZTYPES (gameplay), VARIANTS (visual), HIT_ZONES, LOCOMOTION, ATTACKS, ragdoll/corpse limits
    economy.js          POINTS, PERKS, POWERUPS, prices, WALL_ORDER, DIFFICULTY, roundSpec, pickType
    quality.js          QUALITY tiers (low/medium/high/ultra)
    tuning.js           global feel constants (mood, grade, comfort, hands, audio mix)
  core/
    ctx.js              shared context singleton + event emitter
    settings.js         persisted user settings (localStorage)
    quality.js          applies a tier, perf monitor, automatic governor, perf HUD data
    audio.js            audio engine (mixer, reverb, voices, occlusion, sample slots)
  render/
    mood.js             blackout, flashlight, flashes, room shadows, light shafts, environment, tone map + grade
    textures.js         procedural PBR texture sets
    materials.js        shared material factory
  fx/
    particles.js decals.js debris.js segs.js   pooled effects
    impacts.js          surface-aware impact API
  room/
    room.js             room-scan parsing (pure)
    build.js            occluders, openings, barricades, glass, props, yard portal
    stations.js         wall stations (visuals + offers)
  zombie/
    skeleton.js         18-bone rig, FK/IK, look-at, Verlet ragdoll, hit zones (pure)
    body.js             procedural skinned body + gear meshes, variants
    assets.js           GLB slot loader + retargeting to the canonical rig
    horde.js            GPU-instanced skinned renderer + skin shader
    anim.js             locomotion, attacks, barricade/climb, reactions
    damage.js           hit zones, wounds, dismemberment, gibs, corpses, ragdoll hand-over
    ai.js               state machine, crowd avoidance, spawning, LOD
    voice.js            creature audio
  weapon/
    models.js           gun models with moving parts + PBR wear, GLB slots
    handling.js         6-DOF recoil springs, weight/lag, two-hand, shoulder, haptics
    reload.js           manual/assisted reload state machines, chamber tracking
    fire.js             ballistics, penetration, projectiles, cone/beam/chain, shot VFX
    sounds.js           layered gun audio
  player/
    hands.js            hand meshes + poses, arm IK, wall push-out, belt slots
  game/
    rounds.js economy.js powerups.js hud.js menu.js debug.js
  assets/               optional drop-in assets (see assets/README.md); the game runs without any of them
  tune.html             desktop tuning inspector
```

Code moves out of `main.js` system by system ("strangler"): a system's commit moves its functions into the new module and leaves `main.js` calling it.

## 4. Shared context (`core/ctx.js`)

```js
export const ctx = {
  THREE, renderer, scene, camera, controllers,
  audio, mood, settings, quality,            // set at boot
  G, R, opt,                                 // game state, room, page options (same objects the tests see)
  hands: [], zombies: [],                    // live arrays, never reassigned
  headPos, headDir,                          // THREE.Vector3, refreshed at the top of every frame
  time: { t: 0, dt: 0, game: 0 },            // wall seconds, clamped frame dt, game seconds (frozen while paused)
  fx: {},                                    // effect pools + impacts facade
  fn: {},                                    // late-bound game functions (see below)
  on(name, cb), off(name, cb), emit(name, a, b, c),   // tiny synchronous event bus (no payload objects in hot paths)
};
```

`ctx.fn` holds functions whose call graph is cyclic, registered by whichever module owns them:
`hurtZombie(z, amount, opts)`, `killZombie(z, opts)`, `explode(pos, radius, dmg, color, hand)`, `hurtPlayer(amount, fromPos)`, `award(points, atPos)`, `wallHit(origin, dir, maxT)`, `rayZombies(origin, dir, range, fat)`, `say(title, sub, secs, color)`, `giveWeapon(wi, hand)`, `equip(hand, slot)`, `interact(station, hand)`, `repairPlank(p)`, `repairAll()`, `newGame()`, `gameOver()`, `clearField()`.

Events (emit sparingly; arguments are positional):
`sessionStart(mode)`, `sessionEnd()`, `roomBuilt()`, `roundStart(n)`, `shot(hand, weapon)`, `impact(surface, pos, normal, dir, power)`, `zombieHit(z, zone, amount)`, `zombieKilled(z, opts)`, `playerHurt(amount)`, `purchase(station)`, `settingsChanged(key)`, `qualityChanged(tierName)`.

## 5. Settings and quality

`ctx.settings` (persisted under `localStorage['breach-night-settings']`; the existing key `breach-night-best-round` is untouched):

| Key | Values | Default |
| --- | --- | --- |
| `quality` | `auto`, `low`, `medium`, `high`, `ultra` | `auto` |
| `difficulty` | `easy`, `normal`, `insane` | `normal` |
| `blackout` | 0–0.85 (Off / Dim / Dark presets) | 0.45 |
| `flash` | 0–1 muzzle/explosion flash strength on the real room | 0.6 |
| `flashlight` | bool | true |
| `reload` | `manual`, `assisted` | `manual` |
| `weight` | `weighted`, `direct` (1:1 guns) | `weighted` |
| `arms` | `hands`, `arms` | `arms` |
| `aimDot` | bool | false |
| `floor` | `hard`, `carpet`, `wood` (footstep and casing sounds) | `hard` |
| `perfHud` | bool | false |
| `volume` | 0–1 | 0.8 |

`ctx.quality` is the live tier object from `data/quality.js`:

```js
{ name, renderScale, foveation, shadows /*0 off,1 on*/, shadowMap, env /*PMREM on*/, maxZombies, corpses, ragdolls,
  particles /*multiplier*/, decals, gibs, casings, glowSprites, shafts, darknessRoom /*per-plane lit darkness*/,
  hrtfVoices, voices, reverb, animLodNear, animLodFarHz, bodyLod /*distance to switch*/ }
```

`renderScale` only applies when a session starts. `foveation` and everything else apply immediately. The governor in `core/quality.js` steps `auto` down a tier when the 3-second average frame time exceeds the refresh budget, and never steps up during a round.

## 6. Zombies

- **Skeleton** (`zombie/skeleton.js`, already written and tested): 18 bones, model space Y up / faces +Z / left = +X. Bone indices: 0 hips, 1 spine, 2 chest, 3 neck, 4 head, 5 jaw, 6 upperArmL, 7 foreArmL, 8 handL, 9 upperArmR, 10 foreArmR, 11 handR, 12 thighL, 13 shinL, 14 footL, 15 thighR, 16 shinR, 17 footR. Poses are model-space delta rotations; `solvePose(rig, pose, out, offset)` writes 18 skinning matrices.
- **Renderer** (`zombie/horde.js`, from the Phase 0 spike): one instanced draw call for all bodies. Bone matrices live in an RGBA32F texture, one row per instance. Per-instance: skin tint, cloth A, cloth B, params (decay, blood, eyeGlow, fog), four bind-space wounds. Vertex attribute `hordeRegion`: 0 skin, 1 shirt, 2 trousers, 3 shoes, 4 plain (teeth, hair), 5 eyes. The full body uses 14 of the 16 available vertex attributes: **do not add attributes**. Gear and LOD bodies are extra layers sharing the bone texture.
- **Zombie record** (one per pool slot, in `ctx.zombies`; fields the rest of the game may read):
  `i, state ('dead'|'approach'|'bash'|'enter'|'hunt'|'dying'), typeName, type, variant, op (opening), pos (Vector3, feet), yaw, depth, lat, hp, speed, scale, pose (skeleton pose), head/chestA/chestB (Vector3 world, kept for compatibility), frozen, chill, burn, slow, fuse, fuseDmg, lastHand, severed (bitmask), crawling (bool), fog`.
  `state` strings and `typeName` values are used by tests and must not change.
- **Damage entry point** stays `ctx.fn.hurtZombie(z, amount, opts)` with `opts = { head, zone, bone, point, dir, power, hand, melee, silent, noPoints }`. `dir` and `power` now drive hit reactions, wound placement and the ragdoll impulse.
- **Ray query** stays `ctx.fn.rayZombies(origin, dir, range, fat)` returning a reused array of reused hit records `{ z, t, head, zone, bone, px, py, pz }` sorted by `t`.
- Hit-zone damage multipliers live in `data/zombies.js` (`HIT_ZONES`): head 2.5, torso 1, arms 0.75, legs 0.75 for bullets.

## 7. Weapons and hands

- Guns stay parented to the controller **target-ray** space (barrel along −Z). Hand meshes and blades use **grip** space. Grip pose in ray space on Touch Plus: position (∓0.004, −0.016, +0.050) m, pitch +45°, yaw ±7° — kept in `data/tuning.js`, not hard-coded.
- Controller mapping: `buttons[0]` trigger (analog), `[1]` grip (analog), `[3]` stick click, `[4]` A/X, `[5]` B/Y; `axes[2..3]` stick. Do not rely on the menu button or thumbrest. Haptics: `gamepad.hapticActuators[0].pulse(0..1, ms)`, one actuator per controller.
- **Recoil never touches aim input**: it offsets the gun model and the muzzle transform derived from it, so recoil does move where the next shot goes, exactly as much as it moves the gun.
- Inventory item shape stays `{ wi, tier, ammo, reserve }` plus `chambered` (bool). `ammo` counts rounds in the magazine. `magOf`, `reserveMax`, `dmgOf` keep their meaning.
- Weapon data additions (all optional with defaults per class): `recoil { kick, rise, yaw, roll, spring, damping, pattern, buildup, recovery }`, `handling { mass, lag, twoHand, stockLen }`, `haptic { main, support, ms, auto }`, `audio { preset, sample }`, `reloadType ('mag'|'revolver'|'shell'|'cell'|'box'|'none')`, `ballistics { penetration, falloffStart, falloffEnd }`, `grips { main, support, magwell, slide }`.

## 8. Audio (`core/audio.js`)

One engine instance at `ctx.audio`. Game code calls named events; it never builds node graphs.

```js
ctx.audio.play(event, x, y, z, { gain, pitch, occlusion, variant, priority })   // one-shots; x/y/z omitted = non-positional
ctx.audio.gunshot(weapon, x, y, z, { tier, indoor })                             // layered shot
ctx.audio.loop(event, opts) -> handle; handle.set(x, y, z, occlusion, gain); handle.stop()
ctx.audio.setListener(camera); ctx.audio.setReverb('indoor'|'outdoor', amount); ctx.audio.resume()
```

Voices are capped (`quality.voices`), only the nearest `quality.hrtfVoices` use HRTF. Recorded samples in `assets/audio/` override synthesis per event when present (manifest in `assets/audio/manifest.json`).

## 9. Invariants (do not break)

- Economy: `POINTS` hit 10 / kill 60 / head 100 / melee 130 / plank 10 / nuke 400 / start 500; Carpenter pays 200; crate 950; Overclock 5000 then 10000 with damage ×2 then ×3.2 and magazine ×1.5; ammo refill `round(price × 0.4 × (tier ? 3 : 1) / 50) × 50`; 21 weapons with their prices and crate flags.
- Perks: Iron Skin (HP 220), Quick Hands (reload ×0.5), Overdrive (rpm ×1.33), Second Wind (one revive at 50% with a shockwave, then re-buyable), Deep Pockets (4th gun). Reset in `newGame`.
- Bag: 3 guns + 1 blade; a new blade replaces the old; when full a new gun replaces the gun in the buying hand.
- Crate result chosen at purchase, delivered after 2.4 s of game time. Power-ups: 4.5% per kill during a wave, max 3 per round, 22 s life, 25 s buffs.
- Round loop: `roundSpec`/`DIFFICULTY` formulas; states `menu/scan/intermission/wave/over`; intermission 6 s then 9 s; zombies stay outside the wall plane until the boards are gone.
- Save data: `localStorage['breach-night-best-round']`.
- URL params: `?bot` (self-playing desktop preview). Test hook `window.__z` keeps the fields the tests use (`G, R, zombies, hands, WEAPONS, WI, opt, menu, interact, giveWeapon, equip, newGame, applyScan, spawnZombie, THREE, scene, camera, renderer, room, alive`).
- No console errors or warnings introduced.

## 10. Testing

- A static server serves the repo root on port 8766. Headless Chromium runs at ~14 fps at 1280×720 under SwiftShader and the game clamps `dt` to 50 ms, so game time runs slow: **browser tests use a 480×270 viewport** and wait on game state, not wall-clock sleeps.
- Node: `node test/room.test.mjs`, `node test/skeleton.test.mjs`, `node test/golf.test.mjs`.
- Browser: `test/zombies.browser.mjs` (self-play), `test/zombies.economy.mjs`, `test/xr.emulated.mjs` (IWER Quest 3 emulation with a synthetic room scan), `test/perf.measure.mjs`.
- Every system must leave all of these passing with zero page errors.
