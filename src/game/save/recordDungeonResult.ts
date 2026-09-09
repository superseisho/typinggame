import type { DungeonRunState } from '../../types/dungeon';
import { getRunResults } from '../dungeon/dungeonEngine';
import type { SaveRepository } from './SaveRepository';

export async function recordDungeonResult(repository: SaveRepository, run: DungeonRunState): Promise<void> {
  if (run.runStatus !== 'cleared' && run.runStatus !== 'game_over') return;
  const current = await repository.load();
  const stats = getRunResults(run);
  const cleared = run.runStatus === 'cleared';
  const playedAt = new Date(run.endedAt ?? Date.now()).toISOString();
  const difficulty = run.selectedDifficulty;
  await repository.save({ ...current,
    highestFloor: { ...current.highestFloor, [difficulty]: Math.max(current.highestFloor[difficulty], run.currentFloor) },
    clearCounts: { ...current.clearCounts, [difficulty]: current.clearCounts[difficulty] + (cleared ? 1 : 0) },
    clearHistory: cleared ? [...current.clearHistory, { difficulty, clearedAt: playedAt, score: stats.correctCharacters, maxFloor: run.maxFloor }].slice(-200) : current.clearHistory,
    typingRecords: [...current.typingRecords, { playedAt, result: cleared ? 'victory' as const : 'defeat' as const, wpm: stats.wpm,
      accuracy: stats.accuracy, correctCharacters: stats.correctCharacters, misses: stats.misses, maxCombo: stats.maxCombo }].slice(-200),
  });
}
