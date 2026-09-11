import type { RoomDefinition, RoomType } from '../../types/dungeon';
import { DUNGEON_CONFIG } from '../../game/dungeon/dungeonConfig';
import { getTreasureTrapPercent } from '../../game/dungeon/treasureConfig';

const goldLabel = (range: readonly [number, number]) => `Gold ${range[0]}–${range[1]}`;

export const ROOM_DEFINITIONS: readonly RoomDefinition[] = [
  { type: 'battle', name: 'Battle', icon: '⚔', description: '魔物の部隊と戦う。HPを温存しながら道を切り拓こう。', dangerLevel: 2, reward: goldLabel(DUNGEON_CONFIG.rewards.battle), weight: 45 },
  { type: 'elite', name: 'Elite Battle', icon: '♜', description: '強化された魔物が待つ。危険を引き受け、多くのGoldを得る。', dangerLevel: 4, reward: goldLabel(DUNGEON_CONFIG.rewards.elite), weight: 15 },
  { type: 'rest', name: 'Rest', icon: '✚', description: '安全な休憩所。全体回復・集中治療・蘇生から1つ選ぶ。', dangerLevel: 0, reward: 'Recovery / Revive', weight: 15 },
  { type: 'shop', name: 'Shop', icon: '⚖', description: 'Goldで回復・Buffを選ぶ。商品のRerollも可能。蘇生はRestへ。', dangerLevel: 0, reward: 'Recovery / Buff / Reroll', weight: 15 },
  { type: 'treasure', name: 'Treasure', icon: '◇', description: `無料の祝福・大量Gold・回復。${getTreasureTrapPercent()}%の確率で罠の戦闘が発生。`, dangerLevel: 2, reward: 'Buff / Gold / Heal / Trap', weight: 10 },
];
export const ROOMS_BY_TYPE = Object.fromEntries(ROOM_DEFINITIONS.map((room) => [room.type, room])) as Record<RoomType, RoomDefinition>;
