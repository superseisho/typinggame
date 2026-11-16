import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CombatState } from '../../types/game';
import type { RunBuff } from '../../types/buffs';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { createCombatState } from '../combat/createCombatState';
import { startCombat, tickCombat } from '../combat/combatEngine';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import { getTypingDisplay } from '../typing/typingEngine';
import { partyTargetWeight, selectRandomPartyTarget, selectLowestPartyHpIndex } from '../combat/targeting';
import { executeEnemyAbility } from '../combat/enemyAbilityEngine';
import { planEnemyAction } from '../combat/enemySkillEngine';
import { resolveReadyAllyAttacks } from '../combat/combatEngine';
import { PartyPanel } from '../../components/PartyPanel';
import { EnemyPanel } from '../../components/EnemyPanel';
import { applyRunBuffs, canAddBuff } from './runBuffManager';
import { getEffectiveCharacter } from './buffModifiers';
import { generateBuffRewards } from './buffRewards';
import { BUFF_CONFIG } from './buffConfig';
import { generateShop } from '../dungeon/shopEngine';
import { SHOP_CONFIG } from '../dungeon/shopConfig';
import { TREASURE_CONFIG } from '../dungeon/treasureConfig';
import { ALTAR_CONFIG, EVENT_CONFIG } from '../dungeon/encounterConfig';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { randomStep } from '../../utils/random';

const owned = (buffId: string, stacks = 1): RunBuff => ({ buffId, stacks });
function battle(buffs: readonly RunBuff[] = [], enemies = ['enemy_guardian', 'enemy_guardian', 'crypt-warden']): CombatState {
  const state = startCombat(applyRunBuffs(createCombatState(enemies), buffs), 0);
  return { ...state, enemies: state.enemies.map(e => ({ ...e, currentHp: 10000, actionRemainingMs: 50000, actionDurationMs: 50000 })) };
}
const correct = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current, 1);
function cast(s: CombatState) {
  const trigger = getEffectiveCharacter(s, 'mage').ability.trigger;
  if (trigger.type !== 'correct-characters') throw Error('Expected charged Mage');
  return correct({ ...s, events: [], party: s.party.map(p => ({ ...p, attackCharge: 0, abilityCharge: p.definitionId === 'mage' ? trigger.threshold - 1 : 0 })) });
}
function normal(s: CombatState, id: 'mage' | 'warrior' = 'mage') {
  return resolveReadyAllyAttacks({ ...s, events: [], party: s.party.map(p => ({ ...p, attackCharge: p.definitionId === id ? getEffectiveCharacter(s, id).attackThreshold : 0 })) }, 1);
}
function burnFixture(stacks: number, bonus = 0): CombatState {
  const s = battle([owned('arcane-burn', stacks)]);
  return { ...s, buffResources: { ...s.buffResources, abilityAttackGrowth: { mage: bonus } } };
}

