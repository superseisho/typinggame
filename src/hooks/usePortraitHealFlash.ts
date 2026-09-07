import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  collectUnconsumedHealFlashes,
  type PortraitFlashCue,
} from '../game/combat/portraitFlash';
import type { CombatState } from '../types/game';

const MAX_QUEUED_HEAL_FLASHES = 4;

export function usePortraitHealFlash(
  combat: CombatState,
  characterId: string,
  disabled: boolean,
): PortraitFlashCue | null {
  const [queue, setQueue] = useState<readonly PortraitFlashCue[]>([]);
  const processedThroughEventId = useRef(combat.eventSequence);

  useLayoutEffect(() => {
    const previousCursor = processedThroughEventId.current;
    processedThroughEventId.current = combat.eventSequence;
    if (disabled) {
      setQueue([]);
      return;
    }

    const newCues = collectUnconsumedHealFlashes(
      combat.events,
      previousCursor,
      characterId,
    );
    if (newCues.length === 0) return;
    setQueue((current) => [...current, ...newCues].slice(0, MAX_QUEUED_HEAL_FLASHES));
  }, [characterId, combat.eventSequence, combat.events, disabled]);

  const activeCue = queue[0] ?? null;
  useEffect(() => {
    if (!activeCue) return;
    const timer = window.setTimeout(() => {
      setQueue((current) => current[0]?.eventId === activeCue.eventId ? current.slice(1) : current);
    }, activeCue.durationMs);
    return () => window.clearTimeout(timer);
  }, [activeCue]);

  return activeCue;
}
