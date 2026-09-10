import { GAME_CONFIG } from '../../data/gameConfig';
import type { CombatEvent, CombatEventKind, CombatState } from '../../types/game';

export function appendEvent(state: CombatState, kind: CombatEventKind, message: string,
  details: Omit<Partial<CombatEvent>, 'id' | 'kind' | 'message'> = {}, visibleInLog = true): CombatState {
  const id = state.eventSequence + 1;
  const event: CombatEvent = { id, kind, message, ...details };
  return { ...state, eventSequence: id,
    events: [...state.events, event].slice(-GAME_CONFIG.combatEventHistoryLimit),
    log: visibleInLog ? [...state.log, event].slice(-GAME_CONFIG.combatLogLimit) : state.log };
}
