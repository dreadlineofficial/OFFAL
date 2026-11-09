# OFFAL: REMASTERED — working notes

Branch `claude/offalr` (local; this session could not push: the repo returned 403). Based on `claude/zealous-turing-cvejm8`, the newest OFFAL code.

## Proving it's the same game
- `node tools/regress-offalr.mjs`: the original regression, unchanged (only the URL differs). 27/27.
- `node tools/sameness-offalr.mjs`: fixed seed; every story floor is built in both games and compared. 11/11 identical: layout, lockers and which hold a body, corpses, pickups, lamps, spawn, hunters.
- Both need `node tools/serve.mjs 8090` running.
- Rule that keeps it true: anything the remaster creates draws randomness through `THREE.ownRandom()` (three-r.js). three.js makes every object's uuid with `Math.random`, and the game's own rolls must not shift.

## Where things are
| File | What |
|---|---|
| `src/three-r.js` | The `three` the game imports. In Remastered, `MeshPhongMaterial`/`MeshLambertMaterial` are PBR (roughness from shininess; normal/roughness maps derived from their own canvas). `REMASTERED`, `ownRandom`. |
| `src/postrm.js` | Remastered pipeline: HDR target with depth → SSAO → volumetric light (torch shadow-mapped, 6 lamps) → bloom (thresholded after exposure) → eye adaptation (32×18 luminance image; min of mean-key and RMS-key) → ACES + the original bleach-except-red grade → FXAA + grain. Floor mirror pass for wet floors. |
| `src/post.js` | Classic path untouched; delegates to postrm. A scene can name its volumetric lights in `scene.userData.vol`. |
| `src/pbr.js` | Albedo canvas → normal + ORM (AO/rough/metal) + cavity; puddles; "wet" = redder than the surface's own average. |
| `src/textures.js` | Painters draw at k× (`TEX.k`); `stdMat` turns the Phong descriptions into PBR. Remastered rust = chipped paint (Classic keeps the painted vents). |
| `src/wet.js` | `patchWet()`: floors/pools mix the mirror by roughness and Fresnel. |
| `src/detail.js` | Swaps plain primitives for finer ones (bevelled boxes, more segments). Small parts: no shadow, no bevel. Big shapes join layer 1 (the mirror's). Lights join layer 1 too. |
| `src/arch.js` | Kick plates, rails, pipe runs, I-beams, door frames from the layout (own rng). |
| `src/foremanr.js` | The Foreman's new body on the same rig; welded per joint. |
| `src/viewmodel.js` | Torch in the left hand + lens cookie. |
| `src/motes.js` | Dust in the beam. |
| `src/gfx.js` | Presets, render resolution 720p–2160p/native, GPU detection, apply. |
| `src/env.js` | Code-built environment map. |

## Smoothness (no stalls)
- Shaders are compiled ahead: every floor's behind its load (`warmShaders`), each film's before its first frame (`Cutscene.prepare`, the frame loop holds the film in black until `ready`; a death film is built during the grab). The regression drives `cs.update` directly, so the hold lives in `frame()`, not in the film.
- The number of lights in a scene is part of every shader: a taken pickup's glint light stays in the scene at intensity 0 (`hidePickup`), so nothing rebuilds.
- Dynamic resolution ignores one-off long frames and climbs back to full whenever frames keep time (with vsync it could never see spare time before).
- Desktop: the shader cache is kept between runs (cleared only after a run that didn't close), and `force_high_performance_gpu` puts it on the laptop's real GPU.

## Death films (cutscenes.js, cutkit.js)
Burned (shotgun off his back, top half bursts, legs fold), Torn in Two (bursts apart), Minced, Packed, Beaten, plus the original five. Arms use exact two-bone IK (`reach`). Gore sounds in audio.js: `shotgun`, `pump`, `gib`, `crunch`, `spatter`, `punch`, `wheeze`.

Settings: Graphics / Display / Controls / Sound / Interface / Customize tabs (Customize: colour grades, blood colour, contrast, vignette, screen filters VHS/film/CRT/security camera/retro, dust in the beam). Texture quality, filtering and model detail apply next start; Look reloads.

## Tools
- `tools/shots-offalr.mjs <dir> <floors> [W H] [both|orig|remaster]` then `python3 tools/composite-offalr.py <dir> <floor> out.png`: side-by-side sheets.
- `tools/tune-offalr.mjs out.png floor view W H '{"m.vol.uniforms.density":0.2}'`: one view, live overrides. `STAND=1` stands in the biggest room. `PITCH`, `GFX`.
- `tools/foreman-shot-offalr.mjs`, `tools/props-shot-offalr.mjs`, `tools/cine-shot-offalr.mjs`: close-ups and film frames.
- `tools/budget-offalr.mjs [preset]`: draw calls per floor (every pass counted).

## Builds
- `node tools/build-offalr.mjs` → `dist/offalr.html`
- `bash tools/build-offalr-apk.sh` → `dist/OFFAL-REMASTERED.apk`. No Gradle. Needs `apt-get install aapt apksigner dalvik-exchange android-sdk-platform-23 zipalign`.
- `cd offalr-desktop && npm install && node copy-game.cjs && npx electron-builder --win portable --x64` → `release/OFFAL-REMASTERED-1.0.0-portable.exe`. Built on Linux without Wine, so the exe has Electron's default icon.

## Numbers (headless SwiftShader, so only relative)
- Draw calls, High: Morgue 1212 (original 2057); other floors 298–609.
- Startup materials: Low 0.9 s, High 3.7 s, Ultra 7.5 s on this CPU.

## Not done yet (from the brief)
- Texture painting in a worker + IndexedDB cache (startup).
- Depth of field in cutscenes; the two known rough edges (`process` arm, `exit` mid-fall camera).
- Skinned Foreman, foot/head IK; hands reaching for doors.
- Decal system; detail normal near camera; SSR beyond the floor mirror.
- Deep Freeze breath/frost on lens, Drains lens water, drips/ripples, flies as sprites, steam.
- Bodies/carcasses/lamps beyond the global detail pass.
- Auto-detect benchmark; F3 overlay showing the budgets.
- Real-GPU fps checks (Windows High at 1080p, Android Low).
- Mac zip, exe icon, Steam bits (controller, achievements).

## Classic
Classic is the original game itself: `tools/build-offalr.mjs` builds `offal/` fresh and carries `dist/offal.html` inside
`dist/offalr.html` (base64, `#classicGame`). Choosing Classic sets `localStorage['offalr-look'] = 'classic'`; at load
`#classicBoot` writes the original over the page (its own saves). Its menu gets a "Remastered" button back.
`?look=classic` still selects the remaster's internal Classic renderer (the test tools use it).

## Safety nets (real GPUs)
- Every post pass reads through `safe3()`: one NaN/Inf pixel can no longer go white across the frame via bloom and exposure.
- Fog closes to solid black by 2.35 / density (fog_fragment patch) and the draw distance thickens it to fit: no rooms popping at the far plane.

## Steam
- **Achievements** are in `src/achievements.js` (20). The ids, upper-cased, are the API names to create on the Steamworks
  achievements page (`HIRED`, `FIRSTTAG`, `B2`, ... `OVERTIME`). They're kept in the save and listed in the collection.
  Dev mode never unlocks them.
- **Hooking up Steam** (desktop build): `cd offalr-desktop && npm i steamworks.js`, put the app id in
  `steam_appid.txt` next to the exe (or `STEAM_APP_ID`), rebuild. `main.cjs` starts Steam if both are there and the
  preload exposes `window.offalSteam`; without them nothing changes. Achievements unlocked before Steam was there are
  sent the first time it is.
- **Cloud saves**: the save is localStorage inside the app's data folder (`%APPDATA%/OFFAL REMASTERED`). Steam
  Auto-Cloud can sync that folder with no code (Steamworks, Cloud settings, root: WinAppDataRoaming, path
  `OFFAL REMASTERED/Local Storage`).
- **Controller**: `src/gamepad.js` (Gamepad API, Xbox layout). Menus move by direction; prompts and the how-to switch to
  the buttons while a pad is in use. Steam Input will hand the game an Xbox-style pad, so this is all it needs.
- **Not done**: Steam Deck check on a real Deck; rebinding keys; the store page itself.
