import type { CharacterId, CombatState } from '../../types/game';
import { getEffectiveCharacter } from '../buffs/buffModifiers';

/** Shared HP/Revive update. Gauges are preserved, matching Rest revival. Callers emit their own events. */
export function recoverPartyMember(state: CombatState, targetId: CharacterId, amount: number, allowRevive = false) {
  const member = state.party.find(p => p.definitionId === targetId);
  if (!member || (member.currentHp <= 0 && !allowRevive)) return { state, actualHeal: 0, wasRevived: false };
  const maxHp = getEffectiveCharacter(state, targetId).stats.maxHp;
  const wasDown = member.currentHp <= 0;
  const hp = Math.min(maxHp, Math.max(wasDown && allowRevive ? 1 : member.currentHp, member.currentHp + Math.max(0, amount)));
  const actualHeal = hp - member.currentHp;
  if (actualHeal <= 0) return { state, actualHeal: 0, wasRevived: false };
  return { state: { ...state, party: state.party.map(p => p.definitionId === targetId ? { ...p, currentHp: hp,
    guardCharges: wasDown ? 0 : p.guardCharges, statuses: wasDown ? p.statuses.filter(s => s !== 'ability:guard') : p.statuses,
  } : p) }, actualHeal, wasRevived: wasDown };
}
