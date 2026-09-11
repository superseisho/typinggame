import { describe, expect, it } from 'vitest';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { ROOM_DEFINITIONS } from '../../data/rooms/roomDefinitions';
import type { DungeonRunState, RoomType } from '../../types/dungeon';
import { getTypingDisplay } from '../typing/typingEngine';
import { DUNGEON_CONFIG } from './dungeonConfig';
import { createDungeonRun, getRunResults, reduceDungeon } from './dungeonEngine';
import { generateRoomOptions } from './roomGenerator';

function offer(type: RoomType, run = createDungeonRun(42, 'test')): DungeonRunState {
  return { ...run, roomOptions: [{ id: 'option', type }], runStatus: 'choosing' };
}
function choose(type: RoomType, run?: DungeonRunState) {
  return reduceDungeon(offer(type, run), { type: 'choose', optionId: 'option', now: 1000 });
}
function withHp(run: DungeonRunState, hp: readonly number[]): DungeonRunState {
  return { ...run, combat: { ...run.combat, party: run.combat.party.map((member, i) => ({ ...member, currentHp: hp[i] })) } };
}
function advance(run: DungeonRunState) { return reduceDungeon(run, { type: 'advance' }); }
function fight(initial: DungeonRunState) {
  let run = initial;
  if (run.runStatus === 'announcement') run = reduceDungeon(run, { type: 'enter-battle', now: 1000 });
  let i = 0;
  while (run.runStatus === 'battle' && i < 5000) {
    const now = 1000 + (++i * 150);
    run = reduceDungeon(run, { type: 'tick', deltaMs: 150, now });
    run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now });
  }
  expect(i).toBeLessThan(5000);
  return run;
}

describe('room generation', () => {
  it('offers three deterministic weighted choices with at most two duplicates', () => {
    const counts = new Set<RoomType>();
    for (let seed = 0; seed < 200; seed++) {
      const generated = generateRoomOptions(seed, 1);
      expect(generateRoomOptions(seed, 1)).toEqual(generated);
      expect(generated.options).toHaveLength(3);
      expect(new Set(generated.options.map((o) => o.id)).size).toBe(3);
      for (const room of generated.options) { counts.add(room.type); expect(generated.options.filter((o) => o.type === room.type).length).toBeLessThanOrEqual(2); }
    }
    expect(counts.size).toBe(5);
    expect(ROOM_DEFINITIONS.map((r) => r.name)).toEqual(['Battle', 'Elite Battle', 'Rest', 'Shop', 'Treasure']);
  });
  it('always offers a choice on the first safe floor', () => {
    for (let seed = 0; seed < 50; seed++) expect(createDungeonRun(seed, 'test').runStatus).toBe('choosing');
  });
});

