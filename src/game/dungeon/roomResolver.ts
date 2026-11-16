import { getEffectiveCharacter } from '../buffs/buffModifiers';
import { GAME_CONFIG } from '../../data/gameConfig';
import type { CharacterId, CombatState } from '../../types/game';
import type { RestAction } from '../../types/dungeon';
import { DUNGEON_CONFIG } from './dungeonConfig';
import { recoverPartyMember } from '../combat/partyRecovery';
import { appendEvent } from '../combat/combatEvents';

export function recoveryTargets(combat: CombatState, revive = false) {
  return combat.party.filter((member) => revive ? member.currentHp <= 0 : member.currentHp > 0 && member.currentHp < getEffectiveCharacter(combat, member.definitionId).stats.maxHp);
}

/** Actual HP changes emit existing events, so room heals reuse green flashes / SE. */
export function recoverParty(combat: CombatState, ratio: number, targetId?: CharacterId, revive = false): CombatState {
  let next = combat;
  for (const member of combat.party) {
    if (targetId && member.definitionId !== targetId) continue;
    if (revive ? member.currentHp > 0 : member.currentHp <= 0) continue;
    const definition = getEffectiveCharacter(next, member.definitionId);
    const result = recoverPartyMember(next, member.definitionId, Math.ceil(definition.stats.maxHp * ratio), revive);
    if (result.actualHeal <= 0) continue;
    next = appendEvent(result.state, revive ? 'system' : 'ally-heal', `${definition.name} ${revive ? '蘇生' : '回復'} +${result.actualHeal}`, {
      targetId: member.definitionId, amount: result.actualHeal, soundId: 'ally_heal', wasRevived: result.wasRevived,
    });
  }
  return { ...next, log: next.events.slice(-GAME_CONFIG.combatLogLimit) };
}

export function resolveRest(combat: CombatState, action: RestAction, targetId?: CharacterId): CombatState | null {
  if (action === 'party') return recoverParty(combat, DUNGEON_CONFIG.rest.partyRatio);
  if (!targetId || !recoveryTargets(combat, action === 'revive').some((member) => member.definitionId === targetId)) return null;
  return recoverParty(combat, action === 'revive' ? DUNGEON_CONFIG.rest.reviveRatio : DUNGEON_CONFIG.rest.focusedRatio, targetId, action === 'revive');
}
