// OFFAL: REMASTERED graphics settings: presets, the detected tier, the render resolution, and applying them.
// A preset fills in every option; touching any single option makes the set Custom (keeping the rest as they were).
// Texture quality, anisotropy and model detail are fixed when the game loads (surfaces are painted once): changing
// them is saved and takes effect on the next start. Everything else applies at once.

export const OPTS = ['scale', 'shadowQ', 'lampShadows', 'lights', 'volQ', 'ssaoQ', 'reflQ', 'bloom', 'texQ', 'aniso', 'detailQ', 'aa'];
export const LOAD_TIME = ['texQ', 'aniso', 'detailQ'];

// maxH: the preset's render height ceiling (a 4K or high-DPI screen is not drawn at 4K unless you ask for it);
// lights: how many of the nearest lamps light the scene per pixel (the rest still glow, and the game still knows them)
export const PRESETS = {
  low: { scale: 0.6, maxH: 720, shadowQ: 1, lampShadows: 0, lights: 2, volQ: 0, ssaoQ: 0, reflQ: 0, bloom: 1, texQ: 1, aniso: 4, detailQ: 0, aa: 1 },
  medium: { scale: 0.8, maxH: 900, shadowQ: 2, lampShadows: 0, lights: 3, volQ: 1, ssaoQ: 1, reflQ: 0, bloom: 1, texQ: 2, aniso: 8, detailQ: 1, aa: 1 },
  high: { scale: 1, maxH: 1080, shadowQ: 3, lampShadows: 1, lights: 4, volQ: 2, ssaoQ: 1, reflQ: 1, bloom: 1, texQ: 2, aniso: 16, detailQ: 1, aa: 1 },
  ultra: { scale: 1, maxH: 1440, shadowQ: 4, lampShadows: 3, lights: 6, volQ: 3, ssaoQ: 2, reflQ: 2, bloom: 1, texQ: 3, aniso: 16, detailQ: 2, aa: 1 },
};

// render resolution: a fixed height (720p .. 2160p 4K), the display's own, or what the preset says (a scale of it)
export const RES = { preset: 0, native: -1, 720: 720, 900: 900, 1080: 1080, 1440: 1440, 2160: 2160 };

// what the graphics card is, from its renderer string: software renderers and phones get Low
export function detectTier(renderer, touch) {
  let name = '';
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {}
  // conservative: Auto never picks Ultra, integrated graphics get Low, only a proper gaming card gets High
  let tier = 'medium';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(name)) tier = 'low';
  else if (touch || /mali|adreno|powervr|apple gpu/i.test(name)) tier = 'low';
  else if (/intel|uhd|iris|radeon(?!\s*rx)\s*(graphics|vega|\d{3}m)/i.test(name)) tier = 'low';
  else if (/rtx\s*[2-5]0[6-9]0|rx\s*(6[6-9]|7[6-9]|9[07])\d\d/i.test(name)) tier = 'high';
  return { tier, name };
}

// the concrete options for these settings
export function resolveGfx(s, detected) {
  const preset = s.gfx === 'custom' ? null : PRESETS[s.gfx === 'auto' || !PRESETS[s.gfx] ? detected : s.gfx];
  const o = { ...(preset || { ...PRESETS.high, ...(s.custom || {}) }) };
  o.res = s.res ?? 'preset';
  o.grain = s.grain ?? 1;
  o.ca = s.ca ?? true;
  o.eyeAdapt = s.eyeAdapt ?? true;
  return o;
}

// the internal scale for a drawing buffer of height bufH (before dynamic resolution)
export function renderScale(o, bufH) {
  const r = RES[o.res] ?? 0;
  if (r === -1) return 1;
  if (r > 0) return Math.max(0.3, Math.min(2.5, r / bufH));
  return Math.min(o.scale, (o.maxH || 1080) / bufH);
}

// dynamic resolution: when frames run long, draw fewer pixels (down to half), and give them back when there is room
export class DynRes {
  constructor() { this.k = 1; this.ema = 16.7; this.t = 0; this.on = true; }
  // ms: this frame's interval; target: the frame time wanted. Returns true when the scale changed
  update(ms, target) {
    if (!this.on) { const c = this.k !== 1; this.k = 1; return c; }
    // a one-off long frame (a load, a hitch, the tab coming back) says nothing about how heavy the picture is: skipped
    if (ms > target * 3) return false;
    this.ema += (ms - this.ema) * 0.05;
    this.t += ms;
    if (this.t < 1200) return false;
    this.t = 0;
    const old = this.k;
    // down only when it's really running slow; back up whenever it keeps time (with vsync a frame can't come in under
    // the target, so waiting for spare time would leave the picture soft for good)
    if (this.ema > target * 1.25) this.k = Math.max(0.5, this.k - (this.ema > target * 1.6 ? 0.15 : 0.08));
    else if (this.ema < target * 1.08) this.k = Math.min(1, this.k + 0.1);
    return this.k !== old;
  }
}

const TORCH_MAP = [256, 512, 1024, 2048, 4096], LAMP_MAP = [128, 256, 512, 512, 1024];

// apply what can change while playing
export function applyGfx(o, { post, player, lampLights, bufH, dyn = 1 }) {
  const q = post.q;
  q.scale = renderScale(o, bufH) * dyn;
  q.ssao = o.ssaoQ > 0; q.aoScale = 0.5; q.aoSamples = o.ssaoQ > 1 ? 16 : 10;
  q.vol = o.volQ > 0; q.volScale = [0.25, 0.25, 0.33, 0.5][o.volQ]; q.volSteps = [12, 12, 18, 28][o.volQ];
  q.refl = o.reflQ > 0; q.reflScale = [0.25, 0.25, 0.4, 0.5][o.reflQ];
  q.bloom = !!o.bloom; q.fxaa = !!o.aa; q.autoExpo = !!o.eyeAdapt;
  post.u.grainAmt.value = o.grain; post.u.caAmt.value = o.ca ? 1 : 0;
  // shadows: the torch's map, and how many lamps cast them
  const tm = TORCH_MAP[o.shadowQ] || 2048, sh = player.torch.shadow;
  if (sh.mapSize.x !== tm) { sh.mapSize.set(tm, tm); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  sh.radius = o.shadowQ >= 3 ? 3 : 2;
  lampLights.forEach((l, i) => {
    l.visible = i < (o.lights ?? 6); // a hidden lamp light shades nothing; the game's own lamp bookkeeping is unchanged
    const on = i < o.lampShadows && l.visible;
    l.castShadow = on;
    const lm = LAMP_MAP[o.shadowQ] || 512;
    if (on && l.shadow.mapSize.x !== lm) { l.shadow.mapSize.set(lm, lm); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
  });
  if (post.rm) post.rm.applyQuality();
  return o;
}
