import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CombatState } from '../../types/game';
import type { RunBuff } from '../../types/buffs';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { createCombatState } from '../combat/createCombatState';
import { resolveReadyAllyAttacks, startCombat, tickCombat } from '../combat/combatEngine';
import { getComboView, getNormalAttackHitCount } from '../combat/fighterCombo';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import { getTypingDisplay } from '../typing/typingEngine';
import { getComboMultiplier, getEffectiveCharacter } from './buffModifiers';
import { applyRunBuffs, canAddBuff } from './runBuffManager';
import { delayEnemyAction } from '../combat/actionDelay';
import { planEnemyAction } from '../combat/enemySkillEngine';
import { randomStep } from '../../utils/random';
import { PartyPanel } from '../../components/PartyPanel';
import { generateBuffRewards } from './buffRewards';
import { BUFF_CONFIG } from './buffConfig';
import { generateShop } from '../dungeon/shopEngine';
import { SHOP_CONFIG } from '../dungeon/shopConfig';
import { TREASURE_CONFIG } from '../dungeon/treasureConfig';
import { ALTAR_CONFIG, EVENT_CONFIG } from '../dungeon/encounterConfig';
import { createDungeonRun } from '../dungeon/dungeonEngine';

const id = 'martial-artist' as const;
const owned = (buffId: string, stacks = 1): RunBuff => ({ buffId, stacks });
function battle(buffs: readonly RunBuff[] = [], count = 0, enemies = ['enemy_guardian', 'enemy_guardian', 'crypt-warden']): CombatState {
  const s = startCombat(applyRunBuffs(createCombatState(enemies), buffs), 0);
  return { ...s, typing: { ...s.typing, currentCombo: count }, enemies: s.enemies.map(e => ({ ...e, currentHp: 100000, actionRemainingMs: 100000, actionDurationMs: 100000 })) };
}
const correct = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current, 1);
const miss = (s: CombatState) => handleCombatTyping(s, getTypingDisplay(s.typing).current === 'z' ? 'q' : 'z', 1);
function attack(s: CombatState) {
  return resolveReadyAllyAttacks({ ...s, events: [], party: s.party.map(p => ({ ...p, attackCharge: p.definitionId === id ? getEffectiveCharacter(s, id).attackThreshold : 0 })) }, 1);
}
const hits = (s: CombatState) => s.events.filter(e => e.kind === 'ally-attack' && e.actorId === id);

describe('Fighter definitions and shared stages', () => {
  it('has exactly eight Fighter buffs, with caps and original effects intact', () => {
    expect(BUFF_DEFINITIONS.filter(b => b.categories.includes('Fighter'))).toHaveLength(8);
    for (const [buffId, rarity, maxStacks] of [['leg-sweep','rare',3],['combo-acceleration','epic',2],['relentless-fists','legendary',2],['limit-break','legendary',3],['combo-resilience','legendary',1]] as const) {
      expect(BUFFS_BY_ID[buffId]).toMatchObject({rarity,maxStacks});
      expect(canAddBuff([owned(buffId,maxStacks)],buffId)).toBe(false);
    }
    expect(BUFFS_BY_ID.focus.effects).toEqual([{type:'modifier',stat:'attack',target:id,value:.15}]);
    expect(BUFFS_BY_ID['endless-combo'].effects).toEqual([{type:'modifier',stat:'comboBonus',target:id,value:.25}]);
    expect(BUFFS_BY_ID['perfect-form'].effects).toEqual([{type:'modifier',stat:'activeAttack',target:id,value:.2}]);
  });
  it.each([0,1,2,3])('unlocks exactly %s additional stages', stacks => {
    const s = battle(stacks ? [owned('limit-break',stacks)] : [], 250);
    expect(getComboView(s,id).maxStage).toBe(3+stacks);
    expect(getComboView(s,id).stage).toBe(3+stacks);
    expect(getComboView(s,id).stages.map(s=>s.threshold)).toEqual([20,40,80,120,160,200].slice(0,3+stacks));
    expect(getComboView(s,id).multiplier).toBe([1.5,1.75,2,2.25][stacks]);
  });
  it.each([0,20,40,80,120,160,200])('derives acceleration, multihit and damage from the same count %s', count => {
    for (const stacks of [1,2]) {
      const s = battle([owned('limit-break',3),owned('combo-acceleration',stacks),owned('relentless-fists',stacks),owned('endless-combo'),owned('perfect-form')],count);
      const combo = getComboView(s,id);
      expect(getEffectiveCharacter(s,id).attackThreshold).toBe(Math.max(5,50-combo.stage*10*stacks));
      expect(getNormalAttackHitCount(s,id)).toBe(combo.stage>=3 ? 1+stacks : 1);
      expect(getComboMultiplier(s,id)).toBeCloseTo(combo.stage ? (1+(combo.multiplier-1)*1.25)*1.2 : 1);
    }
  });
  it('applies percentage ceil before both flat reductions without changing base stats', () => {
    let s = battle([owned('swift-fingers'),owned('combo-acceleration')],40);
    s = {...s,buffResources:{...s.buffResources,attackThresholdReduction:10}};
    expect(getEffectiveCharacter(s,id).attackThreshold).toBe(18);
    expect(CHARACTERS_BY_ID[id].attackThreshold).toBe(50);
    expect(getEffectiveCharacter(battle([owned('lightning-fingers'),owned('combo-acceleration')],40),id).attackThreshold).toBe(25);
  });
});

