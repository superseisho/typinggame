export const DUNGEON_CONFIG = {
  maxFloor: 10,
  bossFloors: [10] as readonly number[],
  safeFloors: [1] as readonly number[],
  roomChoices: 3,
  maxSameRoom: 2,
  ambushChance: 0.08,
  announcementMs: 900,
  startingGold: 0,
  rest: { partyRatio: 0.3, focusedRatio: 0.6, reviveRatio: 0.3 },
  rewards: { battle: [45, 65], elite: [100, 130], ambush: [55, 75], boss: [200, 260] },
  treasure: { goldChance: 0.65, gold: 80, recoveryRatio: 0.1 },
} as const;

// Tier is an encounter-table boundary, not a per-floor stat multiplier.
// Future tiers can add their own tables without changing CombatEngine.
export const TIER_ONE_ENCOUNTERS = {
  battle: [['crypt-slime'], ['goblin-archer'], ['crypt-slime', 'grave-shaman']],
  elite: [['elite-slime'], ['elite-slime', 'grave-shaman']],
  ambush: [['goblin-archer', 'grave-shaman']],
  boss: [['crypt-warden']],
} as const;

export const SHOP_PRODUCTS = [
  { id: 'small-potion', name: 'Small Potion', price: 50, recoveryRatio: 0.2 },
  { id: 'large-potion', name: 'Large Potion', price: 100, recoveryRatio: 0.5 },
] as const;
