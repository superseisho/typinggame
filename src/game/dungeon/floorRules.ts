import { DUNGEON_CONFIG } from './dungeonConfig';

/** Preparation floors follow the boss schedule, including future 20F / 30F bosses. */
export function isPreBossFloor(floor: number, bossFloors: readonly number[] = DUNGEON_CONFIG.bossFloors): boolean {
  return bossFloors.includes(floor + 1);
}
