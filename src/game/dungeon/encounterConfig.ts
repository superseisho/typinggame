export const ROOM_WEIGHTS = { battle: 35, elite: 12, rest: 12, shop: 10, treasure: 10, event: 15, altar: 6 } as const;
export const EVENT_CONFIG = {
  travelerCost: 100,
  campHeal: .20, campGold: [60, 120],
  chestGoldChance: 70, chestGold: [100, 180], chestDamage: .10,
  fountainHeal: .25, fountainGold: [50, 100],
  buffWeights: { common: 50, uncommon: 32, rare: 15, epic: 3 },
} as const;
export const ALTAR_CONFIG = {
  bloodDamage: .20, goldCost: 150,
  bloodWeights: { common: 0, uncommon: 0, rare: 80, epic: 20 },
  goldWeights: { common: 0, uncommon: 0, rare: 90, epic: 10 },
} as const;
