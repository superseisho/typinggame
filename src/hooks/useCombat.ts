import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_CONFIG } from '../data/gameConfig';
import { startCombat, tickCombat } from '../game/combat/combatEngine';
import { selectEnemyTarget } from '../game/combat/enemyTarget';
import { createCombatState } from '../game/combat/createCombatState';
import { handleCombatTyping } from '../game/combat/handleCombatTyping';
import { LocalStorageSaveRepository } from '../game/save/LocalStorageSaveRepository';
import { recordCombatResult } from '../game/save/recordCombatResult';
import { audioManager } from '../audio/AudioManager';
import { useCombatAudio } from '../audio/useCombatAudio';

export function useCombat() {
  const [combat, setCombat] = useState(createCombatState);
  const previousFrame = useRef<number | null>(null);
  const savedResultAt = useRef<number | null>(null);
  const saveRepository = useRef(new LocalStorageSaveRepository());
  useCombatAudio(combat.events);

  useEffect(() => {
    if (combat.stats.endedAt === null || combat.stats.endedAt === savedResultAt.current) return;
    savedResultAt.current = combat.stats.endedAt;
    void recordCombatResult(saveRepository.current, combat).catch((error: unknown) => {
      console.error('戦闘記録の保存に失敗しました', error);
    });
  }, [combat]);

  useEffect(() => {
    if (combat.status !== 'active') {
      previousFrame.current = null;
      return;
    }

    previousFrame.current = performance.now();
    const intervalId = window.setInterval(() => {
      const currentFrame = performance.now();
      const delta = Math.min(
        GAME_CONFIG.maxFrameDeltaMs,
        currentFrame - (previousFrame.current ?? currentFrame),
      );
      previousFrame.current = currentFrame;
      setCombat((current) => tickCombat(current, delta));
    }, GAME_CONFIG.combatTickMs);

    return () => window.clearInterval(intervalId);
  }, [combat.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, button, select, textarea')) return;
      void audioManager.unlock();
      if (event.key === ' ') event.preventDefault();
      setCombat((current) => {
        if (current.status === 'ready' && event.key === 'Enter') return startCombat(current);
        if ((current.status === 'victory' || current.status === 'defeat') && event.key.toLowerCase() === 'r') {
          return startCombat(createCombatState());
        }
        return handleCombatTyping(current, event.key);
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const start = useCallback(() => {
    void audioManager.unlock();
    setCombat((current) => startCombat(current));
  }, []);

  const restart = useCallback(() => {
    void audioManager.unlock();
    setCombat(startCombat(createCombatState()));
  }, []);

  const selectTarget = useCallback((enemyId: string) => {
    setCombat(current => selectEnemyTarget(current, enemyId));
  }, []);

  return { combat, start, restart, selectTarget };
}
