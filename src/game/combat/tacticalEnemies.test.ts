import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { EnemyPanel } from '../../components/EnemyPanel';
import { TypingPanel } from '../../components/TypingPanel';
import type { CombatState } from '../../types/game';
import { createCombatState } from './createCombatState';
import { startCombat, tickCombat, applyCorrectTyping, applyTypingMiss } from './combatEngine';
import { planEnemyAction, usableEnemySkills } from './enemySkillEngine';
import { applyTypingCurse, empowerEnemies, empowermentTarget } from './enemyCombatEffects';
import { executeEnemyAbility } from './enemyAbilityEngine';
import { resolveEnemyDamage } from './enemyDamage';
import { addBuff, applyRunBuffs } from '../buffs/runBuffManager';

const battle = (...ids: string[]) => startCombat(createCombatState(ids));
function plan(state: CombatState, index: number, skill: string) {
  for (let seed = 0; seed < 10000; seed++) {
    const next = planEnemyAction({ ...state, skillRngState: seed }, index);
    if (next.enemies[index].nextActionSkillId === skill) return next;
  }
  throw Error(`Unavailable ${skill}`);
}
function execute(state: CombatState, index: number, skill: string) {
  const planned = plan(state,index,skill);
  return tickCombat({ ...planned, enemies: planned.enemies.map((e,i) => ({ ...e, actionRemainingMs: i === index ? 1 : 100000 })) },1);
}
const special = (state: CombatState, index: number) => executeEnemyAbility(state,state.enemies[index].instanceId,
  ENEMIES_BY_ID[state.enemies[index].definitionId].specialAbilities[0]).state;
const hasSkill = (s: CombatState, i: number, id: string) => usableEnemySkills(s,s.enemies[i]).some(b => b.skillId === id);

describe('new tactical Enemy actions', () => {
  it.each([
    ['enemy_executioner','skill_attack',5500,'Attack'],
    ['enemy_executioner','skill_heavy_attack',11500,'Heavy Attack'],
    ['enemy_cultist','skill_attack',6000,'Attack'],
    ['enemy_cultist','skill_empower',8500,'Empower'],
    ['enemy_wraith','skill_attack',4500,'Attack'],
    ['enemy_wraith','skill_curse',8000,'Curse'],
  ] as const)('%s plans %s for %ims and executes the displayed action', (id,skill,time,name) => {
    const planned = plan(battle(id,'crypt-slime'),0,skill);
    expect(planned.enemies[0].actionDurationMs).toBe(time);
    expect(planned.enemies[0].actionRemainingMs).toBe(time);
    const html = renderToStaticMarkup(createElement(EnemyPanel,{ combat:planned }));
    expect(html).toContain(`<small>NEXT</small><strong>${name}</strong>`);
    const pausedOthers = { ...planned, enemies: planned.enemies.map((e,i) => i ? { ...e,actionRemainingMs:100000 } : e) };
    const before = tickCombat(pausedOthers,time - 1);
    expect(before.events.some(e => e.kind === 'enemy-skill-used')).toBe(false);
    expect(tickCombat(before,1).events.find(e => e.kind === 'enemy-skill-used')?.skillId).toBe(skill);
  });
  it.each([1,1.3])('Heavy Attack uses defense and both skill/empower multipliers (%s)', multiplier => {
    let state = battle('enemy_executioner');
    state = empowerEnemies(state,[state.enemies[0].instanceId],multiplier);
    state = { ...state, enemies: state.enemies.map(e => ({ ...e, attackMultiplier:1.2 })) };
    const next = execute(state,0,'skill_heavy_attack');
    const damage = Math.round(24 * 1.2 * 1.8 * multiplier) - CHARACTERS_BY_ID.warrior.stats.defense;
    expect(next.party[0].currentHp).toBe(state.party[0].currentHp - damage);
    expect(next.enemies[0].nextAttackEmpowerMultiplier).toBe(1);
    expect(next.partyTargetCursor).toBe(1);
    expect(next.events.find(e => e.kind === 'ally-damaged')?.amount).toBe(damage);
  });
  it('Guard blocks even Empowered Heavy Attack and consumes its charge', () => {
    const base = battle('enemy_executioner');
    const state = { ...empowerEnemies(base,[base.enemies[0].instanceId],1.3),
      party: base.party.map((p,i) => i ? p : { ...p,statuses:['ability:guard'] }) };
    const next = execute(state,0,'skill_heavy_attack');
    expect(next.party[0].currentHp).toBe(state.party[0].currentHp);
    expect(next.party[0].statuses).not.toContain('ability:guard');
    expect(next.enemies[0].nextAttackEmpowerMultiplier).toBe(1);
  });
  it('Heavy Attack uses Damage Shield and can end combat in defeat', () => {
    const base = battle('enemy_executioner');
    const shielded = { ...base,buffResources:{...base.buffResources,shields:{warrior:.5}} };
    const hit = execute(shielded,0,'skill_heavy_attack');
    expect(hit.party[0].currentHp).toBe(base.party[0].currentHp - Math.round((Math.round(24 * 1.8) - CHARACTERS_BY_ID.warrior.stats.defense) * .5));
    expect(hit.buffResources.shields.warrior).toBe(0);
    const dying = { ...base,party:base.party.map((p,i) => ({...p,currentHp:i === 0 ? 1 : 0})) };
    expect(execute(dying,0,'skill_heavy_attack').status).toBe('defeat');
  });
  it('Execution targets the lowest HP ratio and does not consume Empower', () => {
    const base = battle('enemy_executioner');
    const state = { ...empowerEnemies(base,[base.enemies[0].instanceId],1.3),
      party: base.party.map((p,i) => i === 2 ? { ...p,currentHp:50 } : p) };
    const next = special(state,0);
    expect(next.party[2].currentHp).toBe(6);
    expect(next.party[0].currentHp).toBe(state.party[0].currentHp);
    expect(next.enemies[0].nextAttackEmpowerMultiplier).toBe(1.3);
  });
});

