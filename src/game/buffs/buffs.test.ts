import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { PartyPanel } from '../../components/PartyPanel';
import { BuffReward } from '../../components/dungeon/BuffReward';
import { createCombatState } from '../combat/createCombatState';
import { applyCorrectTyping, applyTypingMiss, startCombat, tickCombat } from '../combat/combatEngine';
import { executeEnemyAbility } from '../combat/enemyAbilityEngine';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { recoverParty, recoveryTargets } from '../dungeon/roomResolver';
import type { CombatState } from '../../types/game';
import type { RunBuff } from '../../types/buffs';
import { addBuff, applyRunBuffs, canAddBuff, removeBuff } from './runBuffManager';
import { generateBuffRewards } from './buffRewards';
import { getBuffModifier, getComboMultiplier, getEffectiveCharacter } from './buffModifiers';
import { consumeDamageShield, handleBuffTrigger } from './buffEffectHandlers';
import { BUFF_CONFIG } from './buffConfig';
import { describeBuffTotals } from './buffDescriptions';
import { getTypingDisplay } from '../typing/typingEngine';

function combat(...buffIds: string[]) {
  const initial = startCombat(createCombatState(['crypt-warden']), 0);
  return applyRunBuffs(initial, buffIds.reduce<readonly RunBuff[]>((owned, id) => addBuff(owned, id), []));
}
function correct(state: CombatState, combo: number) {
  return applyCorrectTyping(state, { ...state.typing, correctCharacterCount: state.typing.correctCharacterCount + 1, currentCombo: combo }, 100);
}
function miss(state: CombatState) {
  return applyTypingMiss(state, { ...state.typing, missCount: state.typing.missCount + 1, currentCombo: 0 });
}
function victory(room: 'battle' | 'elite' | 'ambush' | 'boss' = 'battle', floor = 1, buffs: readonly RunBuff[] = []) {
  const run = createDungeonRun(18, 'reward-test');
  const ready = applyRunBuffs(startCombat(createCombatState(['crypt-slime']), 0), buffs);
  return reduceDungeon({ ...run, currentFloor: floor, currentRoom: room, runStatus: 'battle', activeBuffs: buffs,
    combat: { ...ready, enemies: ready.enemies.map(enemy => ({ ...enemy, currentHp: 1 })), party: ready.party.map(member => ({ ...member, attackCharge: 100 })) } },
  { type: 'key', key: getTypingDisplay(ready.typing).current, now: 100 });
}

