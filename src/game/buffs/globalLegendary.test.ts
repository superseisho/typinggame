import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUFFS_BY_ID, BUFF_DEFINITIONS } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import { BUFF_RARITIES, type RunBuff } from '../../types/buffs';
import type { CombatState } from '../../types/game';
import { randomStep } from '../../utils/random';
import { createCombatState } from '../combat/createCombatState';
import { startCombat, tickCombat } from '../combat/combatEngine';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import { resolveEnemyDamage } from '../combat/enemyDamage';
import { getTypingDisplay } from '../typing/typingEngine';
import { applyRunBuffs, addBuff } from './runBuffManager';
import { getEffectiveCharacter, getBuffModifier } from './buffModifiers';
import { handleBuffTrigger } from './buffEffectHandlers';
import { BUFF_CONFIG } from './buffConfig';
import { generateBuffRewards } from './buffRewards';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { generateShop, purchaseShopItem } from '../dungeon/shopEngine';
import { SHOP_CONFIG } from '../dungeon/shopConfig';
import { TREASURE_CONFIG } from '../dungeon/treasureConfig';
import { ALTAR_CONFIG, EVENT_CONFIG } from '../dungeon/encounterConfig';
import { TypingPanel } from '../../components/TypingPanel';
import { BuffReward } from '../../components/dungeon/BuffReward';
import { CurrentBuffs } from '../../components/dungeon/CurrentBuffs';

const owned = (buffId: string, stacks = 1): RunBuff[] => [{ buffId, stacks }];
function combat(buffs: readonly RunBuff[] = [], enemies = ['crypt-slime', 'enemy_executioner_elite', 'enemy_wraith']): CombatState {
  const state = startCombat(applyRunBuffs(createCombatState(enemies), buffs), 0);
  return { ...state, enemies: state.enemies.map(e => ({ ...e, actionRemainingMs: 1e9 })) };
}
const correct = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current, 1);
const miss = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current === 'z' ? 'q' : 'z', 1);
function seedFor(predicate: (rolls: number[]) => boolean): number {
  for (let seed = 0; seed < 100000; seed++) {
    let next = seed;
    const rolls = Array.from({ length: 4 }, () => { const r = randomStep(next); next = r.seed; return r.value; });
    if (predicate(rolls)) return seed;
  }
  throw Error('No deterministic fixture seed');
}
const direct = (s: CombatState, kind: 'ally-attack' | 'ally-ability-damage' = 'ally-attack', targetIds = [s.enemies[0].instanceId]) =>
  resolveEnemyDamage(s, { targetIds, power: 20, kind, label: 'Test', actorId: 'mage', directCharacterDamage: true });

