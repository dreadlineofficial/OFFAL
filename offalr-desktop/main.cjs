// OFFAL: REMASTERED desktop app (Electron): the game in its own window, with its own copy of Chromium, so nothing depends on
// the browser installed on the PC. Kept deliberately careful with the graphics card:
// - no graphics flags but one (use the faster GPU on a two-GPU laptop): Chromium decides what the GPU can safely do
// - its compiled-shader caches are kept, and thrown away after a run that didn't close properly (a crash mid-write
//   leaves them corrupt, and then every launch crashes)
// - always on the graphics card; safe graphics (drawn on the processor, the driver never touched) only when you
//   start it with --safe on purpose
// - one copy at a time: starting it again brings the open window to the front
// - if the page itself crashes it's reloaded, and the game puts you back exactly where you were
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// the app was called OFFAL REMASTERED until it became the game itself: keep its old folder, so saves and settings carry over
app.setPath('userData', path.join(app.getPath('appData'), 'OFFAL REMASTERED'));
const ud = app.getPath('userData');
const has = (a) => process.argv.some((x) => x.toLowerCase() === a);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
try { fs.mkdirSync(ud, { recursive: true }); } catch {}
// earlier builds switched to safe graphics on their own and remembered it: forget that
for (const f of ['running', 'safe-graphics']) { try { fs.rmSync(path.join(ud, f), { force: true }); } catch {} }
const safe = has('--safe');
if (safe) { app.disableHardwareAcceleration(); app.commandLine.appendSwitch('enable-unsafe-swiftshader'); } // 3D drawn on the processor (SwiftShader)
// compiled shaders are kept between runs (so nothing has to be compiled twice: no stutter the second time round), and
// thrown away only if the last run didn't close properly, in case a crash left them half-written
const mark = path.join(ud, 'open');
if (fs.existsSync(mark)) for (const c of ['GPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Code Cache']) {
  try { fs.rmSync(path.join(ud, c), { recursive: true, force: true }); } catch {}
}
try { fs.writeFileSync(mark, String(Date.now())); } catch {}
app.on('will-quit', () => { try { fs.rmSync(mark, { force: true }); } catch {} });
// on a laptop with two graphics chips, the game runs on the real one (not the power-saving one built into the processor)
if (!safe) app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', title: 'OFFAL', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.removeMenu();
  // the window's own fullscreen, told to the page (preload.cjs)
  const tell = () => { if (win && !win.isDestroyed()) win.webContents.send('fs', win.isFullScreen()); };
  win.on('enter-full-screen', tell); win.on('leave-full-screen', tell);
  win.webContents.on('did-finish-load', tell);
  // shown as soon as the page can paint; and whatever happens, within a few seconds (a slow first start must never
  // look like nothing happened)
  const reveal = () => { if (win && !win.isDestroyed() && !win.isVisible()) { win.maximize(); win.show(); win.focus(); } };
  win.once('ready-to-show', reveal);
  setTimeout(reveal, 4000);
  // F11 / Alt+Enter toggle fullscreen, Ctrl+Shift+I opens devtools for debugging
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11' || (i.alt && i.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.control && i.shift && i.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });
  // never navigate away from the game; open external links in the browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // the page crashed: load it again (the game saves the exact moment every few seconds)
  win.webContents.on('render-process-gone', (e, d) => { if (d.reason !== 'clean-exit') setTimeout(() => win && !win.isDestroyed() && load(), 500); });
  load();
}
function load() { win.loadFile(path.join(__dirname, 'game', 'offal.html'), safe ? { query: { safe: '1' } } : {}); }
// started again while it's already running: bring the window back (and make one if there somehow isn't any)
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) { win.maximize(); win.show(); }
  win.focus();
});

// Steam, when there is one: the steamworks.js module (npm i steamworks.js) and the game's Steam app id, in
// steam_appid.txt next to the exe or in STEAM_APP_ID. Without either the game runs as it always has.
let steam = null;
try {
  const id = Number(process.env.STEAM_APP_ID || fs.readFileSync(path.join(path.dirname(process.execPath), 'steam_appid.txt'), 'utf8').trim());
  if (id) { steam = require('steamworks.js').init(id); try { require('steamworks.js').electronEnableSteamOverlay(); } catch {} }
} catch { steam = null; }
ipcMain.on('steam-on', (e) => { e.returnValue = !!steam; });
ipcMain.on('steam-ach', (_e, id) => { try { if (steam && !steam.achievement.isActivated(id)) steam.achievement.activate(id); } catch {} });
ipcMain.on('fs-set', (_e, on) => { if (win && !win.isDestroyed()) win.setFullScreen(!!on); });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
