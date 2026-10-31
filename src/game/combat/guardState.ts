import type { CombatState } from '../../types/game';

/** Charges are authoritative; portrait/status mirrors them. Down and terminal states cannot guard. */
export function syncGuardState(state: CombatState): CombatState {
  const ended = state.status === 'victory' || state.status === 'defeat';
  return { ...state,
    buffResources: ended ? { ...state.buffResources, timedPartyModifiers: {}, attackThresholdReduction: 0 } : state.buffResources,
    party: state.party.map(member => {
      const guardCharges = ended || member.currentHp <= 0 ? 0 : member.guardCharges;
      const statuses = member.statuses.filter(status => status !== 'ability:guard');
      return { ...member, guardCharges, statuses: guardCharges > 0 ? [...statuses, 'ability:guard'] : statuses };
    }),
  };
}
