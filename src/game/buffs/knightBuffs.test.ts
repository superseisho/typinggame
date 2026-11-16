import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import type { CombatState } from '../../types/game';
import type { RunBuff } from '../../types/buffs';
import { PartyPanel } from '../../components/PartyPanel';
import { createCombatState } from '../combat/createCombatState';
import { applyCorrectTyping, startCombat, tickCombat } from '../combat/combatEngine';
import { executeEnemyAbility } from '../combat/enemyAbilityEngine';
import { getCharacterVisualState } from '../combat/characterVisualState';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { getEffectiveCharacter } from './buffModifiers';
import { applyRunBuffs } from './runBuffManager';
import { BUFF_CONFIG } from './buffConfig';
import { generateBuffRewards } from './buffRewards';
import { SHOP_CONFIG } from '../dungeon/shopConfig';
import { generateShop } from '../dungeon/shopEngine';

function battle(ids: readonly string[] = [], enemies = ['enemy_executioner', 'crypt-slime']): CombatState {
  const state = startCombat(applyRunBuffs(createCombatState(enemies), ids.map(buffId => ({ buffId, stacks: 1 }))), 0);
  return { ...state, enemies: state.enemies.map(e => ({ ...e, currentHp: 10000, actionRemainingMs: 1e9 })) };
}
function ready(s: CombatState, charges = 1): CombatState {
  return { ...s, party: s.party.map((p, i) => i ? p : { ...p, guardCharges: charges, statuses: [...p.statuses.filter(s => s !== 'ability:guard'), 'ability:guard'] }) };
}
function attack(s: CombatState, index = 0, skill = 'skill_attack') {
  return tickCombat({ ...s, enemies: s.enemies.map((e, i) => i === index ? { ...e, actionRemainingMs: 0, nextActionSkillId: skill } : { ...e, actionRemainingMs: 1e9 }) }, 1, 1);
}
const guard = (s: CombatState) => attack(ready(s));
const complete = (s: CombatState) => applyCorrectTyping(s, { ...s.typing, completedSentences: s.typing.completedSentences + 1,
  currentCombo: s.typing.currentCombo + 1, correctCharacterCount: s.typing.correctCharacterCount + 1 }, 1);
const owned = (buffId: string, stacks: number): RunBuff => ({ buffId, stacks });

