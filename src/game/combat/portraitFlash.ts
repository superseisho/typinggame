import { HEAL_FLASH_DURATION_MS } from '../../data/gameConfig';
import type { CombatEvent } from '../../types/game';

export interface PortraitFlashCue {
  readonly eventId: number;
  readonly kind: 'ally_heal';
  readonly durationMs: number;
}

export function getPortraitHealFlashCue(
  event: CombatEvent,
  characterId: string,
): PortraitFlashCue | null {
  if (event.kind !== 'ally-heal'
    || event.targetId !== characterId
    || (event.amount ?? 0) <= 0) return null;

  return {
    eventId: event.id,
    kind: 'ally_heal',
    durationMs: HEAL_FLASH_DURATION_MS,
  };
}

export function collectUnconsumedHealFlashes(
  events: readonly CombatEvent[],
  processedThroughEventId: number,
  characterId: string,
): readonly PortraitFlashCue[] {
  return events
    .filter((event) => event.id > processedThroughEventId)
    .map((event) => getPortraitHealFlashCue(event, characterId))
    .filter((cue): cue is PortraitFlashCue => cue !== null);
}