describe('Mage definitions and Arcane Veil', () => {
  it('adds five definitions, honors caps, and leaves all three original Mage buffs unchanged', () => {
    expect(BUFF_DEFINITIONS).toHaveLength(54);
    expect(new Set(BUFF_DEFINITIONS.map(b => b.id)).size).toBe(54);
    for (const [id, rarity, maxStacks] of [['arcane-veil','common',3],['frostbind','rare',2],['arcane-burn','epic',2],['arcane-barrage','legendary',1],['infinite-arcana','legendary',3]] as const) {
      expect(BUFFS_BY_ID[id]).toMatchObject({ rarity, maxStacks, categories: expect.arrayContaining(['Mage']) });
      expect(canAddBuff([owned(id, maxStacks)], id)).toBe(false);
    }
    expect(BUFFS_BY_ID['arcane-power']).toMatchObject({ rarity:'common',maxStacks:3,effects:[{type:'modifier',stat:'attack',target:'mage',value:.15}] });
    expect(BUFFS_BY_ID['wide-magic']).toMatchObject({ rarity:'uncommon',maxStacks:3,effects:[{type:'modifier',stat:'abilityDamage',target:'mage',value:.25}] });
    expect(BUFFS_BY_ID['mana-surge']).toMatchObject({ rarity:'rare',maxStacks:3,effects:[{type:'modifier',stat:'abilityThreshold',target:'mage',value:-.2}] });
  });
  it.each([0,1,2,3])('uses Mage weight 1 - .2 * %s, with a deterministic uniform baseline', stacks => {
    const s = battle(stacks ? [owned('arcane-veil', stacks)] : []);
    expect(partyTargetWeight(s, 'mage')).toBeCloseTo(1 - .2 * stacks);
    expect(partyTargetWeight(s, 'warrior')).toBe(1);
    for (let i = 0; i < 100; i++) {
      const seed = Math.imul(i,2654435761) >>> 0;
      const r = randomStep(seed);
      const weights = [1, 1 - .2 * stacks, 1, 1];
      let roll = r.value * weights.reduce((a,b)=>a+b,0);
      const expected = weights.findIndex(w => (roll -= w) < 0);
      expect(selectRandomPartyTarget({ ...s, targetRngState: seed }).index).toBe(expected);
    }
  });
  it('integrates weighted selection into normal/Heavy Attack, while Guard and lowest-HP/all-party Special retain priority', () => {
    const base = battle([owned('arcane-veil',3)]);
    const living = { ...base, party: base.party.map((p,i)=>({ ...p,currentHp:i===1?p.currentHp:0 })) };
    expect(selectRandomPartyTarget(living).index).toBe(1);
    const hit = (s: CombatState, skill = 'skill_attack') => tickCombat({ ...s,enemies:s.enemies.map((e,i)=>i?e:{...e,actionRemainingMs:0,nextActionSkillId:skill}) },1,1);
    const expected = selectRandomPartyTarget(base).index!;
    expect(hit(base).events.find(e=>e.kind==='ally-damaged')?.targetId).toBe(base.party[expected].definitionId);
    expect(hit(base, 'skill_heavy_attack').events.find(e=>e.kind==='ally-damaged')?.targetId).toBe(base.party[expected].definitionId);
    const guarded = { ...base,party:base.party.map((p,i)=>i?p:{...p,guardCharges:1,statuses:['ability:guard']}) };
    expect(hit(guarded).events.some(e=>e.kind==='ally-guard-consumed')).toBe(true);
    expect(hit(guarded).targetRngState).toBe(base.targetRngState);
    const weakMage = { ...base,party:base.party.map((p,i)=>i===1?{...p,currentHp:1}:p) };
    expect(selectLowestPartyHpIndex(weakMage)).toBe(1);
    const special = {id:'test',name:'test',description:'',gaugeCost:0,effects:[{effectType:'damage',targetType:'singleParty',value:1,valueType:'flat'}]} as const;
    expect(executeEnemyAbility(weakMage,base.enemies[0].instanceId,special).events.find(e=>e.kind==='ally-damaged')?.targetId).toBe('mage');
    const all = {...special,effects:[{...special.effects[0],targetType:'allParty'}]} as const;
    expect(executeEnemyAbility(weakMage,base.enemies[0].instanceId,all).events.filter(e=>e.kind==='ally-damaged')).toHaveLength(4);
  });
});