describe('Knight successful guard buffs', () => {
  it('defines exactly eight additions with the required rarity and stack caps', () => {
    const expected = [['shield-wall','common',1], ['guardians-grace','uncommon',3], ['shield-momentum','rare',3],
      ['retribution','epic',1], ['rallying-aegis','epic',1], ['relentless-advance','epic',1], ['twin-aegis','legendary',1], ['perfect-bastion','legendary',1]] as const;
    expect(BUFF_DEFINITIONS).toHaveLength(54);
    expect(new Set(BUFF_DEFINITIONS.map(b => b.id)).size).toBe(54);
    for (const [id, rarity, maxStacks] of expected) expect(BUFFS_BY_ID[id]).toMatchObject({ rarity, maxStacks, categories: expect.arrayContaining(['Knight']) });
  });
  it('GUARD readiness alone does not trigger successful-guard effects', () => {
    let state = battle(['shield-wall', 'rallying-aegis', 'relentless-advance', 'guardians-grace', 'shield-momentum', 'retribution']);
    state = complete(complete(complete(state)));
    expect(state.party[0].guardCharges).toBe(1);
    expect(state.buffResources.timedPartyModifiers).toEqual({});
    expect(state.buffResources.attackThresholdReduction).toBe(0);
    expect(state.party[0].attackCharge).toBe(3);
    expect(state.events.some(e => e.abilityId === 'retribution')).toBe(false);
  });
  it.each([['shield-wall', 'defense', 'defense-rune'], ['rallying-aegis', 'attack', 'power-rune']] as const)('%s adds 30%%, refreshes rather than stacks, then expires', (id, stat, rune) => {
    const base = structuredClone(CHARACTERS_BY_ID);
    let state = battle([id, rune]);
    state = { ...state, party: state.party.map((p, i) => i === 1 ? { ...p, currentHp: 0 } : p) };
    state = guard(state);
    for (const p of state.party) expect(getEffectiveCharacter(state, p.definitionId).stats[stat]).toBe(Math.round(base[p.definitionId].stats[stat] * 1.35));
    const duration = stat === 'defense' ? BUFF_CONFIG.guardDefenseDurationMs : BUFF_CONFIG.guardAttackDurationMs;
    expect(state.buffResources.timedPartyModifiers[stat]).toEqual({ value: .3, remainingMs: duration });
    state = tickCombat(state, duration - 1, duration);
    expect(state.buffResources.timedPartyModifiers[stat]!.remainingMs).toBe(1);
    state = guard(state);
    expect(state.buffResources.timedPartyModifiers[stat]).toEqual({ value: .3, remainingMs: duration });
    state = tickCombat(state, duration, duration * 2);
    expect(state.buffResources.timedPartyModifiers[stat]).toBeUndefined();
    expect(getEffectiveCharacter(state, 'warrior').stats[stat]).toBe(Math.round(base.warrior.stats[stat] * 1.05));
    expect(CHARACTERS_BY_ID).toEqual(base);
  });
  it.each([1, 2, 3])("Guardian's Grace heals each effective maximum at stack %s without reviving or overheal", stacks => {
    let state = applyRunBuffs(battle(), [owned('guardians-grace', stacks), owned('greater-vitality-rune', 1)]);
    state = { ...state, party: state.party.map((p, i) => ({ ...p, currentHp: i === 1 ? 0 : i === 2 ? p.currentHp : 10 })) };
    const next = guard(state);
    for (const [i, p] of next.party.entries()) expect(p.currentHp).toBe(i === 1 ? 0 : i === 2 ? state.party[i].currentHp : 10 + Math.round(getEffectiveCharacter(state, p.definitionId).stats.maxHp * .05 * stacks));
    expect(next.events.filter(e => e.kind === 'ally-heal' && e.abilityId === 'guardians-grace')).toHaveLength(2);
  });
  it.each([1, 3])('Momentum adds ceil(effective threshold * 10%% * %s), independent of Overdrive', stacks => {
    const buffs = [owned('shield-momentum', stacks), owned('lightning-fingers', 1)];
    const state = applyRunBuffs(battle(), buffs);
    const next = guard(state);
    expect(next.party.map(p => p.attackCharge)).toEqual(state.party.map(p => Math.ceil(getEffectiveCharacter(state, p.definitionId).attackThreshold * .1 * stacks)));
    expect(guard(applyRunBuffs(state, [...buffs, owned('overdrive', 1)])).party.map(p => p.attackCharge)).toEqual(next.party.map(p => p.attackCharge));
    const base = guard(battle(['shield-momentum']));
    expect(base.party[0].attackCharge).toBe(9);
    expect(base.party[1].attackCharge).toBe(3);
  });
  it('Momentum immediately resolves ready normal attacks with Oath and selected targets', () => {
    let state = battle(['shield-momentum', 'guardian-oath']);
    state = { ...state, targetEnemyId: state.enemies[1].instanceId, party: state.party.map((p,i) => i ? { ...p, currentHp: 0 } : { ...p, attackCharge: 89 }) };
    const next = guard(state);
    expect(next.party[0].attackCharge).toBe(8);
    expect(next.events.filter(e => e.kind === 'ally-attack')).toHaveLength(1);
    expect(next.events.find(e => e.kind === 'ally-attack')).toMatchObject({ targetId: state.targetEnemyId, amount: Math.round(31 * 1.3) - ENEMIES_BY_ID['crypt-slime'].defense });
    expect(next.typing).toBe(state.typing);
    expect(next.buffResources.counters.warrior).toBe(0);
  });
  it('Retribution uses the attacking instance and effective Attack, preserves Oath/selection and never rolls Legendary procs', () => {
    let state = battle(['retribution', 'guardian-oath', 'rallying-aegis', 'reapers-blessing', 'echoing-assault'], ['crypt-slime', 'crypt-slime']);
    state = { ...state, targetEnemyId: state.enemies[1].instanceId };
    const next = guard(state);
    expect(getEffectiveCharacter(next, 'warrior').stats.attack).toBe(40);
    expect(next.events.find(e => e.abilityId === 'retribution')).toMatchObject({ targetId: state.enemies[0].instanceId, amount: 120 - ENEMIES_BY_ID['crypt-slime'].defense });
    expect(next.enemies[1].currentHp).toBe(state.enemies[1].currentHp);
    expect(next.targetEnemyId).toBe(state.targetEnemyId);
    expect(next.buffResources.counters.warrior).toBe(.3);
    expect(next.buffRngState).toBe(state.buffRngState);
  });
  it('Retribution honors Cover and performs normal defeat/retarget cleanup', () => {
    let state = battle(['retribution'], ['crypt-slime', 'enemy_guardian']);
    state = { ...state, targetEnemyId: state.enemies[0].instanceId, enemies: state.enemies.map((e,i) => i ? { ...e, cover: { remainingHits: 2 }, currentHp: 1 } : e) };
    const next = guard(state);
    expect(next.enemies[0].currentHp).toBe(state.enemies[0].currentHp);
    expect(next.enemies[1].currentHp).toBe(0);
    expect(next.enemies[1].cover).toBeNull();
    expect(next.events.find(e => e.abilityId === 'retribution')).toMatchObject({ originalTargetId: state.enemies[0].instanceId, targetId: state.enemies[1].instanceId });
  });
  it('Counter victory stops remaining enemy ticks and clears battle-local resources', () => {
    let state = ready(battle(['retribution', 'relentless-advance', 'shield-wall', 'rallying-aegis'], ['crypt-slime']), 2);
    state = { ...state, enemies: state.enemies.map(e => ({ ...e, currentHp: 1 })) };
    const next = attack(state);
    expect(next.status).toBe('victory');
    expect(next.targetEnemyId).toBeNull();
    expect(next.events.filter(e => e.kind === 'victory')).toHaveLength(1);
    expect(next.events.filter(e => e.kind === 'enemy-defeated')).toHaveLength(1);
    expect(next.buffResources.attackThresholdReduction).toBe(0);
    expect(next.buffResources.timedPartyModifiers).toEqual({});
    expect(next.party[0].guardCharges).toBe(0);
    expect(next.party[0].statuses).not.toContain('ability:guard');
    expect(tickCombat(next, 10000)).toBe(next);
  });
  it('Momentum victory also exits the tick and skips subsequent enemy attacks', () => {
    let state = ready(battle(['shield-momentum', 'echoing-assault']));
    state = { ...state, buffRngState: 0, party: state.party.map(p => ({ ...p, attackCharge: 100 })), enemies: state.enemies.map(e => ({ ...e, currentHp: 1, actionRemainingMs: 0 })) };
    const next = tickCombat(state, 1, 1);
    expect(next.status).toBe('victory');
    expect(next.events.filter(e => e.kind === 'ally-guard-consumed')).toHaveLength(1);
    expect(next.events.some(e => e.kind === 'ally-damaged')).toBe(false);
  });
  it('Relentless accumulates after percentage/ceiling, clamps to five and resets next battle', () => {
    let state = battle(['swift-fingers', 'relentless-advance']);
    expect(getEffectiveCharacter(state, 'warrior').attackThreshold).toBe(86);
    state = guard(state);
    expect(getEffectiveCharacter(state, 'warrior').attackThreshold).toBe(76);
    state = guard(state);
    expect(getEffectiveCharacter(state, 'warrior').attackThreshold).toBe(66);
    state = guard(state);
    expect(state.buffResources.attackThresholdReduction).toBe(30);
    expect(getEffectiveCharacter(state, 'mage').ability.trigger).toEqual(CHARACTERS_BY_ID.mage.ability.trigger);
    expect(getEffectiveCharacter(state, 'warrior').ability.trigger).toEqual(CHARACTERS_BY_ID.warrior.ability.trigger);
    for (let i = 0; i < 10; i++) state = guard(state);
    expect(getEffectiveCharacter(state, 'warrior').attackThreshold).toBe(5);
    const run = { ...createDungeonRun(42, 'reset'), currentRoom: 'battle' as const, runStatus: 'reward' as const, combat: state, activeBuffs: state.runBuffs };
    const next = reduceDungeon(run, { type: 'advance' });
    expect(next.combat.buffResources.attackThresholdReduction).toBe(0);
    expect(next.combat.buffResources.timedPartyModifiers).toEqual({});
    expect(next.combat.party.every(p => p.guardCharges === 0)).toBe(true);
    expect(next.activeBuffs).toEqual(state.runBuffs);
  });
  it('simultaneous effects are independent of Buff acquisition order and use the newly reduced threshold', () => {
    const ids = ['shield-momentum','guardians-grace','retribution','relentless-advance','shield-wall','rallying-aegis','reinforced-shield','guardian-oath','fortress'];
    const run = (ids: string[]) => {
      const s = battle(ids);
      return guard({ ...s, party: s.party.map(p => ({ ...p, currentHp: 10 })) });
    };
    const a = run(ids), b = run([...ids].reverse());
    expect(a.party).toEqual(b.party);
    expect(a.enemies).toEqual(b.enemies);
    expect(a.party.map(p => p.attackCharge)).toEqual([8,2,6,4]);
    expect(a.buffResources.counters.warrior).toBe(.3);
    expect(a.buffResources.gaugeShield).toBe(15);
    expect(a.party[0].currentHp).toBe(28);
  });
});

