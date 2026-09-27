import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EncounterRoom } from '../../components/dungeon/EncounterRoom';
import { EVENT_DEFINITIONS } from '../../data/rooms/encounterDefinitions';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { DungeonRunState } from '../../types/dungeon';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';
import { applyEncounterEffects, choiceDisabledReason, enterEncounter } from './encounterEngine';
import { ALTAR_CONFIG, ROOM_WEIGHTS } from './encounterConfig';
import { getEffectiveCharacter } from '../buffs/buffModifiers';

function room(type: 'event' | 'altar', eventId = 'traveler', seed = 42): DungeonRunState {
  const initial = createDungeonRun(seed, 'encounter-test');
  const run = reduceDungeon({ ...initial, roomOptions: [{ id: 'test', type }] }, { type: 'choose', optionId: 'test', now: 1 });
  return type === 'event' ? { ...run, encounter: { ...run.encounter!, definitionId: eventId } } : run;
}
function choose(run: DungeonRunState, choiceId: string) { return reduceDungeon(run, { type: 'encounter-choice', choiceId, now: 1000 }); }
function wounded(run: DungeonRunState) {
  return { ...run, combat: { ...run.combat, party: run.combat.party.map((p, i) => ({ ...p, currentHp: i === 1 ? 0 : 10 })) } };
}
function claim(run: DungeonRunState) {
  const acquired = reduceDungeon(run, { type: 'choose-buff', buffId: run.buffOptions[0] });
  expect(acquired.runStatus).toBe('buff_acquired');
  expect(reduceDungeon(acquired, { type: 'choose-buff', buffId: run.buffOptions[0] })).toBe(acquired);
  const result = reduceDungeon(acquired, { type: 'finish-buff' });
  expect(result.runStatus).toBe('reward');
  expect(result.currentFloor).toBe(run.currentFloor);
  return result;
}

