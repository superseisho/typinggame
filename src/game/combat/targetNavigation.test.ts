import { describe, expect, it, vi } from 'vitest';
import { createCombatState } from './createCombatState';
import { applyCorrectTyping, startCombat } from './combatEngine';
import { ensureValidEnemyTarget, moveEnemyTarget, selectEnemyTarget } from './enemyTarget';
import { consumeTargetNavigationKey } from './combatKeyboard';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { CHARACTERS_BY_ID } from '../../data/characters';
import type { DungeonRunState } from '../../types/dungeon';

const battle = () => startCombat(createCombatState(['crypt-slime', 'crypt-slime', 'grave-shaman']), 1);

describe('left/right target navigation', () => {
  it('moves one step in display order and wraps at both ends', () => {
    let state = battle();
    const ids = state.enemies.map(e => e.instanceId);
    for (const id of [ids[1], ids[2], ids[0]]) {
      state = moveEnemyTarget(state, 'right');
      expect(state.targetEnemyId).toBe(id);
    }
    for (const id of [ids[2], ids[1], ids[0]]) {
      state = moveEnemyTarget(state, 'left');
      expect(state.targetEnemyId).toBe(id);
    }
  });
  it('skips dead enemies, including after automatic retarget', () => {
    const initial = battle();
    const state = { ...selectEnemyTarget(initial, initial.enemies[1].instanceId), enemies: initial.enemies.map((e,i) => i === 1 ? { ...e, currentHp: 0 } : e) };
    const auto = ensureValidEnemyTarget(state);
    const right = moveEnemyTarget(auto, 'right');
    expect(right.targetEnemyId).toBe(state.enemies[2].instanceId);
    expect(moveEnemyTarget(right, 'right').targetEnemyId).toBe(state.enemies[0].instanceId);
    expect(moveEnemyTarget(auto, 'left').targetEnemyId).toBe(state.enemies[2].instanceId);
  });
  it('preserves object identity with one or zero living enemies', () => {
    const one = startCombat(createCombatState(['grave-shaman']), 1);
    const empty = startCombat(createCombatState([]), 1);
    for (const direction of ['left', 'right'] as const) {
      expect(moveEnemyTarget(one, direction)).toBe(one);
      expect(moveEnemyTarget(empty, direction)).toBe(empty);
    }
  });
  it('repairs an invalid target to the first living enemy without skipping it', () => {
    const state = battle();
    expect(moveEnemyTarget({ ...state, targetEnemyId: 'missing' }, 'left').targetEnemyId).toBe(state.enemies[0].instanceId);
    expect(moveEnemyTarget({ ...state, targetEnemyId: null }, 'right').targetEnemyId).toBe(state.enemies[0].instanceId);
  });
  it('shares click selection and follows reordered/summoned enemies', () => {
    const base = battle();
    const clicked = selectEnemyTarget(base, base.enemies[1].instanceId);
    expect(moveEnemyTarget(clicked, 'right').targetEnemyId).toBe(base.enemies[2].instanceId);
    const added = { ...clicked, enemies: [base.enemies[1], base.enemies[0], base.enemies[2], { ...base.enemies[0], instanceId: 'summoned' }] };
    expect(moveEnemyTarget(added, 'left').targetEnemyId).toBe('summoned');
    expect(moveEnemyTarget(added, 'right').targetEnemyId).toBe(base.enemies[0].instanceId);
  });
  it('changes only target ID: typing, combo, abilities, gauges, timers and events are untouched', () => {
    const base = battle();
    const combo = applyCorrectTyping(base, { ...base.typing, currentCombo: 20 }, 2);
    const next = moveEnemyTarget(combo, 'right');
    expect(next).toEqual({ ...combo, targetEnemyId: combo.enemies[1].instanceId });
    expect(next.party.find(p => p.definitionId === 'martial-artist')!.statuses).toContain('ability:flow-combo');
  });
  it.each(['warrior', 'mage', 'cleric', 'martial-artist'] as const)('%s attacks the keyboard-selected enemy', id => {
    const selected = moveEnemyTarget(moveEnemyTarget(battle(), 'right'), 'right');
    const state = { ...selected, party: selected.party.map(p => ({ ...p, attackCharge: p.definitionId === id ? CHARACTERS_BY_ID[id].attackThreshold - 1 : 0 })) };
    const next = applyCorrectTyping(state, state.typing, 2);
    expect(next.events.find(e => e.kind === 'ally-attack')?.targetId).toBe(state.enemies[2].instanceId);
    expect(next.enemies[0]).toEqual(state.enemies[0]);
    expect(next.enemies[1]).toEqual(state.enemies[1]);
  });
  it.each(['ready', 'victory', 'defeat'] as const)('does nothing when combat is %s', status => {
    const state = { ...battle(), status };
    expect(moveEnemyTarget(state, 'right')).toBe(state);
  });
  it.each(['battle', 'elite', 'ambush', 'treasure', 'boss'] as const)('routes navigation through dungeon %s', currentRoom => {
    const run: DungeonRunState = { ...createDungeonRun(42, 'arrows'), runStatus: 'battle', currentRoom, combat: battle(), combatSource: currentRoom === 'treasure' ? 'treasure_trap' : 'room' };
    expect(reduceDungeon(run, { type: 'move-enemy-target', direction: 'right' })).toEqual({ ...run, combat: moveEnemyTarget(run.combat, 'right') });
    for (const runStatus of ['choosing', 'room', 'reward', 'buff_reward', 'cleared', 'game_over', 'announcement'] as const) {
      const inactive = { ...run, runStatus };
      expect(reduceDungeon(inactive, { type: 'move-enemy-target', direction: 'left' })).toBe(inactive);
    }
  });
});

describe('combat input priority', () => {
  it('consumes only left/right during active combat, before typing', () => {
    const move = vi.fn();
    for (const [key, direction] of [['ArrowLeft', 'left'], ['ArrowRight', 'right']]) {
      const event = { key, repeat: false, preventDefault: vi.fn() };
      expect(consumeTargetNavigationKey(event, true, move)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(move).toHaveBeenLastCalledWith(direction);
    }
    expect(move).toHaveBeenCalledTimes(2);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', '1', 'q', 'a']) {
      const event = { key, repeat: false, preventDefault: vi.fn() };
      expect(consumeTargetNavigationKey(event, false, move)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      if (!['ArrowLeft', 'ArrowRight'].includes(key)) expect(consumeTargetNavigationKey(event, true, move)).toBe(false);
    }
    expect(move).toHaveBeenCalledTimes(2);
  });
  it('consumes repeats without moving or falling through to typing', () => {
    const event = { key: 'ArrowRight', repeat: true, preventDefault: vi.fn() };
    const move = vi.fn();
    expect(consumeTargetNavigationKey(event, true, move)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
  });
});