describe('run buff inventory and rewards', () => {
  it('has 34 unique valid definitions and all five rarity pools', () => {
    expect(BUFF_DEFINITIONS).toHaveLength(34);
    expect(new Set(BUFF_DEFINITIONS.map(buff => buff.id)).size).toBe(34);
    expect(new Set(BUFF_DEFINITIONS.map(buff => buff.rarity)).size).toBe(5);
  });
  it('adds additively, enforces unique and max stacks, removes via a common API', () => {
    let buffs: readonly RunBuff[] = [];
    for (let i = 0; i < 5; i++) buffs = addBuff(buffs, 'power-rune');
    expect(buffs).toEqual([{ buffId: 'power-rune', stacks: 3 }]);
    expect(getBuffModifier(buffs, 'attack', 'warrior')).toBeCloseTo(.15);
    buffs = addBuff(buffs, 'guardian-oath');
    expect(addBuff(buffs, 'guardian-oath')).toBe(buffs);
    expect(addBuff(buffs, 'bad-id')).toBe(buffs);
    expect(canAddBuff(buffs, 'power-rune')).toBe(false);
    expect(removeBuff(buffs, 'power-rune')).toEqual([{ buffId: 'guardian-oath', stacks: 1 }]);
  });
  it('draws distinct eligible candidates deterministically; no capped or unique duplicates', () => {
    const owned = [{ buffId: 'power-rune', stacks: 3 }, { buffId: 'guardian-oath', stacks: 1 }];
    for (let seed = 0; seed < 200; seed++) {
      const reward = generateBuffRewards(owned, 'battle', seed);
      expect(generateBuffRewards(owned, 'battle', seed)).toEqual(reward);
      expect(new Set(reward.choices).size).toBe(3);
      expect(reward.choices).not.toContain('power-rune');
      expect(reward.choices).not.toContain('guardian-oath');
    }
  });
  it('matches configured first-card rarity rates and boosts elite rare/epic rates', () => {
    const counts = { battle: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }, elite: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 } };
    for (let i = 0; i < 10000; i++) for (const room of ['battle', 'elite'] as const) {
      const reward = generateBuffRewards([], room, Math.imul(i + 1, 2654435761) >>> 0);
      counts[room][BUFFS_BY_ID[reward.choices[0]].rarity]++;
    }
    for (const room of ['battle', 'elite'] as const) for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) {
      expect(Math.abs(counts[room][rarity] / 100 - BUFF_CONFIG.rarityWeights[room][rarity])).toBeLessThan(2);
    }
    expect(counts.elite.rare).toBeGreaterThan(counts.battle.rare);
    expect(counts.elite.epic).toBeGreaterThan(counts.battle.epic);
  });
  it('handles depleted pools, including gold fallback', () => {
    const capped = BUFF_DEFINITIONS.map(buff => ({ buffId: buff.id, stacks: buff.maxStacks }));
    expect(generateBuffRewards(capped, 'battle', 1).choices).toEqual([]);
    expect(generateBuffRewards(capped.slice(2), 'battle', 1).choices).toHaveLength(2);
    const won = victory('battle', 1, capped);
    expect(won.runStatus).toBe('reward');
    expect(won.roomMessage).toContain('取得可能なBuffなし');
    expect(won.gold).toBeGreaterThanOrEqual(45 + BUFF_CONFIG.fallbackGold);
    expect(won.clearedRooms[0].goldReward).toBe(won.goldEarned);
  });
  it('displays additive stack totals and keeps intermediate bosses eligible', () => {
    expect(describeBuffTotals(BUFFS_BY_ID['power-rune'], 2)).toBe('Attack +10%');
    expect(describeBuffTotals(BUFFS_BY_ID['flow'], 3)).toContain('+15文字');
    expect(victory('boss', 5).runStatus).toBe('buff_reward');
  });
  it.each(['battle', 'elite', 'ambush'] as const)('%s requires one choice, credits gold once and rejects stale/duplicate clicks', room => {
    const won = victory(room);
    expect(won.runStatus).toBe('buff_reward');
    expect(won.buffOptions).toHaveLength(3);
    expect(won.gold).toBeGreaterThan(0);
    expect(reduceDungeon(won, { type: 'advance' })).toBe(won);
    expect(reduceDungeon(won, { type: 'choose-buff', buffId: 'unknown' })).toBe(won);
    const action = { type: 'choose-buff', buffId: won.buffOptions[0] } as const;
    const selected = reduceDungeon(won, action);
    expect(selected.runStatus).toBe('buff_acquired');
    expect(selected.currentFloor).toBe(1);
    expect(reduceDungeon(selected, action)).toBe(selected);
    expect(selected.gold).toBe(won.gold);
    const next = reduceDungeon(selected, { type: 'finish-buff' });
    expect(next.currentFloor).toBe(2);
    expect(next.combat.runBuffs).toEqual(selected.activeBuffs);
    expect(reduceDungeon(next, { type: 'finish-buff' }, 1)).toBe(next);
    expect(reduceDungeon(next, action, 1)).toBe(next);
  });
  it('final boss skips choices and both terminal outcomes clear run buffs', () => {
    const buffs = [{ buffId: 'power-rune', stacks: 2 }];
    const clear = victory('boss', 10, buffs);
    expect(clear.runStatus).toBe('cleared');
    expect(clear.activeBuffs).toEqual([]);
    expect(clear.combat.runBuffs).toEqual([]);
    expect(clear.buffOptions).toEqual([]);
    const initial = createDungeonRun(2, 'fail');
    const powered = combat('power-rune');
    const defeat = reduceDungeon({ ...initial, runStatus: 'battle', currentRoom: 'battle', activeBuffs: powered.runBuffs,
      combat: { ...powered, party: powered.party.map((member, i) => ({ ...member, currentHp: i ? 0 : 1 })), enemies: powered.enemies.map(enemy => ({ ...enemy, actionRemainingMs: 0 })) } }, { type: 'tick', deltaMs: 50, now: 100 });
    expect(defeat.runStatus).toBe('game_over');
    expect(defeat.activeBuffs).toEqual([]);
    expect(defeat.combat.runBuffs).toEqual([]);
    expect(createDungeonRun(2, 'new').activeBuffs).toEqual([]);
  });
  it('renders rarity, target and owned stacks without adding battle height', () => {
    const run = { ...victory(), buffOptions: ['power-rune', 'healing-prayer', 'swift-fingers'], activeBuffs: [{ buffId: 'power-rune', stacks: 1 }] };
    const html = renderToStaticMarkup(createElement(BuffReward, { run, onChoose: () => {} }));
    expect(html).toContain('Owned: 1 / 3');
    expect(html).toContain('rarity-uncommon');
    expect(html).toContain('Cleric');
  });
});

