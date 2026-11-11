// Shared constants, the story's floors, and how each floor gets harder.
export const TILE = 2; // metres per map cell
export const WALL_H = 3;
export const STORY_FLOORS = 10;
// the free demo (GameJolt): the hiring office and B1-B3, then a card. Built by `node tools/build-offalr.mjs --demo`
// (it sets OFFAL_DEMO before the game loads); `?demo=1` on the dev server plays it too
export const DEMO = (() => { try { return !!globalThis.OFFAL_DEMO || new globalThis.URLSearchParams(globalThis.location.search).has('demo'); } catch { return false; } })();
export const DEMO_LAST = 3;
export const RUN_SPEED = 5.1; // the player's sprint, m/s; the Foreman's chase is set against it

// how fast he is next to you, and what makes noise
// chase: his sprint as a share of yours, on the first floor and on the last
// noise: multipliers per kind of noise (see main.js G.noise); 0 means silent
// stun: seconds a hit from the bolt gun drops him for
// breathDrain: how fast a held breath runs out in a locker, per second out of 100 (easy 20 s, normal 12.5, hard 7.7, extreme 6.7)
export const DIFFS = {
  easy: { label: 'EASY', stun: 20, breathDrain: 5, chase: [0.78, 0.84], hear: 0.8, windup: 0.6, reach: 1.9, recover: 1.1, alert: 1.3, blurb: 'You can outrun him. Walking, crouching, hiding and working are silent.',
    noise: { walk: 0, crouch: 0, locker: 0, work: 0, cut: 0, run: 0.8, other: 0.8 } },
  normal: { label: 'NORMAL', stun: 15, breathDrain: 8, chase: [0.92, 0.97], hear: 1, windup: 0.5, reach: 2.1, recover: 0.6, alert: 1.1, blurb: 'He\u2019s almost as fast as you. You\u2019re still a little faster. Everything that makes noise makes noise.',
    noise: { cut: 0 } },
  hard: { label: 'HARD', stun: 10, breathDrain: 13, chase: [1.03, 1.08], hear: 1.1, windup: 0.4, reach: 2.3, recover: 0.25, alert: 0.6, blurb: 'He\u2019s a little faster than you. Footsteps, lockers and machinery carry further.',
    noise: { walk: 1.4, crouch: 1.6, locker: 2, work: 1.4, cut: 0, run: 1.15, other: 1.1 } },
  extreme: { label: 'EXTREME', stun: 5, breathDrain: 15, chase: [1.12, 1.2], hear: 1.25, windup: 0.3, reach: 2.5, recover: 0, alert: 0.3, blurb: 'He is faster than you. You will not outrun him. Everything is loud.',
    noise: { walk: 1.7, crouch: 2, locker: 2.5, work: 1.7, cut: 0, run: 1.3, other: 1.3 } },
};

