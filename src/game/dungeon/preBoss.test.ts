import { describe, expect, it } from 'vitest';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';
import { isPreBossFloor } from './floorRules';
import { generateRoomOptions } from './roomGenerator';
import type { DungeonRunState } from '../../types/dungeon';

function arrive(floor: number, seed = 42): DungeonRunState {
  return reduceDungeon({ ...createDungeonRun(seed, 'pre-boss'), currentFloor: floor - 1, rngState: seed, runStatus: 'reward' }, { type: 'advance' });
}
function prepare(type: 'rest' | 'shop') {
  const run = arrive(9);
  return reduceDungeon({ ...run, gold: 1000, combat: { ...run.combat, party: run.combat.party.map((member, i) => ({ ...member, currentHp: i === 1 ? 0 : 20 })) } },
    { type: 'choose', optionId: run.roomOptions.find(option => option.type === type)!.id, now: 1000 });
}
function expectBoss(run: DungeonRunState) {
  expect(run.currentFloor).toBe(10);
  expect(run.currentRoom).toBe('boss');
  expect(run.runStatus).toBe('announcement');
  expect(run.roomOptions).toEqual([]);
  const battle = reduceDungeon(run, { type: 'enter-battle', now: 2000 });
  expect(battle.currentFloor).toBe(10);
  expect(battle.runStatus).toBe('battle');
  expect(reduceDungeon(battle, { type: 'enter-battle', now: 2000 })).toBe(battle);
  expect(reduceDungeon(battle, { type: 'advance' }, 9)).toBe(battle);
}

describe('safe boss preparation', () => {
  it('uses the next floor and supports future boss schedules', () => {
    for (const floor of [9, 19, 29]) expect(isPreBossFloor(floor, [10, 20, 30])).toBe(true);
    for (const floor of [1, 8, 10, 18, 20, 30]) expect(isPreBossFloor(floor, [10, 20, 30])).toBe(false);
  });
  it('preserves normal three-choice generation on floors 1–8', () => {
    for (let floor = 1; floor <= 8; floor++) {
      expect(generateRoomOptions(42, floor).options).toHaveLength(3);
      const run = floor === 1 ? createDungeonRun(42, 'normal') : arrive(floor);
      expect(run.runStatus).toBe('choosing');
      expect(run.roomOptions).toHaveLength(3);
    }
  });
  it('always offers Rest / Shop on 9F without consuming any RNG, even ambush seeds', () => {
    for (let seed = 0; seed < 3000; seed++) {
      const run = arrive(9, seed);
      expect(run.runStatus).toBe('choosing');
      expect(run.roomOptions.map(option => option.type)).toEqual(['rest', 'shop']);
      expect(new Set(run.roomOptions.map(option => option.id)).size).toBe(2);
      expect(run.rngState).toBe(seed);
    }
  });
  it.each(['party', 'focused', 'revive'] as const)('finishes Rest %s then enters 10F once, preserving resulting HP', action => {
    const rest = prepare('rest');
    const targetId = rest.combat.party[action === 'revive' ? 1 : 0].definitionId;
    const completed = reduceDungeon(rest, { type: 'rest', action, targetId });
    expect(completed.runStatus).toBe('reward');
    expect(completed.currentFloor).toBe(9);
    expect(reduceDungeon(completed, { type: 'rest', action, targetId })).toBe(completed);
    const boss = reduceDungeon(completed, { type: 'advance' });
    expectBoss(boss);
    expect(boss.combat.party.map(p => p.currentHp)).toEqual(completed.combat.party.map(p => p.currentHp));
    expect(boss.clearedRooms.filter(room => room.floor === 9)).toHaveLength(1);
    expect(reduceDungeon(boss, { type: 'advance' })).toBe(boss);
  });
  it('keeps shopping after purchase and advances only on Leave Shop', () => {
    const shop = prepare('shop');
    const product = shop.shop!.items.find(item => item.type === 'buff')!;
    expect(product).toBeDefined();
    const purchased = reduceDungeon(shop, { type: 'purchase', productId: product.id });
    expect(purchased.gold).toBe(shop.gold - product.price);
    expect(purchased.currentFloor).toBe(9);
    expect(purchased.runStatus).toBe('room');
    expect(purchased.activeBuffs).toHaveLength(1);
    const boss = reduceDungeon(purchased, { type: 'leave-shop' });
    expectBoss(boss);
    expect(boss.activeBuffs).toEqual(purchased.activeBuffs);
    expect(boss.combat.party[1].currentHp).toBe(0);
    expect(reduceDungeon(boss, { type: 'leave-shop' })).toBe(boss);
    expectBoss(reduceDungeon(shop, { type: 'leave-shop' }));
  });
  it('enters Boss directly with no room selection', () => expectBoss(arrive(10)));
});
