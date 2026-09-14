import { TreasureRoom } from '../components/dungeon/TreasureRoom';
import { EncounterRoom } from '../components/dungeon/EncounterRoom';
import { ExplorationPartyPanel } from '../components/dungeon/ExplorationPartyPanel';
import { shouldShowBattleStage, shouldShowExplorationParty } from '../game/dungeon/explorationDisplay';
import { useLayoutEffect, useRef, useState } from 'react';
import { AudioSettingsPanel } from '../components/AudioSettingsPanel';
import { BattleStage } from '../components/BattleStage';
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
import { isPreBossFloor } from '../game/dungeon/floorRules';
import { audioManager } from '../audio/AudioManager';
import '../styles/dungeon.css';
import '../styles/buffs.css';

export function DungeonScreen() {
  const { run, start, dispatch, saveError } = useDungeon();
  const [audioOpen, setAudioOpen] = useState(false);
  const roomContentRef = useRef<HTMLDivElement>(null);
  // All encounter kinds share this phase; announcement and victory are not combat.
  const combatActive = run?.runStatus === 'battle';
  useLayoutEffect(() => {
    if (combatActive) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [combatActive]);
  const showBattleStage = shouldShowBattleStage(run);
  const showExplorationParty = shouldShowExplorationParty(run);
  useLayoutEffect(() => {
    roomContentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [run?.currentFloor, run?.currentRoom, run?.runStatus]);
  const ended = run?.runStatus === 'cleared' || run?.runStatus === 'game_over';
  const narrativeRoom = run?.currentRoom === 'event' || run?.currentRoom === 'altar';
  return <main className={`game-shell dungeon-shell${combatActive ? ' dungeon-shell--combat' : ''}${showExplorationParty ? ' dungeon-shell--exploration' : ''}`}>
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
      <div ref={roomContentRef} className={showExplorationParty ? 'dungeon-room-content' : undefined} key={`${run.id}-${run.currentFloor}`}>
        {ended ? <DungeonResult run={run} onRestart={start} saveError={saveError} /> : <>
          {run.runStatus === 'buff_reward' || run.runStatus === 'buff_acquired' ? <BuffReward run={run} onChoose={(buffId) => dispatch({ type: 'choose-buff', buffId })} /> : null}
          {run.runStatus === 'choosing' ? <RoomSelection preBoss={isPreBossFloor(run.currentFloor)} options={run.roomOptions} onChoose={(optionId) => dispatch({ type: 'choose', optionId, now: Date.now() })} /> : null}
          {run.runStatus === 'room' && narrativeRoom ? <EncounterRoom run={run} onChoose={choiceId => dispatch({ type: 'encounter-choice', choiceId, now: Date.now() })} /> : null}
          {run.runStatus === 'room' && run.currentRoom === 'rest' ? <RestRoom combat={run.combat} onRest={(action, targetId) => dispatch({ type: 'rest', action, targetId })} /> : null}
          {run.runStatus === 'room' && run.currentRoom === 'shop' ? <ShopRoom run={run} onReroll={(revision) => dispatch({ type: 'reroll-shop', revision })} onPurchase={(productId, targetId) => dispatch({ type: 'purchase', productId, targetId })} onLeave={() => dispatch({ type: 'leave-shop' })} /> : null}
          {run.runStatus === 'room' && run.currentRoom === 'treasure' ? <TreasureRoom onOpen={() => dispatch({ type: 'open-treasure' })} /> : null}
          {run.runStatus === 'announcement' ? <div className={`encounter-announcement${run.combatSource === 'treasure_trap' ? ' is-trap' : ''}`} role="status"><span>FLOOR {run.currentFloor}</span><h1>{run.combatSource === 'treasure_trap' ? 'TRAP!' : run.currentRoom === 'boss' ? 'BOSS APPROACHING' : 'AMBUSH!'}</h1><p>{run.combatSource === 'treasure_trap' ? 'The treasure was a trap! 宝箱の報酬は失われた。' : run.currentRoom === 'boss' ? '墓所の守護者が現れた。' : '敵の奇襲を受けた！'}</p></div> : null}
          {run.runStatus === 'reward' ? <section className="room-reward" aria-label="部屋クリア" aria-live="polite">
            <div><span className="eyebrow">FLOOR {run.currentFloor} COMPLETE</span><h2>{run.roomMessage}</h2><p>HPと戦闘不能を維持して先へ進みます。</p></div>
            <button type="button" className="dungeon-button" onClick={() => dispatch({ type: 'advance' })}>{narrativeRoom ? 'CONTINUE' : '次の階へ'} · FLOOR {run.currentFloor + 1} →</button>
          </section> : null}
          {showBattleStage ? <BattleStage combat={run.combat} onSelectEnemyTarget={enemyId => dispatch({ type: 'select-enemy-target', enemyId })} floorLabel={combatActive ? (run.combatSource === 'treasure_trap' ? 'Treasure Trap' : roomName(run.currentRoom)) : `FLOOR ${run.currentFloor} · ${roomName(run.currentRoom)}`} /> : null}
        </>}
      </div>
      {showExplorationParty ? <ExplorationPartyPanel combat={run.combat} /> : null}
    </>}
  </main>;
}
