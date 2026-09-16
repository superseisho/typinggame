import { useEffect, useState } from 'react';
import { ENEMY_SKILLS, ENEMY_SKILL_CONFIG } from '../data/enemySkills';
import type { CombatEvent } from '../types/game';

function useRecentEventId(id: number | undefined) {
  const [expired, setExpired] = useState<number>();
  useEffect(() => {
    if (id === undefined) return;
    const timer = window.setTimeout(() => setExpired(id), ENEMY_SKILL_CONFIG.feedbackMs);
    return () => window.clearTimeout(timer);
  }, [id]);
  return id !== undefined && id !== expired;
}

/** Feedback is separate from the portrait transform and persistent target border. */
export function EnemySkillFeedback({ events, enemyId }: { readonly events: readonly CombatEvent[]; readonly enemyId: string }) {
  const skill = [...events].reverse().find(event => event.actorId === enemyId
    && (event.kind === 'enemy-skill-used' || event.kind === 'enemy-cover'));
  const heal = [...events].reverse().find(event => event.targetId === enemyId && event.kind === 'enemy-heal' && (event.amount ?? 0) > 0);
  const showSkill = useRecentEventId(skill?.id);
  const showHeal = useRecentEventId(heal?.id);
  return <>
    {showSkill && skill ? <span key={skill.id} className="enemy-skill-feedback">{ENEMY_SKILLS[skill.skillId ?? '']?.name}</span> : null}
    {showHeal ? <span key={heal?.id} className="enemy-heal-flash" aria-hidden="true" /> : null}
  </>;
}
