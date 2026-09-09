import { useMemo, useState } from 'react';
import { BattleStage } from '../components/BattleStage';
import { getAccuracy, getWpm } from '../game/combat/combatSelectors';
import { useCombat } from '../hooks/useCombat';
import { AudioSettingsPanel } from '../components/AudioSettingsPanel';
import { audioManager } from '../audio/AudioManager';

export function CombatScreen() {
  const { combat, start, restart } = useCombat();
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const results = useMemo(
    () => ({ accuracy: getAccuracy(combat), wpm: getWpm(combat) }),
    [combat],
  );
  const showOverlay = combat.status !== 'active';

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-mark"><span>ᛟ</span></div>
        <div className="brand-copy"><strong>ECHOES OF THE DEEP</strong><small>Typing Roguelike RPG · Combat Prototype</small></div>
        <div className="floor-meter"><span>DEPTH</span><strong>01 <em>/ 30</em></strong></div>
      </header>

      <button
        type="button"
        className="audio-settings-toggle"
        aria-label="オーディオ設定を開く"
        onClick={() => {
          void audioManager.unlock().then(() => audioManager.play('ui_confirm'));
          setAudioSettingsOpen((current) => !current);
        }}
      >
        <span>♪</span> AUDIO
      </button>
      <AudioSettingsPanel open={audioSettingsOpen} onClose={() => setAudioSettingsOpen(false)} />

      <BattleStage combat={combat} />

      {showOverlay ? (
        <div className="modal-backdrop">
          <section className={`battle-modal battle-modal--${combat.status}`} role="dialog" aria-modal="true">
            <span className="modal-rune">ᛉ</span>
            {combat.status === 'ready' ? (
              <>
                <span className="eyebrow">PHASE 1 · COMBAT MVP</span>
                <h2>墓所への降下</h2>
                <p>日本語の読みをローマ字で入力してください。shi / siなど複数の入力方法に対応し、正しい1文字が全員の攻撃ゲージを進めます。</p>
                <div className="modal-tips"><span>ミスで敵Specialが上昇</span><span>後衛の回復役に注意</span></div>
                <button type="button" onClick={start}>ENTER THE CRYPT <kbd>↵</kbd></button>
              </>
            ) : (
              <>
                <span className="eyebrow">{combat.status === 'victory' ? 'ENEMY VANQUISHED' : 'EXPEDITION FAILED'}</span>
                <h2>{combat.status === 'victory' ? 'VICTORY' : 'GAME OVER'}</h2>
                <p>{combat.status === 'victory' ? '闇の一角を切り拓いた。さらに深い階層が、あなたの指を待っている。' : '冒険者たちは倒れた。リズムを整え、もう一度挑め。'}</p>
                <div className="result-grid">
                  <span><small>WPM</small><strong>{results.wpm.toFixed(0)}</strong></span>
                  <span><small>ACCURACY</small><strong>{results.accuracy.toFixed(1)}%</strong></span>
                  <span><small>MAX COMBO</small><strong>{combat.typing.maxCombo}</strong></span>
                </div>
                <button type="button" onClick={restart}>TRY AGAIN <kbd>R</kbd></button>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
