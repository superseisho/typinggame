import { useCallback, useEffect, useRef, useState } from 'react';
import { audioManager } from '../audio/AudioManager';
import { useCombatAudio } from '../audio/useCombatAudio';
import { GAME_CONFIG } from '../data/gameConfig';
import { DUNGEON_CONFIG } from '../game/dungeon/dungeonConfig';
import { BUFF_CONFIG } from '../game/buffs/buffConfig';
import { TREASURE_CONFIG } from '../game/dungeon/treasureConfig';
import { createDungeonRun, reduceDungeon } from '../game/dungeon/dungeonEngine';
import { LocalStorageSaveRepository } from '../game/save/LocalStorageSaveRepository';
import { recordDungeonResult } from '../game/save/recordDungeonResult';
import type { DungeonAction, DungeonRunState } from '../types/dungeon';
import { consumeTargetNavigationKey, isCombatKeyboardBlocked } from '../game/combat/combatKeyboard';

export function useDungeon() {
  const [run, setRun] = useState<DungeonRunState | null>(null);
  const [saveError, setSaveError] = useState(false);
  const savedRun = useRef<string | null>(null);
  const events = run?.combat.events;
  useCombatAudio(events ?? EMPTY_EVENTS);
  const start = useCallback(() => {
    void audioManager.unlock();
    setSaveError(false);
    setRun(createDungeonRun(Math.floor(Math.random() * 4294967296), crypto.randomUUID()));
  }, []);
  // Stale clicks / timers from the previous floor or previous run are rejected.
  const floor = run?.currentFloor;
  const runId = run?.id;
  const status = run?.runStatus;
  const dispatch = useCallback((action: DungeonAction) => {
    setRun((current) => current ? reduceDungeon(current, action, floor, runId) : current);
  }, [floor, runId]);

  useEffect(() => {
    if (status !== 'buff_acquired') return;
    const timer = window.setTimeout(() => dispatch({ type: 'finish-buff' }), BUFF_CONFIG.acquisitionMs);
    return () => window.clearTimeout(timer);
  }, [status, dispatch]);

  useEffect(() => {
    if (status !== 'announcement') return;
    const timer = window.setTimeout(() => dispatch({ type: 'enter-battle', now: Date.now() }), run?.combatSource === 'treasure_trap' ? TREASURE_CONFIG.trapAnnouncementMs : DUNGEON_CONFIG.announcementMs);
    return () => window.clearTimeout(timer);
  }, [status, dispatch, run?.combatSource]);

  useEffect(() => {
    if (status !== 'battle') return;
    // The selection button may still own focus. Move focus off it before typing.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const time = performance.now();
      dispatch({ type: 'tick', deltaMs: time - previous, now: Date.now() });
      previous = time;
    }, GAME_CONFIG.combatTickMs);
    const input = (event: KeyboardEvent) => {
      if (isCombatKeyboardBlocked(event)) return;
      if (consumeTargetNavigationKey(event, true, direction => dispatch({ type: 'move-enemy-target', direction }))) return;
      if (event.key === ' ') event.preventDefault();
      void audioManager.unlock();
      dispatch({ type: 'key', key: event.key, now: Date.now() });
    };
    window.addEventListener('keydown', input);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', input); };
  }, [status, dispatch]);

  useEffect(() => {
    if (!run || (run.runStatus !== 'cleared' && run.runStatus !== 'game_over') || savedRun.current === run.id) return;
    savedRun.current = run.id;
    void recordDungeonResult(new LocalStorageSaveRepository(), run).catch(() => setSaveError(true));
  }, [run]);
  return { run, start, dispatch, saveError };
}

const EMPTY_EVENTS = [] as const;
