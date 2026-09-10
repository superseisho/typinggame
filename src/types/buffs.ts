import type { CharacterId } from './game';
import type { SoundId } from './audio';

export type BuffRarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type BuffCategory = 'Global' | 'Knight' | 'Mage' | 'Cleric' | 'Fighter' | 'Typing' | 'Defensive' | 'Utility';
export type BuffTarget = 'party' | CharacterId;
export type BuffStat = 'attack' | 'maxHp' | 'attackThreshold' | 'abilityThreshold' | 'abilityDamage' | 'healPower' | 'comboBonus' | 'activeAttack' | 'missGauge';
export type BuffEffect =
  | { readonly type: 'modifier'; readonly stat: BuffStat; readonly target: BuffTarget; readonly value: number }
  | { readonly type: 'guard-heal' | 'guard-counter' | 'guard-gauge-shield' | 'heal-extra' | 'heal-shield'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'streak-charge' | 'streak-damage'; readonly threshold: number; readonly value: number };
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
  readonly counters: Readonly<Partial<Record<CharacterId, number>>>;
  readonly shields: Readonly<Partial<Record<CharacterId, number>>>;
  readonly gaugeShield: number;
}
