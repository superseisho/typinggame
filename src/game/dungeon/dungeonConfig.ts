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
} as const;
