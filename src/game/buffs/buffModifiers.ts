import { CHARACTERS_BY_ID } from '../../data/characters';
import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { BuffEffect, BuffStat, RunBuff } from '../../types/buffs';
import type { CharacterDefinition, CharacterId, CombatState } from '../../types/game';
import { BUFF_CONFIG } from './buffConfig';
import { getTargetedBuffValue } from './buffValues';
import { getComboView, type ComboState } from '../combat/fighterCombo';
export { getTargetedBuffValue } from './buffValues';

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
export function getEffectiveCharacter(state: ComboState & Partial<Pick<CombatState, 'buffResources'>>, id: CharacterId): CharacterDefinition {
  const base = CHARACTERS_BY_ID[id];
  const modifier = (stat: BuffStat) => {
    const temporary = stat === 'attack' || stat === 'defense' ? state.buffResources?.timedPartyModifiers[stat] : undefined;
    const personal = state.buffResources?.timedCharacterModifiers.reduce((sum, effect) => sum + (effect.characterId === id && effect.stat === stat && effect.remainingMs > 0 ? effect.value : 0), 0) ?? 0;
    return 1 + getBuffModifier(state.runBuffs, stat, id) + (temporary && temporary.remainingMs > 0 ? temporary.value : 0)
      + personal + (stat === 'attack' ? state.buffResources?.abilityAttackGrowth[id] ?? 0 : 0);
  };
  const trigger = base.ability.trigger;
  return { ...base,
    stats: { ...base.stats, attack: Math.round(base.stats.attack * modifier('attack')), maxHp: Math.round(base.stats.maxHp * modifier('maxHp')),
      defense: Math.round(base.stats.defense * modifier('defense')) },
    attackThreshold: Math.max(BUFF_CONFIG.minAttackThreshold, Math.ceil(base.attackThreshold * modifier('attackThreshold')) - (state.buffResources?.attackThresholdReduction ?? 0)
      - getComboView(state, id).stage * getTargetedBuffValue(state.runBuffs, 'combo-stage-threshold-reduction', id)),
    ability: { ...base.ability,
      trigger: trigger.type === 'correct-characters' ? { ...trigger, threshold: Math.max(BUFF_CONFIG.minAbilityThreshold, Math.ceil(trigger.threshold * modifier('abilityThreshold'))) }
        : trigger.type === 'completed-prompts' ? { ...trigger, threshold: Math.max(1, trigger.threshold - getTargetedBuffValue(state.runBuffs, 'completed-prompt-threshold-reduction', id)) } : trigger,
      effects: base.ability.effects.map(effect => effect.type === 'damage-all-enemies' ? { ...effect, power: Math.round(effect.power * modifier('abilityDamage')) }
        : effect.type === 'heal-lowest-ally' ? { ...effect, power: Math.round(effect.power * modifier('healPower')) } : effect),
    },
  };
}

export function getComboMultiplier(state: CombatState, id: CharacterId): number {
  const combo = getComboView(state, id);
  if (!combo.stage) return 1;
  const bonus = (combo.multiplier - 1) * (1 + getBuffModifier(state.runBuffs, 'comboBonus', id));
  return (1 + bonus) * (1 + getBuffModifier(state.runBuffs, 'activeAttack', id));
}
