import { describe, expect, it } from 'vitest';
import { CHARACTERS_BY_ID } from '../../data/characters';
import type { CombatState } from '../../types/game';
import type { DungeonRunState } from '../../types/dungeon';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { createCombatState } from './createCombatState';
import { applyCorrectTyping, startCombat, tickCombat } from './combatEngine';
import { ensureValidEnemyTarget, resolveCurrentEnemyTarget, selectEnemyTarget } from './enemyTarget';

const battle = () => startCombat(createCombatState(['crypt-slime', 'crypt-slime', 'grave-shaman']), 1);

describe('shared enemy target', () => {
  it('initializes the first living enemy, including single-enemy and empty encounters', () => {
    const state = battle();
    expect(state.targetEnemyId).toBe(state.enemies[0].instanceId);
    const single = startCombat(createCombatState(['grave-shaman']), 1);
    expect(single.targetEnemyId).toBe(single.enemies[0].instanceId);
    expect(createCombatState([]).targetEnemyId).toBeNull();
    const ready = createCombatState(['crypt-slime', 'grave-shaman']);
    expect(startCombat({ ...ready, enemies: ready.enemies.map((e, i) => i ? e : { ...e, currentHp: 0 }) }).targetEnemyId).toBe(ready.enemies[1].instanceId);
  });

  it('selection changes only the target, not timers, typing, gauges, buffs or events', () => {
    const state = battle();
    const next = selectEnemyTarget(state, state.enemies[1].instanceId);
    expect(next).toEqual({ ...state, targetEnemyId: state.enemies[1].instanceId });
    expect(selectEnemyTarget(next, next.targetEnemyId!)).toBe(next);
    expect(selectEnemyTarget(next, 'missing')).toBe(next);
    const dead = { ...next, enemies: next.enemies.map((e, i) => i === 2 ? { ...e, currentHp: 0 } : e) };
    expect(selectEnemyTarget(dead, dead.enemies[2].instanceId)).toBe(dead);
    expect(selectEnemyTarget({ ...state, status: 'victory' }, state.enemies[1].instanceId).targetEnemyId).toBe(state.targetEnemyId);
  });

  it.each(['warrior', 'mage', 'cleric', 'martial-artist'] as const)('%s normal attack hits only the selected enemy', id => {
    const selected = selectEnemyTarget(battle(), battle().enemies[1].instanceId);
    const state = { ...selected, party: selected.party.map(p => ({ ...p, attackCharge: p.definitionId === id ? CHARACTERS_BY_ID[id].attackThreshold - 1 : 0 })) };
    const next = applyCorrectTyping(state, state.typing, 2);
    expect(next.enemies[1].currentHp).toBeLessThan(state.enemies[1].currentHp);
    expect(next.enemies[0]).toEqual(state.enemies[0]);
    expect(next.enemies[2]).toEqual(state.enemies[2]);
    expect(next.events.find(e => e.kind === 'ally-attack')).toMatchObject({ actorId: id, targetId: selected.targetEnemyId });
  });

  it('retargets between attacks in the same input, then clears on victory', () => {
    const selected = selectEnemyTarget(battle(), battle().enemies[1].instanceId);
    const state = { ...selected, enemies: selected.enemies.map(e => ({ ...e, currentHp: 1 })),
      party: selected.party.map(p => ({ ...p, attackCharge: CHARACTERS_BY_ID[p.definitionId].attackThreshold - 1 })) };
    const next = applyCorrectTyping(state, state.typing, 2);
    expect(next.events.filter(e => e.kind === 'ally-attack').map(e => e.targetId)).toEqual([state.enemies[1].instanceId, state.enemies[0].instanceId, state.enemies[2].instanceId]);
    expect(next.targetEnemyId).toBeNull();
    expect(next.status).toBe('victory');
  });

  it('a single kill immediately retargets without waiting for another attack', () => {
    const selected = selectEnemyTarget(battle(), battle().enemies[1].instanceId);
    const state = { ...selected, enemies: selected.enemies.map((e, i) => i === 1 ? { ...e, currentHp: 1 } : e),
      party: selected.party.map(p => ({ ...p, attackCharge: p.definitionId === 'mage' ? 29 : 0 })) };
    const next = applyCorrectTyping(state, state.typing, 2);
    expect(next.targetEnemyId).toBe(state.enemies[0].instanceId);
  });

  it('Mage AoE remains independent of the selected target', () => {
    const base = battle();
    const state = selectEnemyTarget({ ...base, party: base.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'mage' ? 29 : 0 })) }, base.enemies[1].instanceId);
    const next = applyCorrectTyping(state, { ...state.typing, currentCombo: 30 }, 2);
    for (let i = 0; i < 3; i++) expect(next.enemies[i].currentHp).toBeLessThan(state.enemies[i].currentHp);
    expect(next.targetEnemyId).toBe(state.targetEnemyId);
  });

  it('retargets when AoE kills the selected enemy without a normal attack', () => {
    const selected = selectEnemyTarget(battle(), battle().enemies[1].instanceId);
    const state = { ...selected, party: selected.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'mage' ? 29 : 0 })),
      enemies: selected.enemies.map((e, i) => i === 1 ? { ...e, currentHp: 1 } : e) };
    const next = applyCorrectTyping(state, { ...state.typing, currentCombo: 30 }, 2);
    expect(next.targetEnemyId).toBe(state.enemies[0].instanceId);
    expect(next.events.filter(e => e.kind === 'ally-attack')).toHaveLength(0);
  });

  it('Heal, Guard and enemy attacks are independent of enemy selection', () => {
    const base = battle();
    const injured = { ...base, party: base.party.map(p => ({ ...p, currentHp: p.currentHp - 40, abilityCharge: p.definitionId === 'cleric' ? 49 : p.definitionId === 'warrior' ? 2 : 0 })) };
    const selected = selectEnemyTarget(injured, injured.enemies[1].instanceId);
    const typing = { ...base.typing, currentCombo: 50, completedSentences: 3 };
    const a = applyCorrectTyping(injured, typing, 2);
    const b = applyCorrectTyping(selected, typing, 2);
    expect(a.party).toEqual(b.party);
    expect(b.events.some(e => e.kind === 'ally-heal')).toBe(true);
    expect(b.party[0].statuses).toContain('ability:guard');
    expect(tickCombat(a, 10000, 3).party).toEqual(tickCombat(b, 10000, 3).party);
  });

  it.each(['battle', 'elite', 'ambush', 'boss', 'treasure'] as const)('dungeon %s uses the shared target action without changing room/timers', currentRoom => {
    const run: DungeonRunState = { ...createDungeonRun(42, 'target'), runStatus: 'battle', currentRoom,
      combatSource: currentRoom === 'treasure' ? 'treasure_trap' : 'room', combat: battle() };
    const enemyId = run.combat.enemies[1].instanceId;
    expect(reduceDungeon(run, { type: 'select-enemy-target', enemyId })).toEqual({ ...run, combat: { ...run.combat, targetEnemyId: enemyId } });
    const ended: DungeonRunState = { ...run, runStatus: 'reward' };
    expect(reduceDungeon(ended, { type: 'select-enemy-target', enemyId })).toBe(ended);
  });

  it('keeps a living target through reorder/summon; repairs missing targets', () => {
    const state = selectEnemyTarget(battle(), battle().enemies[1].instanceId);
    const enemies = [...state.enemies].reverse();
    enemies.push({ ...enemies[0], instanceId: 'summoned' });
    expect(ensureValidEnemyTarget({ ...state, enemies }).targetEnemyId).toBe(state.targetEnemyId);
    expect(resolveCurrentEnemyTarget({ ...state, enemies })?.instanceId).toBe(state.targetEnemyId);
    expect(tickCombat({ ...state, enemies, targetEnemyId: null }, 1, 2).targetEnemyId).toBe(enemies[0].instanceId);
    expect(ensureValidEnemyTarget({ ...state, enemies: [] }).targetEnemyId).toBeNull();
  });

  it('clears on defeat and does not carry the last selection into a new battle', () => {
    const state = selectEnemyTarget(battle(), battle().enemies[1].instanceId);
    const doomed = { ...state, party: state.party.map(p => ({ ...p, currentHp: 1 })), enemies: state.enemies.map(e => ({ ...e, actionRemainingMs: 0 })) };
    let next: CombatState = doomed;
    for (let i = 0; i < 5; i++) next = tickCombat(next, 10000, i + 2);
    expect(next.status).toBe('defeat');
    expect(next.targetEnemyId).toBeNull();
    expect(battle().targetEnemyId).toBe(state.enemies[0].instanceId);
  });
});
