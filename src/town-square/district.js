// Rockville Town Square facade recipes, keyed by county OBJECTID.
// Roles follow the 2007 WDG blocks, the library, the later Cambria / Ansel
// towers, and the low garages. They are not a random mix.
// Plaza center is the open ground between Gibbs Street and Maryland Avenue.

export const PLAZA = { x: 40, z: -6 };

const ROLES = {
  127891: 'library',
  232961: 'gallery',
  232962: 'gallery',
  211255: 'gallery',
  247224: 'gallery',
  253420: 'brick-street',
  227489: 'garage',
  232960: 'garage',
  253421: 'garage',
  128822: 'garage',
  128717: 'low-retail',
  153949: 'low-retail',
  153951: 'low-retail',
  227490: 'clock-block',
  212553: 'kiosk',
  212554: 'kiosk',
  128508: 'brick-street',
  228546: 'brick-street',
  228547: 'brick-street',
  227491: 'brick-street',
  227492: 'brick-cream',
  228548: 'brick-street',
  127071: 'brick-cream',
  227751: 'brick-street',
  255837: 'brick-street',
  128821: 'brick-street',
  131322: 'brick-street',
  126987: 'garage-front',
  128588: 'brick-street',
  153950: 'brick-street',
  127231: 'brick-street',
  227488: 'brick-street',
  240005: 'hotel',
  238865: 'hotel',
  238866: 'hotel',
  240007: 'hotel',
  129621: 'midrise',
  272520: 'glass-tower',
  272521: 'glass-tower',
  272526: 'glass-tower',
  240271: 'glass-tower',
  240276: 'glass-tower',
  240006: 'glass-tower',
  240274: 'glass-tower',
  240278: 'glass-tower',
  272794: 'midrise',
  277318: 'liner',
  240272: 'podium',
  240008: 'podium',
  240273: 'podium',
  240277: 'podium',
  240275: 'podium',
  272525: 'podium',
  272519: 'podium',
  272522: 'podium',
  272523: 'podium',
  272524: 'podium',
  272795: 'podium',
};

// Underlying mass color, used only where the new shell does not cover an edge.
const MASS = {
  library: 0xd2c4aa,
  gallery: 0x8d4338,
  'brick-street': 0x8d4338,
  'brick-cream': 0x6d4034,
  'clock-block': 0x8d4338,
  garage: 0x7a756c,
  'garage-front': 0x7a756c,
  'low-retail': 0x8d4338,
  hotel: 0x6a3c32,
  'glass-tower': 0x7f949c,
  midrise: 0x6d4034,
  liner: 0x8d4338,
  podium: 0x7a756c,
  kiosk: 0x8d4338,
};

export function townSquareRole(id) {
  return ROLES[id] ?? null;
}

export function townSquareWallHex(id) {
  const role = townSquareRole(id);
  return role ? MASS[role] : null;
}

export function townSquareIds() {
  return Object.keys(ROLES).map(Number);
}
