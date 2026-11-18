# Quest Apps

Two WebXR apps for the Meta Quest Browser. No build step, no dependencies to install — plain static files.

| App | Folder | What it is |
| --- | --- | --- |
| Golf Range Tools | `golf/` | Swing tempo trainer (3:1 guide tones, club speed, estimated carry) and a putting green that scores start line and pace |
| Breach Night | `zombies/` | Mixed-reality round-based zombie survival. Zombies enter through the doors and windows in your room scan; points buy 21 weapons, perks and upgrades mounted on your walls |

## Put it on the headset

WebXR needs an `https://` address, so the folder has to be hosted somewhere.

**GitHub Pages:** create a repository, upload the contents of this folder, then Settings → Pages → Deploy from branch → `main` / root. Open `https://<user>.github.io/<repo>/` in the Quest Browser.

Any other static host works the same way (Netlify Drop, Cloudflare Pages, …).

## Try it on a computer

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`. Golf shows a demo view (Space = demo swing, M = switch tool). Breach Night has a mouse-and-keyboard preview; add `?bot=1` to watch it play itself.

## Tests

```bash
node test/golf.test.mjs
```

```bash
node test/room.test.mjs
```

The browser tests need a local server on port 8766 and Playwright. `test/zombies.browser.mjs` is a self-playing run, `test/zombies.economy.mjs` covers buying, perks, every weapon and game over, and `test/xr.emulated.mjs` drives a full emulated Quest session with a synthetic room scan (needs the `iwer` package; pass the folder that holds its `node_modules`).

## Layout

- `lib/xrkit.js` — shared session, controller, panel and synth-audio helpers
- `lib/three.module.js`, `lib/three.core.js` — three.js r187 (MIT, see `lib/THREE-LICENSE`)
- `golf/physics.js` — tempo detector, ball flight and putting maths (pure, unit-tested)
- `zombies/data.js` — weapons, prices, perks, enemy types and round rules
- `zombies/room.js` — room-scan parsing: walls, real doors/windows, wall-mount slots (pure, unit-tested)
- `zombies/gfx.js` — procedural textures, the instanced zombie rig, gun models and pooled effects
- `zombies/main.js` — game loop, weapons, economy, in-headset menu and tutorial
