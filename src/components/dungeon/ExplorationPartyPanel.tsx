import { getEffectiveCharacter } from '../../game/buffs/buffModifiers';
import { getCharacterVisualState } from '../../game/combat/characterVisualState';
import type { CombatState } from '../../types/game';
import { artForState } from '../CharacterStateArt';
import { ProgressBar } from '../ProgressBar';

export function ExplorationPartyPanel({ combat }: { readonly combat: CombatState }) {
  return <section className="exploration-party" aria-label="探索パーティー">
    {combat.party.map(member => {
      const character = getEffectiveCharacter(combat, member.definitionId);
      const state = getCharacterVisualState(character, member, null, null, 'exploration');
      const label = state === 'down' ? 'DOWN' : state === 'low_hp' ? 'DANGER!' : null;
      return <article key={member.definitionId} className={`exploration-party__member exploration-party__member--${state}`} data-character-id={member.definitionId} data-visual-state={state}>
        <header><strong>{character.name}</strong>{label ? <span>{label}</span> : null}</header>
        <img src={artForState(character, state)} alt={`${character.name}: ${label ?? '通常'}`} draggable={false} />
        <span className="exploration-party__hp">{member.currentHp} / {character.stats.maxHp} HP</span>
        <ProgressBar value={member.currentHp} max={character.stats.maxHp} label={`${character.name}のHP`} severity={state === 'normal' ? 'normal' : 'danger'} />
      </article>;
    })}
  </section>;
}
