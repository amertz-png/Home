# Breach Night — Realism Overhaul Plan

Living document. Status key: `[ ]` not started · `[~]` in progress · `[x]` done and tested · `[!]` done but needs headset check · `[-]` not applicable / deferred (reason given).

Rollback point for everything below: branch `backup/pre-realism-overhaul` (commit `a84ca75`).

---

## 0. Audit

### 0.1 What this project actually is

| Question | Answer |
| --- | --- |
| Engine | WebXR + three.js **r187** (vendored in `lib/`), plain ES modules, no build step |
| Renderer | `THREE.WebGLRenderer` (WebGL2), single-pass **forward** rendering, MSAA from the XR framebuffer |
| XR stack | Raw WebXR Device API through three's `WebXRManager`; session mode `immersive-ar` (passthrough) with `local-floor`, optional `plane-detection`, `mesh-detection`, `anchors`, `depth-sensing` |
| Target | Meta Quest Browser, standalone. **Quest 3 is the performance floor.** |
| Hosting | Static files on GitHub Pages (`gh-pages` branch of `amertz-png/Home`) |
| Game | Mixed-reality round-based zombie survival: zombies enter through the real doors and windows in the headset's room scan; points buy wall weapons, perks, Mystery Crate rolls and Overclock upgrades |

There is no Unity/Unreal editor, no ScriptableObjects, no lightmapper and no post-processing stack. Every item in the brief is mapped to its closest real equivalent on this platform in section 0.3, and anything with no equivalent is listed in section 9.

### 0.2 What exists and what is weak (before the overhaul)

| System | Where it lived (pre-overhaul) | What it did | What was weak |
| --- | --- | --- | --- |
| Player rig | `lib/xrkit.js` `Controllers`, `main.js` `makeHand` | Guns glued to the controller ray pose; a dark ellipsoid for a glove | No hands or arms, no two-handed grip, no weight or inertia, no damage direction |
| Weapons | `data.js`, `main.js` fire/reload/animate, `gfx.js` models | 21 weapons; hitscan, projectile, cone, beam, chain, melee; timer reload with a canned animation; two 1-D recoil springs on the mesh only | Recoil never moved the shot; synthetic noise for gunshots; untextured extruded models; bullets passed through boards; one identical hit reaction for every calibre |
| Zombies | `gfx.js` `Horde`, `main.js` AI | 9 rigid flat-shaded segments per zombie, instanced; one head sphere + one body capsule; straight-line chase; instant-damage swipe with no wind-up; canned fall-over death | No skinning, no textures, no hit zones, no dismemberment, no ragdoll, shot direction ignored, feet slide |
| Materials | `gfx.js` | Lambert/Phong with vertex colours; five canvas textures | Nothing physically based, no normal/roughness detail, no environment reflections |
| Lighting | `main.js` | Hemisphere + two fixed directionals + one point light for flashes | Unrelated to the real room, no shadows, room at full brightness |
| Post / tone mapping | none | `NoToneMapping` | No tone curve or grade |
| Particles / decals | `gfx.js` pools | Square-ish point sprites, wall bullet holes, floor blood | One hole type, glows used a blend mode that darkens passthrough, every buffer re-uploaded every frame |
| Audio | `lib/xrkit.js` `Sfx` | Oscillator tones and noise bursts, HRTF panner per sound | Thin, no layering, no reverb, no occlusion, unbounded node creation |
| Room | `room.js`, `main.js` | Parses scan planes into walls and real doors/windows; depth-only wall occluders; boarded openings; yard shader | Solid. Station layout random and often incomplete; rescans leaked GPU memory |
| Economy / rounds / menu | `main.js` | Points, wall buys, crate, Overclock, perks, power-ups, rounds, in-headset menu and tutorial | Working. Several bugs (section 0.5) |

Measured before the overhaul (headless, software renderer): 69–73 draw calls and ~41k triangles per frame on desktop; 142–146 draw calls and ~81k triangles in an emulated Quest session (both eyes). All 32 zombie slots were submitted every frame even with no zombies alive.

### 0.3 How the brief maps onto a mixed-reality WebXR game

