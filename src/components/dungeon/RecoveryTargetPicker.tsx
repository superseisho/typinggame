import { getEffectiveCharacter } from '../../game/buffs/buffModifiers';
import type { CharacterCombatState, CharacterId, CombatState } from '../../types/game';

export function RecoveryTargetPicker({ combat, targets, onChoose, onCancel }: {
  readonly combat: CombatState;
  readonly targets: readonly CharacterCombatState[];
  readonly onChoose: (id: CharacterId) => void;
  readonly onCancel: () => void;
}) {
  return <div className="target-picker" role="group" aria-label="回復対象を選択">
    <h3>対象を選択</h3>
    <div className="recovery-targets">{targets.map((member) => {
      const character = getEffectiveCharacter(combat, member.definitionId);
      return <button type="button" key={member.definitionId} onClick={() => onChoose(member.definitionId)}>
        {character.name}<small>HP {member.currentHp} / {character.stats.maxHp}</small>
      </button>;
    })}</div>
    {targets.length === 0 ? <p>回復が必要な生存者はいません。</p> : null}
    <button type="button" className="dungeon-button secondary" onClick={onCancel}>キャンセル</button>
  </div>;
}