describe('derived combat stats and conditional effects', () => {
  it('Power Rune increases actual damage additively without touching base definitions', () => {
    const damage = (state: CombatState) => correct({ ...state, party: state.party.map((member, i) => ({ ...member, attackCharge: i ? 0 : 89 })) }, 1).events.find(event => event.kind === 'ally-attack')!.amount!;
    expect(damage(combat('power-rune'))).toBeGreaterThan(damage(combat()));
    expect(getEffectiveCharacter(combat('power-rune', 'power-rune'), 'warrior').stats.attack).toBe(Math.round(31 * 1.1));
    expect(CHARACTERS_BY_ID.warrior.stats.attack).toBe(31);
    expect(getEffectiveCharacter(combat('arcane-power'), 'mage').stats.attack).toBe(Math.round(23 * 1.15));
    expect(getEffectiveCharacter(combat('focus'), 'martial-artist').stats.attack).toBeGreaterThan(CHARACTERS_BY_ID['martial-artist'].stats.attack);
  });
  it('Swift Fingers changes the real attack boundary and the UI gauge together', () => {
    const state = combat('swift-fingers');
    expect(getEffectiveCharacter(state, 'warrior').attackThreshold).toBe(86);
    const charged = { ...state, party: state.party.map((member, i) => ({ ...member, attackCharge: i ? 0 : 84 })) };
    const before = correct(charged, 1);
    expect(before.events.some(event => event.kind === 'ally-attack' && event.actorId === 'warrior')).toBe(false);
    expect(correct(before, 2).events.some(event => event.kind === 'ally-attack' && event.actorId === 'warrior')).toBe(true);
    const html = renderToStaticMarkup(createElement(PartyPanel, { combat: state }));
    expect(html).toContain('0 / 86');
    expect(getEffectiveCharacter({ runBuffs: [{ buffId: 'swift-fingers', stacks: 100 }] }, 'warrior').attackThreshold).toBe(BUFF_CONFIG.minAttackThreshold);
  });
  it('Vitality adds only max delta to living HP, carries HP across combat and uses buffed max for recovery/revive', () => {
    const original = combat();
    const wounded = { ...original, party: original.party.map((member, i) => ({ ...member, currentHp: i === 1 ? 0 : 80 })) };
    const boosted = applyRunBuffs(wounded, [{ buffId: 'vitality-rune', stacks: 1 }]);
    expect(boosted.party[0].currentHp).toBe(89);
    expect(boosted.party[1].currentHp).toBe(0);
    expect(getEffectiveCharacter(boosted, 'warrior').stats.maxHp).toBe(189);
    const healed = recoverParty(boosted, 1);
    expect(healed.party[0].currentHp).toBe(189);
    expect(recoveryTargets(healed)).toEqual([]);
    expect(recoverParty(boosted, .3, 'mage', true).party[1].currentHp).toBe(Math.ceil(getEffectiveCharacter(boosted, 'mage').stats.maxHp * .3));
    expect(applyRunBuffs(boosted, []).party[0].currentHp).toBe(80);
  });
  it('Healing Prayer/Sacred Healing change actual heal amount and grant a consumable shield only on actual heals', () => {
    let state = combat('healing-prayer', 'sacred-healing', 'guardian-blessing');
    state = { ...state, party: state.party.map((member, i) => ({ ...member, currentHp: i === 0 ? 20 : member.currentHp, abilityCharge: member.definitionId === 'cleric' ? 49 : 0 })) };
    const healed = correct(state, 50);
    expect(healed.events.find(event => event.kind === 'ally-heal')?.amount).toBe(69);
    expect(healed.party[0].currentHp).toBe(89);
    const blocked = consumeDamageShield(healed, 'warrior', 40);
    expect(blocked.damage).toBe(30);
    expect(consumeDamageShield(blocked.state, 'warrior', 40).damage).toBe(40);
    const full = combat('guardian-blessing');
    expect(correct({ ...full, party: full.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'cleric' ? 49 : 0 })) }, 50).buffResources.shields).toEqual({});
  });
  it('guard buffs activate on consumption, heal actual HP and consume the next counter once', () => {
    let state = combat('reinforced-shield', 'guardian-oath', 'fortress');
    state = { ...state, party: state.party.map((member, i) => i === 0 ? { ...member, currentHp: 100, statuses: ['ability:guard'] } : member), enemies: state.enemies.map(enemy => ({ ...enemy, actionRemainingMs: 0 })) };
    const guarded = tickCombat(state, 1, 1);
    expect(guarded.party[0].statuses).not.toContain('ability:guard');
    expect(guarded.party[0].currentHp).toBe(109);
    expect(guarded.events.find(event => event.kind === 'ally-heal')?.amount).toBe(9);
    expect(guarded.buffResources.counters.warrior).toBe(.3);
    expect(guarded.buffResources.gaugeShield).toBe(15);
    const firstMiss = miss(guarded);
    expect(firstMiss.enemies[0].specialGauge).toBe(10);
    expect(miss(firstMiss).enemies[0].specialGauge).toBe(35);
    const attack = correct({ ...guarded, party: guarded.party.map((member, i) => i === 0 ? { ...member, attackCharge: 89 } : member) }, 1);
    expect(attack.buffResources.counters.warrior).toBe(0);
    expect(attack.events.find(event => event.kind === 'ally-attack')?.amount).toBe(Math.round(31 * 1.3) - ENEMIES_BY_ID['crypt-warden'].defense);
  });
  it('Guardian Blessing mitigates enemy SPECIAL once, independently for each target', () => {
    let state = combat('guardian-blessing');
    state = handleBuffTrigger(state, { type: 'heal', characterId: 'cleric', targetId: 'warrior' });
    const special = { id: 'test-damage', name: 'Test', description: '', gaugeCost: 0, effects: [{ effectType: 'damage', targetType: 'allParty', valueType: 'flat', value: 40 }] } as const;
    const result = executeEnemyAbility(state, state.enemies[0].instanceId, special);
    expect(result.events.find(event => event.kind === 'ally-damaged' && event.targetId === 'warrior')?.amount).toBe(30);
    expect(result.events.find(event => event.kind === 'ally-damaged' && event.targetId === 'mage')?.amount).toBe(40);
    expect(result.state.buffResources.shields.warrior).toBe(0);
  });
  it('Mana Surge lowers ability threshold; Wide Magic increases actual AoE damage', () => {
    const charged = (state: CombatState) => ({ ...state, party: state.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'mage' ? 23 : 0 })) });
    const original = correct(charged(combat()), 24);
    expect(original.events.some(event => event.kind === 'ally-ability-triggered' && event.actorId === 'mage')).toBe(false);
    const enhanced = correct(charged(combat('mana-surge', 'wide-magic')), 24);
    expect(enhanced.events.some(event => event.kind === 'ally-ability-triggered' && event.actorId === 'mage')).toBe(true);
    expect(enhanced.events.find(event => event.kind === 'ally-ability-damage')?.amount).toBe(30 - ENEMIES_BY_ID['crypt-warden'].defense);
    for (let i = 0, state = enhanced; i < 10; i++) {
      state = miss(state);
      expect(state.events.filter(event => event.kind === 'ally-ability-triggered' && event.actorId === 'mage')).toHaveLength(1);
    }
  });
  it('combo bonuses scale only active combo and further misses never reactivate it', () => {
    const active = correct(combat('focus', 'endless-combo', 'perfect-form'), 40);
    expect(getComboMultiplier(active, 'martial-artist')).toBeCloseTo((1 + .25 * 1.25) * 1.2);
    let ended = active;
    for (let i = 0; i < 10; i++) ended = miss(ended);
    expect(getComboMultiplier(ended, 'martial-artist')).toBe(1);
    expect(ended.party[3].statuses.some(status => status.startsWith('ability:'))).toBe(false);
  });
  it('Calm Mind and Precision reduce miss gain additively and preserve warnings', () => {
    const state = miss(combat('calm-mind', 'precision'));
    expect(state.enemies[0].specialGauge).toBeCloseTo(17.5);
    const nearMax = { ...state, enemies: state.enemies.map(enemy => ({ ...enemy,
      specialGauge: ENEMIES_BY_ID[enemy.definitionId].specialGaugeMax - 1 })) };
    expect(miss(nearMax).events.some(event => event.kind === 'enemy-special-ready')).toBe(true);
  });
  it('Flow and Perfect Rhythm fire on 50/100 perfect chars, not misses, and skip fallen allies', () => {
    let state = combat('flow', 'perfect-rhythm');
    state = { ...state, party: state.party.map((member, i) => i === 0 ? { ...member, currentHp: 0 } : member) };
    const fired = correct(state, 50);
    expect(fired.party[0].attackCharge).toBe(0);
    expect(fired.party[1].attackCharge).toBe(6);
    expect(fired.events.filter(event => event.abilityId === 'perfect-rhythm' && event.kind === 'ally-ability-damage')).toHaveLength(1);
    expect(correct(fired, 51).party[1].attackCharge).toBe(7);
    expect(correct(fired, 100).party[1].attackCharge).toBe(12);
    expect(miss(fired).party[1].attackCharge).toBe(6);
  });
});
