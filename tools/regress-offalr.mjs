// OFFAL: REMASTERED regression pass (same checks as regress-offal.mjs): pass/fail lines only, no screenshots
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 300 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.goto('http://localhost:8090/offalr/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600); await p.click('#warn');
const res = [];
const check = async (name, fn, arg) => {
  const n = errs.length;
  let r;
  try { r = await p.evaluate(fn, arg); } catch (e) { r = { ok: false, why: e.message.split('\n')[0] }; }
  const ok = r && r.ok && errs.length === n;
  res.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${r && r.info ? '  ' + r.info : ''}${!ok ? '  ' + ((r && r.why) || '') + ' ' + errs.slice(n).join(' | ').slice(0, 300) : ''}`);
};
// a run up to play, ghosted so nothing kills the pass mid-check
const enter = `(mode, floor, diff) => { const o = window.__offal; o.G.state = 'menu'; o.startRun(mode, true, diff || 'normal', { floor }); let k = 0; while (o.G.state === 'transition' && k++ < 900) (o.G.warming = false, o.updateTransition(0.05)); o.G.dev = { ghost: true }; o.player.inLift = false; return o.G.state; }`;
await check('menu: no Crew, no Play as the Foreman', () => ({ ok: !document.getElementById('lobby') && !document.querySelector('[data-act=lobby]') && !document.getElementById('btnHunt') && !document.querySelector('[data-act=hunt]') }));
for (let f = 0; f <= 10; f++) {
  await check(`story floor ${f}`, new Function('f', `const enter = ${enter}; const st = enter('story', f); const o = window.__offal; if (st !== 'play' && st !== 'letter') return { ok: false, why: 'state ' + st };
    if (o.G.state === 'letter') o.G.state = 'play';
    const s2 = o.step(1 / 30, 150); o.findInteract && o.findInteract();
    return { ok: o.G.depth === f && ['play', 'letter'].includes(s2), info: o.G.info.name + ' tags ' + o.G.D.tags + ' lockers ' + o.G.B.lockers.length + ' filled ' + o.G.B.lockers.filter((l) => l.filled).length };`), f);
}
// a floor's teardown must only free what was painted for it: a shared texture freed and then drawn again re-uploads
// from its canvas, and on real GPUs that canvas may be gone (blank walls)
await check('floor teardown keeps shared textures', new Function(`const enter = ${enter}; const o = window.__offal; let T = null;
  o.scene.traverse((x) => { if (!T && x.material && x.material.map) T = x.material.map; }); if (!T) enter('story', 1), o.scene.traverse((x) => { if (!T && x.material && x.material.map) T = x.material.map; });
  let P = Object.getPrototypeOf(T); while (P && !Object.prototype.hasOwnProperty.call(P, 'dispose')) P = Object.getPrototypeOf(P);
  const gone = new WeakSet(), orig = P.dispose; P.dispose = function () { gone.add(this); return orig.call(this); };
  let bad = 0;
  try { for (const f of [3, 3, 4, 6, 8, 3, 7, 1]) { enter('story', f); o.scene.traverse((x) => { for (const m of [].concat(x.material || [])) for (const k in m) if (m[k] && m[k].isTexture && gone.has(m[k])) bad++; }); } } finally { P.dispose = orig; }
  return { ok: bad === 0, info: bad + ' freed textures back in use' };`));
await check('next floor via the lift', new Function(`const enter = ${enter}; enter('story', 2); const o = window.__offal; o.nextFloor(); let k = 0; while (o.G.state === 'transition' && k++ < 900) (o.G.warming = false, o.updateTransition(0.05)); return { ok: o.G.depth === 3 && o.G.state === 'play' };`));
await check('overtime, hard', new Function(`return (${enter})('overtime', 3, 'hard') === 'play' && window.__offal.step(1 / 30, 200) === 'play' ? { ok: true } : { ok: false };`));
await check('save + resume mid-floor', new Function(`const enter = ${enter}; enter('story', 4); const o = window.__offal; o.step(1 / 30, 60); o.player.pos.x += 1.5; const x = o.player.pos.x;
  o.G.saveT = -1; o.step(1 / 30, 2); const snap = o.save.snap; if (!snap) return { ok: false, why: 'no snapshot' };
  o.G.state = 'menu'; o.startRun('story', false, null, { resume: snap }); let k = 0; while (o.G.state === 'transition' && k++ < 900) (o.G.warming = false, o.updateTransition(0.05));
  return { ok: o.G.depth === 4 && Math.abs(o.player.pos.x - x) < 0.6, info: 'dx ' + Math.abs(o.player.pos.x - x).toFixed(2) };`));
await check('lockers: first is the scare, then hide/unhide works', new Function(`const enter = ${enter}; enter('overtime', 3); const o = window.__offal, B = o.G.B;
  const first = o.G.lockerScare; const lk = B.lockers[0]; o.openFilled(lk); const free = B.lockers.find((l) => !l.filled);
  o.hide(free); const hid = o.player.hidden === free; o.step(1 / 30, 30);
  return { ok: first && !o.G.lockerScare && lk.filled === 'open' && !!lk.slump && hid };`));
await check('scale: over the target opens it', new Function(`const enter = ${enter}; enter('story', 7); const o = window.__offal; const sc = o.G.puzzles.list ? o.G.puzzles.list.find((q) => q.cuts) : null;
  const all = sc || Object.values(o.G.puzzles).flat().find((q) => q && q.cuts); if (!all) return { ok: false, why: 'no scale on B7' };
  const heavy = all.cuts.slice().sort((a, b) => b.w - a.w); all.carry = heavy.slice(0, 2); all.put(); while (!all.done && heavy.length > 2) { all.carry = heavy.splice(2, 2); all.put(); }
  return { ok: all.done && all.total >= all.target, info: all.total + '/' + all.target };`));
for (const id of ['rope', 'exit', 'grinder', 'fan', 'eaten', 'rack', 'process']) {
  await check(`cutscene ${id}`, new Function('id', `const o = window.__offal; if (o.G.replay) { o.G.replay.dispose(); o.G.replay = null; } o.G.state = 'menu'; o.startReplay(id); const cs = o.G.replay; let k = 0, done = false;
    while (!done && k++ < 1200) done = cs.update(1 / 30); const t = cs.t; cs.dispose(); o.G.replay = null; o.G.state = 'menu'; return { ok: done, info: t.toFixed(1) + 's' };`), id);
}
// (Play as the Foreman is gone from the game)
await check('story ending plays through', new Function(`const enter = ${enter}; enter('story', 10); const o = window.__offal; o.G.dev = null; o.startEnding();
  return new Promise((r) => setTimeout(r, 1700)).then(() => { if (!o.G.cutscene) return { ok: false, why: 'no ending film' }; let k = 0; while (o.G.state === 'endcine' && k++ < 3000) o.updateEndCine(1 / 30);
  return { ok: o.G.state === 'ending' && o.save.story.done >= 1, info: 'state ' + o.G.state }; });`));
await p.waitForTimeout(500);
console.log(res.join('\n'));
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].slice(0, 8).join('\n') : 'no page errors');
await b.close();
