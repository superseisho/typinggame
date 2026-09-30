import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartyPanel } from '../../components/PartyPanel';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { CombatState } from '../../types/game';
import { createCombatState } from '../combat/createCombatState';
import { applyCorrectTyping, startCombat } from '../combat/combatEngine';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import { getTypingDisplay } from '../typing/typingEngine';
import { applyRunBuffs, canAddBuff } from './runBuffManager';
import { getCorrectInputChargeMultiplier, getEffectiveCharacter } from './buffModifiers';
import { generateBuffRewards } from './buffRewards';
import { BUFF_CONFIG } from './buffConfig';
import { SHOP_CONFIG } from '../dungeon/shopConfig';
import { TREASURE_CONFIG } from '../dungeon/treasureConfig';
import { ALTAR_CONFIG, EVENT_CONFIG } from '../dungeon/encounterConfig';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { generateShop } from '../dungeon/shopEngine';

function battle(ids: string[] = ['overdrive']): CombatState {
  const state = startCombat(applyRunBuffs(createCombatState(['crypt-warden']), ids.map(buffId => ({ buffId, stacks: 1 }))));
  return { ...state, enemies: state.enemies.map(e => ({ ...e, currentHp: 100000 })) };
}
const correct = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current, 1);
const miss = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current === 'z' ? 'q' : 'z', 1);
const completion = (s: CombatState) => applyCorrectTyping(s, { ...s.typing, completedSentences: s.typing.completedSentences + 1,
  correctCharacterCount: s.typing.correctCharacterCount + 1, currentCombo: s.typing.currentCombo + 1 }, 1);

