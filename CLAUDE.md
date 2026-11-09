# OFFAL — notes for Claude

First-person horror game (three.js r160). Owner: dreadlineofficial. Prefers low token use, short tests, a commit after
every change, and builds (Windows portable exe, APK, dist/offalr.html) sent after updates.

- Game: `offalr/src/*.js` (`main.js` loop/states/floors, `level.js` layout+build, `monster.js` Foreman AI,
  `cutscenes.js` death films, `puzzles.js`, `tape.js` hiring-office tape, `props*.js` models, `textures.js`).
- Dev server: `PORT=8090 node tools/serve.mjs 8090` (background) → http://localhost:8090/offalr/
- Build: `node tools/build-offalr.mjs` → `dist/offalr.html`. APK: `bash tools/build-offalr-apk.sh`.
  Exe: `cd offalr-desktop && node copy-game.cjs && npx electron-builder --win portable --x64`.
- Regression: `node tools/regress-offalr.mjs` (dev server running). Headless Chromium is SwiftShader: slow, so step
  cutscenes in loops; a WebGL `toDataURL` is black (use page screenshots).
- Rules: the remastered and classic looks are never mixed; the word "Remastered" is not shown; Math.random order
  matters for floor rolls (wrap new randomness in `THREE.ownRandom`).
