import { useEffect, useRef } from 'react';
import type { CombatEvent } from '../types/game';
import { audioManager } from './AudioManager';
import { soundForCombatEvent } from './combatEventAudio';

export function useCombatAudio(events: readonly CombatEvent[]): void {
  const lastProcessedEventId = useRef(0);

  useEffect(() => {
    const latestEventId = events.at(-1)?.id ?? 0;
    if (latestEventId < lastProcessedEventId.current) lastProcessedEventId.current = 0;
    for (const event of events) {
      if (event.id <= lastProcessedEventId.current) continue;
      const soundId = soundForCombatEvent(event);
      if (soundId) audioManager.play(soundId);
      lastProcessedEventId.current = event.id;
    }
  }, [events]);
}
