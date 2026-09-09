import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  collectUnconsumedPortraitMotions,
  updatePortraitMotionQueue,
  type PortraitEntityType,
  type PortraitMotionCue,
} from '../game/combat/portraitMotion';
import type { CombatState } from '../types/game';

export function usePortraitMotion(
  combat: CombatState,
  entityType: PortraitEntityType,
  entityId: string,
  disabled: boolean,
): PortraitMotionCue | null {
  const [queue, setQueue] = useState<readonly PortraitMotionCue[]>([]);
  const processedThroughEventId = useRef(combat.eventSequence);
  const wasDisabled = useRef(disabled);

  // Consume new events before paint, sharing one transform queue per portrait.
  useLayoutEffect(() => {
    const previousCursor = processedThroughEventId.current;
    const previouslyDisabled = wasDisabled.current;
    const restarted = combat.eventSequence < previousCursor;
    processedThroughEventId.current = combat.eventSequence;
    wasDisabled.current = disabled;

    const newCues = collectUnconsumedPortraitMotions(
      combat.events,
      restarted ? 0 : previousCursor,
      entityType,
      entityId,
    );
    if (newCues.length === 0 && disabled === previouslyDisabled && !restarted) return;
    setQueue((current) => updatePortraitMotionQueue(
      restarted ? [] : current, newCues, disabled, previouslyDisabled,
    ));
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
