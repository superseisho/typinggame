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
  const [feedback, setFeedback] = useState<readonly Feedback[]>([]);
  const lastShownId = useRef(0);
  const matching = events.map(event => toFeedback(event, targetId)).filter((item): item is Feedback => item !== null);
  const latestId = matching.at(-1)?.id;

  useEffect(() => {
    if (latestId === undefined) { setFeedback([]); return; }
    const fresh = matching.filter(item => item.id > lastShownId.current).slice(-8);
    lastShownId.current = latestId;
    if (fresh.length) setFeedback(fresh);
    const timeoutId = window.setTimeout(() => setFeedback([]), 720);
    return () => window.clearTimeout(timeoutId);
  // Only a new feedback event restarts its lifetime, not typing/timer renders.
  }, [latestId, targetId]);

  return <>{feedback.map((item, index) => (
    <span className={`combat-feedback combat-feedback--${item.kind}`} key={item.id}
      style={{ right: `${13 + index * 35}px`, animationDelay: `${index * 35}ms` }}>
      {item.text}
    </span>
  ))}</>;
}
