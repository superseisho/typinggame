import type { CharacterId, CombatState } from './game';
import type { Difficulty } from './save';

export type RoomType = 'battle' | 'elite' | 'rest' | 'shop' | 'treasure';
export type DungeonRoomType = RoomType | 'boss' | 'ambush';
export interface RoomDefinition {
  readonly type: RoomType;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly dangerLevel: number;
  readonly reward: string;
  readonly weight: number;
}
export interface RoomOption { readonly id: string; readonly type: RoomType }
export interface RoomHistory {
  readonly floor: number;
  readonly roomType: DungeonRoomType;
  readonly result: 'cleared' | 'failed';
  readonly goldReward: number;
}
export interface RunStatistics {
  readonly correctCharacters: number;
  readonly misses: number;
  readonly maxCombo: number;
  readonly timeoutCount: number;
  readonly combatMs: number;
  readonly enemiesDefeated: number;
}
export type RunStatus = 'choosing' | 'announcement' | 'battle' | 'room' | 'reward' | 'cleared' | 'game_over';
export interface DungeonRunState {
  readonly id: string;
  readonly currentFloor: number;
  readonly maxFloor: number;
  readonly enemyTier: 1;
  readonly selectedDifficulty: Difficulty;
  readonly gold: number;
  readonly goldEarned: number;
  readonly rngState: number;
  readonly runStatus: RunStatus;
  readonly currentRoom: DungeonRoomType | null;
  readonly roomOptions: readonly RoomOption[];
  /** Combat owns party HP: there is no second, potentially stale copy. */
  readonly combat: CombatState;
  readonly currentCombatMs: number;
  readonly statistics: RunStatistics;
  readonly clearedRooms: readonly RoomHistory[];
  readonly purchasedProducts: readonly string[];
  readonly roomMessage: string;
  readonly endedAt: number | null;
}
export type RestAction = 'party' | 'focused' | 'revive';
export type DungeonAction =
  | { readonly type: 'choose'; readonly optionId: string; readonly now: number }
  | { readonly type: 'enter-battle'; readonly now: number }
  | { readonly type: 'key'; readonly key: string; readonly now: number }
  | { readonly type: 'tick'; readonly deltaMs: number; readonly now: number }
  | { readonly type: 'rest'; readonly action: RestAction; readonly targetId?: CharacterId }
  | { readonly type: 'purchase'; readonly productId: string; readonly targetId: CharacterId }
  | { readonly type: 'leave-shop' }
  | { readonly type: 'advance' };
