import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  collectUnconsumedPortraitMotions,
  type PortraitEntityType,
  type PortraitMotionCue,
} from '../game/combat/portraitMotion';
import type { CombatState } from '../types/game';

const MAX_QUEUED_PORTRAIT_MOTIONS = 6;

export function usePortraitMotion(
  combat: CombatState,
  entityType: PortraitEntityType,
  entityId: string,
  disabled: boolean,
): PortraitMotionCue | null {
  const [queue, setQueue] = useState<readonly PortraitMotionCue[]>([]);
  const processedThroughEventId = useRef(combat.eventSequence);

  // Combat advances on a short interval. Consume its events before the browser
  // paints so a following tick cannot move the cursor past a visual cue.
  useLayoutEffect(() => {
    const previousCursor = processedThroughEventId.current;
    processedThroughEventId.current = combat.eventSequence;
    if (disabled) {
      setQueue([]);
      return;
    }

    const newCues = collectUnconsumedPortraitMotions(
      combat.events,
      previousCursor,
      entityType,
      entityId,
    );
    if (newCues.length === 0) return;
    setQueue((current) => [...current, ...newCues].slice(0, MAX_QUEUED_PORTRAIT_MOTIONS));
  }, [combat.eventSequence, combat.events, disabled, entityId, entityType]);

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