describe('floor and combat lifecycle', () => {
  it('does not advance on selection, reject stale/duplicate commands, awards victory only once', () => {
    const initial = offer('battle');
    const action = { type: 'choose', optionId: 'option', now: 1000 } as const;
    const battle = reduceDungeon(initial, action);
    expect(battle.currentFloor).toBe(1);
    expect(reduceDungeon(battle, action)).toBe(battle);
    expect(reduceDungeon(initial, action, 2)).toBe(initial);
    expect(reduceDungeon(initial, action, 1, 'old-run')).toBe(initial);
    expect(advance(battle)).toBe(battle);
    const won = fight(battle);
    expect(won.runStatus).toBe('buff_reward');
    expect(won.gold).toBeGreaterThanOrEqual(DUNGEON_CONFIG.rewards.battle[0]);
    expect(won.clearedRooms).toHaveLength(1);
    expect(reduceDungeon(won, { type: 'tick', deltaMs: 50, now: 10000 })).toBe(won);
    expect(advance(won)).toBe(won);
    const picked = reduceDungeon(won, { type: 'choose-buff', buffId: won.buffOptions[0] });
    const next = reduceDungeon(picked, { type: 'finish-buff' });
    expect(next.currentFloor).toBe(2);
    expect(advance(next)).toBe(next);
    expect(reduceDungeon(next, { type: 'advance' }, 1)).toBe(next);
    expect(next.combat.party.map((p) => p.currentHp)).toEqual(picked.combat.party.map((p) => p.currentHp));
  });
  it('keeps Down into the next combat and resets only battle-local gauges/statuses', () => {
    let run = withHp(createDungeonRun(0, 'test'), [60, 0, 75, 80]);
    run = reduceDungeon(choose('rest', run), { type: 'rest', action: 'party' });
    run = advance(run);
    const hp = run.combat.party.map((p) => p.currentHp);
    run = choose('battle', run);
    expect(run.combat.party.map((p) => p.currentHp)).toEqual(hp);
    expect(run.combat.party[1].currentHp).toBe(0);
    expect(run.combat.party.every((p) => p.attackCharge === 0 && p.statuses.length === 0)).toBe(true);
  });
  it('plays all ten floors with existing typing/combat rules and ends at the boss', () => {
    let run = createDungeonRun(18, 'full-run');
    for (let floor = 1; floor <= 10; floor++) {
      expect(run.currentFloor).toBe(floor);
      if (run.runStatus === 'choosing') {
        run = choose(floor % 3 === 0 ? 'rest' : 'battle', run);
        if (run.currentRoom === 'rest') run = reduceDungeon(run, { type: 'rest', action: 'party' });
      }
      if (run.runStatus === 'battle' || run.runStatus === 'announcement') run = fight(run);
      if (floor < 10) {
        if (run.runStatus === 'buff_reward') {
          run = reduceDungeon(run, { type: 'choose-buff', buffId: run.buffOptions[0] });
          run = reduceDungeon(run, { type: 'finish-buff' });
        } else { expect(run.runStatus).toBe('reward'); run = advance(run); }
      }
    }
    expect(run.runStatus).toBe('cleared');
    expect(run.activeBuffs).toEqual([]);
    expect(run.combat.runBuffs).toEqual([]);
    expect(run.buffOptions).toEqual([]);
    expect(run.currentRoom).toBe('boss');
    expect(run.clearedRooms).toHaveLength(10);
    expect(run.statistics.enemiesDefeated).toBeGreaterThan(5);
    expect(run.statistics.correctCharacters).toBeGreaterThan(500);
    expect(getRunResults(run).accuracy).toBe(100);
    expect(getRunResults(run).wpm).toBeGreaterThan(0);
    expect(advance(run)).toBe(run);
  });
  it('game over stops all progression and includes the failed room', () => {
    let run = withHp(choose('battle'), [1, 0, 0, 0]);
    for (let i = 0; i < 40 && run.runStatus === 'battle'; i++) run = reduceDungeon(run, { type: 'tick', deltaMs: 250, now: 2000 + i * 250 });
    expect(run.runStatus).toBe('game_over');
    expect(run.currentFloor).toBe(1);
    expect(run.clearedRooms[0].result).toBe('failed');
    expect(run.gold).toBe(0);
    expect(advance(run)).toBe(run);
  });
  it('only fixed room variants change enemy stats, not floors 1–9', () => {
    const floor1 = choose('battle', { ...createDungeonRun(4, 'test'), rngState: 999 });
    const floor9 = choose('battle', { ...createDungeonRun(4, 'test'), rngState: 999, currentFloor: 9 });
    expect(floor1.combat.enemies).toEqual(floor9.combat.enemies);
    const elite = choose('elite');
    expect(ENEMIES_BY_ID[elite.combat.enemies[0].definitionId].elite).toBe(true);
    expect(ENEMIES_BY_ID['elite-slime'].maxHp).toBeGreaterThan(ENEMIES_BY_ID['crypt-slime'].maxHp);
    expect(ENEMIES_BY_ID['crypt-warden'].boss).toBe(true);
    expect(ENEMIES_BY_ID['crypt-warden'].maxHp).toBeGreaterThan(ENEMIES_BY_ID['elite-slime'].maxHp);
  });
  it('can ambush on normal floors but never draws ambush before a boss', () => {
    const reward = reduceDungeon(choose('rest'), { type: 'rest', action: 'party' });
    const outcomes = new Set<string | null>();
    for (let seed = 0; seed < 1000; seed++) {
      const rngState = Math.imul(seed, 214013) >>> 0;
      outcomes.add(advance({ ...reward, rngState }).currentRoom);
      const boss = advance({ ...reward, currentFloor: 9, rngState });
      expect(boss.currentRoom).toBe('boss');
      expect(boss.runStatus).toBe('announcement');
      expect(boss.roomOptions).toEqual([]);
    }
    expect(outcomes.has('ambush')).toBe(true);
    expect(outcomes.has(null)).toBe(true);
  });
});

describe('rest, shop and treasure', () => {
  it('party recovery excludes fallen allies, caps at max HP, emits actual heals once', () => {
    const room = withHp(choose('rest'), [170, 0, 50, 130]);
    const action = { type: 'rest', action: 'party' } as const;
    const healed = reduceDungeon(room, action);
    expect(healed.combat.party[0].currentHp).toBe(180);
    expect(healed.combat.party[1].currentHp).toBe(0);
    expect(healed.combat.party[2].currentHp).toBe(88);
    expect(healed.combat.events.filter((e) => e.kind === 'ally-heal').find((e) => e.targetId === 'warrior')?.amount).toBe(10);
    expect(reduceDungeon(healed, action)).toBe(healed);
    expect(healed.currentFloor).toBe(1);
  });
  it('focused recovery only heals the selected living target', () => {
    const room = withHp(choose('rest'), [50, 0, 40, 50]);
    const healed = reduceDungeon(room, { type: 'rest', action: 'focused', targetId: 'cleric' });
    expect(healed.combat.party.map((p) => p.currentHp)).toEqual([50, 0, 115, 50]);
    expect(reduceDungeon(room, { type: 'rest', action: 'focused', targetId: 'mage' })).toBe(room);
    expect(reduceDungeon(room, { type: 'rest', action: 'focused' })).toBe(room);
  });
  it('revives only fallen allies; unavailable revive is also rejected by the engine', () => {
    const living = choose('rest');
    expect(reduceDungeon(living, { type: 'rest', action: 'revive', targetId: 'mage' })).toBe(living);
    const room = withHp(living, [50, 0, 40, 0]);
    const revived = reduceDungeon(room, { type: 'rest', action: 'revive', targetId: 'mage' });
    expect(revived.combat.party.map((p) => p.currentHp)).toEqual([50, 28, 40, 0]);
    const next = choose('battle', advance(revived));
    expect(next.combat.party[1].currentHp).toBe(28);
    expect(next.combat.party[3].currentHp).toBe(0);
  });
  // Shop stock and the five Treasure outcomes are covered in shopTreasure.test.ts.
  it('calculates aggregate accuracy and WPM weighted by combat time, not room time', () => {
    const run = createDungeonRun(0, 'test');
    const results = getRunResults({ ...run, statistics: { ...run.statistics, correctCharacters: 200, misses: 50, combatMs: 60000 } });
    expect(results.accuracy).toBe(80);
    expect(results.wpm).toBe(40);
    expect(CHARACTERS_BY_ID.warrior.stats.maxHp).toBe(180);
  });
});
