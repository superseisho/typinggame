import { describe, expect, it } from 'vitest';
import { createCombatState } from './createCombatState';
import { startCombat, tickCombat, applyCorrectTyping, applyTypingMiss } from './combatEngine';
import { planEnemyAction } from './enemySkillEngine';
import { selectEnemyTarget, moveEnemyTarget } from './enemyTarget';
import { resolveEnemyDamage } from './enemyDamage';
import type { CombatState } from '../../types/game';

const initial = () => startCombat(createCombatState(['enemy_guardian', 'enemy_shaman', 'enemy_guardian']), 1);
function scheduled(index: number, skill: string): CombatState {
  const state = initial();
  return { ...state, enemies: state.enemies.map((e,i) => ({ ...e,
    currentHp: i === 0 ? 90 : e.currentHp, cooldownRemainingMs: i === index ? 100 : 10000,
    nextActionSkillId: i === index ? skill : e.nextActionSkillId,
  })) };
}
describe('planned normal enemy actions', () => {
  it('plans every living instance at battle start, exactly once', () => {
    const state = initial();
    expect(state.enemies.every(e => e.nextActionSkillId)).toBe(true);
    expect(state.enemies[1].nextActionSkillId).toBe('skill_attack'); // all full
    expect(startCombat(state, 2)).toBe(state);
    const solo = startCombat(createCombatState(['enemy_guardian']));
    expect(solo.enemies[0].nextActionSkillId).toBe('skill_attack');
  });
  it.each([[0,'skill_attack'],[0,'skill_cover'],[1,'skill_attack'],[1,'skill_heal']] as const)(
    'executes saved skill %s/%s without execution-time random selection', (index, skill) => {
      const state = scheduled(index, skill);
      const before = tickCombat(state, 99, 100);
      expect(before.enemies[index].nextActionSkillId).toBe(skill);
      expect(before.skillRngState).toBe(state.skillRngState);
      const next = tickCombat(before, 1, 101);
      expect(next.events.find(e => e.kind === 'enemy-skill-used')?.skillId).toBe(skill);
      expect(next.enemies[index].cooldownRemainingMs).toBeGreaterThan(0);
      expect(next.enemies[index].nextActionSkillId).toBeTruthy();
      if (skill === 'skill_cover' || skill === 'skill_heal') {
        expect(next.enemies[index].skillCooldowns[skill]).toBeGreaterThan(0);
        expect(next.enemies[index].nextActionSkillId).toBe('skill_attack');
      }
    });
  it('duplicate Guardians can hold independent plans', () => {
    let state = initial();
    for (let seed = 0; seed < 10000; seed++) {
      state = startCombat({ ...createCombatState(['enemy_guardian', 'enemy_guardian']), skillRngState: seed });
      if (state.enemies[0].nextActionSkillId !== state.enemies[1].nextActionSkillId) break;
    }
    expect(state.enemies[0].nextActionSkillId).not.toBe(state.enemies[1].nextActionSkillId);
    const other = state.enemies[1].nextActionSkillId;
    expect(planEnemyAction(state, 0).enemies[1].nextActionSkillId).toBe(other);
  });
  it.each(['skill_cover', 'skill_heal'])('invalidated %s falls back to Attack', skill => {
    const index = skill === 'skill_cover' ? 0 : 1;
    let state = scheduled(index, skill);
    state = { ...state, enemies: state.enemies.map((e,i) => skill === 'skill_cover'
      ? { ...e, currentHp: i === 0 ? 90 : 0 }
      : { ...e, currentHp: i === 1 ? 105 : 180 }) };
    const next = tickCombat(state, 100, 101);
    expect(next.events.find(e => e.kind === 'enemy-skill-used')?.skillId).toBe('skill_attack');
    expect(next.enemies[index].nextActionSkillId).toBe('skill_attack');
  });
  it('typing, targeting, and independent SPECIAL do not reroll the plan', () => {
    let state = scheduled(0, 'skill_cover');
    const plans = state.enemies.map(e => e.nextActionSkillId);
    const rng = state.skillRngState;
    state = selectEnemyTarget(state, state.enemies[1].instanceId);
    state = moveEnemyTarget(state, 'right');
    state = applyCorrectTyping(state, state.typing);
    for (let i = 0; i < 4; i++) state = applyTypingMiss(state, state.typing);
    expect(state.enemies[0].pendingSpecial).not.toBeNull();
    state = { ...state, enemies: state.enemies.map(e => ({ ...e, cooldownRemainingMs: 10000 })) };
    state = tickCombat(state, 800, 801);
    expect(state.enemies.map(e => e.nextActionSkillId)).toEqual(plans);
    expect(state.skillRngState).toBe(rng);
    expect(state.enemies[0].pendingSpecial).toBeNull();
  });
  it('clears dead enemy plans and never carries them into a new battle', () => {
    const state = scheduled(0, 'skill_cover');
    const next = resolveEnemyDamage(state, { targetIds: [state.enemies[0].instanceId], power: 999,
      kind: 'ally-attack', label: 'test' });
    expect(next.enemies[0].nextActionSkillId).toBeNull();
    expect(createCombatState(['enemy_guardian']).enemies[0].nextActionSkillId).toBeNull();
    expect(planEnemyAction(next, 0)).toBe(next);
  });
});
