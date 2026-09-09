import { describe, expect, it } from 'vitest';
import { createDungeonRun } from '../dungeon/dungeonEngine';
import { createDefaultSaveData } from './defaultSaveData';
import { recordDungeonResult } from './recordDungeonResult';
import type { SaveRepository } from './SaveRepository';

describe('dungeon result persistence', () => {
  it('saves a completed MVP run without erasing existing settings/equipment', async () => {
    let data = createDefaultSaveData();
    data = { ...data, equippedRelicId: 'existing-relic', settings: { ...data.settings, reducedMotion: true } };
    const repository: SaveRepository = { load: async () => data, save: async (next) => { data = next; } };
    const run = createDungeonRun(2, 'save');
    await recordDungeonResult(repository, { ...run, currentFloor: 10, runStatus: 'cleared', endedAt: 1000,
      statistics: { ...run.statistics, correctCharacters: 200, misses: 50, combatMs: 60000 } });
    expect(data.highestFloor.normal).toBe(10);
    expect(data.clearCounts.normal).toBe(1);
    expect(data.clearHistory[0].maxFloor).toBe(10);
    expect(data.typingRecords[0]).toMatchObject({ wpm: 40, accuracy: 80, misses: 50, result: 'victory' });
    expect(data.equippedRelicId).toBe('existing-relic');
    expect(data.settings.reducedMotion).toBe(true);
    await recordDungeonResult(repository, { ...run, currentFloor: 4, runStatus: 'game_over', endedAt: 2000 });
    expect(data.highestFloor.normal).toBe(10);
    expect(data.clearCounts.normal).toBe(1);
    expect(data.typingRecords).toHaveLength(2);
    await recordDungeonResult(repository, run);
    expect(data.typingRecords).toHaveLength(2);
  });
});
