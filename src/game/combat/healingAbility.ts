import type { CharacterId, CombatState } from '../../types/game';
import { getEffectiveCharacter, getTargetedBuffValue } from '../buffs/buffModifiers';
import { getExtraHealing, handleBuffTrigger } from '../buffs/buffEffectHandlers';
import { selectLowestPartyHpIndex } from './targeting';
import { recoverPartyMember } from './partyRecovery';
import { appendEvent } from './combatEvents';

/** Freeze targets once per cast. A repeated pulse never selects a different ally. */
export function selectHealingTargets(state: CombatState, healerId: CharacterId): readonly CharacterId[] {
  const revive = getTargetedBuffValue(state.runBuffs, 'heal-revive', healerId) > 0;
  if (getTargetedBuffValue(state.runBuffs, 'heal-all-targets', healerId) > 0) {
    return state.party.filter(p => p.currentHp > 0 || revive).map(p => p.definitionId);
  }
  const down = revive ? state.party.find(p => p.currentHp <= 0) : undefined;
  if (down) return [down.definitionId];
  const index = selectLowestPartyHpIndex(state);
  return index === null ? [] : [state.party[index].definitionId];
}

export function resolveHealingPulse(state: CombatState, healerId: CharacterId, targets: readonly CharacterId[], power: number, pulse: number): CombatState {
  const source = getEffectiveCharacter(state, healerId);
  const revive = getTargetedBuffValue(state.runBuffs, 'heal-revive', healerId) > 0;
  let next = state;
  for (const targetId of targets) {
    const member = next.party.find(p => p.definitionId === targetId);
    if (!member || (member.currentHp <= 0 && !revive)) continue;
    const targetName = getEffectiveCharacter(next, targetId).name;
    const resolution = recoverPartyMember(next, targetId, power + getExtraHealing(next, healerId, targetId), revive);
    next = resolution.state;
    if (resolution.actualHeal > 0) {
      next = appendEvent(next, 'ally-heal', `${source.name}の「${source.ability.name}」${pulse > 1 ? ` · PULSE ${pulse}` : ''}！ ${resolution.wasRevived ? 'REVIVE · ' : ''}${targetName}のHPが ${resolution.actualHeal} 回復した。`, {
        actorId: healerId, targetId, amount: resolution.actualHeal, abilityId: source.ability.id, soundId: source.ability.soundId,
        healPulse: pulse, wasRevived: resolution.wasRevived, targetHpAfter: next.party.find(p => p.definitionId === targetId)!.currentHp,
      });
      // Legacy actual-healing effects (Guardian Blessing) keep their old contract.
      next = handleBuffTrigger(next, { type: 'heal', characterId: healerId, targetId });
    }
    next = handleBuffTrigger(next, { type: 'heal-target', characterId: healerId, targetId,
      actualHeal: resolution.actualHeal, wasRevived: resolution.wasRevived, pulse });
  }
  return next;
}

export function resolveHealingAbility(state: CombatState, healerId: CharacterId, power: number): CombatState {
  const targets = selectHealingTargets(state, healerId);
  const pulses = Math.max(1, getTargetedBuffValue(state.runBuffs, 'heal-repeat', healerId));
  let next = state;
  for (let pulse = 1; pulse <= pulses; pulse++) next = resolveHealingPulse(next, healerId, targets, power, pulse);
  return next;
}
