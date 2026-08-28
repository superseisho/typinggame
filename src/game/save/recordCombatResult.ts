import type { CombatState } from '../../types/game';
import type { TypingRecord } from '../../types/save';
import { getAccuracy, getWpm } from '../combat/combatSelectors';
import type { SaveRepository } from './SaveRepository';

const MAX_TYPING_RECORDS = 200;

export async function recordCombatResult(repository: SaveRepository, combat: CombatState): Promise<void> {
  if (combat.status !== 'victory' && combat.status !== 'defeat') return;
  const record: TypingRecord = {
    playedAt: new Date(combat.stats.endedAt ?? Date.now()).toISOString(),
    result: combat.status,
    wpm: getWpm(combat),
    accuracy: getAccuracy(combat),
    correctCharacters: combat.typing.correctCharacterCount,
    misses: combat.typing.missCount,
    maxCombo: combat.typing.maxCombo,
  };
  const current = await repository.load();
  await repository.save({
    ...current,
    typingRecords: [...current.typingRecords, record].slice(-MAX_TYPING_RECORDS),
  });
}
