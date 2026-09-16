import { describe, expect, it, vi } from 'vitest';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { CHARACTERS_BY_ID } from '../../data/characters';
import type { CombatState } from '../../types/game';
import { createCombatState } from './createCombatState';
import { applyCorrectTyping, startCombat, tickCombat } from './combatEngine';
import { resolveEnemyDamage } from './enemyDamage';
import { chooseEnemySkill, performEnemySkill, usableEnemySkills } from './enemySkillEngine';
import { selectEnemyTarget } from './enemyTarget';

const battle = () => startCombat(createCombatState(['enemy_guardian', 'enemy_shaman', 'crypt-slime']), 1);
const cover = (hits: number, hp = 180): CombatState => {
  const state = battle();
  return { ...state, enemies: state.enemies.map((e, i) => i ? e : { ...e, currentHp: hp, cover: { remainingHits: hits } }) };
};
const hit = (state: CombatState, indices: number[], power = 24) => resolveEnemyDamage(state, {
  targetIds: indices.map(i => state.enemies[i].instanceId), power, kind: 'ally-ability-damage', label: 'Test AoE',
});
function forceSkill(state: CombatState, index: number, id: string) {
  for (let seed = 0; seed < 10000; seed++) {
    const candidate = { ...state, skillRngState: seed };
    if (chooseEnemySkill(candidate, candidate.enemies[index]).skill?.id === id) return candidate;
  }
  throw new Error('Skill unavailable');
}

describe('attack-snapshot Cover', () => {
  it.each([3, 2, 1])('redirects all AoE hits even with only %i cover hits', hits => {
    const state = cover(hits);
    const next = hit(state, [0, 1, 2]);
    expect(next.enemies.map(e => e.currentHp)).toEqual([120, 105, 150]);
    expect(next.enemies[0].cover?.remainingHits ?? 0).toBe(Math.max(0, hits - 2));
    const damage = next.events.filter(e => e.kind === 'ally-ability-damage');
    expect(damage).toHaveLength(3);
    expect(damage.map(e => e.targetId)).toEqual(Array(3).fill(state.enemies[0].instanceId));
    expect(damage.map(e => e.originalTargetId)).toEqual(state.enemies.map(e => e.instanceId));
  });
  it('does not cover with zero charges', () => {
    expect(hit(cover(0), [0, 1, 2]).enemies.map(e => e.currentHp)).toEqual([160, 82, 129]);
  });
  it('consumes one charge for a single redirected hit, not a direct Guardian hit', () => {
    expect(hit(cover(3), [1]).enemies[0].cover?.remainingHits).toBe(2);
    expect(hit(cover(3), [0]).enemies[0].cover?.remainingHits).toBe(3);
  });
  it('keeps remaining AoE hits on a Guardian killed midway and cleans up only afterwards', () => {
    const state = cover(1, 30);
    const next = hit(state, [0, 1, 2]);
    expect(next.enemies.map(e => e.currentHp)).toEqual([0, 105, 150]);
    expect(next.events.filter(e => e.kind === 'ally-ability-damage').map(e => e.actualDamage)).toEqual([20, 10, 0]);
    expect(next.events.filter(e => e.kind === 'enemy-defeated')).toHaveLength(1);
    expect(next.events.at(-1)?.kind).toBe('enemy-defeated');
    expect(next.enemies[0].cover).toBeNull();
    expect(next.enemies[0].skillCooldowns).toEqual({});
    expect(next.targetEnemyId).toBe(next.enemies[1].instanceId);
    expect(hit(next, [1]).enemies[1].currentHp).toBe(82);
  });
  it('uses the first living active Guardian deterministically, without chaining', () => {
    const base = startCombat(createCombatState(['enemy_guardian', 'enemy_guardian', 'enemy_shaman']));
    const state = { ...base, enemies: base.enemies.map(e => ({ ...e, cover: { remainingHits: 3 } })) };
    const next = hit(state, [0, 1, 2]);
    expect(next.enemies.map(e => e.currentHp)).toEqual([120, 180, 105]);
    expect(next.enemies[1].cover?.remainingHits).toBe(3);
  });
  it.each(['warrior', 'mage', 'cleric', 'martial-artist'] as const)('routes %s normal attack but preserves selected target', id => {
    let state = cover(3);
    state = selectEnemyTarget(state, state.enemies[1].instanceId);
    state = { ...state, party: state.party.map(e => e.definitionId === id
      ? { ...e, attackCharge: CHARACTERS_BY_ID[id].attackThreshold - 1 } : e) };
    const next = applyCorrectTyping(state, state.typing);
    expect(next.enemies[0].currentHp).toBeLessThan(180);
    expect(next.enemies[1].currentHp).toBe(105);
    expect(next.targetEnemyId).toBe(state.targetEnemyId);
    expect(next.enemies[0].cover?.remainingHits).toBe(2);
  });
  it('Mage ability uses the same snapshot with Cover and hits everyone without Cover', () => {
    for (const hits of [0, 1]) {
      const state = cover(hits);
      const next = applyCorrectTyping(state, { ...state.typing, currentCombo: 30 });
      const damage = next.events.filter(e => e.kind === 'ally-ability-damage');
      expect(damage).toHaveLength(3);
      expect(new Set(damage.map(e => e.targetId)).size).toBe(hits ? 1 : 3);
    }
  });
});