describe('Combo Resilience isolates Fighter progress from real typing streak', () => {
  it.each([[20,0],[40,20],[110,40],[150,80],[175,120],[230,160]])('drops count %s to the previous stage start %s', (before,after) => {
    const s = battle([owned('limit-break',3),owned('combo-resilience')],before);
    const next = miss(s);
    expect(getComboView(next,id).count).toBe(after);
    expect(next.typing.currentCombo).toBe(0);
    expect(next.typing.missCount).toBe(s.typing.missCount+1);
    expect(next.enemies[0].specialGauge).toBeGreaterThan(s.enemies[0].specialGauge);
    expect(next.party.map(p=>p.attackCharge)).toEqual(s.party.map(p=>p.attackCharge));
    expect(next.party.map(p=>p.abilityCharge)).toEqual(s.party.map(p=>p.abilityCharge));
  });
  it('updates stage, threshold, multiplier and multihit on every consecutive miss', () => {
    let s = battle([owned('limit-break',3),owned('combo-resilience'),owned('combo-acceleration'),owned('relentless-fists',2)],230);
    for (const count of [160,120,80,40,20,0,0]) {
      s = miss(s);
      const view = getComboView(s,id);
      expect(view.count).toBe(count);
      expect(getEffectiveCharacter(s,id).attackThreshold).toBe(Math.max(5,50-view.stage*10));
      expect(getNormalAttackHitCount(s,id)).toBe(view.stage>=3?3:1);
      expect(getComboMultiplier(s,id)).toBe(view.multiplier);
    }
  });
  it('retains ordinary reset without Resilience and prioritizes Unbroken Focus with it', () => {
    expect(getComboView(miss(battle([],100)),id).count).toBe(0);
    const s = battle([owned('limit-break',3),owned('combo-resilience'),owned('unbroken-focus')],200);
    const protectedMiss = miss(s);
    expect(getComboView(protectedMiss,id).count).toBe(200);
    expect(protectedMiss.typing.currentCombo).toBe(200);
    expect(protectedMiss.enemies.map(e=>e.specialGauge)).toEqual(s.enemies.map(e=>e.specialGauge));
    expect(protectedMiss.buffResources.focusRechargeMs[0]).toBe(30000);
    const unprotected = miss(protectedMiss);
    expect(getComboView(unprotected,id).count).toBe(160);
    expect(unprotected.typing.currentCombo).toBe(0);
  });
  it('rebuilds global streak from zero while Fighter rebuilds from its retained stage', () => {
    let s = miss(battle([owned('limit-break',3),owned('combo-resilience'),owned('vital-rhythm'),owned('seal-rhythm')],200));
    for (let i=0;i<40;i++) s=correct(s);
    expect(getComboView(s,id).count).toBe(200);
    expect(s.typing.currentCombo).toBe(40);
    expect(s.typing.correctCharacterCount).toBe(40);
    expect(s.events.some(e=>e.abilityId==='vital-rhythm'||e.abilityId==='seal-rhythm')).toBe(false);
    for (let i=0;i<60;i++) s=correct(s);
    expect(s.typing.currentCombo).toBe(100);
    expect(s.events.some(e=>e.abilityId==='seal-rhythm')).toBe(true);
  });
  it('keeps Curse penalties but never adds Correct charge on a Resilience miss', () => {
    const s=battle([owned('combo-resilience')],110);
    const cursed={...s,typingCurseBonus:10,typingCurseRemainingMs:10000};
    const next=miss(cursed);
    expect(next.enemies[0].specialGauge-miss(s).enemies[0].specialGauge).toBe(10);
    expect(next.typingCurseRemainingMs).toBe(10000);
    expect(next.typing.correctCharacterCount).toBe(s.typing.correctCharacterCount);
    expect(getComboView(next,id).count).toBe(40);
  });
  it('Overdrive doubles only base charge after an independent Fighter count is established', () => {
    let s=miss(battle([owned('combo-resilience'),owned('overdrive')],80));
    s={...s,party:s.party.map(p=>({...p,attackCharge:0,abilityCharge:0}))};
    const next=correct(s);
    expect(getComboView(next,id).count).toBe(41);
    expect(next.typing.currentCombo).toBe(1);
    expect(next.typing.correctCharacterCount).toBe(1);
    expect(next.party.find(p=>p.definitionId===id)?.attackCharge).toBe(2);
  });
});

