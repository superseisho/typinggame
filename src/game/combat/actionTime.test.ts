import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EnemyPanel } from '../../components/EnemyPanel';
import { ENEMIES_BY_ID } from '../../data/enemies';
import type { CombatState } from '../../types/game';
import { createCombatState } from './createCombatState';
import { startCombat, tickCombat } from './combatEngine';
import { planEnemyAction } from './enemySkillEngine';
import { executeEnemyAbility } from './enemyAbilityEngine';

function planned(enemyId: string, skillId: string, multiplier = 1): CombatState {
  const base = createCombatState([enemyId, 'crypt-slime']);
  for (let seed = 0; seed < 10000; seed++) {
    const state = startCombat({ ...base, skillRngState: seed, enemies: base.enemies.map((e,i) => ({
      ...e, currentHp: i === 1 ? 1 : e.currentHp, actionTimeMultiplier: i === 0 ? multiplier : 1,
    })) });
    if (state.enemies[0].nextActionSkillId === skillId) return {
      ...state, enemies: state.enemies.map((e,i) => i ? { ...e, actionRemainingMs: 100000 } : e),
    };
  }
  throw Error('No matching plan');
}

describe('Enemy × Skill action time', () => {
  it.each([
    ['enemy_guardian','skill_attack',5000],
    ['enemy_guardian','skill_cover',8000],
    ['enemy_shaman','skill_attack',6500],
    ['enemy_shaman','skill_heal',10000],
  ] as const)('%s / %s plans and executes at exactly %i ms', (id,skill,duration) => {
    const initial = planned(id,skill);
    expect(initial.enemies[0].actionDurationMs).toBe(duration);
    expect(initial.enemies[0].actionRemainingMs).toBe(duration);
    const before = tickCombat(initial,duration - 1, duration);
    expect(before.events.some(e => e.kind === 'enemy-skill-used')).toBe(false);
    expect(before.enemies[0].actionRemainingMs).toBe(1);
    const next = tickCombat(before,1,duration + 1);
    expect(next.events.find(e => e.kind === 'enemy-skill-used')?.skillId).toBe(skill);
    const actor = next.enemies[0];
    const binding = ENEMIES_BY_ID[id].skills.find(s => s.skillId === actor.nextActionSkillId)!;
    expect(actor.actionDurationMs).toBe(binding.actionTimeMs);
    expect(actor.actionRemainingMs).toBe(actor.actionDurationMs);
    expect(next.enemies[1].actionRemainingMs).toBe(initial.enemies[1].actionRemainingMs - duration);
  });
  it.each([['enemy_guardian','skill_cover'],['enemy_shaman','skill_heal']] as const)(
    'allows consecutive %s / %s with full preparation time', (id,skill) => {
      const base = planned(id,skill);
      let found = false;
      for (let seed = 0; seed < 10000; seed++) {
        const next = tickCombat({ ...base, skillRngState: seed },base.enemies[0].actionDurationMs);
        if (next.enemies[0].nextActionSkillId === skill) {
          expect(next.enemies[0].actionRemainingMs).toBe(base.enemies[0].actionDurationMs);
          const twice = tickCombat(next,next.enemies[0].actionDurationMs);
          expect(twice.events.filter(e => e.kind === 'enemy-skill-used' && e.skillId === skill)).toHaveLength(2);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });
  it('applies the action-time modifier, not a reuse restriction', () => {
    const state = planned('enemy_shaman','skill_heal',.8);
    expect(state.enemies[0].actionDurationMs).toBe(8000);
    const result = executeEnemyAbility(state,state.enemies[0].instanceId,{
      id:'haste',name:'Haste',description:'',gaugeCost:0,
      effects:[{ effectType:'buff',targetType:'self',stat:'actionTime',value:-20 }],
    });
    expect(result.state.enemies[0].actionTimeMultiplier).toBeCloseTo(.64);
    // Current cycle stays intact; the next plan snapshots the new speed.
    expect(result.state.enemies[0].actionRemainingMs).toBe(8000);
    const next = planEnemyAction(result.state,0);
    const binding = ENEMIES_BY_ID.enemy_shaman.skills.find(s => s.skillId === next.enemies[0].nextActionSkillId)!;
    expect(next.enemies[0].actionDurationMs).toBe(Math.round(binding.actionTimeMs * .64));
  });
  it('the same Heal definition supports an Enemy-specific binding duration', () => {
    ENEMIES_BY_ID['test-fast-shaman'] = { ...ENEMIES_BY_ID.enemy_shaman, id:'test-fast-shaman',
      skills: ENEMIES_BY_ID.enemy_shaman.skills.map(s => s.skillId === 'skill_heal' ? { ...s, actionTimeMs:6000 } : s) };
    try {
      expect(planned('test-fast-shaman','skill_heal').enemies[0].actionDurationMs).toBe(6000);
      expect(planned('enemy_shaman','skill_heal').enemies[0].actionDurationMs).toBe(10000);
    } finally { delete ENEMIES_BY_ID['test-fast-shaman']; }
  });
  it('falls back immediately after the planned preparation, without another Attack wait', () => {
    const base = planned('enemy_shaman','skill_heal');
    const full = { ...base, enemies: base.enemies.map(e => ({ ...e,currentHp:ENEMIES_BY_ID[e.definitionId].maxHp })) };
    const before = tickCombat(full,9999);
    expect(before.events.some(e => e.kind === 'enemy-skill-used')).toBe(false);
    const next = tickCombat(before,1);
    expect(next.events.find(e => e.kind === 'enemy-skill-used')?.skillId).toBe('skill_attack');
    expect(next.enemies[0].actionRemainingMs).toBe(6500);
    expect(next.party[0].currentHp).toBeLessThan(base.party[0].currentHp);
  });
  it('renders NEXT Heal, ACTION 5.0s and a half-filled 10s gauge', () => {
    const state = tickCombat(planned('enemy_shaman','skill_heal'),5000);
    const html = renderToStaticMarkup(createElement(EnemyPanel,{ combat:state }));
    expect(html).toContain('ACTION');
    expect(html).toContain('5.0s');
    expect(html).toContain('<small>NEXT</small><strong>Heal</strong>');
    expect(html).toContain('aria-valuemax="10000" aria-valuenow="5000"');
    expect(html).toContain('width:50%');
  });
  it.each([['crypt-slime',5000],['grave-shaman',6500],['goblin-archer',4200],['elite-slime',4800],['crypt-warden',5500]] as const)(
    'preserves %s Attack tempo at %i ms', (id,time) => {
      expect(startCombat(createCombatState([id])).enemies[0].actionDurationMs).toBe(time);
    });
});