describe('Global stat runes', () => {
  it.each([
    ['power-rune', 'attack', .05], ['vitality-rune', 'maxHp', .05], ['defense-rune', 'defense', .05],
    ['greater-power-rune', 'attack', .1], ['greater-vitality-rune', 'maxHp', .1], ['greater-defense-rune', 'defense', .1],
    ['superior-power-rune', 'attack', .15], ['superior-vitality-rune', 'maxHp', .15], ['superior-defense-rune', 'defense', .15],
  ] as const)('%s stacks additively without mutating base stats', (id, stat, value) => {
    const base = structuredClone(CHARACTERS_BY_ID);
    for (const stacks of [1, 2, 3]) {
      const state = combat(owned(id, stacks));
      for (const member of state.party) {
        expect(getBuffModifier(state.runBuffs, stat, member.definitionId)).toBeCloseTo(value * stacks);
        expect(getEffectiveCharacter(state, member.definitionId).stats[stat]).toBe(Math.round(base[member.definitionId].stats[stat] * (1 + value * stacks)));
      }
    }
    expect(addBuff(owned(id, 3), id)).toEqual(owned(id, 3));
    expect(CHARACTERS_BY_ID).toEqual(base);
  });
  it.each(['vitality-rune', 'greater-vitality-rune', 'superior-vitality-rune', 'ascendant-rune'])('%s gives only max HP delta and does not revive', id => {
    const initial = combat();
    const wounded = { ...initial, party: initial.party.map((p, i) => ({ ...p, currentHp: i === 1 ? 0 : 20 })) };
    const next = applyRunBuffs(wounded, owned(id));
    for (const [i, p] of next.party.entries()) expect(p.currentHp).toBe(i === 1 ? 0 : 20 + getEffectiveCharacter(next, p.definitionId).stats.maxHp - CHARACTERS_BY_ID[p.definitionId].stats.maxHp);
    expect(applyRunBuffs(next, owned(id)).party).toEqual(next.party);
  });
  it('Ascendant applies 20% to all three stats and is unique', () => {
    const state = combat(owned('ascendant-rune'));
    for (const stat of ['attack', 'maxHp', 'defense'] as const) expect(getBuffModifier(state.runBuffs, stat, 'warrior')).toBe(.2);
    expect(addBuff(state.runBuffs, 'ascendant-rune')).toBe(state.runBuffs);
  });
  it.each([['swift-fingers', .05], ['lightning-fingers', .1]] as const)('%s uses ceiling and the existing minimum', (id, reduction) => {
    for (const stacks of [1, 2, 3]) for (const member of combat().party) {
      expect(getEffectiveCharacter({ runBuffs: owned(id, stacks) }, member.definitionId).attackThreshold)
        .toBe(Math.max(5, Math.ceil(CHARACTERS_BY_ID[member.definitionId].attackThreshold * (1 - reduction * stacks))));
    }
    expect(getEffectiveCharacter({ runBuffs: owned(id, 100) }, 'warrior').attackThreshold).toBe(5);
  });
  it('Defense uses the existing enemy attack formula and does not change unbuffed damage', () => {
    const base = combat([], ['enemy_executioner']);
    const hit = (s: CombatState) => tickCombat({ ...s, enemies: s.enemies.map(e => ({ ...e, nextActionSkillId: 'skill_attack', actionRemainingMs: 1 })) }, 1, 1);
    expect(base.party[0].currentHp - hit(base).party[0].currentHp).toBe(24 - CHARACTERS_BY_ID.warrior.stats.defense);
    const boosted = applyRunBuffs(base, owned('superior-defense-rune', 3));
    expect(boosted.party[0].currentHp - hit(boosted).party[0].currentHp).toBe(24 - getEffectiveCharacter(boosted, 'warrior').stats.defense);
  });
});

describe('100-character rhythms', () => {
  it.each([1, 2, 3])('heals living allies and seals per-enemy maximums at stack %s', stacks => {
    let state = combat([...owned('vital-rhythm', stacks), ...owned('seal-rhythm', stacks)]);
    state = { ...state, typing: { ...state.typing, currentCombo: 99 },
      party: state.party.map((p, i) => ({ ...p, currentHp: i === 1 ? 0 : 10 })),
      enemies: state.enemies.map(e => ({ ...e, specialGauge: 100 })) };
    const next = correct(state);
    for (const [i, p] of next.party.entries()) expect(p.currentHp).toBe(i === 1 ? 0 : 10 + Math.round(getEffectiveCharacter(next, p.definitionId).stats.maxHp * .05 * stacks));
    for (const e of next.enemies) expect(e.specialGauge).toBeCloseTo(100 - ENEMIES_BY_ID[e.definitionId].specialGaugeMax * .1 * stacks);
    expect(next.events.filter(e => e.kind === 'ally-heal')).toHaveLength(3);
    expect(correct(next).party.map(p => p.currentHp)).toEqual(next.party.map(p => p.currentHp));
    const again = correct({ ...next, typing: { ...next.typing, currentCombo: 199 } });
    expect(again.party[0].currentHp).toBeGreaterThan(next.party[0].currentHp);
    const failed = correct(miss(state));
    expect(failed.typing.currentCombo).toBe(1);
    expect(failed.party.map(p => p.currentHp)).toEqual(state.party.map(p => p.currentHp));
    const clamped = handleBuffTrigger({ ...state, enemies: state.enemies.map((e, i) => ({ ...e, currentHp: i === 1 ? 0 : e.currentHp, specialGauge: 1 })) }, { type: 'perfect-streak', streak: 100 });
    expect(clamped.enemies.map(e => e.specialGauge)).toEqual([0, 1, 0]);
  });
});

