// The bridge between OFFAL: REMASTERED and its window: fullscreen is the window's own (not the page's), so Escape,
// which the game uses for its pause menu, can never drop you out of it.
const { contextBridge, ipcRenderer } = require('electron');
let fs = false;
ipcRenderer.on('fs', (_e, on) => { fs = !!on; window.dispatchEvent(new Event('offal-fullscreen')); });
contextBridge.exposeInMainWorld('offalNative', {
  setFullscreen: (on) => ipcRenderer.send('fs-set', !!on),
  isFullscreen: () => fs,
});
// Steam: achievements go to the Steam client when the game runs under it (see main.cjs); otherwise this is never there
if (ipcRenderer.sendSync('steam-on')) contextBridge.exposeInMainWorld('offalSteam', { activate: (id) => ipcRenderer.send('steam-ach', String(id)) });
