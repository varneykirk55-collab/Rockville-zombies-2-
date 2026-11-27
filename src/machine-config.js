// Arena Mortis 2 economy_config.tres and weapons/*.tres at 4d05984.
export const ECONOMY = Object.freeze({ startingPoints: 500, box: 950, pack: 5000 });
export const UPGRADES = {
  m4: { name: 'Legio Fulminata', damage: 2, magazine: 1.334, reserve: 1.5, rate: 1.1, tint: [1, 0.35, 0.15] },
  mk35: { name: 'Praetorian Tempest', damage: 2, magazine: 1.334, reserve: 1.5, rate: 1.1, tint: [0.25, 0.75, 1] },
  pistol: { name: 'Mars Ultor', damage: 2.5, magazine: 1.5, reserve: 1.5, rate: 1.2, tint: [0.85, 0.2, 1] },
};

// Rockville retains Arena Mortis 2's rifle weights and assigns the M1911 weight 25.
export const BOX_POOL = [{ id: 'm4', weight: 85 }, { id: 'mk35', weight: 40 }, { id: 'pistol', weight: 25 }];

export function createWallet(startingPoints = ECONOMY.startingPoints) {
  let points = startingPoints;
  return {
    get points() { return points; },
    credit(amount) {
      if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(points + amount)) return false;
      points += amount;
      return true;
    },
    spend(amount) {
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > points) return false;
      points -= amount;
      return true;
    },
  };
}
