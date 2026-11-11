// Keepsakes: small personal things the workers left behind. Each one is a line about somebody who worked here.
// Found once, kept for good.
export const KEEPSAKES = [
  { id: 'photo-wedding', kind: 'photo', name: 'Family photo', text: 'A farmer and his two boys outside the farmhouse. On the back: "Eddie & John."' },
  { id: 'ring-plain', kind: 'ring', name: 'Wedding ring', text: 'Plain gold, worn thin on one side. Found in a drain grate.' },
  { id: 'toy-bear', kind: 'toy', name: 'Teddy bear', text: 'Small and brown, one ear chewed off. Somebody kept it in their locker.' },
  { id: 'tape-dictaphone', kind: 'tape', name: 'Dictaphone', text: 'A manager’s voice on the tape: "Headcount is down again. The Foreman says he’ll deal with it."' },
  { id: 'key-car', kind: 'key', name: 'Car keys', text: 'Ford keys and a house key. The car is still out in the staff lot.' },
  { id: 'misc-lighter', kind: 'misc', name: 'Zippo lighter', text: '' },
  { id: 'misc-watch', kind: 'misc', name: 'Wristwatch', text: 'Stopped at 3:12.' },
  { id: 'misc-glasses', kind: 'misc', name: 'Reading glasses', text: 'One lens cracked. Folded up neatly.' },
  { id: 'photo-kid', kind: 'photo', name: 'School photo', text: 'A girl of about eight. "Daddy’s girl" written on the back.' },
  { id: 'card-letter', kind: 'card', name: 'Dismissal letter', text: '"Your employment is terminated effective immediately. Please report to the lower floors to collect your final pay."' },
  // the farm, before any of this
  { id: 'photo-mother', kind: 'photo', name: 'Photo of a woman', text: 'A woman on a farmhouse porch, years ago. Her face has been scratched out with a nail.' },
  { id: 'misc-ledger', kind: 'misc', name: 'Farm ledger', text: 'Meat sold by the pound, in a careful hand. The last page is about a jar under the smokehouse floor.' },
  { id: 'card-farm', kind: 'card', name: 'Demolition notice', text: 'The county has condemned the farm on Route 9. Someone went over the date in pen, three times.' },
  { id: 'card-eddie', kind: 'card', name: 'Business card', text: 'Eddie’s Quality Meats, across the county line. On the back, in pencil: "You should have listened to Dad."' },
];
// the original's twenty-six, in its order: the floors still draw from these exactly as the original does (the same
// pick, the same model built, so the game's dice don't move), and each is shown as one of the ten above
export const KEEPSAKE_DRAW = ['photo-wedding', 'ring-plain', 'card-union', 'toy-bear', 'tape-msg', 'tooth-gold', 'key-locker', 'photo-team', 'card-time', 'misc-rosary', 'photo-kid', 'misc-lighter', 'card-id', 'tape-dictaphone', 'key-car', 'misc-glasses', 'photo-dog', 'misc-watch', 'card-letter', 'toy-car', 'tooth-milk', 'misc-cross', 'tape-radio', 'photo-you', 'card-contract', 'key-tag'];
export function keepsakeFor(drawId) {
  if (KEEPSAKES.some((k) => k.id === drawId)) return drawId;
  const i = Math.max(0, KEEPSAKE_DRAW.indexOf(drawId));
  return KEEPSAKES[i % KEEPSAKES.length].id;
}

export const CUTSCENE_INFO = {
  rope: { name: 'Burned', text: 'Set alight, cut loose, and shot.' },
  exit: { name: 'The Exit', text: 'A door marked EXIT, and a long way down.' },
  grinder: { name: 'The Grinder', text: 'Dragged by the ankle and fed in.' },
  fan: { name: 'The Fan', text: 'Held up into the blades.' },
  eaten: { name: 'Supper', text: 'Taken apart on the floor and eaten.' },
  rack: { name: 'The Rack', text: 'Stretched on the winch until something gave.' },
  torn: { name: 'Torn in Two', text: 'Pulled apart at the waist.' },
  minced: { name: 'Minced', text: 'Pushed through the mincer, head first.' },
  packed: { name: 'Packed', text: 'Opened up and packed for the shelf.' },
  beaten: { name: 'Beaten', text: 'Beaten until there was nothing left to hit.' },
  brains: { name: 'Emptied', text: 'The top of the skull off, and what was in it taken out by hand.' },
  smoke: { name: 'Smoke Break', text: 'Roped to a table and set alight. He had a cigarette while it burned.' },
  forklift: { name: 'Right of Way', text: 'On the factory floor. He drove over you, backed up, and parked.' },
  ending: { name: 'Clocking Out', text: 'The end of the shift.' },
};