describe('Frostbind and on-hit routing', () => {
  it.each([1,2])('adds %s * 2s to each live hit instance without changing NEXT, Special or data', stacks => {
    const before = battle([owned('frostbind', stacks)]);
    const definitions = structuredClone(ENEMIES_BY_ID);
    const next = cast(before);
    for (const [i,e] of next.enemies.entries()) {
      expect(e.actionRemainingMs).toBe(before.enemies[i].actionRemainingMs + 2000 * stacks);
      expect(e.actionDurationMs).toBe(before.enemies[i].actionDurationMs + 2000 * stacks);
      expect(e.pendingFrostDelayMs).toBe(2000 * stacks);
      expect(e.nextActionSkillId).toBe(before.enemies[i].nextActionSkillId);
      expect(e.specialGauge).toBe(before.enemies[i].specialGauge);
    }
    expect(next.enemies[0].instanceId).not.toBe(next.enemies[1].instanceId);
    expect(ENEMIES_BY_ID).toEqual(definitions);
  });
  it('caps outstanding delay, recovers budget with time, resets at a new cycle and does not delay Special', () => {
    let s = battle([owned('frostbind',2)],['enemy_executioner']);
    s = cast(cast(cast(s)));
    expect(s.enemies[0].pendingFrostDelayMs).toBe(BUFF_CONFIG.maxPendingFrostDelayMs);
    const remaining = s.enemies[0].actionRemainingMs;
    expect(cast(s).enemies[0].actionRemainingMs).toBe(remaining);
    s = tickCombat(s,2200,2200);
    expect(s.enemies[0].pendingFrostDelayMs).toBe(7800);
    expect(cast(s).enemies[0].actionRemainingMs).toBe(s.enemies[0].actionRemainingMs + 2200);
    expect(planEnemyAction(s,0).enemies[0].pendingFrostDelayMs).toBe(0);
    const pending = { ...s,enemies:s.enemies.map(e=>({...e,pendingSpecial:{abilityId:'execution',remainingMs:1}})) };
    const fired = tickCombat(pending,1,1);
    expect(fired.events.some(e=>e.kind==='enemy-special-used')).toBe(true);
    expect(fired.enemies[0].pendingSpecial).toBeNull();
  });
  it('uses actual Cover receivers once each, and never leaves statuses on ability-killed enemies', () => {
    let s = battle([owned('frostbind'),owned('arcane-burn')]);
    s = { ...s,enemies:s.enemies.map((e,i)=>i===0?{...e,cover:{remainingHits:3}}:e) };
    const next = cast(s);
    expect(next.enemies.map(e=>e.pendingFrostDelayMs)).toEqual([2000,0,0]);
    expect(next.enemies.map(e=>!!e.burn)).toEqual([true,false,false]);
    const dead = cast({ ...s,enemies:s.enemies.map(e=>({...e,currentHp:1,cover:null})) });
    expect(dead.status).toBe('victory');
    expect(dead.enemies.every(e=>e.burn===null && e.pendingFrostDelayMs===0)).toBe(true);
  });
  it('keeps the visible gauge within its adjusted cycle total', () => {
    const s = battle([owned('frostbind',2)]);
    const next = cast({ ...s,enemies:s.enemies.map(e=>({...e,actionDurationMs:8000,actionRemainingMs:2000})) });
    expect(next.enemies[0].actionDurationMs).toBe(12000);
    expect(next.enemies[0].actionRemainingMs).toBe(6000);
    const html = renderToStaticMarkup(createElement(EnemyPanel,{combat:next}));
    expect(html).toContain('FROST +4.0s');
    expect(html).toContain('width:50%');
  });
});

