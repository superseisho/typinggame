import { getRunResults, roomName } from '../../game/dungeon/dungeonEngine';
import type { DungeonRunState } from '../../types/dungeon';

export function DungeonResult({ run, onRestart, saveError }: { readonly run: DungeonRunState; readonly onRestart: () => void; readonly saveError: boolean }) {
  const stats = getRunResults(run);
  return <section className="dungeon-room dungeon-result" aria-label="探索リザルト">
    <span className="eyebrow">{run.runStatus === 'cleared' ? 'THE FIRST DEPTH CONQUERED' : 'PARTY DEFEATED'}</span>
    <h1>{run.runStatus === 'cleared' ? 'DUNGEON CLEAR' : 'GAME OVER'}</h1>
    <p>{run.runStatus === 'cleared' ? '墓所の守護者を撃破した。第1区画の探索完了。' : '冒険者たちは倒れた。次の挑戦では、回復と進路の選択を見直そう。'}</p>
    <div className="result-grid">
      {Object.entries({ Difficulty: 'Normal', 'Reached Floor': `${run.currentFloor} / ${run.maxFloor}`, Gold: run.gold,
        'Gold Earned': run.goldEarned, 'Enemies Defeated': stats.enemiesDefeated, 'Typing Accuracy': `${stats.accuracy.toFixed(1)}%`,
        WPM: stats.wpm.toFixed(1), 'Miss Count': stats.misses, 'Max Combo': stats.maxCombo,
      }).map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
    </div>
    <p>WPMは探索全体の正解文字数 ÷ 5 ÷ 実戦闘時間（分）。部屋選択・休憩時間は含みません。</p>
    <details className="dungeon-history"><summary>Room History · {run.clearedRooms.length} rooms</summary>
      <ol>{run.clearedRooms.map((room) => <li key={room.floor}>F{room.floor} · {roomName(room.roomType)} · {room.result} · +{room.goldReward} Gold</li>)}</ol>
    </details>
    {saveError ? <p role="alert">成績を保存できませんでした。ブラウザのストレージ設定を確認してください。</p> : null}
    <button className="dungeon-button" type="button" onClick={onRestart}>NEW EXPEDITION</button>
  </section>;
}
