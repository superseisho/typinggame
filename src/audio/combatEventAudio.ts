import { CHARACTERS_BY_ID } from '../data/characters';
import type { CombatEvent } from '../types/game';
import type { SoundId } from '../types/audio';

const SPECIAL_FALLBACKS: Partial<Record<NonNullable<CombatEvent['effectType']>, SoundId>> = {
  damage: 'enemy_special_damage',
  heal: 'enemy_special_heal',
  buff: 'enemy_special_buff',
  debuff: 'enemy_special_debuff',
};

export function soundForCombatEvent(event: CombatEvent): SoundId | null {
  if (event.kind === 'typing-correct') return 'typing_correct';
  if (event.kind === 'typing-miss') return 'typing_miss';
  if (event.kind === 'ally-attack') {
    if (event.soundId) return event.soundId;
    return event.actorId && event.actorId in CHARACTERS_BY_ID
      ? CHARACTERS_BY_ID[event.actorId as keyof typeof CHARACTERS_BY_ID].audio.attack
      : null;
  }
  if (event.kind === 'ally-damaged') return 'ally_damage';
  if (event.kind === 'ally-heal') return event.soundId ?? 'ally_heal';
  if (event.kind === 'ally-buff') return event.soundId ?? 'ally_buff';
  if (event.kind === 'ally-debuff') return event.soundId ?? 'ally_debuff';
  if (event.kind === 'enemy-heal') return 'enemy_heal';
  if (event.kind === 'enemy-buff') return 'enemy_buff';
  if (event.kind === 'enemy-debuff') return 'enemy_debuff';
  if (event.kind === 'enemy-special-ready') return 'enemy_special_warning';
  if (event.kind === 'enemy-special-used') {
    return event.soundId ?? (event.effectType ? SPECIAL_FALLBACKS[event.effectType] ?? null : null);
  }
  if (event.kind === 'ally-defeated') return 'ally_defeated';
  if (event.kind === 'enemy-defeated') return 'enemy_defeated';
  if (event.kind === 'victory') return 'victory';
  if (event.kind === 'defeat') return 'game_over';
  return null;
}