// The story goes down the way the line ran: receiving, stunning, bleeding... to the bottom, where it stops.
// size: tiles across. puzzles: what else stands between you and the lift (see puzzles.js).
const STORY = [
  { name: 'RECEIVING', quote: 'The trucks stopped coming in 1998. The deliveries didn’t.', lamp: 0xd8f0d0, fog: 0x020302,
    size: 32, rooms: 10, tags: 3, hunters: 1, puzzles: [] },
  { name: 'STUNNING', quote: 'The bolt guns are still on their hooks. One of them is warm.', lamp: 0xc8d8ff, fog: 0x020205,
    size: 36, rooms: 11, tags: 4, hunters: 1, puzzles: ['bolts'], pool: ['pens', 'pens', 'lockers', 'pens', 'butcher', 'cold'] }, // stun pens; the warm bolt gun
  { name: 'THE MORGUE', quote: 'They kept the workers down here too. Labelled. Filed. Cold.', lamp: 0xe8f2ff, fog: 0x050608, theme: 'morgue',
    size: 40, rooms: 12, tags: 4, hunters: 1, puzzles: ['drawers'] },
  { name: 'THE DRAINS', quote: 'Everything that ran off the kill floor ended up down here. So did some of the people.', lamp: 0xe8e0b0, fog: 0x040504, theme: 'sewer',
    size: 44, rooms: 14, tags: 5, hunters: 1, puzzles: ['sluices'] },
  { name: 'EVISCERATION', quote: 'Everything that is inside comes out here. Now there are two of him.', lamp: 0xff8070, fog: 0x070000,
    size: 46, rooms: 14, tags: 5, hunters: 2, puzzles: ['fuses', 'keypad'] },
  { name: 'ADMINISTRATION', quote: 'Somebody up here signed off on all of it. Every quarter. In triplicate.', lamp: 0xfff0c8, fog: 0x050402, theme: 'offices',
    size: 48, rooms: 15, tags: 5, hunters: 2, puzzles: ['keycard'] },
  { name: 'THE PROCESSING LINE', quote: 'The belts stopped in 1998. Nobody told the meat.', lamp: 0xffcf90, fog: 0x070403, theme: 'processing',
    size: 50, rooms: 14, tags: 6, hunters: 2, puzzles: ['scale', 'keypad'] },
  { name: 'DEEP FREEZE', quote: 'Minus twenty. The meat is racked to the ceiling, and some of it is wrapped like people.', lamp: 0xd8ecff, fog: 0x0c1014, theme: 'freezer',
    size: 52, rooms: 16, tags: 6, hunters: 2, puzzles: ['meatkey'] },
  { name: 'THE QUIET LINE', quote: 'Everything the line made ends up in the smokehouse. The fires never went out.', lamp: 0xffa860, fog: 0x0a0503,
    size: 54, rooms: 17, tags: 6, hunters: 2, puzzles: ['hooks'], deadLamps: 0.5, pool: ['smoke', 'vats', 'line', 'bunks', 'shrine', 'hanging', 'smoke', 'vats', 'lockers', 'pit', 'smoke', 'bunks'], glass: 0.14 }, // the smokehouse: smoke chambers, rendering vats, bunks, a shrine; glass underfoot
  { name: 'THE LINE', quote: 'This is where it all goes. Stop the line, and the shift is over.', lamp: 0xe2eaf2, fog: 0x2a2e31, // (the newest part of the plant: cold white light, and a haze the far side stands out of)
   
    // the bottom: the main factory floor, one open hall under a roof 12 m up, and one job after another (each needs
    // the last) before the lift will go up
    size: 56, rooms: 14, tags: 0, hunters: 2, puzzles: ['fuses', 'keypad', 'scale', 'breakers', 'valves', 'hooks', 'override'], finale: true, chain: true, hall: true, storeys: true, width: 92, ceil: 12, fogBoost: -0.035,
    pool: ['line', 'pens', 'packing', 'butcher', 'mincer', 'wash', 'racks', 'line', 'packing', 'pens', 'vats', 'mincer', 'butcher', 'wash', 'racks', 'line'] }, // (every work area a different job: the kill line, the pens, packing, boning, mincing, wash-down, the chill store)
];

const DEEP = ['THE COLD ROOM', 'OFFAL PIT', 'BONE YARD', 'THE QUIET LINE', 'HIS OFFICE', 'FURTHER DOWN', 'WHERE THE DRAINS GO'];
const DEEP_QUOTES = [
  'There are no more floors on the plans.',
  'You can hear the line still running somewhere below.',
  'Somebody has been keeping count on the walls.',
  'It is warmer down here. It smells like a kitchen.',
  'Your tag is in your pocket. You checked. You keep checking.',
];

// how each kind of floor looks: colour cast over the picture, lamp colour, fog colour, extra fog
export const THEMES = {
  plant: { tint: [1, 1, 1] },
  morgue: { tint: [0.9, 1.0, 1.06], lamp: 0xe8f2ff, fog: 0x050608, label: 'HOSPITAL WING' },
  offices: { tint: [1.06, 1.0, 0.86], lamp: 0xfff0c8, fog: 0x050402, label: 'ADMINISTRATION' },
  sewer: { tint: [0.95, 1.0, 0.86], lamp: 0xe8e0b0, fog: 0x040504, fogBoost: 0.008, label: 'THE DRAINS' },
  freezer: { tint: [0.84, 0.95, 1.14], lamp: 0xd8ecff, fog: 0x0c1014, fogBoost: 0.015, label: 'DEEP FREEZE' },
  processing: { tint: [1.06, 0.98, 0.86], lamp: 0xffcf90, fog: 0x070403, label: 'PROCESSING LINE' },
};
// each kind of floor's own job, for overtime's lottery
const THEME_PUZZLES = { morgue: ['drawers'], offices: ['keycard'], sewer: ['sluices'], freezer: ['meatkey'], processing: ['scale'] };

// before B1: the office at the bottom of the building where you were hired. No tags, no Foreman, one notice.
const INTRO = { name: 'THE HIRING OFFICE', quote: 'You answered an advertisement. Good pay. Nights. No experience necessary.', lamp: 0xe4f4e0, fog: 0x030504, label: 'SUB-LEVEL', theme: 'offices' };

