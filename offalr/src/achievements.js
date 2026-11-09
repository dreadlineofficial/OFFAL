// Achievements: kept in the save, shown in the collection, announced when they come. In the desktop build they also
// go to Steam (window.offalSteam, from the Electron preload, when the Steam client is running and the game has an app
// id); the ids here are the API names to use on the Steamworks achievements page, upper-cased.
export const ACHIEVEMENTS = [
  { id: 'hired', name: 'Clocked In', text: 'Take the lift down from the hiring office.' },
  { id: 'firsttag', name: 'Brass', text: 'Cut your first tag out of a body.' },
  { id: 'b2', name: 'Stunned', text: 'Get out of B2.' },
  { id: 'b3', name: 'Filed Away', text: 'Get out of the morgue.' },
  { id: 'b5', name: 'Two of Him', text: 'Get out of Evisceration.' },
  { id: 'b8', name: 'Minus Twenty', text: 'Get out of the Deep Freeze.' },
  { id: 'out', name: 'Clocking Out', text: 'Stop the line and get out alive.' },
  { id: 'hard', name: 'Graveyard Shift', text: 'Get out alive on Hard.' },
  { id: 'extreme', name: 'Double Shift', text: 'Get out alive on Extreme.' },
  { id: 'clean', name: 'Not a Scratch', text: 'Get out alive without dying once.' },
  { id: 'unseen', name: 'Nobody Saw a Thing', text: 'Clear a floor without him ever chasing you.' },
  { id: 'breath', name: 'Don’t Breathe', text: 'Hold your breath in a locker while he stands right outside it, and live.' },
  { id: 'crawl', name: 'Too Big to Follow', text: 'Lose him in a crouchway while he’s chasing you.' },
  { id: 'bolt', name: 'Captive Bolt', text: 'Drop him with the bolt gun.' },
  { id: 'keeper', name: 'Lost Property', text: 'Find five keepsakes.' },
  { id: 'collector', name: 'Everything They Left', text: 'Find every keepsake.' },
  { id: 'processed', name: 'Processed', text: 'Die.' },
  { id: 'regular', name: 'Regular', text: 'Die twenty-five times.' },
  { id: 'films', name: 'Seen It All', text: 'See every way he can kill you.' },
  { id: 'overtime', name: 'Further Down', text: 'Reach B12 in overtime.' },
];

let save = null, write = () => {}, toast = () => {}, blocked = () => false;
export function initAchievements(s, w, t, b) {
  save = s; write = w; toast = t; if (b) blocked = b;
  save.ach ||= {};
  // anything got while Steam wasn't there goes to Steam now (it ignores the ones it already has)
  if (window.offalSteam) for (const id in save.ach) try { window.offalSteam.activate(id.toUpperCase()); } catch {}
}
export function unlock(id) {
  if (!save || blocked() || save.ach[id] || !ACHIEVEMENTS.some((a) => a.id === id)) return;
  save.ach[id] = Date.now();
  write();
  try { window.offalSteam && window.offalSteam.activate(id.toUpperCase()); } catch {}
  toast(ACHIEVEMENTS.find((a) => a.id === id));
}
export const has = (id) => !!(save && save.ach[id]);
