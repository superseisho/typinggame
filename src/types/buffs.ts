import type { CharacterId } from './game';
import type { SoundId } from './audio';

export type BuffRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const BUFF_RARITIES: readonly BuffRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export type BuffCategory = 'Global' | 'Knight' | 'Mage' | 'Cleric' | 'Fighter' | 'Typing' | 'Defensive' | 'Offensive' | 'Utility';
export type BuffTarget = 'party' | CharacterId;
export type BuffStat = 'attack' | 'defense' | 'maxHp' | 'attackThreshold' | 'abilityThreshold' | 'abilityDamage' | 'healPower' | 'comboBonus' | 'activeAttack' | 'missGauge';
export type BuffEffect =
  | { readonly type: 'modifier'; readonly stat: BuffStat; readonly target: BuffTarget; readonly value: number }
  | { readonly type: 'guard-heal' | 'guard-counter' | 'guard-gauge-shield' | 'heal-extra' | 'heal-shield'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'streak-charge' | 'streak-damage' | 'streak-heal' | 'streak-seal'; readonly threshold: number; readonly value: number }
  | { readonly type: 'miss-protection' | 'instant-kill' | 'normal-aoe'; readonly value: number };
export interface BuffDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rarity: BuffRarity;
  readonly categories: readonly BuffCategory[];
  readonly effects: readonly BuffEffect[];
  readonly stackable: boolean;
  readonly maxStacks: number;
  readonly soundId?: SoundId;
}
export interface RunBuff { readonly buffId: string; readonly stacks: number }
/** Conditional, battle-local resources. Never written to character definitions. */
export interface BuffCombatResources {
  readonly focusRechargeMs: readonly number[];
  readonly counters: Readonly<Partial<Record<CharacterId, number>>>;
  readonly shields: Readonly<Partial<Record<CharacterId, number>>>;
  readonly gaugeShield: number;
}
