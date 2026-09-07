import { useCharacterVisualState } from '../hooks/useCharacterVisualState';
import { usePortraitHealFlash } from '../hooks/usePortraitHealFlash';
import { usePortraitMotion } from '../hooks/usePortraitMotion';
import type {
  CharacterCombatState,
  CharacterDefinition,
  CharacterVisualState,
  CombatState,
} from '../types/game';
import { PortraitMotionLayer } from './PortraitMotionLayer';

function stateLabel(state: CharacterVisualState): string | null {
  if (state === 'normal') return null;
  if (state === 'low_hp') return 'DANGER!';
  if (state === 'down') return 'DOWN';
  if (state.includes('guard')) return 'GUARD';
  if (state.includes('cast')) return 'CAST!';
  if (state.includes('heal')) return 'HEAL!';
  if (state.includes('combo')) return 'COMBO!';
  return 'ABILITY!';
}

function artForState(character: CharacterDefinition, state: CharacterVisualState): string {
  if (state === 'low_hp') return character.art.lowHp;
  if (state === 'down') return character.art.down;
  if (state.startsWith('low_hp_')) return character.art.lowHpAbilityActive;
  if (state.endsWith('active')) return character.art.abilityActive;
  return character.art.normal;
}

export function CharacterStateArt({
  character,
  member,
  combat,
}: {
  readonly character: CharacterDefinition;
  readonly member: CharacterCombatState;
  readonly combat: CombatState;
}) {
  const state = useCharacterVisualState(character, member, combat);
  const motion = usePortraitMotion(combat, 'ally', character.id, member.currentHp <= 0);
  const healFlash = usePortraitHealFlash(combat, character.id, member.currentHp <= 0);
  const artSrc = artForState(character, state);
  const label = stateLabel(state);

  return (
    <div
      className={`character-state-art character-state-art--${state} character-state-art--kind-${character.ability.visual.kind}`}
      data-visual-state={state}
      data-ability-kind={character.ability.visual.kind}
      role="img"
      aria-label={`${character.name}: ${label ?? 'READY'}`}
    >
      <PortraitMotionLayer className="character-state-art__motion" motion={motion} flash={healFlash}>
        <img className="character-state-art__portrait" src={artSrc} alt="" draggable={false} />
      </PortraitMotionLayer>
      <span className="character-state-art__effect" aria-hidden="true" />
      {label ? <strong className="character-state-art__label">{label}</strong> : null}
    </div>
  );
}
