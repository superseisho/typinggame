import type { RoomDefinition, RoomType } from '../../types/dungeon';
import { DUNGEON_CONFIG, SHOP_PRODUCTS } from '../../game/dungeon/dungeonConfig';

const goldLabel = (range: readonly [number, number]) => `Gold ${range[0]}–${range[1]}`;

export const ROOM_DEFINITIONS: readonly RoomDefinition[] = [
  { type: 'battle', name: 'Battle', icon: '⚔', description: '魔物の部隊と戦う。HPを温存しながら道を切り拓こう。', dangerLevel: 2, reward: goldLabel(DUNGEON_CONFIG.rewards.battle), weight: 45 },
  { type: 'elite', name: 'Elite Battle', icon: '♜', description: '強化された魔物が待つ。危険を引き受け、多くのGoldを得る。', dangerLevel: 4, reward: goldLabel(DUNGEON_CONFIG.rewards.elite), weight: 15 },
  { type: 'rest', name: 'Rest', icon: '✚', description: '安全な休憩所。全体回復・集中治療・蘇生から1つ選ぶ。', dangerLevel: 0, reward: 'Recovery / Revive', weight: 15 },
  { type: 'shop', name: 'Shop', icon: '⚖', description: 'Goldを使ってポーションを購入できる。必要な味方を回復しよう。', dangerLevel: 0, reward: `Potions · ${SHOP_PRODUCTS.map((item) => item.price).join(' / ')} Gold`, weight: 15 },
  { type: 'treasure', name: 'Treasure', icon: '◇', description: '戦闘なしで宝を獲得。Goldまたはパーティーの小回復。', dangerLevel: 0, reward: 'Gold / Recovery', weight: 10 },
];
export const ROOMS_BY_TYPE = Object.fromEntries(ROOM_DEFINITIONS.map((room) => [room.type, room])) as Record<RoomType, RoomDefinition>;