describe('Empower and Dark Ritual', () => {
  it('chooses the strongest effective attack, then formation order; excludes self/dead/charged', () => {
    let state = battle('enemy_cultist','enemy_executioner','enemy_wraith','enemy_executioner');
    expect(hasSkill(state,0,'skill_empower')).toBe(true);
    expect(empowermentTarget(state,state.enemies[0])?.instanceId).toBe(state.enemies[1].instanceId);
    state = { ...state,enemies:state.enemies.map((e,i) => i === 2 ? { ...e,attackMultiplier:2 } : e) };
    expect(empowermentTarget(state,state.enemies[0])?.instanceId).toBe(state.enemies[2].instanceId);
    const next = execute(state,0,'skill_empower');
    expect(next.enemies.map(e => e.nextAttackEmpowerMultiplier)).toEqual([1,1,1.3,1]);
    expect(empowermentTarget(next,next.enemies[0])?.instanceId).toBe(next.enemies[1].instanceId);
    const dead = { ...next,enemies:next.enemies.map((e,i) => i === 0 ? e : { ...e,currentHp:0 }) };
    expect(hasSkill(dead,0,'skill_empower')).toBe(false);
    expect(hasSkill(battle('enemy_cultist'),0,'skill_empower')).toBe(false);
    const all = empowerEnemies(state,state.enemies.map(e => e.instanceId),1.3);
    expect(hasSkill(all,0,'skill_empower')).toBe(false);
  });
  it.each([['enemy_guardian','skill_cover'],['enemy_shaman','skill_heal'],['enemy_cultist','skill_empower'],['enemy_wraith','skill_curse']] as const)(
    '%s retains Empower through %s', (id,skill) => {
      const base = battle(id,'crypt-slime');
      const state = { ...empowerEnemies(base,[base.enemies[0].instanceId],1.3),
        enemies:base.enemies.map((e,i) => i ? { ...e,currentHp:50 } : { ...e,nextAttackEmpowerMultiplier:1.3 }) };
      expect(execute(state,0,skill).enemies[0].nextAttackEmpowerMultiplier).toBe(1.3);
    });
  it('Attack consumes Empower once, while Dark Ritual upgrades without stacking and skips dead enemies', () => {
    const base = battle('enemy_cultist','enemy_executioner','crypt-slime');
    let state = empowerEnemies(base,base.enemies.map(e => e.instanceId),1.3);
    state = { ...state,enemies:state.enemies.map((e,i) => i === 2 ? { ...e,currentHp:0,nextAttackEmpowerMultiplier:1 } : e) };
    state = special(special(state,0),0);
    expect(state.enemies.map(e => e.nextAttackEmpowerMultiplier)).toEqual([1.35,1.35,1]);
    state = empowerEnemies(state,[state.enemies[1].instanceId],1.3);
    expect(state.enemies[1].nextAttackEmpowerMultiplier).toBe(1.35);
    const next = execute(state,1,'skill_attack');
    expect(next.party[0].currentHp).toBe(state.party[0].currentHp - (Math.round(24 * 1.35) - CHARACTERS_BY_ID.warrior.stats.defense));
    expect(next.enemies[1].nextAttackEmpowerMultiplier).toBe(1);
    expect(next.enemies[0].nextAttackEmpowerMultiplier).toBe(1.35);
  });
  it('an invalidated Empower plan falls back immediately to Attack', () => {
    const planned = plan(battle('enemy_cultist','crypt-slime'),0,'skill_empower');
    const next = tickCombat({ ...planned,enemies:planned.enemies.map((e,i) => i ? { ...e,currentHp:0 } : e) },8500);
    expect(next.events.find(e => e.kind === 'enemy-skill-used')?.skillId).toBe('skill_attack');
  });
});