describe('Unbroken Focus', () => {
  it('records a typo but preserves all combat resources, curse, fighter status and streak effects', () => {
    let state = combat([...owned('unbroken-focus'), ...owned('vital-rhythm'), ...owned('seal-rhythm'), ...owned('flow'), ...owned('perfect-rhythm')]);
    state = { ...state, typing: { ...state.typing, currentCombo: 99, maxCombo: 99 },
      typingCurseBonus: 10, typingCurseRemainingMs: 10000,
      party: state.party.map(p => ({ ...p, currentHp: 10, statuses: p.definitionId === 'martial-artist' ? ['ability:flow-combo'] : [] })),
      buffResources: { ...state.buffResources, gaugeShield: 15 } };
    const protectedMiss = miss(state);
    expect(protectedMiss.typing).toEqual({ ...state.typing, missCount: 1, lastInput: 'miss' });
    expect(protectedMiss.party).toEqual(state.party);
    expect(protectedMiss.enemies).toEqual(state.enemies);
    expect(protectedMiss.buffResources.gaugeShield).toBe(15);
    expect(protectedMiss.typingCurseRemainingMs).toBe(10000);
    expect(protectedMiss.lastMissProtected).toBe(true);
    expect(renderToStaticMarkup(createElement(TypingPanel, { combat: protectedMiss }))).toContain('PROTECTED');
    const advanced = correct(protectedMiss);
    expect(advanced.typing.currentCombo).toBe(100);
    expect(advanced.party[0].currentHp).toBeGreaterThan(10);
    expect(advanced.events.some(e => e.abilityId === 'seal-rhythm')).toBe(true);
    expect(advanced.events.some(e => e.abilityId === 'perfect-rhythm')).toBe(true);
    expect(advanced.party[0].attackCharge).toBe(6);
    const ordinary = miss(protectedMiss);
    expect(ordinary.typing.missCount).toBe(2);
    expect(ordinary.typing.currentCombo).toBe(0);
    expect(ordinary.buffResources.gaugeShield).toBe(0);
    expect(ordinary.enemies[0].specialGauge).toBe(GAME_CONFIG.enemySpecialGaugeOnMiss + 10 - 15);
    expect(ordinary.party[3].statuses).not.toContain('ability:flow-combo');
  });
  it('recharges three slots independently and resets all slots for a new battle', () => {
    let state = combat(owned('unbroken-focus', 3));
    state = miss(state);
    state = tickCombat(state, 1000, 1000);
    state = miss(state);
    state = tickCombat(state, 1000, 2000);
    state = miss(state);
    expect(state.buffResources.focusRechargeMs).toEqual([28000, 29000, 30000]);
    expect(miss(state).lastMissProtected).toBe(false);
    state = tickCombat(state, 27999, 29999);
    expect(state.buffResources.focusRechargeMs).toEqual([1, 1001, 2001]);
    state = tickCombat(state, 1, 30000);
    expect(state.buffResources.focusRechargeMs).toEqual([0, 1000, 2000]);
    expect(miss(state).buffResources.focusRechargeMs).toEqual([BUFF_CONFIG.unbrokenFocusRechargeMs, 1000, 2000]);
    expect(tickCombat(state, 1000, 31000).buffResources.focusRechargeMs).toEqual([0, 0, 1000]);
    expect(startCombat({ ...state, status: 'ready' }, 40000).buffResources.focusRechargeMs).toEqual([0, 0, 0]);
    expect(tickCombat({ ...state, status: 'victory' }, 30000).buffResources).toBe(state.buffResources);
  });
});

