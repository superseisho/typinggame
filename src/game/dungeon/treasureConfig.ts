export const TREASURE_CONFIG = {
  outcomeWeights: { buff: 30, gold: 25, party_heal: 20, rare_buff: 15, trap_battle: 10 },
  gold: { min: 150, max: 250 }, healRatio: .3,
  buffWeights: { common: 45, uncommon: 35, rare: 17, epic: 3 },
  rareBuffWeights: { common: 0, uncommon: 0, rare: 85, epic: 15 },
  trapGold: [10, 25],
  trapAnnouncementMs: 750,
  trapEncounters: [['crypt-slime'], ['goblin-archer'], ['crypt-slime', 'grave-shaman']],
} as const;

export function getTreasureTrapPercent(): number {
  const total = Object.values(TREASURE_CONFIG.outcomeWeights).reduce((sum, weight) => sum + weight, 0);
  return total > 0 ? Math.round(TREASURE_CONFIG.outcomeWeights.trap_battle / total * 100) : 0;
}