describe('GUARD capacity and prompt threshold', () => {
  it('Twin Aegis refills rather than adds charges, blocks two heavy/normal attacks and triggers old/new buffs each time', () => {
    let state = battle(['twin-aegis','perfect-bastion','overdrive','reinforced-shield','guardians-grace','guardian-oath','fortress','relentless-advance']);
    state = { ...state, party: state.party.map((p,i) => i ? p : { ...p, currentHp: 50 }) };
    state = complete(state);
    expect(state.party[0].guardCharges).toBe(2);
    expect(state.typing.completedSentences).toBe(1);
    expect(getCharacterVisualState(CHARACTERS_BY_ID.warrior, state.party[0])).toContain('guard_active');
    expect(renderToStaticMarkup(createElement(PartyPanel, { combat: state }))).toContain('GUARD ×2');
    state = attack(state, 0, 'skill_heavy_attack');
    expect(state.party[0].guardCharges).toBe(1);
    expect(state.party[0].currentHp).toBe(68);
    expect(state.buffResources.attackThresholdReduction).toBe(10);
    const refill = complete(state);
    expect(refill.party[0].guardCharges).toBe(2);
    state = attack(state);
    expect(state.party[0].guardCharges).toBe(0);
    expect(state.party[0].statuses).not.toContain('ability:guard');
    expect(state.party[0].currentHp).toBe(86);
    expect(state.buffResources.attackThresholdReduction).toBe(20);
    expect(state.events.filter(e => e.abilityId === 'guardian-oath')).toHaveLength(2);
    expect(state.events.filter(e => e.abilityId === 'fortress')).toHaveLength(2);
    expect(attack(state).events.filter(e => e.kind === 'ally-damaged')).toHaveLength(1);
  });
  it.each([false, true])('Perfect Bastion requires 2 prompts, Overdrive combo requires 1 (Overdrive=%s)', overdrive => {
    let state = battle(['perfect-bastion', ...(overdrive ? ['overdrive'] : [])]);
    expect(getEffectiveCharacter(state, 'warrior').ability.trigger).toMatchObject({ threshold: 2 });
    state = complete(state);
    expect(state.party[0].guardCharges).toBe(overdrive ? 1 : 0);
    if (!overdrive) expect(complete(state).party[0].guardCharges).toBe(1);
    expect(CHARACTERS_BY_ID.warrior.ability.trigger).toMatchObject({ threshold: 3 });
    expect(getEffectiveCharacter({ runBuffs: [owned('perfect-bastion', 100)] }, 'warrior').ability.trigger).toMatchObject({ threshold: 1 });
  });
  it('normal GUARD still needs three sentences and has one charge', () => {
    const first = complete(battle());
    const second = complete(first);
    expect(second.party[0].guardCharges).toBe(0);
    expect(complete(second).party[0].guardCharges).toBe(1);
  });
  it('Special bypasses guard as before; a fallen Knight loses charges and Guard art/status', () => {
    const state = ready(battle(['twin-aegis']), 2);
    const special = { id: 'test', name: 'Test', description: '', gaugeCost: 100,
      effects: [{ effectType: 'damage', targetType: 'allParty', valueType: 'flat', value: 999 }] } as const;
    const next = executeEnemyAbility(state, state.enemies[0].instanceId, special).state;
    expect(next.party[0].currentHp).toBe(0);
    expect(next.party[0].guardCharges).toBe(0);
    expect(next.party[0].statuses).not.toContain('ability:guard');
    expect(next.events.some(e => e.kind === 'ally-guard-consumed')).toBe(false);
    const dead = tickCombat({ ...state, enemies: state.enemies.map((e,i) => i ? e : { ...e, pendingSpecial: { abilityId: ENEMIES_BY_ID[e.definitionId].specialAbilities[0].id, remainingMs: 0 } }),
      party: state.party.map(p => ({ ...p, currentHp: 1 })) }, 1, 1);
    expect(dead.party[0].guardCharges).toBe(0);
  });
  it('new Buffs automatically enter reward/Shop pools, honor caps, and expose compact timers in UI', () => {
    const allowed = ['shield-wall','guardians-grace','shield-momentum','retribution','rallying-aegis','relentless-advance','twin-aegis','perfect-bastion'];
    for (const id of allowed) {
      const capped = BUFF_DEFINITIONS.filter(b => b.id !== id).map(b => owned(b.id, b.maxStacks));
      expect(generateBuffRewards(capped, 'battle', 42).choices).toEqual([id]);
      expect(generateShop({ ...createDungeonRun(42, 'shop'), activeBuffs: capped }).shop.items.find(p => p.type === 'buff' && p.buffId === id)?.price).toBe(SHOP_CONFIG.buffPrices[BUFFS_BY_ID[id].rarity]);
    }
    const state = guard(battle(['shield-wall', 'rallying-aegis']));
    const html = renderToStaticMarkup(createElement(PartyPanel, { combat: state }));
    expect(html).toContain('ATK +30% 20.0s');
    expect(html).toContain('DEF +30% 20.0s');
  });
});