describe('Legendary direct attack procs', () => {
  it.each(['crypt-slime', 'enemy_executioner_elite'])('Reaper kills %s, including an add alongside the Boss', id => {
    const state = { ...combat(owned('reapers-blessing'), ['crypt-warden', id]), buffRngState: seedFor(r => r[0] < .05) };
    const result = direct(state, 'ally-ability-damage', state.enemies.map(e => e.instanceId));
    expect(result.enemies[0].currentHp).toBeGreaterThan(0);
    expect(result.enemies[1].currentHp).toBe(0);
    expect(result.buffRngState).toBe(randomStep(state.buffRngState).seed); // no Boss roll
    expect(result.events.filter(e => e.kind === 'enemy-defeated')).toHaveLength(1);
    expect(result.targetEnemyId).toBe(state.enemies[0].instanceId);
  });
  it('rolls independently for AoE targets and never rolls for Buff damage', () => {
    const state = { ...combat(owned('reapers-blessing')), buffRngState: seedFor(r => r[0] < .05 && r[1] >= .05 && r[2] >= .05) };
    const ids = state.enemies.map(e => e.instanceId);
    const result = direct(state, 'ally-ability-damage', ids);
    expect(result.enemies.map(e => e.currentHp === 0)).toEqual([true, false, false]);
    const buffHit = resolveEnemyDamage(state, { targetIds: ids, power: 15, kind: 'ally-ability-damage', label: 'Perfect Rhythm' });
    expect(buffHit.enemies.every(e => e.currentHp > 0)).toBe(true);
    expect(buffHit.buffRngState).toBe(state.buffRngState);
    const bossOnly = combat(owned('reapers-blessing'), ['crypt-warden']);
    expect(direct(bossOnly).buffRngState).toBe(bossOnly.buffRngState);
  });
  it('Echo rolls once per normal attack, preserves selected target and excludes abilities', () => {
    const initial = combat(owned('echoing-assault'));
    const success = { ...initial, targetEnemyId: initial.enemies[1].instanceId, buffRngState: seedFor(r => r[0] < .3) };
    const all = direct(success, 'ally-attack', [success.targetEnemyId]);
    expect(all.enemies.every((e, i) => e.currentHp < success.enemies[i].currentHp)).toBe(true);
    expect(all.targetEnemyId).toBe(success.targetEnemyId);
    expect(all.buffRngState).toBe(randomStep(success.buffRngState).seed);
    const failure = { ...success, buffRngState: seedFor(r => r[0] >= .3) };
    const one = direct(failure, 'ally-attack', [failure.targetEnemyId]);
    expect(one.enemies.map((e, i) => e.currentHp < failure.enemies[i].currentHp)).toEqual([false, true, false]);
    expect(direct(success, 'ally-ability-damage').buffRngState).toBe(success.buffRngState);
  });
  it('Echo then Reaper combines one AoE roll with per-target rolls', () => {
    const state = { ...combat([...owned('echoing-assault'), ...owned('reapers-blessing')]), buffRngState: seedFor(r => r[0] < .3 && r[1] < .05 && r[2] >= .05 && r[3] >= .05) };
    const result = direct(state);
    expect(result.enemies.map(e => e.currentHp === 0)).toEqual([true, false, false]);
    let seed = state.buffRngState;
    for (let i = 0; i < 4; i++) seed = randomStep(seed).seed;
    expect(result.buffRngState).toBe(seed);
  });
  it.each(['warrior', 'mage', 'cleric', 'martial-artist'] as const)('%s normal attack enters the same proc pipeline', id => {
    let state = combat(owned('reapers-blessing'), ['crypt-slime']);
    state = { ...state, buffRngState: seedFor(r => r[0] < .05), party: state.party.map(p => ({ ...p, attackCharge: p.definitionId === id ? getEffectiveCharacter(state, id).attackThreshold - 1 : 0 })) };
    expect(correct(state).status).toBe('victory');
  });
  it('Mage ability enters the direct-damage proc pipeline without Echo rolling', () => {
    let state = combat([...owned('reapers-blessing'), ...owned('echoing-assault')]);
    const seed = seedFor(r => r[0] < .05 && r[1] >= .05 && r[2] >= .05);
    state = { ...state, buffRngState: seed, party: state.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'mage' ? 29 : 0 })) };
    const next = correct(state);
    expect(next.enemies.map(e => e.currentHp === 0)).toEqual([true, false, false]);
    let expected = seed;
    for (let i = 0; i < 3; i++) expected = randomStep(expected).seed;
    expect(next.buffRngState).toBe(expected);
  });
});

