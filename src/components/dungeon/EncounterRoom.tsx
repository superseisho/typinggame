import type { DungeonRunState } from '../../types/dungeon';
import { choiceDisabledReason, getEncounter } from '../../game/dungeon/encounterEngine';

export function EncounterRoom({ run, onChoose }: { readonly run: DungeonRunState; readonly onChoose: (id: string) => void }) {
  const definition = getEncounter(run);
  if (!definition) return null;
  const altar = run.currentRoom === 'altar';
  return <section className={`dungeon-room encounter-room${altar ? ' encounter-room--altar' : ''}`} aria-label={altar ? 'Altar' : 'Event'}>
    <div className="dungeon-heading"><span className="eyebrow">{altar ? 'Altar · A PRICE FOR POWER' : 'Event'}</span><h1>{definition.title}</h1><p>{definition.description}</p></div>
    <div className="encounter-choices">{definition.choices.map(choice => {
      const reason = choiceDisabledReason(run, choice);
      return <button type="button" className="room-card" key={choice.id} disabled={!!reason} onClick={() => onChoose(choice.id)}>
        <h2>{choice.label}</h2><p>{choice.description}</p><strong>{reason ?? (choice.id === 'leave' ? 'No cost · No reward' : '選択を確定 →')}</strong>
      </button>;
    })}</div>
    <small className="encounter-note">{altar ? '犠牲は選択時に確定します。蘇生はできません。' : '選択は1回だけ。結果を確認してから次の階へ進みます。'} Buff候補が足りなければ少数の候補、0個ならGold報酬になります。</small>
  </section>;
}