| Brief asks for | What it means here | Decision |
| --- | --- | --- |
| PBR materials everywhere | `MeshStandardMaterial` + procedural albedo/normal/roughness/AO sets, patched for per-instance data | Do it |
| Baked GI / lightmaps for static geometry | There is no static level: the "map" is the player's real room. Nothing to bake | Replace with image-based lighting (PMREM environment) + real-room light estimation where the browser offers it |
| Light probes / reflection probes | One PMREM environment acts as both for all dynamic objects | Do it |
| Real-time shadow lights | Weapon flashlight (spot, shadowed) + muzzle-flash light; virtual shadows cast onto the **real** floor and walls through shadow-receiver planes built from the room scan | Do it, quality-gated |
| Darker, moody atmosphere | Passthrough cannot be re-lit, but it **can be dimmed**: draw darkness with partial alpha over the real room, cut open by the flashlight cone and by muzzle flashes | Do it ("Blackout" setting) |
| Post-processing | A full-screen pass costs a full extra resolve per eye on Quest. ACES + colour grade is done **inside the material shaders** instead (custom tone-mapping chunk); bloom is faked with additive glow sprites | Do it without a post pass |
| SSAO | Not affordable in the Quest browser | Replaced by baked vertex AO + contact shadows; listed in section 9 |
| Motion blur / chromatic aberration / head-locked grain / DoF | Never added | Confirmed absent |
| Volumetric fog / light shafts | Fake light-shaft cards + drifting dust at each opening; analytic fog on the yard | Do it |
| Decals per surface type | Surface types here: real wall (plaster), wood (boards, frames, crate), metal (wall stations), glass (window panes), flesh | Do it, pooled and capped |
| MSAA 4x | Already what the XR framebuffer provides; verified in Phase 0 | Keep |
| Quality menu | Low / Medium / High / Ultra scaling shadows, render scale, particles, decals, glow, max zombies, ragdolls | Do it |
| Higher-detail rigged zombie meshes | No assets exist in the project. Build a GPU-skinned procedural humanoid as the default **and** a GLB drop-in pipeline with named slots | Do both; asset list in section 8 |
| 4 variants + per-instance randomisation | Civilian, worker, soldier, heavy; per-instance skin tone, decay, tints, blood, grime, missing parts as instanced shader parameters (one draw call) | Do it |
| Skin shader, eyes | Patched standard material: subsurface tint, rot/vein mask, accumulating blood, wet specular, emissive eyes | Do it |
| Hit zones, dismemberment, wound decals, hit reactions, ragdoll deaths | All done on the skinned rig: capsule zones per bone, bone-scale dismemberment + gib pool, wound points in bind space, spring flinch, Verlet ragdoll started from the live pose | Do it |
| Locomotion sets, foot IK, look IK, barricade/vault animation, attack variety, crowd avoidance, LOD | Procedural animation on the skeleton with planted-foot IK | Do it |
| Detailed guns with moving parts | Procedural models gain separate slide/bolt, magazine, trigger, hammer, safety, charging handle, port cover; PBR wear; GLB slots | Do it |
| Two-handed grip, manual reloads, chambered round, hand poses | Do it. Manual reload is the default with an "Assisted" option |
| Recoil that moves the gun, never the camera | 6-DOF spring-damper on the gun only, per-weapon data, pattern + build-up, one- vs two-handed, shoulder detection, haptics | Do it |
| Shot VFX, ballistics, layered gun audio | Do it; audio is synthesised with drop-in sample slots |
| Upper-body avatar with arm IK | Gloved hands + forearms/upper arms solved from head and controller poses (toggleable — in passthrough the player can also see their real arms) | Do it |
| Weighted weapon handling | Spring-follow lag scaled by weapon mass, with a "1:1" option | Do it |
| Physical hands that do not clip | Guns and hands are pushed out of scanned walls and barricades | Do it |
| Melee | Velocity-based blade damage with zones and dismemberment | Do it |
| Comfort vignette for smooth locomotion | The game is room-scale with no artificial locomotion or turning | N/A — nothing moves the camera |
| Environment detail pass | The room is real. Detail goes into the yard outside, the barricades, breakable glass, reactive props at the openings, wall stations | Do it |
| Hold native refresh rate, profile before/after | No headset in the build environment. Proxy metrics (draw calls, triangles, JS frame time) are logged before/after; an in-headset perf HUD and an automatic quality governor are added | Do it; real numbers need the headset |
| Data-driven tuning exposed in the editor | Tuning lives in `zombies/data/*.js`; a desktop tuning inspector page edits it live and exports it | Do it |
| Test scene / debug menu | In-headset debug page: spawn any variant, grant any weapon, toggle systems | Do it |

