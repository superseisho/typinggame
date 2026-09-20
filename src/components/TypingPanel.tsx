import { getTypingDisplay } from '../game/typing/typingEngine';
import type { CombatState } from '../types/game';

export function TypingPanel({ combat }: { readonly combat: CombatState }) {
  const display = getTypingDisplay(combat.typing);
  const disabled = combat.status !== 'active';

  return (
    <section className={`typing-panel ${combat.typing.lastInput === 'miss' ? 'is-miss' : ''}`} aria-label="タイピングエリア">
      <div className="typing-panel__topline">
        <span className="eyebrow">COMBAT SCRIPT</span>
        <span className={`typing-panel__hint ${combat.typingCurseBonus > 0 ? 'typing-curse' : ''}`}>
          {combat.typingCurseBonus > 0 ? `CURSED · Next Miss: Special Gauge +${combat.typingCurseBonus}` : 'スペース入力不要 · 複数ローマ字対応'}
        </span>
      </div>
      <div className="japanese-sentence">{combat.typing.sentenceText}</div>
      <div className="kana-reading">{combat.typing.reading}</div>
      <div className={`typing-line ${disabled ? 'is-disabled' : ''}`} aria-live="polite">
        <span className="typing-line__done">{display.typed}</span>
        <mark>{display.current}</mark>
        <span>{display.remaining}</span>
      </div>
      <div className="romaji-candidates">
        INPUT ROUTES · {display.candidates.length > 0 ? display.candidates.join(' / ') : 'COMPLETE'}
      </div>
      <div className="typing-stats">
        <span><small>CORRECT</small><strong>{combat.typing.correctCharacterCount}</strong></span>
        <span><small>MISS</small><strong className="miss-value">{combat.typing.missCount}</strong></span>
        <span><small>COMBO</small><strong>{combat.typing.currentCombo}</strong></span>
        <span><small>SENTENCES</small><strong>{combat.typing.completedSentences}</strong></span>
      </div>
    </section>
  );
}
