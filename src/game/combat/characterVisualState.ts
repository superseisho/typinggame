import type {
  AbilityVisualKind,
  CharacterCombatState,
  CharacterDefinition,
  CharacterVisualState,
  CombatEvent,
} from '../../types/game';

export interface TransientAbilityVisual {
  readonly sourceEventId: number;
  readonly kind: AbilityVisualKind;
}

export const LOW_HP_VISUAL_THRESHOLD = 0.3;
export const ABILITY_STATUS_PREFIX = 'ability:';

export const CHARACTER_VISUAL_STATE_PRIORITY = [
  'down',
  'persistent_ability_active',
  'instant_ability_active',
  'low_hp',
  'normal',
] as const;

const ABILITY_STATES: Record<AbilityVisualKind, {
  readonly active: CharacterVisualState;
  readonly lowHpActive: CharacterVisualState;
}> = {
  guard: {
    active: 'guard_active',
    lowHpActive: 'low_hp_guard_active',
  },
  cast: {
    active: 'cast_active',
    lowHpActive: 'low_hp_cast_active',
  },
  heal: {
    active: 'heal_active',
    lowHpActive: 'low_hp_heal_active',
  },
  combo: {
    active: 'combo_active',
    lowHpActive: 'low_hp_combo_active',
  },
};

function abilityState(
  kind: AbilityVisualKind,
  lowHp: boolean,
): CharacterVisualState {
  const states = ABILITY_STATES[kind];
  return lowHp ? states.lowHpActive : states.active;
}

export function getCharacterVisualState(
  character: CharacterDefinition,
  member: CharacterCombatState,
  transientVisual: TransientAbilityVisual | null = null,
): CharacterVisualState {
  if (member.currentHp <= 0) return 'down';

  const lowHp = member.currentHp / character.stats.maxHp < LOW_HP_VISUAL_THRESHOLD;
  const kind = character.ability.visual.kind;

  const persistentActive = character.ability.visual.persistence === 'persistent'
    && member.statuses.includes(`${ABILITY_STATUS_PREFIX}${character.ability.id}`);
  if (persistentActive) return abilityState(kind, lowHp);
  if (transientVisual?.kind === kind) return abilityState(kind, lowHp);
  return lowHp ? 'low_hp' : 'normal';
}

/**
 * Selects only an ability activation that happened after the UI consumer's
 * event cursor. Typing misses and previously consumed history can never
 * reactivate a transient portrait.
 */
export function findUnconsumedAbilityTrigger(
  events: readonly CombatEvent[],
  characterId: string,
  processedThroughEventId: number,
): CombatEvent | null {
  return [...events].reverse().find((event) => (
    event.id > processedThroughEventId
    && event.kind === 'ally-ability-triggered'
    && event.actorId === characterId
  )) ?? null;
}