### 0.4 Decisions made without asking (reasonable calls)

1. **Stay on WebXR/three.js.** Porting to a native engine would discard the working game and the zero-install delivery to the headset.
2. **Default loadout becomes pistol in the right hand, left hand empty** (machete on the belt, reached with the weapon-swap button). An empty hand is required for two-handed grip and manual reloads. Dual-wielding still works.
3. **Manual reload is the default**, with "Assisted" (one-button, animated) in Settings.
4. **Passthrough dimming ("Blackout") defaults to a moderate level** with a weapon light, and muzzle flashes briefly light the room. A "Flash intensity" setting limits this for photosensitive players.
5. **No full-screen post-processing pass.** Tone mapping and grade run in-shader.
6. **Hit-zone multipliers**: head 2.5 (unchanged), torso 1.0, arms 0.75, legs 0.75. Points values and prices are unchanged.
7. **No copyrighted or ripped assets.** Anything not clearly redistributable is used for local pipeline tests only and listed in section 8 for the owner to source.

### 0.5 Phase 0 findings

**Platform facts that shape the plan** (from spec/source reading and emulator runs — nothing here was run on a headset):

- Quest Browser has **no light estimation**, so real-room lighting cannot be sampled. Lighting is authored, with a brightness setting.
- **No multiview** in three.js r187: every draw call is issued once per eye. Draw-call count is the main CPU cost, so instancing matters more than triangle count. Working budget: ≤ ~150 draw calls per frame in the headset (both eyes), ≤ ~300k triangles per eye.
- **Resolution cannot change mid-session**; render scale applies when a session starts. Fixed foveation can change at any time and is the cheap GPU lever.
- 4x MSAA is already what the XR framebuffer uses.
- Framebuffer alpha composites over passthrough as premultiplied alpha. **Black with partial alpha dims the real room**, and a shadow-only material darkens the real floor. three's stock additive blending also writes alpha, which darkens the room behind every glow — the old build did this everywhere.
- Controller mapping, grip-versus-ray pose (45° pitch, ~5 cm offset) and haptics (`hapticActuators[0].pulse`, one actuator) are known; the menu button is not exposed.
- Room-scan labels are exactly `wall`, `door`, `window`, `floor`, `ceiling`. A second `initiateRoomCapture()` in one session is expected to be refused, so "Rescan" may need leaving and re-entering.
- Depth-sensing occlusion works but would also hide the held gun behind the player's real hand; it stays optional.
- Audio: moving HRTF voices are about 15x the cost of plain panning. Cap HRTF to the nearest few voices and use one shared reverb.

**Prototypes built and verified in Phase 0**

| Prototype | Result |
| --- | --- |
| GPU-instanced skinned horde | 32 individually posed, tinted, wounded, dismembered zombies in **one draw call** (plus one in the shadow pass); output matches three's own skinning to 1/255 per pixel; 62 automated checks pass |
| Room darkening + lighting | Darkness layers lit by a flashlight cone, muzzle flashes and window light pools; virtual shadows on the real floor and walls; ACES + grade with no post pass; procedural night environment; light-shaft cards. 75 pixel checks + 9 in an emulated stereo session pass |
| Skeleton / IK / ragdoll maths | 18-bone rig, FK, two-bone IK, look-at, Verlet ragdoll that takes over from the live pose, hit-zone ray test; dependency-free and unit-tested |
| Audio engine | _pending_ |
| Performance harness + baseline | _pending_ |

**Bugs found in the pre-overhaul build** (fixed during the Foundation step unless noted)

1. Power-ups could be collected two or three times in one frame (Carpenter paid 400 instead of 200).
2. Crawlers reached through intact boards (fixed with the new zombie rig).
3. Buying the Plasma Edge with the gun hand left both hands on the same weapon.
4. Fire rate was quantised to the frame rate (850 rpm delivered ~720 at 72 Hz).
5. Rescans leaked geometries and textures.
6. The wall-station layout was random; some weapons and perks never appeared and small rooms often had no Overclock bench.
7. Game time ran slow below 20 fps (only affects the headless tests).
8. Buff and regen timers kept running while paused.
9. Shot direction was computed and then discarded (fixed with the new damage system).
10. A zombie spawned in a reused slot was hittable at the previous corpse's position for one frame.
11. `wallHit` let bullets escape through an opening even when a duplicate wall plane was in front of it, and ignored floor and ceiling.
12. Ending the session did not clear the field or the pause state.
13. Nuke kills chained bloater explosions for points and rolled for drops.
14. Smaller text and tier-scaling slips.