describe('Legendary acquisition and UI', () => {
  const tables = [BUFF_CONFIG.rarityWeights.battle, BUFF_CONFIG.rarityWeights.elite, TREASURE_CONFIG.buffWeights,
    TREASURE_CONFIG.rareBuffWeights, ALTAR_CONFIG.bloodWeights, ALTAR_CONFIG.goldWeights, EVENT_CONFIG.buffWeights, SHOP_CONFIG.buffWeights];
  it.each(tables)('supports Legendary with configured weights %j', weights => {
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(weights.legendary).toBeGreaterThan(0);
    const rarities = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const reward = generateBuffRewards([], 'custom', Math.imul(i, 2654435761) >>> 0, { weights });
      expect(new Set(reward.choices).size).toBe(reward.choices.length);
      reward.choices.forEach(id => rarities.add(BUFFS_BY_ID[id].rarity));
    }
    expect(rarities.has('legendary')).toBe(true);
    if (!weights.common && !weights.uncommon) expect([...rarities].every(r => ['rare', 'epic', 'legendary'].includes(r))).toBe(true);
  });
  it('sells Legendary at 400 Gold with caps, sold-out, reroll and insufficient-gold checks', () => {
    let run = { ...createDungeonRun(1, 'shop'), runStatus: 'room' as const, currentRoom: 'shop' as const, gold: 1000 };
    let stock = generateShop(run);
    for (let i = 0; !stock.shop.items.some(p => p.type === 'buff' && BUFFS_BY_ID[p.buffId].rarity === 'legendary') && i < 10000; i++) stock = generateShop({ ...run, rngState: Math.imul(i, 2654435761) >>> 0 });
    run = { ...run, shop: stock.shop, rngState: stock.seed };
    const product = stock.shop.items.find(p => p.type === 'buff' && BUFFS_BY_ID[p.buffId].rarity === 'legendary')!;
    expect(product).toBeDefined(); expect(product.price).toBe(400);
    const poor = { ...run, gold: 399 };
    expect(purchaseShopItem(poor, product.id)).toBe(poor);
    const bought = purchaseShopItem(run, product.id);
    expect(bought.gold).toBe(600);
    expect(bought.shop!.items.find(p => p.id === product.id)!.purchased).toBe(true);
    expect(purchaseShopItem(bought, product.id)).toBe(bought);
    const maxed = BUFF_DEFINITIONS.filter(b => b.rarity === 'legendary').map(b => ({ buffId: b.id, stacks: b.maxStacks }));
    const capped = { ...bought, activeBuffs: maxed };
    const rerolled = reduceDungeon(capped, { type: 'reroll-shop', revision: 0 });
    expect(rerolled.gold).toBe(600 - SHOP_CONFIG.rerollCost);
    expect(rerolled.shop!.items.every(p => p.type !== 'buff' || BUFFS_BY_ID[p.buffId].rarity !== 'legendary')).toBe(true);
    expect(reduceDungeon(rerolled, { type: 'reroll-shop', revision: 0 })).toBe(rerolled);
  });
  it('orders Legendary above Epic and renders reward/list rarity and stack information', () => {
    expect(BUFF_RARITIES.indexOf('legendary')).toBeGreaterThan(BUFF_RARITIES.indexOf('epic'));
    const run = { ...createDungeonRun(1, 'ui'), buffOptions: ['unbroken-focus', 'reapers-blessing', 'echoing-assault'], runStatus: 'buff_reward' as const };
    const reward = renderToStaticMarkup(createElement(BuffReward, { run, onChoose: () => {} }));
    expect(reward.match(/rarity-legendary/g)).toHaveLength(3);
    expect(reward).toContain('Owned: 0 / 3');
    expect(renderToStaticMarkup(createElement(CurrentBuffs, { buffs: owned('unbroken-focus', 3) }))).toContain('3 Charges');
  });
});
