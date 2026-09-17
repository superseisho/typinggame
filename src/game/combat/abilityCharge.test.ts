import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartyPanel } from '../../components/PartyPanel';
import type { CombatState } from '../../types/game';
import { createCombatState } from './createCombatState';
import { startCombat, applyCorrectTyping } from './combatEngine';
import { handleCombatTyping } from './handleCombatTyping';
import { createTypingEngineState } from '../typing/typingEngine';
import { applyRunBuffs } from '../buffs/runBuffManager';
import { getEffectiveCharacter } from '../buffs/buffModifiers';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';

function battle(mage = 0, cleric = 0): CombatState {
  const state = startCombat(createCombatState(['crypt-warden']));
  return { ...state, typing: createTypingEngineState({ id: 'charge', text: 'を', reading: 'を', difficulty: 1 }),
    enemies: state.enemies.map(e => ({ ...e, currentHp: 50000 })),
    party: state.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'mage' ? mage : p.definitionId === 'cleric' ? cleric : 0 })) };
}
const correct = (s: CombatState) => applyCorrectTyping(s, { ...s.typing, currentCombo: s.typing.currentCombo + 1, correctCharacterCount: s.typing.correctCharacterCount + 1 });
const miss = (s: CombatState) => handleCombatTyping(s, 'o'); // invalid at を, full miss-event path
const charge = (s: CombatState, id: string) => s.party.find(p => p.definitionId === id)!.abilityCharge;

describe('accumulated character ability charge', () => {
  it('clears battle-local charge on floor transition while preserving HP and Run Buffs', () => {
    const combat = applyRunBuffs(battle(20,35), [{ buffId: 'mana-surge', stacks: 1 }]);
    const run = { ...createDungeonRun(42,'charge-reset'), runStatus: 'reward' as const, combat,
      activeBuffs: combat.runBuffs, currentRoom: 'battle' as const };
    const next = reduceDungeon(run, { type: 'advance' });
    expect(next.combat.party.every(p => p.abilityCharge === 0)).toBe(true);
    expect(next.combat.party.map(p => p.currentHp)).toEqual(combat.party.map(p => p.currentHp));
    expect(next.combat.runBuffs).toEqual(combat.runBuffs);
  });
  it.each([['mage',29,'arcane-burst'],['cleric',49,'heal']] as const)('%s preserves progress on miss and triggers exactly once on the next correct character', (id, value, ability) => {
    const base = battle(id === 'mage' ? value : 0, id === 'cleric' ? value : 0);
    const state = { ...base, party: base.party.map(p => p.definitionId === 'warrior' ? { ...p, currentHp: 30 } : p) };
    const missed = miss(state);
    expect(charge(missed,id)).toBe(value);
    expect(missed.typing.missCount).toBe(1);
    expect(missed.enemies[0].specialGauge).toBe(25);
    const fired = correct(missed);
    expect(charge(fired,id)).toBe(0);
    expect(fired.events.filter(e => e.kind === 'ally-ability-triggered' && e.abilityId === ability)).toHaveLength(1);
    expect(fired.events.some(e => e.kind === (id === 'mage' ? 'ally-ability-damage' : 'ally-heal'))).toBe(true);
    expect(charge(correct(fired),id)).toBe(1);
  });
  it('accumulates across repeated misses, consumes over-threshold charge safely, and does not advance Down allies', () => {
    let state = battle();
    for (let i = 0; i < 29; i++) state = correct(miss(state));
    expect(charge(state,'mage')).toBe(29);
    expect(charge(correct(state),'mage')).toBe(0);
    expect(charge(correct(battle(100)),'mage')).toBe(0);
    const down = battle(20,35);
    const stopped = correct({ ...down, party: down.party.map(p => ({ ...p, currentHp: 0 })) });
    expect(stopped.party.map(p => p.abilityCharge)).toEqual(down.party.map(p => p.abilityCharge));
    expect(createCombatState().party.every(p => p.abilityCharge === 0)).toBe(true);
  });
  it('PartyPanel preserves Mage/Cleric gauge values while Fighter resets and Knight Guard persists', () => {
    const base = battle(20,35);
    const state = { ...base, typing: { ...base.typing, currentCombo: 40, completedSentences: 2 },
      party: base.party.map(p => ({ ...p, statuses: p.definitionId === 'warrior' ? ['ability:guard'] : p.definitionId === 'martial-artist' ? ['ability:flow-combo'] : [] })) };
    const missed = miss(state);
    for (const combat of [state,missed]) {
      const html = renderToStaticMarkup(createElement(PartyPanel,{ combat }));
      expect(html).toContain('20 / 30');
      expect(html).toContain('35 / 50');
      expect(html).toContain('2 / 3');
    }
    expect(missed.typing.currentCombo).toBe(0);
    expect(missed.party[3].statuses).not.toContain('ability:flow-combo');
    expect(missed.party[0].statuses).toContain('ability:guard');
    expect(renderToStaticMarkup(createElement(PartyPanel,{ combat: missed }))).toContain('×1.0');
  });
  it('Mana Surge fires at 24 accumulated correct characters despite misses', () => {
    let state = applyRunBuffs(battle(), [{ buffId: 'mana-surge', stacks: 1 }]);
    expect(getEffectiveCharacter(state,'mage').ability.trigger).toEqual({ type: 'correct-characters', threshold: 24 });
    for (let i = 0; i < 23; i++) state = correct(state);
    state = miss(state);
    expect(charge(state,'mage')).toBe(23);
    expect(renderToStaticMarkup(createElement(PartyPanel,{ combat: state }))).toContain('23 / 24');
    expect(charge(correct(state),'mage')).toBe(0);
  });
  it('Flow and Perfect Rhythm still require a fresh unbroken streak after a miss', () => {
    let state = applyRunBuffs(battle(), [{ buffId: 'flow', stacks: 1 }, { buffId: 'perfect-rhythm', stacks: 1 }]);
    for (let i = 0; i < 49; i++) state = correct(state);
    state = correct(miss(state));
    expect(state.typing.currentCombo).toBe(1);
    expect(state.events.some(e => e.abilityId === 'flow' || e.abilityId === 'perfect-rhythm')).toBe(false);
    for (let i = 1; i < 50; i++) state = correct(state);
    expect(state.events.some(e => e.abilityId === 'flow')).toBe(true);
    expect(state.events.some(e => e.abilityId === 'perfect-rhythm')).toBe(true);
  });
});
