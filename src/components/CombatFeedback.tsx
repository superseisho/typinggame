import { useEffect, useRef, useState } from 'react';
import type { CombatEvent } from '../types/game';

interface Feedback {
  readonly id: number;
  readonly kind: 'damage' | 'heal' | 'buff' | 'debuff' | 'down';
  readonly text: string;
}

function toFeedback(event: CombatEvent, targetId: string): Feedback | null {
  if (event.targetId !== targetId) return null;
  if (event.kind === 'ally-attack' || event.kind === 'ally-ability-damage' || event.kind === 'ally-damaged') {
    return { id: event.id, kind: 'damage', text: `-${event.amount ?? 0}` };
  }
  if (event.kind === 'ally-heal' || event.kind === 'enemy-heal') {
    return { id: event.id, kind: 'heal', text: `+${event.amount ?? 0}` };
  }
  if (event.kind === 'ally-buff' || event.kind === 'enemy-buff') {
    return { id: event.id, kind: 'buff', text: 'BUFF UP' };
  }
  if (event.kind === 'ally-debuff' || event.kind === 'enemy-debuff') {
    return { id: event.id, kind: 'debuff', text: 'DEBUFF' };
  }
  if (event.kind === 'enemy-defeated') {
    return { id: event.id, kind: 'down', text: 'DOWN' };
  }
  if (event.kind === 'ally-guard-consumed') {
    return { id: event.id, kind: 'buff', text: 'BLOCK' };
  }
  return null;
}

export function CombatFeedback({
  events,
  targetId,
}: {
  readonly events: readonly CombatEvent[];
  readonly targetId: string;
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const lastShownId = useRef(0);

  useEffect(() => {
    const latest = [...events].reverse().map((event) => toFeedback(event, targetId)).find(Boolean);
    if (!latest || latest.id <= lastShownId.current) return;
    lastShownId.current = latest.id;
    setFeedback(latest);
    const timeoutId = window.setTimeout(() => setFeedback(null), 720);
    return () => window.clearTimeout(timeoutId);
  }, [events, targetId]);

  return feedback ? (
    <span className={`combat-feedback combat-feedback--${feedback.kind}`} key={feedback.id}>
      {feedback.text}
    </span>
  ) : null;
}