describe('Arcane Burn snapshots and ticks', () => {
  it.each([1,2])('deals snapshot 100 * 10%% * %s every second, exactly five ticks ignoring defense', stacks => {
    let s = cast(burnFixture(stacks,100 / CHARACTERS_BY_ID.mage.stats.attack - 1));
    const hp = s.enemies.map(e=>e.currentHp);
    expect(s.enemies.every(e=>e.burn?.damage===10*stacks)).toBe(true);
    expect(tickCombat(s,999,999).enemies.map(e=>e.currentHp)).toEqual(hp);
    s = tickCombat(s,2200,2200);
    expect(s.enemies.map(e=>e.currentHp)).toEqual(hp.map(h=>h-20*stacks));
    s = tickCombat(s,2800,5000);
    expect(s.enemies.map(e=>e.currentHp)).toEqual(hp.map(h=>h-50*stacks));
    expect(s.enemies.every(e=>e.burn===null)).toBe(true);
    expect(s.events.filter(e=>e.kind==='ally-ability-damage' && e.abilityId==='arcane-burn')).toHaveLength(15);
    expect(tickCombat(s,1000,6000).enemies.map(e=>e.currentHp)).toEqual(s.enemies.map(e=>e.currentHp));
  });
  it('refreshes one Burn per instance, recalculates snapshot and restarts the first tick after a full second', () => {
    let s = cast(burnFixture(1));
    s = tickCombat(s,3200,3200);
    expect(s.enemies[0].burn?.remainingMs).toBe(1800);
    const before = s.buffResources.abilityAttackGrowth.mage ?? 0;
    s = { ...s,buffResources:{...s.buffResources,abilityAttackGrowth:{mage:before+3}} };
    const attack = getEffectiveCharacter(s,'mage').stats.attack;
    s = cast(s);
    const hp = s.enemies[0].currentHp;
    expect(s.enemies[0].burn).toMatchObject({remainingMs:5000,untilTickMs:1000,damage:Math.round(attack*.1)});
    expect(tickCombat(s,999,4199).enemies[0].currentHp).toBe(hp);
    expect(tickCombat(s,1000,4200).enemies[0].currentHp).toBe(hp-Math.round(attack*.1));
  });
  it('does not redirect an existing DoT through Cover and cannot proc Reaper/Echo or ability effects', () => {
    let s = cast(battle([owned('arcane-burn'),owned('frostbind'),owned('infinite-arcana'),owned('arcane-barrage')]));
    s = applyRunBuffs(s,[...s.runBuffs,owned('reapers-blessing'),owned('echoing-assault')]);
    s = { ...s,buffRngState:0,enemies:s.enemies.map((e,i)=>i===1?{...e,cover:{remainingHits:3}}:e) };
    const hp = s.enemies.map(e=>e.currentHp);
    const bonus = s.buffResources.abilityAttackGrowth;
    const next = tickCombat(s,1000,1000);
    expect(next.enemies.map(e=>e.currentHp)).toEqual(hp.map((h,i)=>h-s.enemies[i].burn!.damage));
    expect(next.enemies[1].cover?.remainingHits).toBe(3);
    expect(next.buffRngState).toBe(s.buffRngState);
    expect(next.buffResources.abilityAttackGrowth).toEqual(bonus);
    expect(next.party.map(p=>p.abilityCharge)).toEqual(s.party.map(p=>p.abilityCharge));
    expect(next.enemies[0].burn?.remainingMs).toBe(4000);
    expect(next.enemies[0].pendingFrostDelayMs).toBe(1000);
  });
  it('kills, retargets and finishes Victory through the normal death pipeline', () => {
    let s = cast(battle([owned('arcane-burn'),owned('arcane-barrage'),owned('infinite-arcana')]));
    s = { ...s,enemies:s.enemies.map((e,i)=>({...e,currentHp:i===0?1:10000})) };
    const first = tickCombat(s,1000,1000);
    expect(first.enemies[0].currentHp).toBe(0);
    expect(first.enemies[0].burn).toBeNull();
    expect(first.targetEnemyId).toBe(first.enemies[1].instanceId);
    const next = tickCombat({...first,enemies:first.enemies.map(e=>({...e,currentHp:e.currentHp>0?1:0}))},1000,2000);
    expect(next.status).toBe('victory');
    expect(next.targetEnemyId).toBeNull();
    expect(next.buffResources.nextNormalAoe).toEqual({});
    expect(next.buffResources.abilityAttackGrowth).toEqual({});
    expect(next.enemies.every(e=>!e.burn && e.pendingFrostDelayMs===0)).toBe(true);
    expect(tickCombat(next,1000)).toBe(next);
  });
});

