// Controllers (Xbox layout; PlayStation pads map the same): the game is played through the keys it already knows,
// pressed for you, the way the touch controls do it. Sticks: walk and look. In menus the D-pad or the left stick
// moves between buttons, A presses, B goes back.
//
//   left stick  walk (push it all the way and click it, or hold LB, to run)     right stick  look
//   A  use / hold to cut        B  crouch (back, in menus)      X  hold to listen      Y  torch
//   RT  fire the bolt gun       LT  hold your breath (in a locker)                     D-pad up  syringe
//   Menu  pause                 View  tasks
const key = (code, down) => window.dispatchEvent(new window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
const tap = (code) => { key(code, true); setTimeout(() => key(code, false), 60); };
const DEAD = 0.18;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

// what each button holds down while you play (hold) or taps once (tap)
const PLAY = [[0, 'KeyE', 'hold'], [1, 'KeyC', 'tap'], [2, 'KeyQ', 'hold'], [3, 'KeyF', 'tap'], [6, 'Space', 'hold'], [12, 'KeyR', 'tap'], [9, 'KeyP', 'tap'], [8, 'Tab', 'tap']];

export function initGamepad({ look, fire, playing, onUse }) {
  let pad = -1, prev = [], held = new Set(), moveHeld = new Set(), navT = 0, focus = null, lastT = 0;
  addEventListener('gamepadconnected', (e) => { pad = e.gamepad.index; onUse(true); });
  addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === pad) { pad = -1; release(); onUse(false); } });
  // the mouse or the keyboard takes over again: the prompts go back to keys
  addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 4) onUse(false); });
  addEventListener('keydown', (e) => { if (e.isTrusted) onUse(false); });
  const release = () => { for (const k of held) key(k, false); for (const k of moveHeld) key(k, false); held.clear(); moveHeld.clear(); };
  const down = (k) => { if (!held.has(k)) { held.add(k); key(k, true); } };
  const up = (k) => { if (held.has(k)) { held.delete(k); key(k, false); } };

  // ---------- menus: whatever buttons are on screen, moved between by direction ----------
  const items = () => { // (settings open over the pause menu: only the settings)
    const top = document.querySelector('#settings.on') ? '#settings' : '.screen.on';
    return [...document.querySelectorAll(`${top} button, ${top} input, ${top} select`)].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null && !el.closest('#touch, #hud') && el.type !== 'hidden');
  };
  const setFocus = (el) => {
    if (focus) focus.classList.remove('pad-focus');
    focus = el;
    if (el) { el.classList.add('pad-focus'); el.scrollIntoView({ block: 'nearest' }); }
  };
  const move = (dx, dy) => {
    const all = items();
    if (!all.length) return;
    if (!focus || !all.includes(focus)) { setFocus(all[0]); return; }
    const a = focus.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of all) {
      if (el === focus) continue;
      const b = el.getBoundingClientRect(), x = b.left + b.width / 2 - ax, y = b.top + b.height / 2 - ay;
      const along = x * dx + y * dy; if (along <= 4) continue;
      const across = Math.abs(x * dy - y * dx), s = along + across * 2.5;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) setFocus(best);
    else if (focus.type === 'range' && dx) nudge(focus, dx);
  };
  const nudge = (el, dir) => { // a slider: left and right change it
    const st = +el.step || (el.max - el.min) / 20 || 1;
    el.value = Math.min(+el.max, Math.max(+el.min, +el.value + dir * st));
    el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const press = () => {
    if (!focus || !items().includes(focus)) { move(0, 1); return; }
    if (focus.tagName === 'SELECT') { focus.selectedIndex = (focus.selectedIndex + 1) % focus.options.length; focus.dispatchEvent(new window.Event('change', { bubbles: true })); return; }
    if (focus.type === 'range') return;
    focus.click();
  };

  const frame = (t) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
    const gp = pad >= 0 && navigator.getGamepads ? navigator.getGamepads()[pad] : null;
    if (!gp) return;
    const b = gp.buttons.map((x) => x.value > 0.5), was = (i) => prev[i], pressed = (i) => b[i] && !was(i);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (playing()) {
      setFocus(null);
      // walking: the stick sets the keys, like the touch stick
      const want = new Set();
      if (ly < -0.3) want.add('KeyW'); if (ly > 0.3) want.add('KeyS'); if (lx < -0.3) want.add('KeyA'); if (lx > 0.3) want.add('KeyD');
      if ((b[10] || b[4]) && ly < -0.3) want.add('ShiftLeft');
      for (const k of moveHeld) if (!want.has(k)) key(k, false);
      for (const k of want) if (!moveHeld.has(k)) key(k, true);
      moveHeld = want;
      // looking: faster the further you push, as if a mouse moved that far
      const sp = 900 * dt, cv = (v) => Math.sign(v) * v * v;
      if (rx || ry) look(cv(rx) * sp * 1.2, cv(ry) * sp * 0.8);
      for (const [i, k, how] of PLAY) {
        if (how === 'hold') { if (b[i]) down(k); else up(k); } else if (pressed(i)) tap(k);
      }
      if (pressed(7)) fire();
    } else {
      release();
      // a menu, a card, a film, a letter
      navT -= dt;
      const dx = b[15] || lx > 0.5 ? 1 : b[14] || lx < -0.5 ? -1 : 0, dy = b[13] || ly > 0.5 ? 1 : b[12] || ly < -0.5 ? -1 : 0;
      if ((dx || dy) && navT <= 0) { move(dx, dy); navT = navT < -0.1 ? 0.28 : 0.14; } else if (!dx && !dy) navT = 0;
      if (pressed(0)) { tap('Space'); tap('KeyE'); press(); } // (Space and E: skip a card or a film, put a letter down)
      if (pressed(1) || pressed(9)) tap('Escape');
    }
    prev = b;
  };
  requestAnimationFrame(frame);
}
