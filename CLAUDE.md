# OFFAL — notes for Claude (read all of this first)

First-person horror game. Hollow Pines Meatworks, 1998: night-shift workers are going missing; you go down floor by
floor, cut brass ID tags out of the dead, feed them to the lift, and avoid the Foreman. three.js r160, everything
(models, textures, sound, films) made in code — no asset files. Owner: **dreadlineofficial**. Repo:
`dreadlineofficial/offal` (branch `main`). Planned for sale on Steam.

## How the owner works (follow this)
- Short messages, often with screenshots; tests on Windows, a Mac and an Android phone. Fix each report literally,
  verify it, and say plainly what was and wasn't checked.
- **Low token use**: few screenshots, short tests, no long explanations.
- **Commit after every change and push** (`git push origin main`).
- **Send builds after updates**: Windows portable exe (main deliverable), APK, `dist/offalr.html`.
  The exe is ~86 MB; if a chat won't hand it over, also send it zipped.
- Cares about: things looking real, no clipping, readable darkness, cutscenes that show what they should, no
  freezes/stutter, textures never vanishing.
- Don't invent a new art style: grim, bleached, red-only palette, grain, fog, a torch you see by.
- The word "Remastered" is never shown in the game. The remastered look and the classic look are never mixed.
- Gore is intentional (it's a horror game); there's a **Less gore** setting that must keep working.

## Layout
- `offalr/src/*.js` — the game. Key files:
  - `main.js` — game loop, states (`menu`, `play`, `transition`, `dying`, `letter`, `tape`, `inspect`, …), floors,
    lockers, tags, lift, save/resume, settings, death start (`startDeath`, prebuilt film `prepDeathFilm`), debug
    handle `window.__offal`.
  - `level.js` — layout generation (`makeLayout`) + building (`buildLevel`, room `furnish` switch per room type).
  - `config.js` — the story floors (`STORY`: hiring office = depth 0, B1–B10), difficulty, themes.
  - `monster.js` — Foreman AI (touching him = caught instantly). `foreman.js` / `foremanr.js` — his mesh.
  - `cutscenes.js` — death films (`CUTSCENES` list), ending, exit; `Cutscene` class (build/update per film,
    `prepare` precompiles shaders). `cutkit.js` — organs/gore kit.
  - `puzzles.js` — per-floor puzzles (`notice` = the hiring-office tape+TV, fuses, keypad, scale, valves, drawers,
    sluices, keycard, meatkey, bolts, hooks, breakers).
  - `tape.js` — the hiring-office VHS tape, CRT TV on an AV cart, and the video (static white/red cards with the
    staff-message script, snow between cards, TTS voice, fullscreen with F).
  - `props.js`, `props2.js`, `props3.js` (B9 smokehouse props), `vendr.js` (vending machine), `bagr.js`,
    `sculpt.js` (fused bodies, carcasses), `detail.js` (bevels), `keepsakes*.js`, `farmphoto.js`.
  - `textures.js` — painted canvas textures + `themeMaterials` (plant, morgue, offices, sewer, processing,
    freezer, `hiring` for depth 0, `smokehouse` for B9).
  - `post.js`/`postrm.js`/`gfx.js`/`pbr.js`/`three-r.js` — renderer, grade, settings presets; `three-r.js` maps
    Phong→PBR in the remastered look and exposes `THREE.ownRandom`, `THREE.gore.less`.
  - `gamepad.js` (controller → synthetic keys), `achievements.js` (20, + Steam via preload), `guide.js` (briefs,
    task sheet), `director.js` (scares), `audio.js`, `ui.js`, `touch.js`, `story.js`, `collection.js`.
- `offalr/index.html`, `offalr/offal.css` — screens/HUD/settings. `offalr/NOTES.md` — design + Steam notes.
  `offalr/steam/` — store art.
- `vendor/three/` — three.js r160 (imported as `../../vendor/three/...` from `offalr/src`).
- `offalr-desktop/` — Electron (steamworks.js bridge in `main.cjs`/`preload.cjs`).
- `offalr-android/` + `tools/build-offalr-apk.sh` — WebView APK, no Gradle.
- `tools/` — `serve.mjs`, `build-offalr.mjs`, `regress-offalr.mjs`, `eslint.offal.mjs`.

## Commands
```sh
npm install                               # esbuild
PORT=8090 node tools/serve.mjs 8090 &     # dev server → http://localhost:8090/offalr/  (never `pkill -f serve.mjs`)
node tools/build-offalr.mjs               # → dist/offalr.html
bash tools/build-offalr-apk.sh            # → dist/OFFAL.apk (needs Ubuntu android packages; debug key made on first use)
cd offalr-desktop && npm install && node copy-game.cjs && npx electron-builder --win portable --x64
                                          # → offalr-desktop/release/OFFAL-1.0.0-portable.exe
npx eslint -c tools/eslint.offal.mjs offalr/src   # (pre-existing URLSearchParams no-undef errors are known)
node tools/regress-offalr.mjs             # regression, needs the dev server; must show 0 FAIL
```

## Testing tips
- Playwright + headless Chromium uses SwiftShader: very slow. Keep shots few and small.
- Drive films by calling `cs.update(dt)` in loops; for in-game, `window.__offal.step(dt, n)`;
  `o.startRun('story', true, 'normal', { floor: N })` then loop `o.updateTransition(0.05)` while state is transition.
- A WebGL `toDataURL` is black — use page screenshots. To photograph a prop on its own, make a separate
  `THREE.WebGLRenderer` on a new canvas over the page (the game's own canvas isn't the one shown).
- `window.__forceCut = 'smoke'` forces a death film; `o.startReplay(id)` plays one from the menu.

## Rules / gotchas
- `Math.random` order matters for floor rolls: wrap any new randomness in `THREE.ownRandom(() => …)`.
- r160 `position` is read-only: use `.position.set()`. Element ids must be unique (a duplicate broke captions once).
- The baker (`bakeStatic`) merges static meshes; anything the game needs to change must be held by the game
  (B, puzzles, hunters, director) so it stays unbaked.
- Use `MeshPhongMaterial` in new props (the remaster converts it); remaster-only code checks `THREE.REMASTERED`.
- Fog must be solid before the far plane. Camera near ≥ 0.1. No large planes a few cm apart.
- Shader stalls: new things shown mid-play/mid-film must be warmed (`compileSoon`, `Cutscene.warm`, parked
  objects). Death films are built at floor load (`prepDeathFilm`), keepsakes preloaded (`viewer.preload`).

## Current state (Nov 2026, v1.0.0)
Done recently:
- GameJolt demo: `node tools/build-offalr.mjs --demo` → `dist/offalr-demo.html` (sets `OFFAL_DEMO`; `?demo=1` on the
  dev server). config.js `DEMO`/`DEMO_LAST = 3`: hiring office + B1–B3, then `demoEnd` (main.js) shows the ending card
  with "END OF DEMO"; no Overtime, no dev mode, floor pick only up to B3, own save key `offalr-demo-save-v1`.
  GameJolt HTML5 = zip with that file as `index.html`. Windows demo exe: copy it to `offalr-desktop/game/offal.html`,
  then electron-builder with `-c.productName="OFFAL Demo" -c.appId=games.offal.demo`. No demo APK (same package id).
- B10 = the main factory floor (`hall: true`, `ceil: 12`, size 56). `hallRooms` (level.js): one open hall of work
  areas with no walls, 2-tile aisles with column lines, a lift bay, a walled 2-room annex (= the keypad wing), and
  strips of small rooms along the north/west walls (`fixed` types; `L.low` tiles keep a 3 m ceiling, walls above their
  doors). Walls stack 3 m panels to the roof (`TM.upper` above 3 m). `hall.js` dresses it: roof drops for anything hung
  at WALL_H, trusses, red-railed catwalks, roof lamps, machines, clutter, column plates/beacons (atlas textures), wall
  signs, roof pipes, floor lanes/hatching, and the overhead hook line (`B.hallLine`, InstancedMesh, runs until the
  kill switches). Own surfaces: `plant98` theme (dark steel cladding, sealed concrete, roof deck). Cool white lamps,
  grey haze, hemisphere fill (`officeLight` when `D.hall`). Perf: baked in 32 m blocks, no carcasses on hall rails,
  no shadows from clutter/catwalks/line: ~370 draws at the lift (B7/B9 ~300). ~10 lockers only.
  Chain (`chain`, puzzles.js): fuses → keypad → scale → kill switches (one in the wing) → valves → hooks (brake crank)
  → `Override` (line control desk, furthest room) unlocks the lift; frenzy after it (4 s head start). Locked jobs say
  "LOCKED — FIRST: …"; notes/wall writing readable any time. Saves from an older B10 (`b10` < 4) restart B10.
- B10 polish: crouch spaces (`L.crawl` vents from small rooms through the wall; 3 machine housings `L.house`, 2.6 m
  steel with a crawl tunnel; shell draws them via HOUSE key). Set pieces in hall.js: reefer trailer at a south-wall
  dock, raised supervisor's office (lit blinds, a hanging shape), time clock + card racks by the lift, export crates
  (port stencils atlas), owner's pin board (farm demolition notice 26 Oct 1998, family photo with the mother's face
  scratched out). Fuse bags on B10 lie against walls (cold rooms first) with pools/drag marks. B10 music: audio.js
  `setFinale`/`finaleTick` (72 bpm pulse, flat-2 bass, cluster swells, rising tone; 104 bpm after the override).
