import { useLayoutEffect, useState } from 'react';
import { AudioSettingsPanel } from '../components/AudioSettingsPanel';
import { BattleStage } from '../components/BattleStage';
import { PartyPanel } from '../components/PartyPanel';
import { RoomSelection } from '../components/dungeon/RoomSelection';
import { RestRoom } from '../components/dungeon/RestRoom';
import { ShopRoom } from '../components/dungeon/ShopRoom';
import { DungeonResult } from '../components/dungeon/DungeonResult';
import { DungeonProgressHeader } from '../components/dungeon/DungeonProgressHeader';
import { BuffReward } from '../components/dungeon/BuffReward';
import { CurrentBuffs } from '../components/dungeon/CurrentBuffs';
import { useDungeon } from '../hooks/useDungeon';
import { DUNGEON_CONFIG } from '../game/dungeon/dungeonConfig';
import { roomName } from '../game/dungeon/dungeonEngine';
import { audioManager } from '../audio/AudioManager';
import '../styles/dungeon.css';
import '../styles/buffs.css';

export function DungeonScreen() {
  const { run, start, dispatch, saveError } = useDungeon();
  const [audioOpen, setAudioOpen] = useState(false);
  // All encounter kinds share this phase; announcement and victory are not combat.
  const combatActive = run?.runStatus === 'battle';
  useLayoutEffect(() => {
    if (combatActive) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [combatActive]);
  const showBattleStage = run && (run.runStatus === 'battle' || run.runStatus === 'announcement' || (run.runStatus === 'reward' && run.combat.enemies.length > 0));
  const ended = run?.runStatus === 'cleared' || run?.runStatus === 'game_over';
  return <main className={`game-shell dungeon-shell${combatActive ? ' dungeon-shell--combat' : ''}`}>
    <header className="topbar">
      <div className="brand-mark"><span>ᛟ</span></div><div className="brand-copy"><strong>ECHOES OF THE DEEP</strong><small>Dungeon Expedition · Tier 1</small></div>
      <button type="button" className="dungeon-audio" onClick={() => { void audioManager.unlock(); setAudioOpen(!audioOpen); }} aria-label="オーディオ設定を開く">♪ AUDIO</button>
    </header>
    <AudioSettingsPanel open={audioOpen} onClose={() => setAudioOpen(false)} />
    {!run ? <section className="dungeon-room dungeon-title">
      <span className="eyebrow">TEN FLOORS. ONE EXPEDITION.</span><h1>墓所への降下</h1><p>4人の冒険者と、地下{DUNGEON_CONFIG.maxFloor}階の守護者へ。<br />戦うか、休むか。選んだ道が生還を左右する。</p>
      <p>日本語をローマ字で入力すると全員が自動攻撃。スペース不要・shi / siなど複数入力対応。</p>
      <div className="expedition-rules"><span>HP / Downを引き継ぐ</span><span>Restで回復・蘇生</span><span>Normal · 階層倍率なし</span></div>
      <button type="button" className="dungeon-button" onClick={start}>GAME START</button>
      <small>探索途中のセーブはありません。リロードすると探索は終了します。成績・音量設定は保存されます。</small>
    </section> : <>
      {!combatActive ? <DungeonProgressHeader run={run} /> : null}
      {!combatActive && !ended ? <CurrentBuffs key={run.id} buffs={run.activeBuffs} /> : null}
      <div key={`${run.id}-${run.currentFloor}`}>
        {ended ? <DungeonResult run={run} onRestart={start} saveError={saveError} /> : <>
          {run.runStatus === 'buff_reward' || run.runStatus === 'buff_acquired' ? <BuffReward run={run} onChoose={(buffId) => dispatch({ type: 'choose-buff', buffId })} /> : null}
          {run.runStatus === 'choosing' ? <RoomSelection options={run.roomOptions} onChoose={(optionId) => dispatch({ type: 'choose', optionId, now: Date.now() })} /> : null}
          {run.runStatus === 'room' && run.currentRoom === 'rest' ? <RestRoom combat={run.combat} onRest={(action, targetId) => dispatch({ type: 'rest', action, targetId })} /> : null}
          {run.runStatus === 'room' && run.currentRoom === 'shop' ? <ShopRoom run={run} onPurchase={(productId, targetId) => dispatch({ type: 'purchase', productId, targetId })} onLeave={() => dispatch({ type: 'leave-shop' })} /> : null}
          {run.runStatus === 'announcement' ? <div className="encounter-announcement" role="status"><span>FLOOR {run.currentFloor}</span><h1>{run.currentRoom === 'boss' ? 'BOSS APPROACHING' : 'AMBUSH!'}</h1><p>{run.currentRoom === 'boss' ? '墓所の守護者が現れた。' : '敵の奇襲を受けた！'}</p></div> : null}
          {run.runStatus === 'reward' ? <section className="room-reward" aria-label="部屋クリア" aria-live="polite">
            <div><span className="eyebrow">FLOOR {run.currentFloor} COMPLETE</span><h2>{run.roomMessage}</h2><p>HPと戦闘不能を維持して先へ進みます。</p></div>
            <button type="button" className="dungeon-button" onClick={() => dispatch({ type: 'advance' })}>次の階へ · FLOOR {run.currentFloor + 1} →</button>
          </section> : null}
          {showBattleStage ? <BattleStage combat={run.combat} floorLabel={combatActive ? roomName(run.currentRoom) : `FLOOR ${run.currentFloor} · ${roomName(run.currentRoom)}`} /> : <div className="dungeon-party"><PartyPanel combat={run.combat} /></div>}
        </>}
      </div>
    </>}
  </main>;
}