describe('Arcane Barrage and Infinite Arcana', () => {
  it('readies one AoE, preserves selected target, applies each defense, and consumes on Mage normal only', () => {
    const initial = battle([owned('arcane-barrage')]);
    expect(initial.buffResources.nextNormalAoe.mage).toBeUndefined();
    const ready = cast(cast(initial));
    expect(ready.buffResources.nextNormalAoe.mage).toBe(true);
    expect(normal(ready,'warrior').buffResources.nextNormalAoe.mage).toBe(true);
    const selected = {...ready,targetEnemyId:ready.enemies[2].instanceId};
    const next = normal(selected);
    expect(next.events.filter(e=>e.kind==='ally-attack')).toHaveLength(3);
    for (const [i,e] of next.enemies.entries()) expect(selected.enemies[i].currentHp-e.currentHp).toBe(CHARACTERS_BY_ID.mage.stats.attack-ENEMIES_BY_ID[e.definitionId].defense);
    expect(next.buffResources.nextNormalAoe.mage).toBe(false);
    expect(next.targetEnemyId).toBe(selected.targetEnemyId);
    expect(normal(next).events.filter(e=>e.kind==='ally-attack')).toHaveLength(1);
    const down = {...ready,party:ready.party.map(p=>p.definitionId==='mage'?{...p,currentHp:0,attackCharge:100}:p)};
    expect(resolveReadyAllyAttacks(down).buffResources.nextNormalAoe.mage).toBe(true);
  });
  it('bypasses Echo roll when ready, permits it otherwise and still rolls Reaper independently excluding Boss', () => {
    const initial = battle([owned('arcane-barrage'),owned('echoing-assault')]);
    const ready = cast(initial);
    expect(normal(ready).buffRngState).toBe(ready.buffRngState);
    const noReady = {...initial,buffRngState:0}; // first LCG roll < .30
    expect(normal(noReady).events.filter(e=>e.kind==='ally-attack')).toHaveLength(3);
    const reaper = applyRunBuffs(ready,[...ready.runBuffs,owned('reapers-blessing')]);
    let seed = 0;
    while (randomStep(seed).value>=.05) seed++;
    const next = normal({...reaper,buffRngState:seed});
    expect(next.enemies[0].currentHp).toBe(0);
    expect(next.enemies[2].currentHp).toBeGreaterThan(0);
    expect(next.buffRngState).toBe(randomStep(randomStep(seed).seed).seed);
  });
  it.each([1,2,3])('grows additively by .3 * %s after each cast and snapshots Burn before the new bonus', stacks => {
    const base = structuredClone(CHARACTERS_BY_ID);
    let s = battle([owned('infinite-arcana',stacks),owned('arcane-power'),owned('wide-magic'),owned('arcane-burn'),owned('arcane-barrage')]);
    const attackBefore = getEffectiveCharacter(s,'mage').stats.attack;
    s = cast(s);
    expect(s.buffResources.abilityAttackGrowth.mage).toBeCloseTo(.3*stacks);
    expect(s.events.find(e=>e.kind==='ally-ability-damage')?.amount).toBe(30-ENEMIES_BY_ID[s.enemies[0].definitionId].defense);
    expect(s.enemies[0].burn?.damage).toBe(Math.round(attackBefore*.1));
    const currentAttack = getEffectiveCharacter(s,'mage').stats.attack;
    expect(currentAttack).toBe(Math.round(23*(1+.15+.3*stacks)));
    const hit = normal(s);
    expect(hit.events.filter(e=>e.kind==='ally-attack')).toHaveLength(3);
    expect(hit.events.find(e=>e.kind==='ally-attack')?.amount).toBe(currentAttack-ENEMIES_BY_ID[s.enemies[0].definitionId].defense);
    s = cast(s);
    expect(s.enemies[0].burn?.damage).toBe(Math.round(currentAttack*.1));
    expect(s.events.find(e=>e.kind==='ally-ability-damage')?.amount).toBe(Math.round(30*currentAttack/attackBefore)-ENEMIES_BY_ID[s.enemies[0].definitionId].defense);
    expect(s.buffResources.abilityAttackGrowth.mage).toBeCloseTo(.6*stacks);
    expect(CHARACTERS_BY_ID).toEqual(base);
    const run = {...createDungeonRun(42,'reset'),runStatus:'reward' as const,currentRoom:'battle' as const,combat:s,activeBuffs:s.runBuffs};
    const next = reduceDungeon(run,{type:'advance'});
    expect(next.combat.buffResources.abilityAttackGrowth).toEqual({});
    expect(next.combat.buffResources.nextNormalAoe).toEqual({});
    expect(next.activeBuffs).toEqual(s.runBuffs);
  });
  it('Mana Surge and Overdrive trigger once per 12 real correct keys; miss/protected miss do not trigger new effects', () => {
    let s = battle([owned('mana-surge'),owned('overdrive'),owned('frostbind'),owned('arcane-burn'),owned('arcane-barrage'),owned('infinite-arcana'),owned('unbroken-focus')]);
    for(let i=0;i<11;i++) s=correct(s);
    expect(s.party[1].abilityCharge).toBe(22);
    const missed = handleCombatTyping(s,getTypingDisplay(s.typing).current==='z'?'q':'z',1);
    expect(missed.buffResources.abilityAttackGrowth.mage).toBeUndefined();
    expect(missed.lastMissProtected).toBe(true);
    s=correct(missed);
    expect(s.events.filter(e=>e.kind==='ally-ability-triggered' && e.actorId==='mage')).toHaveLength(1);
    expect(s.buffResources.abilityAttackGrowth.mage).toBeCloseTo(.3);
    expect(s.enemies[0].pendingFrostDelayMs).toBe(2000);
    expect(s.enemies[0].burn).not.toBeNull();
    expect(s.typing.correctCharacterCount).toBe(12);
  });
  it('Death/Victory on the direct Ability clears all local state, and compact UI shows READY/ARCANA/BURN', () => {
    const s=cast(battle([owned('arcane-barrage'),owned('infinite-arcana'),owned('arcane-burn')]));
    const ui=renderToStaticMarkup(createElement(PartyPanel,{combat:s}));
    expect(ui).toContain('BARRAGE READY');
    expect(ui).toContain('ARCANA +30%');
    expect(renderToStaticMarkup(createElement(EnemyPanel,{combat:s}))).toContain('BURN 5.0s');
    const dead=cast({...s,enemies:s.enemies.map(e=>({...e,currentHp:1}))});
    expect(dead.status).toBe('victory');
    expect(dead.buffResources.nextNormalAoe).toEqual({});
    expect(dead.buffResources.abilityAttackGrowth).toEqual({});
    expect(dead.enemies.every(e=>!e.burn)).toBe(true);
  });
});