describe('normal enemy Skill selection', () => {
  it('old enemies remain Attack-only and never reveal unexecuted skills as events', () => {
    const state = startCombat(createCombatState(['crypt-slime', 'grave-shaman', 'goblin-archer']));
    for (const enemy of state.enemies) expect(usableEnemySkills(state, enemy).map(s => s.skillId)).toEqual(['skill_attack']);
    expect(state.events.some(e => e.kind === 'enemy-skill-used')).toBe(false);
  });
  it('Guardian alone cannot Cover and full-health Shaman cannot Heal', () => {
    for (const id of ['enemy_guardian', 'enemy_shaman']) {
      const state = startCombat(createCombatState([id]));
      expect(usableEnemySkills(state, state.enemies[0]).map(s => s.skillId)).toEqual(['skill_attack']);
    }
  });
  it('Cover refreshes to three, cooldown is per instance, and reuse waits for cooldown', () => {
    const state = forceSkill(cover(1), 0, 'skill_cover');
    const next = performEnemySkill(state, 0, 2, vi.fn());
    expect(next.enemies[0].cover?.remainingHits).toBe(3);
    expect(next.enemies[0].skillCooldowns.skill_cover).toBe(10000);
    expect(usableEnemySkills(next, next.enemies[0]).map(s => s.skillId)).toEqual(['skill_attack']);
    const quiet = { ...next, enemies: next.enemies.map(e => ({ ...e, cooldownRemainingMs: 20000 })) };
    const elapsed = tickCombat(quiet, 10000, 10002);
    expect(elapsed.enemies[0].skillCooldowns.skill_cover).toBe(0);
    expect(usableEnemySkills(elapsed, elapsed.enemies[0]).map(s => s.skillId)).toContain('skill_cover');
    expect(elapsed.enemies[1].skillCooldowns).toEqual({});
  });
  it('Heal picks lowest alive HP ratio, not lowest raw HP; no dead revival', () => {
    const base = battle();
    const state = forceSkill({ ...base, enemies: base.enemies.map((e, i) => ({ ...e, currentHp: [60, 50, 0][i] })) }, 1, 'skill_heal');
    const next = performEnemySkill(state, 1, 2, vi.fn());
    expect(next.enemies.map(e => e.currentHp)).toEqual([105, 50, 0]);
    expect(next.events.at(-1)).toMatchObject({ kind: 'enemy-heal', targetId: state.enemies[0].instanceId, amount: 45 });
    expect(next.enemies[1].skillCooldowns.skill_heal).toBe(8000);
  });
  it('Shaman heals itself and caps healing at max HP', () => {
    const base = startCombat(createCombatState(['enemy_shaman']));
    const state = forceSkill({ ...base, enemies: [{ ...base.enemies[0], currentHp: 100 }] }, 0, 'skill_heal');
    const next = performEnemySkill(state, 0, 2, vi.fn());
    expect(next.enemies[0].currentHp).toBe(105);
    expect(next.events.at(-1)?.amount).toBe(5);
  });
  it('selects weighted Attack/Cover rather than a fixed cycle', () => {
    let state = battle();
    let covers = 0;
    for (let i = 0; i < 10000; i++) {
      const result = chooseEnemySkill(state, state.enemies[0]);
      state = result.state;
      if (result.skill?.id === 'skill_cover') covers++;
    }
    expect(covers).toBeGreaterThan(2700);
    expect(covers).toBeLessThan(3300);
  });
  it('tick executes Skill, preserves typing/target/SPECIAL, and stops after defeat', () => {
    const base = forceSkill(cover(0), 0, 'skill_cover');
    const state = { ...base, enemies: base.enemies.map((e,i) => ({ ...e, cooldownRemainingMs: i ? 9999 : 1 })) };
    const next = tickCombat(state, 1, 2);
    expect(next.enemies[0].cover?.remainingHits).toBe(3);
    expect(next.typing).toBe(state.typing);
    expect(next.targetEnemyId).toBe(state.targetEnemyId);
    expect(next.enemies.map(e => e.specialGauge)).toEqual(state.enemies.map(e => e.specialGauge));
    const losing = { ...next, party: next.party.map(e => ({ ...e, currentHp: 1 })),
      enemies: next.enemies.map(e => ({ ...e, cooldownRemainingMs: 0, skillCooldowns: { skill_cover: 99999, skill_heal: 99999 } })) };
    let ended = losing as CombatState;
    for (let i = 0; i < 10 && ended.status === 'active'; i++) ended = tickCombat(ended, 10000, i);
    expect(ended.status).toBe('defeat');
    expect(ended.enemies.every(e => !e.cover && !Object.keys(e.skillCooldowns).length)).toBe(true);
    expect(tickCombat(ended, 1000)).toBe(ended);
    expect(createCombatState(['enemy_guardian']).enemies[0].cover).toBeNull();
  });
  it('definitions have unique IDs and valid fixed-tier stats', () => {
    expect(ENEMIES_BY_ID.enemy_guardian.tier).toBe(1);
    expect(ENEMIES_BY_ID.enemy_shaman.tier).toBe(1);
  });
});
