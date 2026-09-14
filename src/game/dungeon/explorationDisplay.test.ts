import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExplorationPartyPanel } from '../../components/dungeon/ExplorationPartyPanel';
import { getEffectiveCharacter } from '../buffs/buffModifiers';
import { getCharacterVisualState } from '../combat/characterVisualState';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';
import { shouldShowBattleStage, shouldShowExplorationParty } from './explorationDisplay';
import type { DungeonRunState } from '../../types/dungeon';

describe('shared exploration party', () => {
  it('shows all exploration rooms and hides for every combat source and terminal screen', () => {
    const run = createDungeonRun(42, 'display');
    expect(shouldShowExplorationParty(run)).toBe(true);
    for (const currentRoom of ['rest', 'shop', 'treasure', 'event', 'altar'] as const) {
      expect(shouldShowExplorationParty({ ...run, runStatus: 'room', currentRoom })).toBe(true);
    }
    for (const currentRoom of ['battle', 'elite', 'ambush', 'boss', 'treasure'] as const) {
      const battle: DungeonRunState = { ...run, runStatus: 'battle', currentRoom, combatSource: currentRoom === 'treasure' ? 'treasure_trap' : 'room' };
      expect(shouldShowExplorationParty(battle)).toBe(false);
      expect(shouldShowBattleStage(battle)).toBe(true);
    }
    for (const runStatus of ['buff_reward', 'buff_acquired', 'reward'] as const) expect(shouldShowExplorationParty({ ...run, runStatus })).toBe(true);
    for (const runStatus of ['announcement', 'cleared', 'game_over'] as const) expect(shouldShowExplorationParty({ ...run, runStatus })).toBe(false);
    expect(shouldShowExplorationParty(null)).toBe(false);
  });
  it('uses latest effective HP and ignores all battle ability/damage cues in exploration', () => {
    const combat = createDungeonRun(42, 'states').combat;
    for (const member of combat.party) {
      const character = getEffectiveCharacter(combat, member.definitionId);
      for (const [ratio, expected] of [[1, 'normal'], [.3, 'normal'], [.29, 'low_hp'], [0, 'down']] as const) {
        const state = getCharacterVisualState(character, { ...member, currentHp: character.stats.maxHp * ratio, statuses: [`ability:${character.ability.id}`] },
          { sourceEventId: 1, kind: character.ability.visual.kind }, { sourceEventId: 2, hpAfter: 1 }, 'exploration');
        expect(state).toBe(expected);
      }
    }
  });
  it('renders four portraits and HP bars without attack/ability gauges', () => {
    const combat = createDungeonRun(42, 'html').combat;
    const party = combat.party.map((member, i) => ({ ...member, currentHp: i === 1 ? 0 : i === 2 ? 1 : member.currentHp }));
    const html = renderToStaticMarkup(createElement(ExplorationPartyPanel, { combat: { ...combat, party } }));
    expect(html.match(/<img /g)).toHaveLength(4);
    expect(html.match(/role="progressbar"/g)).toHaveLength(4);
    expect(html).toContain('data-visual-state="low_hp"');
    expect(html).toContain('data-visual-state="down"');
    expect(html).not.toContain('ability-state');
    expect(html).not.toContain('KEYS');
  });
  it('updates normal → Low HP immediately after Blood Offering, then normal after recovery', () => {
    const initial = createDungeonRun(42, 'altar-hp');
    const combat = { ...initial.combat, party: initial.combat.party.map((member, i) => ({ ...member, currentHp: i === 1 ? 0 : Math.ceil(getEffectiveCharacter(initial.combat, member.definitionId).stats.maxHp * .35) })) };
    const altar = reduceDungeon({ ...initial, combat, roomOptions: [{ id: 'altar', type: 'altar' }] }, { type: 'choose', optionId: 'altar', now: 0 });
    const paid = reduceDungeon(altar, { type: 'encounter-choice', choiceId: 'blood', now: 1 });
    const states = (run: DungeonRunState) => run.combat.party.map(member => getCharacterVisualState(getEffectiveCharacter(run.combat, member.definitionId), member, null, null, 'exploration'));
    expect(states(altar)).toEqual(['normal', 'down', 'normal', 'normal']);
    expect(states(paid)).toEqual(['low_hp', 'down', 'low_hp', 'low_hp']);
    const healed = { ...paid, combat: { ...paid.combat, party: paid.combat.party.map((member, i) => ({ ...member, currentHp: combat.party[i].currentHp })) } };
    expect(states(healed)).toEqual(['normal', 'down', 'normal', 'normal']);
  });
});
