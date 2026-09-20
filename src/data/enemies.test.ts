import { describe, expect, it } from 'vitest';
import { ENEMIES_BY_ID, ENEMY_DEFINITIONS } from './enemies';
import { BOSS_ENCOUNTERS, ENEMY_ENCOUNTER_CONFIG } from '../game/dungeon/enemyEncounterConfig';
import { GAME_CONFIG } from './gameConfig';

describe('explicit enemy definitions', () => {
  it('preserves all resolved enemy data from before the definition refactor', () => {
    const additions = new Set(['enemy_executioner', 'enemy_cultist', 'enemy_wraith']);
    expect(Object.fromEntries(Object.entries(ENEMIES_BY_ID).filter(([id]) => !additions.has(id)))).toMatchSnapshot();
  });
  it('defines all twelve unique IDs and indexes only the canonical definitions', () => {
    const ids = ENEMY_DEFINITIONS.map(e => e.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(ENEMIES_BY_ID)).toEqual(ids);
    for (const enemy of ENEMY_DEFINITIONS) expect(ENEMIES_BY_ID[enemy.id]).toBe(enemy);
  });
  it('resolves every normal, elite, ambush, trap, boss and initial encounter ID', () => {
    for (const [tier, sources] of Object.entries(ENEMY_ENCOUNTER_CONFIG)) {
      for (const [source, config] of Object.entries(sources)) {
        for (const { enemyId } of config.pool) {
          const enemy = ENEMIES_BY_ID[enemyId];
          expect(enemy).toBeDefined();
          expect(enemy.tier).toBe(Number(tier));
          expect(enemy.elite).toBe(source === 'elite');
          expect(enemy.boss).toBe(false);
        }
      }
    }
    for (const [tier, ids] of Object.entries(BOSS_ENCOUNTERS)) {
      for (const id of ids) {
        expect(ENEMIES_BY_ID[id]?.boss).toBe(true);
        expect(ENEMIES_BY_ID[id]?.tier).toBe(Number(tier));
      }
    }
    for (const id of GAME_CONFIG.firstEncounterEnemyIds) expect(ENEMIES_BY_ID[id]).toBeDefined();
  });
  it('owns separate skills, specials, AI rules and rewards for every definition', () => {
    for (const field of ['skills', 'specialAbilities', 'aiRules', 'rewards'] as const) {
      expect(new Set(ENEMY_DEFINITIONS.map(e => e[field])).size).toBe(ENEMY_DEFINITIONS.length);
    }
  });
  it('stores the formerly calculated Elite stats explicitly', () => {
    expect(ENEMIES_BY_ID.enemy_guardian_elite).toMatchObject({ maxHp: 270, attack: 20, defense: 7 });
    expect(ENEMIES_BY_ID.enemy_shaman_elite).toMatchObject({ maxHp: 158, attack: 18, defense: 4 });
  });
});
