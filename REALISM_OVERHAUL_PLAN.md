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

_Filled in from the Phase 0 audit — see section 0.5._

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

_Audit, capability research, tech spikes and the baseline performance table are added here when Phase 0 completes._

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

_Filled in from Phase 0 asset research._

## 9. Not done / needs headset testing

_Maintained as work proceeds._

## 10. Frame-time and budget log

_Baseline and per-system measurements are appended here._
