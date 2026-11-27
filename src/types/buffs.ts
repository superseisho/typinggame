import type { CharacterId } from './game';
import type { SoundId } from './audio';

export type BuffRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const BUFF_RARITIES: readonly BuffRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export type BuffCategory = 'Global' | 'Knight' | 'Mage' | 'Cleric' | 'Fighter' | 'Typing' | 'Defensive' | 'Offensive' | 'Utility';
export type BuffTarget = 'party' | CharacterId;
export type BuffStat = 'attack' | 'defense' | 'maxHp' | 'attackThreshold' | 'abilityThreshold' | 'abilityDamage' | 'healPower' | 'comboBonus' | 'activeAttack' | 'missGauge';
export type BuffEffect =
  | { readonly type: 'free-reroll'; readonly value: number; readonly targets: readonly ('buff-reward' | 'shop')[] }
  | { readonly type: 'modifier'; readonly stat: BuffStat; readonly target: BuffTarget; readonly value: number }
  | { readonly type: 'guard-heal' | 'guard-counter' | 'guard-gauge-shield' | 'heal-extra' | 'heal-shield'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'streak-charge' | 'streak-damage' | 'streak-heal' | 'streak-seal'; readonly threshold: number; readonly value: number }
  | { readonly type: 'guard-timed-party-modifier'; readonly stat: 'attack' | 'defense'; readonly value: number; readonly durationMs: number }
  | { readonly type: 'guard-party-heal' | 'guard-party-attack-charge' | 'guard-retaliation' | 'guard-battle-threshold-reduction'; readonly value: number }
  | { readonly type: 'guard-extra-charge' | 'completed-prompt-threshold-reduction'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'target-weight-modifier' | 'ability-next-normal-aoe' | 'ability-battle-attack-growth'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'ability-action-delay'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'ability-damage-over-time'; readonly target: CharacterId; readonly value: number; readonly durationMs: number; readonly intervalMs: number }
  | { readonly type: 'heal-attack-charge' | 'heal-all-targets' | 'heal-revive' | 'heal-repeat'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'heal-timed-modifier'; readonly target: CharacterId; readonly stat: 'attack' | 'defense'; readonly value: number; readonly durationMs: number }
  | { readonly type: 'normal-attack-action-delay' | 'combo-stage-threshold-reduction' | 'max-combo-stage-increase' | 'combo-miss-stage-loss'; readonly target: CharacterId; readonly value: number }
  | { readonly type: 'combo-stage-multihit'; readonly target: CharacterId; readonly activationStage: number; readonly value: number }
  | { readonly type: 'miss-protection' | 'instant-kill' | 'normal-aoe' | 'correct-input-charge-multiplier'; readonly value: number };
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
  readonly timedCharacterModifiers: readonly { readonly sourceId: string; readonly characterId: CharacterId; readonly stat: 'attack' | 'defense'; readonly value: number; readonly remainingMs: number }[];
  readonly nextNormalAoe: Readonly<Partial<Record<CharacterId, boolean>>>;
  readonly abilityAttackGrowth: Readonly<Partial<Record<CharacterId, number>>>;
  readonly timedPartyModifiers: Readonly<Partial<Record<'attack' | 'defense', { readonly value: number; readonly remainingMs: number }>>>;
  readonly attackThresholdReduction: number;
  readonly focusRechargeMs: readonly number[];
  readonly counters: Readonly<Partial<Record<CharacterId, number>>>;
  readonly shields: Readonly<Partial<Record<CharacterId, number>>>;
  readonly gaugeShield: number;
}
