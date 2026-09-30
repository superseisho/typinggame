import { CHARACTERS_BY_ID } from '../../data/characters';
import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { BuffEffect, BuffStat, RunBuff } from '../../types/buffs';
import type { CharacterDefinition, CharacterId, CombatState } from '../../types/game';
import { BUFF_CONFIG } from './buffConfig';

export function getBuffModifier(buffs: readonly RunBuff[], stat: BuffStat, target: CharacterId): number {
  return buffs.reduce((total, buff) => total + (BUFFS_BY_ID[buff.buffId]?.effects ?? []).reduce((sum, effect) =>
    sum + (effect.type === 'modifier' && effect.stat === stat && (effect.target === 'party' || effect.target === target) ? effect.value * buff.stacks : 0), 0), 0);
}

/** Shared numeric conditional effects, derived from data rather than Buff IDs. */
export function getBuffEffectValue(buffs: readonly RunBuff[], type: BuffEffect['type']): number {
  return buffs.reduce((sum, owned) => sum + (BUFFS_BY_ID[owned.buffId]?.effects ?? [])
    .reduce((value, effect) => value + (effect.type === type ? effect.value * owned.stacks : 0), 0), 0);
}

/** Multiplier for basic correct-input charge only; never stats, streaks or Buff charge grants. */
export function getCorrectInputChargeMultiplier(buffs: readonly RunBuff[]): number {
  // Add bonuses above x1, so future x1.25 / x1.5 effects compose predictably.
  return Math.max(0, 1 + buffs.reduce((sum, owned) => sum + (BUFFS_BY_ID[owned.buffId]?.effects ?? []).reduce((bonus, effect) =>
    bonus + (effect.type === 'correct-input-charge-multiplier' ? (effect.value - 1) * owned.stacks : 0), 0), 0));
}

/** Pure derived definition: base data, art and run buffs are never mutated. */
export function getEffectiveCharacter(state: Pick<CombatState, 'runBuffs'>, id: CharacterId): CharacterDefinition {
  const base = CHARACTERS_BY_ID[id];
  const modifier = (stat: BuffStat) => 1 + getBuffModifier(state.runBuffs, stat, id);
  const trigger = base.ability.trigger;
  return { ...base,
    stats: { ...base.stats, attack: Math.round(base.stats.attack * modifier('attack')), maxHp: Math.round(base.stats.maxHp * modifier('maxHp')),
      defense: Math.round(base.stats.defense * modifier('defense')) },
    attackThreshold: Math.max(BUFF_CONFIG.minAttackThreshold, Math.ceil(base.attackThreshold * modifier('attackThreshold'))),
    ability: { ...base.ability,
      trigger: trigger.type === 'correct-characters' ? { ...trigger, threshold: Math.max(BUFF_CONFIG.minAbilityThreshold, Math.ceil(trigger.threshold * modifier('abilityThreshold'))) } : trigger,
      effects: base.ability.effects.map(effect => effect.type === 'damage-all-enemies' ? { ...effect, power: Math.round(effect.power * modifier('abilityDamage')) }
        : effect.type === 'heal-lowest-ally' ? { ...effect, power: Math.round(effect.power * modifier('healPower')) } : effect),
    },
  };
}

export function getComboMultiplier(state: CombatState, id: CharacterId): number {
  const base = CHARACTERS_BY_ID[id];
  const trigger = base.ability.trigger;
  const effect = base.ability.effects.find(effect => effect.type === 'combo-attack-scaling');
  if (trigger.type !== 'combo-milestones' || effect?.type !== 'combo-attack-scaling') return 1;
  const tier = trigger.thresholds.filter(threshold => state.typing.currentCombo >= threshold).length;
  if (!tier) return 1;
  const bonus = (effect.multipliers[tier - 1] - 1) * (1 + getBuffModifier(state.runBuffs, 'comboBonus', id));
  return (1 + bonus) * (1 + getBuffModifier(state.runBuffs, 'activeAttack', id));
}
