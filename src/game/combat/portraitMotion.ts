import { CHARACTERS_BY_ID } from '../../data/characters';
import { PORTRAIT_MOTION_DURATION_MS } from '../../data/gameConfig';
import type { CombatEvent } from '../../types/game';

export type PortraitEntityType = 'ally' | 'enemy';
export type PortraitMotion =
  | 'ally_attack'
  | 'enemy_attack'
  | 'ally_damaged'
  | 'enemy_damaged'
  | 'ally_guard_hit'
  | 'ally_transient_ability'
  | 'ally_persistent_ability'
  | 'enemy_special';

export interface PortraitMotionCue {
  readonly eventId: number;
  readonly motion: PortraitMotion;
  readonly durationMs: number;
  readonly damageHpAfter?: number;
}

export function isDamageMotion(motion: PortraitMotion): boolean {
  return motion === 'ally_damaged' || motion === 'enemy_damaged';
}

const MAX_QUEUED_PORTRAIT_MOTIONS = 6;

export function updatePortraitMotionQueue(
  queue: readonly PortraitMotionCue[],
  newCues: readonly PortraitMotionCue[],
  defeated: boolean,
  wasDefeated: boolean,
): readonly PortraitMotionCue[] {
  if (defeated) {
    // Let the final hit play on the Down portrait. Discard pending attacks and
    // abilities; subsequent ticks must not cancel or replay that final hit.
    if (wasDefeated) return queue;
    const finalHit = newCues.filter((cue) => isDamageMotion(cue.motion)).at(-1);
    return finalHit ? [finalHit] : [];
  }
  if (newCues.length === 0) return queue;
  // Damage must begin immediately with its portrait/flash, even during an
  // ability. Cancel the old transform and merge a burst into the latest hit.
  const newestHit = newCues.filter((cue) => isDamageMotion(cue.motion)).at(-1);
  if (newestHit) return [newestHit, ...newCues.filter((cue) => cue.eventId > newestHit.eventId)]
    .slice(0, MAX_QUEUED_PORTRAIT_MOTIONS);
  return [...queue, ...newCues].slice(0, MAX_QUEUED_PORTRAIT_MOTIONS);
}

const MOTION_DURATION_BY_TYPE: Record<PortraitMotion, number> = {
  ally_attack: PORTRAIT_MOTION_DURATION_MS.allyAttack,
  enemy_attack: PORTRAIT_MOTION_DURATION_MS.enemyAttack,
  ally_damaged: PORTRAIT_MOTION_DURATION_MS.allyDamaged,
  enemy_damaged: PORTRAIT_MOTION_DURATION_MS.enemyDamaged,
  ally_guard_hit: PORTRAIT_MOTION_DURATION_MS.guardHit,
  ally_transient_ability: PORTRAIT_MOTION_DURATION_MS.transientAbility,
  ally_persistent_ability: PORTRAIT_MOTION_DURATION_MS.persistentAbility,
  enemy_special: PORTRAIT_MOTION_DURATION_MS.enemySpecial,
};

function allyMotion(event: CombatEvent, characterId: string): PortraitMotion | null {
  if (event.kind === 'ally-attack' && event.actorId === characterId) return 'ally_attack';
  if (event.kind === 'ally-damaged' && (event.amount ?? 0) > 0
    && event.targetId === characterId) return 'ally_damaged';
  if (event.kind === 'ally-guard-consumed' && event.targetId === characterId) return 'ally_guard_hit';
  if (event.kind !== 'ally-ability-triggered' || event.actorId !== characterId) return null;

  const character = CHARACTERS_BY_ID[characterId as keyof typeof CHARACTERS_BY_ID];
  if (!character) return null;
  return character.ability.visual.persistence === 'persistent'
    ? 'ally_persistent_ability'
    : 'ally_transient_ability';
}

function enemyMotion(event: CombatEvent, enemyInstanceId: string): PortraitMotion | null {
  if (event.kind === 'enemy-special-used' && event.actorId === enemyInstanceId) return 'enemy_special';
  if ((event.kind === 'ally-attack' || event.kind === 'ally-ability-damage')
    && event.targetId === enemyInstanceId) return 'enemy_damaged';
  // Special damage has its own stronger motion, so it must not also enqueue an attack bounce.
  if (event.kind === 'ally-damaged' && !event.abilityId && event.actorId === enemyInstanceId) {
    return 'enemy_attack';
  }
  if (event.kind === 'ally-guard-consumed' && event.actorId === enemyInstanceId) return 'enemy_attack';
  return null;
}

export function getPortraitMotionCue(
  event: CombatEvent,
  entityType: PortraitEntityType,
  entityId: string,
): PortraitMotionCue | null {
  const motion = entityType === 'ally'
    ? allyMotion(event, entityId)
    : enemyMotion(event, entityId);
  return motion ? {
    eventId: event.id, motion, durationMs: MOTION_DURATION_BY_TYPE[motion],
    ...(motion === 'ally_damaged' ? { damageHpAfter: event.targetHpAfter } : {}),
  } : null;
}

export function collectUnconsumedPortraitMotions(
  events: readonly CombatEvent[],
  processedThroughEventId: number,
  entityType: PortraitEntityType,
  entityId: string,
): readonly PortraitMotionCue[] {
  return events
    .filter((event) => event.id > processedThroughEventId)
    .map((event) => getPortraitMotionCue(event, entityType, entityId))
    .filter((cue): cue is PortraitMotionCue => cue !== null);
}
