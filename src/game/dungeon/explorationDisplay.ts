import type { DungeonRunState } from '../../types/dungeon';

export function shouldShowBattleStage(run: DungeonRunState | null): boolean {
  return !!run && (run.runStatus === 'battle' || run.runStatus === 'announcement'
    || (run.runStatus === 'reward' && run.combat.enemies.length > 0));
}

/** Shared parent-layout policy; independent of the growing list of room types. */
export function shouldShowExplorationParty(run: DungeonRunState | null): boolean {
  return !!run && run.runStatus !== 'cleared' && run.runStatus !== 'game_over' && !shouldShowBattleStage(run);
}
