# OFFAL

A first-person horror game. Hollow Pines Meatworks, 1998: workers on the night shift have been going missing, and you
were hired to go down and find out why. Cut the brass tags out of the dead, feed them to the lift, go down a floor,
and don't let the Foreman see you.

Built with three.js. Everything — models, textures, sound, films — is made in code; there are no asset files.

## Play

- **Windows:** the portable `.exe` from Releases.
- **Android:** the `.apk` from Releases (sideload).
- **Browser:** open `dist/offalr.html`.

## Develop

```sh
npm install
npm start            # http://localhost:8090/offalr/
npm run build        # dist/offalr.html — the whole game in one file
npm run lint
npm test             # regression pass (needs the dev server running and Playwright)
```

- `offalr/src/` — the game (`main.js` is the entry point). `offalr/index.html`, `offalr/offal.css` — screens and HUD.
- `vendor/three/` — three.js r160.
- `offalr-desktop/` — Electron wrapper (Steam achievements via steamworks.js):
  `cd offalr-desktop && npm install && node copy-game.cjs && npx electron-builder --win portable --x64`.
- `offalr-android/` + `tools/build-offalr-apk.sh` — WebView APK built without Gradle (Ubuntu Android packages).
- `offalr/NOTES.md` — design notes; `offalr/steam/` — store art.

© dreadlineofficial