describe('Overdrive combat-only charge', () => {
  it('adds 2 basic charge only to living allies; no-buff input adds 1', () => {
    expect(getCorrectInputChargeMultiplier([])).toBe(1);
    expect(correct(battle([])).party.map(p => p.attackCharge)).toEqual([1, 1, 1, 1]);
    expect(correct(battle()).party.map(p => p.attackCharge)).toEqual([2, 2, 2, 2]);
    expect(correct(battle()).party.map(p => p.abilityCharge)).toEqual([0, 2, 2, 0]);
    const state = battle();
    const down = { ...state, party: state.party.map(p => ({ ...p, currentHp: 0 })) };
    expect(completion(down).party.every(p => p.attackCharge === 0 && p.abilityCharge === 0)).toBe(true);
  });
  it.each([['mage', 28, 'arcane-burst'], ['mage', 29, 'arcane-burst'], ['cleric', 48, 'heal'], ['cleric', 49, 'heal']] as const)('%s triggers once at/over threshold from %s and resets', (id, charge, abilityId) => {
    const state = battle();
    const ready = { ...state, party: state.party.map(p => ({ ...p, currentHp: p.definitionId === 'warrior' ? 10 : p.currentHp, abilityCharge: p.definitionId === id ? charge : 0 })) };
    const next = correct(ready);
    expect(next.party.find(p => p.definitionId === id)!.abilityCharge).toBe(0);
    expect(next.events.filter(e => e.kind === 'ally-ability-triggered' && e.abilityId === abilityId)).toHaveLength(1);
    if (id === 'cleric') expect(next.party[0].currentHp).toBeGreaterThan(10);
    if (charge === 28 || charge === 48) expect(correct(applyRunBuffs(ready, [])).party.find(p => p.definitionId === id)!.abilityCharge).toBe(charge + 1);
  });
  it('Knight uses sentence charge, preserves excess, shows the same gauge and keeps real completion counts', () => {
    const first = completion(battle());
    expect(first.party[0].abilityCharge).toBe(2);
    expect(first.typing.completedSentences).toBe(1);
    expect(renderToStaticMarkup(createElement(PartyPanel, { combat: first }))).toContain('2 / 3');
    const second = completion(first);
    expect(second.party[0].statuses).toContain('ability:guard');
    expect(second.party[0].abilityCharge).toBe(1);
    expect(second.typing.completedSentences).toBe(2);
    expect(second.events.filter(e => e.kind === 'ally-ability-triggered' && e.abilityId === 'guard')).toHaveLength(1);
    expect(miss(first).party[0].abilityCharge).toBe(2);
    const nextRun = reduceDungeon({ ...createDungeonRun(42, 'test'), currentRoom: 'battle', runStatus: 'reward', combat: second, activeBuffs: second.runBuffs }, { type: 'advance' });
    expect(nextRun.combat.party.every(p => p.abilityCharge === 0)).toBe(true);
  });
  it('real typing counts and Fighter milestones advance once per key, not per charge', () => {
    let state = battle();
    for (let i = 0; i < 10; i++) state = correct(state);
    expect(state.typing.correctCharacterCount).toBe(10);
    expect(state.typing.currentCombo).toBe(10);
    expect(state.typing.maxCombo).toBe(10);
    expect(state.party[3].attackCharge).toBe(20);
    expect(state.party[3].statuses).not.toContain('ability:flow-combo');
    for (let i = 0; i < 10; i++) state = correct(state);
    expect(state.typing.currentCombo).toBe(20);
    expect(state.party[3].statuses).toContain('ability:flow-combo');
  });
  it('Flow remains +5, Perfect Rhythm remains 50, Vital/Seal remain 100 real correct keys', () => {
    let state = battle(['overdrive', 'flow', 'perfect-rhythm', 'vital-rhythm', 'seal-rhythm']);
    for (let i = 0; i < 49; i++) state = correct(state);
    const before = state.party[0].attackCharge;
    state = correct(state);
    expect(state.party[0].attackCharge).toBe((before + 2 + 5) % getEffectiveCharacter(state, 'warrior').attackThreshold);
    expect(state.events.some(e => e.abilityId === 'perfect-rhythm')).toBe(true);
    expect(state.events.some(e => e.abilityId === 'vital-rhythm' || e.abilityId === 'seal-rhythm')).toBe(false);
    for (let i = 0; i < 49; i++) state = correct(state);
    state = { ...state, party: state.party.map(p => ({ ...p, currentHp: 10 })), enemies: state.enemies.map(e => ({ ...e, specialGauge: 100 })) };
    state = correct(state);
    expect(state.typing.currentCombo).toBe(100);
    expect(state.events.some(e => e.abilityId === 'vital-rhythm')).toBe(true);
    expect(state.events.some(e => e.abilityId === 'seal-rhythm')).toBe(true);
    expect(state.enemies[0].specialGauge).toBeLessThan(100);
  });
  it.each([false, true])('ordinary/protected Miss adds no charge (protected=%s)', protectedMiss => {
    let state = battle(protectedMiss ? ['overdrive', 'unbroken-focus'] : ['overdrive']);
    for (let i = 0; i < 10; i++) state = correct(state);
    const next = miss(state);
    expect(next.party.map(p => [p.attackCharge, p.abilityCharge])).toEqual(state.party.map(p => [p.attackCharge, p.abilityCharge]));
    expect(next.typing.missCount).toBe(1);
    expect(next.typing.currentCombo).toBe(protectedMiss ? 10 : 0);
    expect(next.lastMissProtected).toBe(protectedMiss);
  });
  it.each(['swift-fingers', 'lightning-fingers'])('combines with %s and preserves attack overflow without double attacks', id => {
    let state = battle(['overdrive', id]);
    const threshold = getEffectiveCharacter(state, 'mage').attackThreshold;
    expect(threshold).toBe(id === 'swift-fingers' ? 29 : 27);
    state = { ...state, party: state.party.map(p => p.definitionId === 'mage' ? { ...p, attackCharge: threshold - 1 } : p) };
    const next = correct(state);
    expect(next.party[1].attackCharge).toBe(1);
    expect(next.events.filter(e => e.kind === 'ally-attack' && e.actorId === 'mage')).toHaveLength(1);
  });
  it('Mana Surge still reduces threshold to 24, reached in 12 correct inputs', () => {
    let state = battle(['overdrive', 'mana-surge']);
    for (let i = 0; i < 11; i++) state = correct(state);
    expect(state.party[1].abilityCharge).toBe(22);
    expect(correct(state).party[1].abilityCharge).toBe(0);
  });
  it('is unique and available through every existing Legendary route and Shop price', () => {
    expect(BUFFS_BY_ID.overdrive).toMatchObject({ rarity: 'legendary', categories: ['Global', 'Typing'], maxStacks: 1, stackable: false });
    const cappedOthers = BUFF_DEFINITIONS.filter(b => b.id !== 'overdrive').map(b => ({ buffId: b.id, stacks: b.maxStacks }));
    for (const weights of [BUFF_CONFIG.rarityWeights.battle, BUFF_CONFIG.rarityWeights.elite, TREASURE_CONFIG.buffWeights, TREASURE_CONFIG.rareBuffWeights, ALTAR_CONFIG.bloodWeights, ALTAR_CONFIG.goldWeights, EVENT_CONFIG.buffWeights, SHOP_CONFIG.buffWeights]) {
      expect(generateBuffRewards(cappedOthers, 'test', 42, { weights }).choices).toEqual(['overdrive']);
    }
    const run = { ...createDungeonRun(42, 'shop'), activeBuffs: cappedOthers };
    expect(generateShop(run).shop.items.find(p => p.type === 'buff' && p.buffId === 'overdrive')?.price).toBe(SHOP_CONFIG.buffPrices.legendary);
    expect(canAddBuff([{ buffId: 'overdrive', stacks: 1 }], 'overdrive')).toBe(false);
    expect(generateBuffRewards([...cappedOthers, { buffId: 'overdrive', stacks: 1 }], 'battle', 42).choices).toEqual([]);
  });
});