export function floorInfo(depth, mode = 'story') {
  if (depth === 0) return { ...INTRO };
  if (mode === 'story' || depth <= 6) {
    const f = STORY[Math.min(depth, STORY_FLOORS) - 1];
    return { name: f.name, quote: f.quote, lamp: f.lamp, fog: f.fog, label: 'B' + depth, theme: f.theme || 'plant' };
  }
  const i = depth - 7;
  return { name: DEEP[i % DEEP.length], quote: DEEP_QUOTES[i % DEEP_QUOTES.length], lamp: [0xff6050, 0xd0c0a0, 0xff9070][i % 3], fog: 0x040000, label: 'B' + depth };
}

const PUZZLE_KINDS = ['fuses', 'keypad', 'scale', 'valves'];

// torch batteries: enough for the size of the floor (the torch burns one down in under three minutes, and the
// big floors take ten), a spare on easy, one fewer on hard and extreme
const BATTERY_DIFF = { easy: 1, normal: 0, hard: -1, extreme: -1 };
const batteriesFor = (size, diffKey) => Math.max(3, Math.min(9, Math.round((size * size) / 330) + (BATTERY_DIFF[diffKey] || 0)));

// everything a floor needs to know about how hard it is
export function difficulty(depth, mode = 'story', rng = Math.random, diffKey = 'normal') {
  const d = depth - 1;
  const df = DIFFS[diffKey] || DIFFS.normal;
  const ramp = Math.min(1, d / (STORY_FLOORS - 1));
  const chaseRatio = df.chase[0] + (df.chase[1] - df.chase[0]) * ramp;
  const pace = { chaseSpeed: RUN_SPEED * chaseRatio, speedMul: chaseRatio / 0.92, diff: diffKey, windup: df.windup, reach: df.reach, recover: df.recover, alert: df.alert, breathDrain: df.breathDrain, stun: df.stun };
  const base = {
    hearing: (1 + d * 0.06) * df.hear,
    adrenaline: d < 2 ? 1 : 2,
    deadLamps: Math.min(0.15 + d * 0.06, 0.55),
    gore: Math.min(d, 3),
    screamers: Math.min(d, 4),
    fogBoost: 0,
    finale: false,
  };
  if (depth === 0) return { ...base, ...pace, batteries: 0, size: 14, rooms: 4, tags: 0, hunters: 0, puzzles: ['notice'], adrenaline: 0, gore: 0, screamers: 0, deadLamps: 0.1, theme: 'offices', intro: true };
  if (mode === 'story') {
    const f = STORY[Math.min(depth, STORY_FLOORS) - 1];
    return { ...base, ...pace, batteries: batteriesFor(f.size, diffKey), size: f.size, rooms: f.rooms, tags: f.tags, hunters: f.hunters, puzzles: f.puzzles.slice(), finale: !!f.finale, chain: !!f.chain, hall: !!f.hall, storeys: !!f.storeys, width: f.width || 0, ceil: f.ceil || 0,
      fogBoost: (f.fogBoost || 0) + ((THEMES[f.theme || 'plant'] || {}).fogBoost || 0), deadLamps: f.deadLamps ?? base.deadLamps, theme: f.theme || 'plant', pool: f.pool, glass: f.glass || 0 };
  }
  // overtime: endless, and the puzzles are a lottery
  const puzzles = [];
  const r = rng();
  const theme = depth < 2 ? 'plant' : r < 0.34 ? 'plant' : r < 0.47 ? 'morgue' : r < 0.6 ? 'sewer' : r < 0.73 ? 'offices' : r < 0.86 ? 'freezer' : 'processing';
  const n = depth >= 5 ? 2 : depth >= 2 ? 1 : 0;
  // a floor of its own kind always has its own job first
  if (THEME_PUZZLES[theme] && n) puzzles.push(THEME_PUZZLES[theme][0]);
  // the offices and the deep freeze have wide aisles: nowhere to put a shutter
  const pool = PUZZLE_KINDS.filter((k) => !(k === 'keypad' && (theme === 'offices' || theme === 'freezer')));
  for (let i = puzzles.length; i < n; i++) {
    const k = pool[Math.floor(rng() * pool.length)];
    puzzles.push(k);
    for (let j = pool.length - 1; j >= 0; j--) if (pool[j] === k) pool.splice(j, 1);
  }
  return {
    ...base,
    ...pace,
    theme,
    size: Math.min(26 + d * 4, 50),
    batteries: batteriesFor(Math.min(26 + d * 4, 50), diffKey),
    rooms: Math.min(7 + d, 16),
    tags: Math.min(3 + Math.floor((d + 1) / 2), 6),
    hunters: 1 + Math.floor(depth / 5),
    puzzles,
    fogBoost: (THEMES[theme].fogBoost || 0) + (depth === 4 ? 0.025 : 0),
  };
}
