import { useState } from 'react';
import { DUNGEON_CONFIG } from '../../game/dungeon/dungeonConfig';
import { recoveryTargets } from '../../game/dungeon/roomResolver';
import type { RestAction } from '../../types/dungeon';
import type { CharacterId, CombatState } from '../../types/game';
import { RecoveryTargetPicker } from './RecoveryTargetPicker';

export function RestRoom({ combat, onRest }: {
  readonly combat: CombatState;
  readonly onRest: (action: RestAction, targetId?: CharacterId) => void;
}) {
  const [selection, setSelection] = useState<'focused' | 'revive' | null>(null);
  const fallen = recoveryTargets(combat, true);
  const config = DUNGEON_CONFIG.rest;
  return <section className="dungeon-room" aria-label="Rest">
    <div className="dungeon-heading"><span className="eyebrow">A MOMENT OF RESPITE</span><h1>Rest</h1><p>この部屋では1回だけ休息できます。</p></div>
    {selection ? <RecoveryTargetPicker combat={combat} targets={recoveryTargets(combat, selection === 'revive')} onCancel={() => setSelection(null)} onChoose={(id) => onRest(selection, id)} /> :
      <div className="room-grid">
        <button type="button" className="room-card" onClick={() => onRest('party')}><span className="room-card__icon">✚</span><h2>Party Recovery</h2><p>生存者全員を最大HPの{config.partyRatio * 100}%回復</p><strong>Down中の味方は回復しません</strong></button>
        <button type="button" className="room-card" disabled={recoveryTargets(combat).length === 0} onClick={() => setSelection('focused')}><span className="room-card__icon">✦</span><h2>Focused Recovery</h2><p>生存者1人を最大HPの{config.focusedRatio * 100}%回復</p><strong>対象を選択</strong></button>
        <button type="button" className="room-card" disabled={fallen.length === 0} onClick={() => setSelection('revive')}><span className="room-card__icon">♧</span><h2>Revive</h2><p>戦闘不能者1人をHP{config.reviveRatio * 100}%で蘇生</p><strong>{fallen.length === 0 ? '復活対象なし · No fallen allies' : '蘇生する味方を選択'}</strong></button>
      </div>}
  </section>;
}
