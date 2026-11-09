// Touch controls for phones and tablets: a stick on the left to walk (push it to the edge to run), drag
// anywhere else to look, and buttons on the right. The buttons press the same keys the keyboard does, so
// everything in the game answers them without knowing they're fingers.
const key = (code, down) => window.dispatchEvent(new window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
// a quick press of one key, as if typed
export const tapKey = (code) => { key(code, true); setTimeout(() => key(code, false), 60); };
const BUTTONS = [
  // [label, key, hold (true) or tap]
  ['USE', 'KeyE', true], ['CROUCH', 'KeyC', false], ['LISTEN', 'KeyQ', true], ['TORCH', 'KeyF', false],
  ['FIRE', 'fire', false], ['BREATH', 'Space', true],
];

// show: which buttons belong on screen right now ({ fire, breath }); tap(id): a hotbar box was tapped
export function initTouch({ look, fire, active, show: showing, tap }) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `<div class="t-stick"><i></i></div><div class="t-pad">${BUTTONS.map(([l, k]) => `<button data-k="${k}">${l}</button>`).join('')}</div><button class="t-pause">II</button><button class="t-tasks">TASKS</button>`;
  document.body.appendChild(root);
  const stick = root.querySelector('.t-stick'), knob = stick.querySelector('i');
  let stickId = null, sx = 0, sy = 0, held = new Set();
  const setMove = (dx, dy) => {
    const want = new Set();
    const m = Math.hypot(dx, dy), R = stick.offsetWidth / 2 || 60;
    if (m > R * 0.25) {
      if (dy < -R * 0.3) want.add('KeyW');
      if (dy > R * 0.3) want.add('KeyS');
      if (dx < -R * 0.3) want.add('KeyA');
      if (dx > R * 0.3) want.add('KeyD');
      if (m > R * 0.9 && dy < 0) want.add('ShiftLeft'); // pushed to the edge: run
    }
    for (const k of held) if (!want.has(k)) key(k, false);
    for (const k of want) if (!held.has(k)) key(k, true);
    held = want;
    const c = Math.min(1, m / R);
    knob.style.transform = m ? `translate(${(dx / m) * c * R * 0.6}px, ${(dy / m) * c * R * 0.6}px)` : '';
  };
  stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; stickId = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; setMove(t.clientX - sx, t.clientY - sy); e.preventDefault(); }, { passive: false });
  // looking: any finger that isn't on the stick or a button
  const lookers = new Map();
  addEventListener('touchstart', (e) => {
    if (!active()) return;
    for (const t of e.changedTouches) if (t.identifier !== stickId && !t.target.closest('#touch button, .t-stick')) lookers.set(t.identifier, [t.clientX, t.clientY]);
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { setMove(t.clientX - sx, t.clientY - sy); continue; }
      const p = lookers.get(t.identifier);
      if (p) { look((t.clientX - p[0]) * 2.2, (t.clientY - p[1]) * 2.2); lookers.set(t.identifier, [t.clientX, t.clientY]); }
    }
    if (active()) e.preventDefault();
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; setMove(0, 0); } lookers.delete(t.identifier); } };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  // the buttons
  for (const b of root.querySelectorAll('.t-pad button')) {
    const [, k, hold] = BUTTONS.find((x) => x[1] === b.dataset.k);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('on'); if (k === 'fire') fire(); else key(k, true); if (!hold && k !== 'fire') setTimeout(() => key(k, false), 60); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('on'); if (hold) key(k, false); }, { passive: false });
  }
  root.querySelector('.t-pause').addEventListener('touchstart', (e) => { e.preventDefault(); key('KeyP', true); setTimeout(() => key('KeyP', false), 60); }, { passive: false });
  // tasks: top left, by the floor's name
  root.querySelector('.t-tasks').addEventListener('touchstart', (e) => { e.preventDefault(); key('Tab', true); setTimeout(() => key('Tab', false), 60); }, { passive: false });
  // the hotbar: tap a box to use what's in it (a syringe goes in)
  document.getElementById('hotbar').addEventListener('touchstart', (e) => { const s = e.target.closest('.slot[data-id]'); if (s && active()) { e.preventDefault(); tap(s.dataset.id); } }, { passive: false });
  // only while you're playing; FIRE only with the gun in hand, BREATH only in a locker
  const fireB = root.querySelector('[data-k=fire]'), breathB = root.querySelector('[data-k=Space]');
  const show = () => {
    const on = active();
    root.classList.toggle('on', on);
    if (on) { const w = showing(); fireB.hidden = !w.fire; breathB.hidden = !w.breath; }
    requestAnimationFrame(show);
  };
  show();
  return root;
}
