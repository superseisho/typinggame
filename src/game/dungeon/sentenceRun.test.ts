import { describe, expect, it } from 'vitest';
import type { DungeonRunState } from '../../types/dungeon';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';
import { createCombatState } from '../combat/createCombatState';
import { startCombat } from '../combat/combatEngine';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import { getTypingDisplay } from '../typing/typingEngine';

function battle(run: DungeonRunState) {
  return reduceDungeon({ ...run, roomOptions: [{ id: 'test-battle', type: 'battle' }] }, { type: 'choose', optionId: 'test-battle', now: 1 });
}

describe('Run-local sentence lifecycle', () => {
  it('consumes on display, preserves completed and unfinished draws across real floor transitions', () => {
    const initial = createDungeonRun(42, 'run');
    const fullDeck = initial.combat.sentenceDeck;
    expect(fullDeck.remainingSentenceIds).toHaveLength(200);
    let run = battle(initial);
    expect(run.runStatus).toBe('battle');
    expect(run.combat.typing.sentenceId).toBe(fullDeck.remainingSentenceIds[0]);
    expect(startCombat(run.combat, 2)).toBe(run.combat);
    // Enough HP to complete a sentence without prematurely winning.
    run = { ...run, combat: { ...run.combat, enemies: run.combat.enemies.map(e => ({ ...e, currentHp: 100000 })) } };
    while (run.combat.typing.completedSentences === 0) {
      run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now: 3 });
    }
    expect(run.combat.typing.sentenceId).toBe(fullDeck.remainingSentenceIds[1]);
    expect(run.combat.typing.currentCombo).toBe(run.combat.typing.correctCharacterCount);
    expect(run.combat.typing.completedSentences).toBe(1);
    expect(run.combat.sentenceDeck.remainingSentenceIds).toHaveLength(198);
    // Victory partway through the next sentence must not return it to the bag.
    run = { ...run, combat: { ...run.combat,
      enemies: run.combat.enemies.map(e => ({ ...e, currentHp: 1 })),
      party: run.combat.party.map(p => ({ ...p, attackCharge: 100 })) } };
    run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now: 4 });
    expect(run.runStatus).toBe('buff_reward');
    const afterBattle = run.combat.sentenceDeck;
    run = reduceDungeon(run, { type: 'choose-buff', buffId: run.buffOptions[0] });
    run = reduceDungeon(run, { type: 'finish-buff' });
    expect(run.combat.sentenceDeck).toBe(afterBattle);
    run = battle(run);
    expect(run.combat.typing.sentenceId).toBe(fullDeck.remainingSentenceIds[2]);
    expect(run.combat.sentenceDeck.remainingSentenceIds).toHaveLength(197);
    expect(run.combat.typing.correctCharacterCount).toBe(0);
    expect(createDungeonRun(42, 'new-run').combat.sentenceDeck).toEqual(fullDeck);
    expect(createDungeonRun(43, 'other-run').combat.sentenceDeck).not.toEqual(fullDeck);
  });
  it('does not draw an unseen prompt when the completing character wins combat', () => {
    let state = startCombat(createCombatState(['crypt-slime']), 0);
    state = { ...state, enemies: state.enemies.map(e => ({ ...e, currentHp: 100000 })) };
    while (getTypingDisplay(state.typing).remaining !== '') {
      state = handleCombatTyping(state, getTypingDisplay(state.typing).current, 1);
    }
    const deck = state.sentenceDeck;
    state = { ...state, enemies: state.enemies.map(e => ({ ...e, currentHp: 1 })),
      party: state.party.map(p => ({ ...p, attackCharge: 100 })) };
    state = handleCombatTyping(state, getTypingDisplay(state.typing).current, 2);
    expect(state.status).toBe('victory');
    expect(state.typing.completedSentences).toBe(1);
    expect(state.sentenceDeck).toBe(deck);
  });
  it('does not consume on exploration, announcement, miss, or ignored input', () => {
    let run = createDungeonRun(9, 'run');
    const deck = run.combat.sentenceDeck;
    run = reduceDungeon({ ...run, currentFloor: 9, runStatus: 'reward' }, { type: 'advance' });
    expect(run.runStatus).toBe('announcement');
    expect(run.combat.sentenceDeck).toBe(deck);
    run = reduceDungeon(run, { type: 'enter-battle', now: 1 });
    const active = run.combat.sentenceDeck;
    run = reduceDungeon(run, { type: 'key', key: '!', now: 2 });
    run = reduceDungeon(run, { type: 'key', key: 'Shift', now: 3 });
    expect(run.combat.sentenceDeck).toBe(active);
    expect(run.combat.sentenceDeck.rngState).toBe(deck.rngState);
  });
});