- Show, don't tell: briefing cards only teach controls (TEACH set) on depth ≤ 2; the objective line only on B1–B2;
  listen arrow text only on B1; chain-locked things say "NO POWER" / "IT WON'T BUDGE"; TAB on B10 shows only done +
  current job ("???" after). Owner has their own lore timeline (prequels/sequels reveal it): keep clues subtle.
- Windows splash (`offalr-desktop/splash.bmp`) = make-art.mjs `splash_640x299`: the banner only (no text, no subtitle).
- Textures vanishing: every 2D canvas forced CPU-backed in `three-r.js` (GPU canvases got blanked → black
  normal/AO maps → dark walls); env map rebuilt on WebGL context restore.
- Intro freeze: card shows before the build; death film a frame later; textures uploaded few-per-frame
  (`uploadSoon`); play waits for shaders+textures. Sheet stains use gradients not blur (build 20 s → 3 s headless).
  Sync test loops must set `o.G.warming = false` while calling `updateTransition`.
- Tape: black cards (white text, red key line), each card cuts 0.6 s after the voice ends.
- PA announcements removed; tag messages are "Pulled out a tag."; locker body only on B2/B5/B8/B11.
- Touching the Foreman = caught. Floor bodies' legs no longer cross (X). Scale KG label hides when taken.
- Less gore setting (organs/limbs hidden, closed chests, films limited to exit/beaten/smoke, little blood).
- Freezes: death film prebuilt at load (fixed jumpscare freeze/"replay"); keepsakes preloaded.
- Hiring office: tape + TV replace the employment notice (script: 1998 Oct 30th, IMPORTANT STAFF MESSAGE, the
  warning from Hollow Pines Meatworks). Owner wants it **simple static white and red cards** (like a reference
  analog-horror video), no animation.
- Smoke Break film: pack/lighter follow the real hand, cigarette clamped in his teeth, flame meets the tip, arms
  hang clear of the body.
- Models: real severed arm/head; detailed vending machine; hiring office has its own look (green cinder block,
  checkered lino) so it no longer matches B6; B9 rebuilt as the smokehouse (smoke chambers, rendering vats, bunks,
  shrine to the missing, soot brick, tallow floor, amber light).
- Earlier: controller support, 20 achievements + Steam bridge, captions, save backup, version label, Foreman locker
  memory, Play-as-the-Foreman removed, many death films, keepsakes.
- Regression passes with 0 FAIL; last builds sent.

Not verified / open:
- Real-GPU and real-phone behaviour of the freeze fixes (headless only).
- Steam: needs the real app id in `offalr-desktop` (`steam_appid.txt`) and achievement API names on Steamworks
  (ids in `achievements.js`, upper-cased).
- The tape's look may need more tuning to match the owner's reference video (they couldn't share it beyond a
  YouTube link, which the cloud session couldn't open).