describe('Typing Curse', () => {
  it('two simultaneously planned Curses never stack; the later invalidated plan falls back to Attack', () => {
    let state = plan(battle('enemy_wraith','enemy_wraith'),0,'skill_curse');
    state = plan(state,1,'skill_curse');
    const next = tickCombat(state,8000);
    expect(next.events.filter(e => e.kind === 'enemy-skill-used').map(e => e.skillId)).toEqual(['skill_curse','skill_attack']);
    expect(next.typingCurseBonus).toBe(10);
    expect(next.enemies.every(e => e.nextActionSkillId === 'skill_attack')).toBe(true);
  });
  it('is shared, nonstacking, persists through correct input and caster death, and is consumed by one miss', () => {
    let state = battle('enemy_wraith','enemy_wraith','crypt-slime');
    expect(hasSkill(state,0,'skill_curse')).toBe(true);
    state = execute(state,0,'skill_curse');
    expect(state.typingCurseBonus).toBe(10);
    expect(hasSkill(state,1,'skill_curse')).toBe(false);
    state = applyTypingCurse(state,10);
    state = applyCorrectTyping(state,state.typing);
    state = tickCombat(state,1000);
    state = resolveEnemyDamage(state,{targetIds:[state.enemies[0].instanceId],power:999,kind:'ally-attack',label:'test'});
    expect(state.typingCurseBonus).toBe(10);
    const next = applyTypingMiss(state,state.typing);
    expect(next.enemies.map(e => e.specialGauge)).toEqual([0,35,35]);
    expect(next.typingCurseBonus).toBe(0);
    expect(hasSkill(next,1,'skill_curse')).toBe(true);
    expect(applyTypingMiss(next,next.typing).enemies[1].specialGauge).toBe(60);
    expect(createCombatState(['enemy_wraith']).typingCurseBonus).toBe(0);
  });
  it('applies Calm Mind + Precision and shield to the combined base + Curse', () => {
    let state = applyRunBuffs(battle('enemy_wraith'),addBuff(addBuff([],'calm-mind'),'precision'));
    state = applyTypingCurse(state,10);
    state = { ...state,buffResources:{...state.buffResources,gaugeShield:5} };
    const next = applyTypingMiss(state,state.typing);
    expect(next.enemies[0].specialGauge).toBeCloseTo(35 * .7 - 5);
    expect(next.buffResources.gaugeShield).toBe(0);
    expect(next.typingCurseBonus).toBe(0);
    expect(applyTypingMiss({ ...state,buffResources:{...state.buffResources,gaugeShield:100} },state.typing).enemies[0].specialGauge).toBe(0);
  });
  it('Soul Erosion deals 16 to living party members and reapplies only one Curse', () => {
    let state = battle('enemy_wraith');
    state = { ...state,party:state.party.map((p,i) => i === 1 ? { ...p,currentHp:0 } : p) };
    const next = special(special(state,0),0);
    expect(next.party.map(p => p.currentHp)).toEqual(state.party.map(p => p.currentHp > 0 ? p.currentHp - 32 : 0));
    expect(next.typingCurseBonus).toBe(10);
  });
  it('uses compact shared UI, and clears the warning on consumption', () => {
    const base = battle('enemy_wraith','enemy_executioner');
    const state = applyTypingCurse(empowerEnemies(base,[base.enemies[1].instanceId],1.3),10);
    expect(renderToStaticMarkup(createElement(EnemyPanel,{combat:state}))).toContain('EMPOWER ×1.30');
    expect(renderToStaticMarkup(createElement(TypingPanel,{combat:state}))).toContain('CURSED · Next Miss: Special Gauge +10');
    const next = applyTypingMiss(state,state.typing);
    expect(renderToStaticMarkup(createElement(TypingPanel,{combat:next}))).not.toContain('CURSED');
  });
});