describe('Fighter acquisition', () => {
  it('uses all existing reward routes and Shop prices, excluding capped definitions', () => {
    const weights=[BUFF_CONFIG.rarityWeights.battle,BUFF_CONFIG.rarityWeights.elite,TREASURE_CONFIG.buffWeights,TREASURE_CONFIG.rareBuffWeights,ALTAR_CONFIG.bloodWeights,ALTAR_CONFIG.goldWeights,EVENT_CONFIG.buffWeights,SHOP_CONFIG.buffWeights];
    for (const buffId of ['leg-sweep','combo-acceleration','relentless-fists','limit-break','combo-resilience']) {
      const capped=BUFF_DEFINITIONS.filter(b=>b.id!==buffId).map(b=>owned(b.id,b.maxStacks));
      for (const table of weights) expect(generateBuffRewards(capped,'custom',42,{weights:table}).choices).toEqual(table[BUFFS_BY_ID[buffId].rarity]>0?[buffId]:[]);
      expect(generateShop({...createDungeonRun(42,'shop'),activeBuffs:capped}).shop.items.find(p=>p.type==='buff'&&p.buffId===buffId)?.price).toBe(SHOP_CONFIG.buffPrices[BUFFS_BY_ID[buffId].rarity]);
      expect(generateBuffRewards([...capped,owned(buffId,BUFFS_BY_ID[buffId].maxStacks)],'battle',42).choices).toEqual([]);
    }
  });
});

