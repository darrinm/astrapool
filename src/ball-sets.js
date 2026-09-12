// Add future collections here; the picker and B shortcut share this catalog.
export const BALL_SETS = [
  { id: 'balls', name: 'Classic', description: 'The original solids & stripes.' },
  { id: 'planets', name: 'Planets', description: 'A little solar system on the felt.' },
  { id: 'heads', name: 'Heads', description: 'Familiar faces, numbered underneath.' },
];
export const ballSetById = id => BALL_SETS.find(set => set.id === id) || BALL_SETS[0];
export function readBallSet(storage) {
  try { return ballSetById(storage.getItem('playful.ballStyle')).id; } catch { return 'balls'; }
}
export const nextBallSet = id => BALL_SETS[(BALL_SETS.findIndex(set => set.id === id) + 1) % BALL_SETS.length].id;

// Major companions, not a census. Sizes and distances
// are compressed so a miniature system stays legible on a pool table.
export const PLANETS = [
  { id: 'mercury', name: 'Mercury', color: '#aba59e', moons: [] },
  { id: 'venus', name: 'Venus', color: '#e6c887', moons: [] },
  { id: 'earth', name: 'Earth', color: '#3884d8', moons: [['Moon', '#c9c9c7', .20]] },
  { id: 'mars', name: 'Mars', color: '#e47b48', moons: [['Phobos', '#b9a18d', .13], ['Deimos', '#c3b3a0', .10]] },
  { id: 'jupiter', name: 'Jupiter', color: '#daa67b', rings: 'dust',
    moons: [['Io', '#e3c45f', .14], ['Europa', '#e0d6b7', .12], ['Ganymede', '#b7aa95', .18], ['Callisto', '#807b73', .16]] },
  { id: 'saturn', name: 'Saturn', color: '#e3c58f', rings: 'saturn',
    moons: [['Titan', '#dfaf61', .19], ['Enceladus', '#f1f1eb', .10]] },
  { id: 'uranus', name: 'Uranus', color: '#9bdcdd', rings: 'fine',
    moons: [['Titania', '#b6b5b3', .14], ['Oberon', '#92908d', .12]] },
  { id: 'neptune', name: 'Neptune', color: '#78bdd4', rings: 'arcs',
    moons: [['Triton', '#d8cbbf', .18]] },
];
export const WORLDS = [
  ...PLANETS.slice(0, 7),
  { id: 'black-hole', name: 'Black hole', color: '#090705', rings: 'accretion', moons: [] },
  PLANETS[7],
  { id: 'moon', name: 'Moon', color: '#c6c6c3', moons: [] },
  { id: 'io', name: 'Io', color: '#ddc35d', moons: [] },
  { id: 'europa', name: 'Europa', color: '#c6b8a0', moons: [] },
  { id: 'ganymede', name: 'Ganymede', color: '#a79883', moons: [] },
  { id: 'titan', name: 'Titan', color: '#d8ad68', moons: [] },
  { id: 'pluto', name: 'Pluto', color: '#c8ab93', moons: [['Charon', '#a9aaa9', .24]] },
];
export const SUN = { id: 'sun', name: 'Sun', color: '#ffe3a0', moons: [] };
export const planetForBall = number => number === 0 ? SUN : WORLDS[number - 1] ?? null;