---

## Execution order and checklist

Each numbered system is one commit (or a short run of commits) so it can be reverted on its own.

- [~] **Phase 0** — audit, capability research, tech spikes, baseline metrics, this plan
- [ ] **F. Foundation** — split `zombies/main.js` into modules behind a shared context with no behaviour change; move tuning into `zombies/data/`; settings store
- [ ] **1. Graphics and rendering**
- [ ] **2. Zombies**
- [ ] **3. Guns**
- [ ] **4. Player body**
- [ ] **5. Environment polish**
- [ ] **6. Performance pass**
- [ ] **7. Verification, debug menu, final report**

Detailed per-system task lists are written in at the start of each system.

---

## 8. Assets the owner needs to source

Nothing license-clean and high-detail is reachable from the build environment (only `raw.githubusercontent.com` and the npm registry are reachable). The game therefore ships with procedural models and runs with **no** external assets. Each item below is an optional drop-in that replaces the procedural version.

| Slot | File(s) | Requirements | Legitimate sources |
| --- | --- | --- | --- |
| Zombie bodies: civilian, worker, soldier, heavy | `zombies/assets/zombies/<variant>.glb` | Binary glTF 2.0, no Draco/meshopt/KTX2. One skinned mesh, one material, ≤ 4 bone influences. Humanoid rig with Mixamo (`mixamorig:*`) or Unreal-style (`pelvis`, `spine_01`…) bone names, T- or A-pose, metres, ~1.75 m (heavy ~2.1 m), feet at origin. ≤ 8,000 triangles (heavy ≤ 12,000). Base colour + normal + ORM at 1024² or 512². Animation clips not required | Quaternius (CC0, stylised); Mixamo with your own Adobe account (do not commit the raw files to a public repo); Sketchfab CC0/CC-BY; commissioned |
| Weapons with moving parts | `zombies/assets/weapons/<weapon id>.glb` | Barrel along −Z, +Y up, origin at the grip, real-world metres, ≤ 12,000 triangles, one 1024² PBR set. Separate rigid child nodes named `Body`, `Magazine`, `Trigger`, `Slide` or `Bolt`/`ChargingHandle`, `Pump`, `Cylinder`, `Hammer`, and empties `Muzzle`, `EjectPort`, `GripR`, `GripL` | Quaternius Ultimate Guns (CC0); OpenGameArt CC0; the CC0 "Steel Tide" M4A1 already matches this layout |
| Environment map | `zombies/assets/env/night.hdr` | Equirectangular Radiance `.hdr`, 1024×512, ≤ 2 MB | Poly Haven (CC0), e.g. `moonless_golf`, `dikhololo_night` |
| Zombie voices | `zombies/assets/audio/zombie/*.ogg` | Mono, 48 kHz Ogg Vorbis, ≤ 2.5 s, peaks ≤ −1 dBFS; ideally idle ×6, alert ×4, attack ×4, pain ×4, death ×4, brute roar ×2 | freesound.org (CC0 filter), OpenGameArt CC0 creature packs, your own recordings |
| Impacts, footsteps, ambience | `zombies/assets/audio/...` | Same format; loops stereo ≤ 20 s | Kenney (CC0), freesound CC0 |

Gunshot recordings **are** being added by the overhaul itself from the Free Firearm SFX Library (CC0, licence file verified).

The exact slot names and a manifest are documented in `zombies/assets/README.md` once the loaders exist.

## 9. Not done / needs headset testing

- **Nothing has been run on a real headset.** Every visual and performance claim comes from headless Chromium with a software renderer or Meta's IWER emulator.
- SSAO, a real bloom pass, lightmaps and multiview are not available on this platform (see section 0.3).
- Light estimation from the real room is not available in the Quest Browser.

_More items are added as each system lands._

## 10. Frame-time and budget log

_Baseline and per-system measurements are appended here._