describe('normal attack multihit, actual receivers and ACTION delay', () => {
  it.each([1,2,3])('Leg Sweep %s stack delays only the actual living receiver without changing NEXT or Special', stacks => {
    const s = battle([owned('leg-sweep',stacks)]);
    const next = attack(s);
    expect(next.enemies[0].actionRemainingMs).toBe(s.enemies[0].actionRemainingMs+stacks*2000);
    expect(next.enemies[0].actionDurationMs).toBe(s.enemies[0].actionDurationMs+stacks*2000);
    expect(next.enemies[1].actionRemainingMs).toBe(s.enemies[1].actionRemainingMs);
    expect(next.enemies[0].nextActionSkillId).toBe(s.enemies[0].nextActionSkillId);
    expect(next.enemies[0].specialGauge).toBe(s.enemies[0].specialGauge);
    expect(ENEMIES_BY_ID.enemy_guardian.skills[0].actionTimeMs).toBe(5000);
  });
  it('uses all three full-power hits, one Gauge cost, and uncapped delay alongside capped Frost', () => {
    let s = battle([owned('relentless-fists',2),owned('leg-sweep',3),owned('focus')],80);
    s = delayEnemyAction(s,s.enemies[0].instanceId,20000,10000);
    const next = attack(s);
    expect(hits(next)).toHaveLength(3);
    const power=Math.round(getEffectiveCharacter(s,id).stats.attack*1.5);
    expect(hits(next).map(e=>e.amount)).toEqual(Array(3).fill(power-ENEMIES_BY_ID.enemy_guardian.defense));
    expect(next.party.find(p=>p.definitionId===id)?.attackCharge).toBe(0);
    expect(next.typing).toEqual(s.typing);
    expect(next.enemies[0].actionRemainingMs).toBe(128000);
    expect(next.enemies[0].pendingFrostDelayMs).toBe(10000);
    const elapsed=tickCombat(next,2000,2001);
    expect(elapsed.enemies[0].pendingFrostDelayMs).toBe(8000);
    expect(delayEnemyAction(elapsed,elapsed.enemies[0].instanceId,4000,10000).enemies[0].pendingFrostDelayMs).toBe(10000);
    expect(planEnemyAction(next,0).enemies[0].pendingFrostDelayMs).toBe(0);
  });
  it('redirects each hit through Cover and then returns to selected target when Cover expires', () => {
    let s = battle([owned('relentless-fists',2),owned('leg-sweep')],80);
    s={...s,targetEnemyId:s.enemies[1].instanceId,enemies:s.enemies.map((e,i)=>i===0?{...e,cover:{remainingHits:1}}:e)};
    const next=attack(s);
    expect(hits(next).map(e=>e.targetId)).toEqual([s.enemies[0].instanceId,s.enemies[1].instanceId,s.enemies[1].instanceId]);
    expect(next.enemies.map(e=>e.actionRemainingMs)).toEqual([102000,104000,100000]);
    expect(next.targetEnemyId).toBe(s.targetEnemyId);
  });
  it('rolls Echo once per action and repeats that AoE mode for every hit including Boss', () => {
    const s={...battle([owned('relentless-fists',2),owned('echoing-assault'),owned('leg-sweep')],80),buffRngState:0};
    expect(randomStep(0).value).toBeLessThan(.3);
    const next=attack(s);
    expect(hits(next)).toHaveLength(9);
    expect(next.buffRngState).toBe(randomStep(0).seed);
    expect(next.enemies.map(e=>e.actionRemainingMs)).toEqual([106000,106000,106000]);
    let seed=0; while(randomStep(seed).value<.3) seed++;
    const failed=attack({...s,buffRngState:seed});
    expect(hits(failed)).toHaveLength(3);
    expect(failed.enemies[1].currentHp).toBe(s.enemies[1].currentHp);
  });
  it('rolls Reaper on each nonboss hit and never rolls it against Boss', () => {
    const s={...battle([owned('relentless-fists',2),owned('reapers-blessing')],80),buffRngState:0};
    const next=attack(s);
    let seed=s.buffRngState; for(let i=0;i<3;i++) seed=randomStep(seed).seed;
    expect(next.buffRngState).toBe(seed);
    const boss=attack({...s,targetEnemyId:s.enemies[2].instanceId});
    expect(boss.buffRngState).toBe(s.buffRngState);
    expect(hits(boss)).toHaveLength(3);
  });
  it('auto retargets after each kill, stops at Victory and clears battle combo/delay', () => {
    const s=battle([owned('relentless-fists',2),owned('leg-sweep'),owned('combo-resilience')],80);
    const next=attack({...s,enemies:s.enemies.map(e=>({...e,currentHp:1}))});
    expect(hits(next).map(e=>e.targetId)).toEqual(s.enemies.map(e=>e.instanceId));
    expect(next.status).toBe('victory');
    expect(next.events.filter(e=>e.kind==='victory')).toHaveLength(1);
    expect(getComboView(next,id).count).toBe(0);
    expect(next.enemies.every(e=>e.actionRemainingMs===0)).toBe(true);
    const fresh=startCombat(applyRunBuffs(createCombatState(),next.runBuffs),0);
    expect(getComboView(fresh,id).count).toBe(0);
    expect(fresh.runBuffs).toEqual(next.runBuffs);
  });
  it('stops unused hits immediately after the last target dies', () => {
    const s=battle([owned('relentless-fists',2),owned('leg-sweep')],80,['crypt-slime']);
    const next=attack({...s,enemies:s.enemies.map(e=>({...e,currentHp:1}))});
    expect(next.status).toBe('victory');
    expect(hits(next)).toHaveLength(1);
    expect(next.enemies[0].actionRemainingMs).toBe(0);
    expect(next.events.some(e=>e.abilityId==='leg-sweep')).toBe(false);
  });
  it('renders the same extended stage and hit count used by combat', () => {
    const s=battle([owned('limit-break',3),owned('relentless-fists',2)],200);
    const html=renderToStaticMarkup(createElement(PartyPanel,{combat:s}));
    expect(html).toContain('S6/6');
    expect(html).toContain('3 HIT');
  });
});
