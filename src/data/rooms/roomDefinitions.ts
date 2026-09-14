import type { RoomDefinition, RoomType } from '../../types/dungeon';
import { DUNGEON_CONFIG } from '../../game/dungeon/dungeonConfig';
import { getTreasureTrapPercent } from '../../game/dungeon/treasureConfig';
import { ROOM_WEIGHTS } from '../../game/dungeon/encounterConfig';

const goldLabel = (range: readonly [number, number]) => `Gold ${range[0]}–${range[1]}`;

export const ROOM_DEFINITIONS: readonly RoomDefinition[] = [
  { type: 'battle', name: 'Battle', icon: '⚔', description: '魔物と戦い、Goldと祝福を得る。', dangerLevel: 2, reward: goldLabel(DUNGEON_CONFIG.rewards.battle), features: [goldLabel(DUNGEON_CONFIG.rewards.battle).toUpperCase(), 'BUFF'], weight: ROOM_WEIGHTS.battle },
  { type: 'elite', name: 'Elite Battle', icon: '♜', description: '強敵に挑み、より強力な祝福を狙う。', dangerLevel: 4, reward: goldLabel(DUNGEON_CONFIG.rewards.elite), features: [goldLabel(DUNGEON_CONFIG.rewards.elite).toUpperCase(), 'HIGH RISK', 'BUFF'], weight: ROOM_WEIGHTS.elite },
  { type: 'rest', name: 'Rest', icon: '✚', description: '無料で回復・蘇生から1つ選ぶ。', dangerLevel: 0, reward: 'Recovery / Revive', features: ['PARTY HEAL', 'FOCUSED HEAL', 'REVIVE'], weight: ROOM_WEIGHTS.rest },
  { type: 'shop', name: 'Shop', icon: '⚖', description: 'Goldで回復や祝福を購入する。', dangerLevel: 0, reward: 'Recovery / Buff / Reroll', features: ['RECOVERY', 'BUFF', 'REROLL'], weight: ROOM_WEIGHTS.shop },
  { type: 'treasure', name: 'Treasure', icon: '◇', description: `無料の宝箱。${getTreasureTrapPercent()}%の確率で罠の戦闘。`, dangerLevel: 2, reward: 'Buff / Gold / Heal / Trap', features: ['FREE REWARD', 'RARE+ CHANCE', 'TRAP RISK'], weight: ROOM_WEIGHTS.treasure },
  { type: 'event', name: 'Event', icon: '?', description: '出会いや発見に、行動を選んで応える。', dangerLevel: 1, reward: 'Choices / Gold / HP / Buff', features: ['CHOICES', 'GOLD', 'HP', 'BUFF'], weight: ROOM_WEIGHTS.event },
  { type: 'altar', name: 'Altar', icon: '♆', description: 'HPかGoldを捧げ、強い祝福を選ぶ。', dangerLevel: 3, reward: 'Sacrifice → Rare / Epic Buff', features: ['RISK', 'RARE+ BUFF'], weight: ROOM_WEIGHTS.altar },
];
export const ROOMS_BY_TYPE = Object.fromEntries(ROOM_DEFINITIONS.map((room) => [room.type, room])) as Record<RoomType, RoomDefinition>;
