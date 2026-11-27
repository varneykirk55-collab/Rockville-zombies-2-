// Arena Mortis 2 wave_config.tres, zombie.gd, player.gd, and economy_config.tres.
export const SURVIVAL = Object.freeze({
  baseCount: 6, linearCount: 2.4, quadraticCount: 0.15, maxActive: 24,
  spawnStart: 2, spawnDecay: 0.94, spawnFloor: 0.45, firstSpawnDelay: 2,
  intermission: 3, minSpawnDistance: 12, maxSpawnDistance: 46,
  healthBase: 150, healthStep: 100, healthLinearRounds: 9, healthGrowth: 1.1,
  walkMin: 1.1, walkMax: 1.6, jogSpeed: 2.4, jogRound: 3,
  runMin: 3.6, runMax: 4.3, runRound: 5, runnerStep: 0.12, runnerCap: 0.85,
  attackDamage: 35, attackRange: 1.55, hitRange: 2.05, windup: 0.45, attackDuration: 1,
  attackCooldown: 0.45, biteChance: 0.28, awareness: 42, corpseSeconds: 7, maxCorpses: 12,
  playerHealth: 100, regenDelay: 4, regenRate: 30,
  pointsHit: 10, pointsKill: 60, pointsHeadKill: 100, roundBonus: 50,
  headshot: Object.freeze({ m4: 2.2, mk35: 2.2, pistol: 2.5 }),
});

export const zombiesForRound = round => {
  const step = round - 1;
  return Math.round(SURVIVAL.baseCount + SURVIVAL.linearCount * step + SURVIVAL.quadraticCount * step ** 2);
};
export const healthForRound = round => (SURVIVAL.healthBase +
  SURVIVAL.healthStep * (Math.min(round, SURVIVAL.healthLinearRounds) - 1)) *
  SURVIVAL.healthGrowth ** Math.max(0, round - SURVIVAL.healthLinearRounds);