describe('Mage acquisition',()=>{
  it('uses existing rarity tables/prices and excludes capped Buffs from every route',()=>{
    const weights=[BUFF_CONFIG.rarityWeights.battle,BUFF_CONFIG.rarityWeights.elite,TREASURE_CONFIG.buffWeights,TREASURE_CONFIG.rareBuffWeights,ALTAR_CONFIG.bloodWeights,ALTAR_CONFIG.goldWeights,EVENT_CONFIG.buffWeights,SHOP_CONFIG.buffWeights];
    for(const id of ['arcane-veil','frostbind','arcane-burn','arcane-barrage','infinite-arcana']) {
      const capped=BUFF_DEFINITIONS.filter(b=>b.id!==id).map(b=>owned(b.id,b.maxStacks));
      for(const table of weights) expect(generateBuffRewards(capped,'custom',42,{weights:table}).choices).toEqual(table[BUFFS_BY_ID[id].rarity]>0?[id]:[]);
      expect(generateShop({...createDungeonRun(42,'shop'),activeBuffs:capped}).shop.items.find(p=>p.type==='buff' && p.buffId===id)?.price).toBe(SHOP_CONFIG.buffPrices[BUFFS_BY_ID[id].rarity]);
      expect(generateBuffRewards([...capped,owned(id,BUFFS_BY_ID[id].maxStacks)],'battle',42).choices).toEqual([]);
    }
  });
});
