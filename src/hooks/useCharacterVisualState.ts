import { useEffect, useRef, useState } from 'react';
import { TRANSIENT_ABILITY_VISUAL_MS } from '../data/gameConfig';
import {
  findUnconsumedAbilityTrigger,
  getCharacterVisualState,
  type TransientAbilityVisual,
  type TransientDamageVisual,
} from '../game/combat/characterVisualState';
import type {
  CharacterCombatState,
  CharacterDefinition,
  CharacterVisualState,
  CombatState,
} from '../types/game';

export function useCharacterVisualState(
  character: CharacterDefinition,
  member: CharacterCombatState,
  combat: CombatState,
  damageVisual: TransientDamageVisual | null = null,
): CharacterVisualState {
  const [transientVisual, setTransientVisual] = useState<TransientAbilityVisual | null>(null);
  // Events already present at mount are history, not new visual instructions.
  const processedThroughEventId = useRef(combat.eventSequence);

  useEffect(() => {
    const previousCursor = processedThroughEventId.current;
    processedThroughEventId.current = combat.eventSequence;
    if (character.ability.visual.persistence === 'persistent') return;

    const activation = findUnconsumedAbilityTrigger(combat.events, character.id, previousCursor);
    if (!activation) return;
    setTransientVisual({
      sourceEventId: activation.id,
      kind: character.ability.visual.kind,
    });
  }, [character.ability.visual.kind, character.ability.visual.persistence, character.id, combat.eventSequence, combat.events]);

  useEffect(() => {
    if (!transientVisual) return;
    const sourceEventId = transientVisual.sourceEventId;
    const displayMs = character.ability.visual.displayMs ?? TRANSIENT_ABILITY_VISUAL_MS;
    const clearTimer = window.setTimeout(() => {
      setTransientVisual((current) => current?.sourceEventId === sourceEventId ? null : current);
    }, displayMs);
    return () => window.clearTimeout(clearTimer);
  }, [character.ability.visual.displayMs, transientVisual]);

  return getCharacterVisualState(character, member, transientVisual, damageVisual);
}