describe('Event / Altar', () => {
  it('has seven room weights totaling 100 and allows Event / Altar in normal choices', () => {
    expect(Object.values(ROOM_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const seen = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) createDungeonRun(seed, 'weights').roomOptions.forEach(option => seen.add(option.type));
    expect(seen.size).toBe(7);
  });
  it('draws five Events deterministically, excludes the previous Event and fixes selection on entry', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const initial = { ...room('event'), rngState: Math.imul(seed, 2654435761) >>> 0 };
      const next = enterEncounter(initial);
      seen.add(next.encounter!.definitionId);
      expect(enterEncounter(initial)).toEqual(next);
      expect(next.encounter!.definitionId).not.toBe(initial.lastEventId);
      expect(reduceDungeon(next, { type: 'choose', optionId: 'test', now: 1 })).toBe(next);
    }
    // The initial previous event is fixed, so the remaining pool has four entries.
    expect(seen.size).toBe(EVENT_DEFINITIONS.length - 1);
    expect(EVENT_DEFINITIONS).toHaveLength(5);
  });
  it('keeps insufficient-gold options visible and disabled, also enforcing requirements in the engine', () => {
    const run = { ...room('event'), gold: 50 };
    expect(choose(run, 'pay')).toBe(run);
    const html = renderToStaticMarkup(createElement(EncounterRoom, { run, onChoose: () => {} }));
    expect(html).toContain('Pay 100 Gold'); expect(html).toContain('disabled=""'); expect(html).toContain('Not enough Gold');
    expect(choiceDisabledReason(wounded(run), { id: 'hp', label: '', description: '', requirements: [{ type: 'hp', ratio: .2 }], effects: [] })).toBe('Not enough HP');
  });
  it('pays the traveler once, pauses for Buff and then CONTINUE, recording exactly one completed room', () => {
    const initial = { ...room('event'), gold: 150 };
    const reward = choose(initial, 'pay');
    expect(reward.gold).toBe(50); expect(reward.buffOptions).toHaveLength(3);
    expect(reward.encounter).toMatchObject({ costPaid: true, selectedChoiceId: 'pay', resolved: false });
    expect(reduceDungeon(reward, { type: 'advance' })).toBe(reward);
    expect(choose(reward, 'pay')).toBe(reward);
    const result = claim(reward);
    expect(result.activeBuffs).toHaveLength(1);
    expect(result.clearedRooms).toHaveLength(1);
    expect(result.clearedRooms[0].roomType).toBe('event');
    expect(result.encounter!.resolved).toBe(true);
    const next = reduceDungeon(result, { type: 'advance' });
    expect(next.currentFloor).toBe(2);
    expect(reduceDungeon(next, { type: 'advance' }, 1)).toBe(next);
    expect(next.encounter).toBeNull();
  });
  it.each([['camp', 'rest'], ['fountain', 'drink']])('heals living members in %s without reviving Down', (id, action) => {
    const initial = wounded(room('event', id));
    const result = choose(initial, action);
    expect(result.combat.party[0].currentHp).toBeGreaterThan(10);
    expect(result.combat.party[1].currentHp).toBe(0);
    expect(choose(result, action)).toBe(result);
    expect(result.runStatus).toBe('reward');
  });
  it.each([['camp', 'search', 60, 120], ['fountain', 'bottle', 50, 100]] as const)('grants %s Gold only once', (id, action, min, max) => {
    const result = choose(room('event', id), action);
    expect(result.gold).toBeGreaterThanOrEqual(min); expect(result.gold).toBeLessThanOrEqual(max);
    expect(result.goldEarned).toBe(result.gold);
    expect(choose(result, action)).toBe(result);
  });
  it('offers free inscription Buff and safely supports refusing every Event', () => {
    expect(choose(room('event', 'inscription'), 'study').runStatus).toBe('buff_reward');
    for (const definition of EVENT_DEFINITIONS) {
      const initial = room('event', definition.id);
      const left = choose(initial, 'leave');
      expect(left.runStatus).toBe('reward'); expect(left.gold).toBe(initial.gold);
      expect(left.combat).toBe(initial.combat);
    }
  });
  it('draws both chest outcomes once, can cause Down and handles party defeat', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const initial = { ...wounded(room('event', 'chest')), rngState: Math.imul(seed, 2654435761) >>> 0 };
      const result = choose(initial, 'open');
      expect(choose(initial, 'open')).toEqual(result);
      outcomes.add(result.gold > 0 ? 'gold' : 'damage');
      if (result.gold > 0) { expect(result.gold).toBeGreaterThanOrEqual(100); expect(result.gold).toBeLessThanOrEqual(180); }
      else {
        expect(result.combat.party[0].currentHp).toBeLessThan(10);
        const fragile = { ...initial, combat: { ...initial.combat, party: initial.combat.party.map(p => ({ ...p, currentHp: 1 })) } };
        const defeated = choose(fragile, 'open');
        expect(defeated.runStatus).toBe('game_over'); expect(defeated.activeBuffs).toEqual([]);
        expect(defeated.clearedRooms[0].result).toBe('failed');
      }
      expect(choose(result, 'open')).toBe(result);
    }
    expect(outcomes.size).toBe(2);
  });
  it('supports targeted heal / damage without changing other characters', () => {
    const initial = wounded(room('event'));
    const targetId = initial.combat.party[0].definitionId;
    const healed = applyEncounterEffects(initial, [{ type: 'heal', ratio: .5, targetId }]).run;
    expect(healed.combat.party[0].currentHp).toBeGreaterThan(10);
    expect(healed.combat.party.slice(1)).toEqual(initial.combat.party.slice(1));
    const damaged = applyEncounterEffects(healed, [{ type: 'damage', ratio: .1, targetId }]).run;
    expect(damaged.combat.party[0].currentHp).toBeLessThan(healed.combat.party[0].currentHp);
    expect(damaged.combat.party.slice(1)).toEqual(initial.combat.party.slice(1));
  });
  it('Blood Offering uses max HP, floors living HP at 1 and never revives', () => {
    const initial = wounded(room('altar'));
    const result = choose(initial, 'blood');
    expect(result.runStatus).toBe('buff_reward');
    for (const member of result.combat.party) expect(member.currentHp).toBe(member.definitionId === result.combat.party[1].definitionId ? 0 : 1);
    expect(choose(result, 'blood')).toBe(result);
    expect(choose(result, 'gold')).toBe(result);
    expect(choose(result, 'leave')).toBe(result);
    const healthy = room('altar');
    const paid = choose(healthy, 'blood');
    expect(paid.combat.party[0].currentHp).toBe(healthy.combat.party[0].currentHp - Math.ceil(getEffectiveCharacter(healthy.combat, healthy.combat.party[0].definitionId).stats.maxHp * ALTAR_CONFIG.bloodDamage));
    expect(claim(result).clearedRooms[0].roomType).toBe('altar');
  });
  it('Gold Offering enforces its price and only charges once', () => {
    const poor = room('altar'); expect(choose(poor, 'gold')).toBe(poor);
    const result = choose({ ...poor, gold: 200 }, 'gold');
    expect(result.gold).toBe(50); expect(choose(result, 'gold')).toBe(result);
  });
  it('Altar rewards only distinct eligible Rare / Epic / Legendary, respecting max stacks and exhaustion', () => {
    for (let seed = 0; seed < 80; seed++) {
      const result = choose(room('altar', '', seed), 'blood');
      expect(new Set(result.buffOptions).size).toBe(3);
      expect(result.buffOptions.every(id => ['rare', 'epic', 'legendary'].includes(BUFFS_BY_ID[id].rarity))).toBe(true);
    }
    const initial = room('altar');
    const maxed = BUFF_DEFINITIONS.map(buff => ({ buffId: buff.id, stacks: buff.stackable ? buff.maxStacks! : 1 }));
    const available = BUFF_DEFINITIONS.find(buff => buff.rarity === 'rare')!;
    const one = choose({ ...initial, activeBuffs: maxed.filter(buff => buff.buffId !== available.id) }, 'blood');
    expect(one.buffOptions).toEqual([available.id]);
    const none = choose({ ...initial, activeBuffs: maxed }, 'blood');
    expect(none.runStatus).toBe('reward'); expect(none.gold).toBeGreaterThan(0);
    expect(none.roomMessage).toContain('取得可能なBuffなし');
  });
  it('leaves Altar without cost or reward and advances once after confirmation', () => {
    const initial = room('altar'); const result = choose(initial, 'leave');
    expect(result.combat).toBe(initial.combat); expect(result.gold).toBe(initial.gold);
    expect(result.buffOptions).toEqual([]);
    const next = reduceDungeon(result, { type: 'advance' }); expect(next.currentFloor).toBe(2);
    expect(reduceDungeon(next, { type: 'advance' }, 1)).toBe(next);
  });
});
