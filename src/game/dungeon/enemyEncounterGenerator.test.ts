import { describe, expect, it } from 'vitest';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { generateEnemyEncounter } from './enemyEncounterGenerator';
import { ENEMY_ENCOUNTER_CONFIG } from './enemyEncounterConfig';
import { createCombatState } from '../combat/createCombatState';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';

describe('independent random enemy slots', () => {
  it.each(['battle', 'elite', 'ambush', 'treasure_trap'] as const)('%s draws 1–3 enemies, allows duplicates, and is reproducible', source => {
    const counts = new Set<number>();
    let duplicate = false;
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const seed = Math.imul(i, 2654435761) >>> 0;
      const result = generateEnemyEncounter(seed, source);
      expect(result).toEqual(generateEnemyEncounter(seed, source));
      counts.add(result.enemyIds.length);
      duplicate ||= new Set(result.enemyIds).size < result.enemyIds.length;
      for (const id of result.enemyIds) {
        seen.add(id);
        expect(ENEMIES_BY_ID[id].tier).toBe(1);
        expect(ENEMIES_BY_ID[id].boss).toBe(false);
      }
      const state = createCombatState(result.enemyIds);
      expect(new Set(state.enemies.map(e => e.instanceId)).size).toBe(result.enemyIds.length);
    }
    expect([...counts].sort()).toEqual([1, 2, 3]);
    expect(duplicate).toBe(true);
    expect(seen).toEqual(new Set(ENEMY_ENCOUNTER_CONFIG[1][source].pool.map(e => e.enemyId)));
  });
  it('rejects unconfigured tiers instead of scaling floor stats', () => {
    expect(() => generateEnemyEncounter(1, 'battle', 2)).toThrow('Tier 2');
  });
  it('generates once on entry and ignores duplicate room entry commands', () => {
    const initial = createDungeonRun(21, 'test');
    const run = { ...initial, roomOptions: [{ id: 'battle', type: 'battle' as const }] };
    const action = { type: 'choose' as const, optionId: 'battle', now: 1 };
    const entered = reduceDungeon(run, action);
    expect(entered.combat.enemies.length).toBeGreaterThanOrEqual(1);
    expect(reduceDungeon(entered, action)).toBe(entered);
    expect(reduceDungeon(run, action)).toEqual(entered);
  });
});
