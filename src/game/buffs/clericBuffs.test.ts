import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CombatState } from '../../types/game';
import type { RunBuff } from '../../types/buffs';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { createCombatState } from '../combat/createCombatState';
import { startCombat, tickCombat } from '../combat/combatEngine';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import { getTypingDisplay } from '../typing/typingEngine';
import { selectHealingTargets, resolveHealingPulse } from '../combat/healingAbility';
import { recoverPartyMember } from '../combat/partyRecovery';
import { partyTargetWeight, selectRandomPartyTarget } from '../combat/targeting';
import { executeEnemyAbility } from '../combat/enemyAbilityEngine';
import { getCharacterVisualState } from '../combat/characterVisualState';
import { recoverParty } from '../dungeon/roomResolver';
import { applyRunBuffs, canAddBuff } from './runBuffManager';
import { getEffectiveCharacter } from './buffModifiers';
import { getExtraHealing } from './buffEffectHandlers';
import { PartyPanel } from '../../components/PartyPanel';
import { createDungeonRun, reduceDungeon } from '../dungeon/dungeonEngine';
import { generateBuffRewards } from './buffRewards';
import { BUFF_CONFIG } from './buffConfig';
import { SHOP_CONFIG } from '../dungeon/shopConfig';
import { generateShop } from '../dungeon/shopEngine';
import { TREASURE_CONFIG } from '../dungeon/treasureConfig';
import { ALTAR_CONFIG, EVENT_CONFIG } from '../dungeon/encounterConfig';

const owned = (buffId: string, stacks = 1): RunBuff => ({ buffId, stacks });
function battle(buffs: readonly RunBuff[] = []): CombatState {
  const s = startCombat(applyRunBuffs(createCombatState(['crypt-warden']), buffs), 0);
  return { ...s, enemies: s.enemies.map(e => ({ ...e, currentHp: 100000, actionRemainingMs: 1e9 })) };
}
function hp(s: CombatState, values: readonly number[]): CombatState {
  return { ...s, party: s.party.map((p,i) => ({ ...p, currentHp: values[i] })) };
}
function cast(s: CombatState): CombatState {
  const trigger = getEffectiveCharacter(s,'cleric').ability.trigger;
  if(trigger.type!=='correct-characters') throw Error('Expected charged heal');
  const ready = { ...s, events: [], party: s.party.map(p => ({ ...p, abilityCharge: p.definitionId==='cleric'?trigger.threshold-1:p.abilityCharge })) };
  return handleCombatTyping(ready,getTypingDisplay(ready.typing).current,1);
}
const healed = (s: CombatState) => s.events.filter(e => e.kind==='ally-heal');
const support = [owned('divine-momentum'),owned('sacred-protection'),owned('divine-inspiration')];

describe('Cleric definitions and Sacred Veil',()=>{
  it('adds seven definitions, ten Cleric buffs total, with original effects/caps unchanged',()=>{
    expect(BUFF_DEFINITIONS).toHaveLength(60);
    expect(new Set(BUFF_DEFINITIONS.map(b=>b.id)).size).toBe(60);
    expect(BUFF_DEFINITIONS.filter(b=>b.categories.includes('Cleric'))).toHaveLength(10);
    for(const [id,rarity,maxStacks] of [['sacred-veil','common',3],['divine-momentum','uncommon',3],['sacred-protection','rare',3],['divine-inspiration','epic',3],['mass-healing','legendary',1],['resurrection','legendary',1],['twin-miracle','legendary',1]] as const) {
      expect(BUFFS_BY_ID[id]).toMatchObject({rarity,maxStacks,categories:expect.arrayContaining(['Cleric'])});
      expect(canAddBuff([owned(id,maxStacks)],id)).toBe(false);
    }
    expect(BUFFS_BY_ID['healing-prayer']).toMatchObject({rarity:'common',maxStacks:3,effects:[{type:'modifier',stat:'healPower',value:.2,target:'cleric'}]});
    expect(BUFFS_BY_ID['sacred-healing']).toMatchObject({rarity:'uncommon',maxStacks:3,effects:[{type:'heal-extra',value:.05,target:'cleric'}]});
    expect(BUFFS_BY_ID['guardian-blessing']).toMatchObject({rarity:'rare',maxStacks:1,effects:[{type:'heal-shield',value:.25,target:'cleric'}]});
  });
  it.each([1,2,3])('shares weighted targeting with Arcane Veil at stack %s',stacks=>{
    const s=battle([owned('sacred-veil',stacks),owned('arcane-veil',3)]);
    expect(partyTargetWeight(s,'cleric')).toBeCloseTo(1-.2*stacks);
    expect(partyTargetWeight(s,'mage')).toBeCloseTo(.4);
    expect(partyTargetWeight(s,'warrior')).toBe(1);
    const only=hp(s,[0,0,100,0]);
    expect(selectRandomPartyTarget(only).index).toBe(2);
    const ready={...s,party:s.party.map((p,i)=>i?p:{...p,guardCharges:1,statuses:['ability:guard']}),enemies:s.enemies.map(e=>({...e,actionRemainingMs:0,nextActionSkillId:'skill_attack'}))};
    const blocked=tickCombat(ready,1,1);
    expect(blocked.events.some(e=>e.kind==='ally-guard-consumed')).toBe(true);
    expect(blocked.targetRngState).toBe(ready.targetRngState);
    const special={id:'lowest',name:'Lowest',description:'',gaugeCost:0,effects:[{effectType:'damage',targetType:'singleParty',value:1,valueType:'flat'}]} as const;
    expect(executeEnemyAbility(hp(s,[100,100,1,100]),s.enemies[0].instanceId,special).events.find(e=>e.kind==='ally-damaged')?.targetId).toBe('cleric');
  });
});

describe('Heal-target support buffs',()=>{
  it.each([1,2,3])('Momentum grants fixed +10 * %s, even at full HP, and never applies Overdrive to this bonus',stacks=>{
    for(const overdrive of [false,true]) {
      const s=battle([owned('divine-momentum',stacks),owned('guardian-blessing'),...(overdrive?[owned('overdrive')]:[])]);
      const next=cast(s);
      expect(next.party[0].attackCharge).toBe((overdrive?2:1)+10*stacks);
      expect(next.party[1].attackCharge).toBe(overdrive?2:1);
      expect(healed(next)).toHaveLength(0);
      expect(next.buffResources.shields).toEqual({});
    }
  });
  it('does not give target effects to an unrevivable Down member or to Rest/potion/Guard heals',()=>{
    const s=hp(battle(support),[0,100,100,100]);
    const next=cast(s);
    expect(next.party[0].currentHp).toBe(0);
    expect(next.party[0].attackCharge).toBe(0);
    expect(next.buffResources.timedCharacterModifiers.every(e=>e.characterId!=='warrior')).toBe(true);
    expect(resolveHealingPulse(s,'cleric',['warrior'],50,1)).toEqual(s);
    const roomHeal=recoverParty(hp(battle(support),[10,10,10,10]),.2);
    expect(roomHeal.buffResources.timedCharacterModifiers).toEqual([]);
    expect(roomHeal.party.every(p=>p.attackCharge===0)).toBe(true);
  });
  it('resolves a ready normal Attack once after both pulses, preserving overflow and selected target',()=>{
    let s=hp(battle([owned('divine-momentum',2),owned('twin-miracle')]),[10,100,100,100]);
    s={...s,party:s.party.map((p,i)=>i?p:{...p,attackCharge:49})};
    const next=cast(s);
    expect(next.party[0].attackCharge).toBe(0); // 49 + correct 1 + 20 + 20 - 90
    expect(next.events.filter(e=>e.kind==='ally-attack'&&e.actorId==='warrior')).toHaveLength(1);
    expect(next.events.find(e=>e.kind==='ally-attack')?.targetId).toBe(s.targetEnemyId);
    expect(healed(next).map(e=>e.healPulse)).toEqual([1,2]);
  });
  it.each([['sacred-protection','defense'],['divine-inspiration','attack']] as const)('%s is per-character, adds to static/party buffs, refreshes and expires precisely', (id,stat)=>{
    const original=structuredClone(CHARACTERS_BY_ID);
    for(const stacks of [1,2,3]) {
      let s=hp(battle([owned(id,stacks),owned(stat==='attack'?'power-rune':'defense-rune')]),[10,100,100,100]);
      s={...s,buffResources:{...s.buffResources,timedPartyModifiers:{[stat]:{value:.3,remainingMs:100000}}}};
      s=cast(s);
      expect(getEffectiveCharacter(s,'warrior').stats[stat]).toBe(Math.round(original.warrior.stats[stat]*(1+.05+.3+.3*stacks)));
      expect(getEffectiveCharacter(s,'mage').stats[stat]).toBe(Math.round(original.mage.stats[stat]*1.35));
      expect(s.buffResources.timedCharacterModifiers).toHaveLength(1);
      s=tickCombat(s,15000,15000);
      expect(s.buffResources.timedCharacterModifiers[0].remainingMs).toBe(5000);
      // Fix the target back to the same ally for refresh, independent of HP recovered earlier.
      s=cast(hp(s,[10,100,100,100]));
      expect(s.buffResources.timedCharacterModifiers[0]).toMatchObject({value:.3*stacks,remainingMs:20000});
      expect(s.buffResources.timedCharacterModifiers).toHaveLength(1);
      s=tickCombat(s,19999,34999);
      expect(s.buffResources.timedCharacterModifiers[0].remainingMs).toBe(1);
      s=tickCombat(s,1,35000);
      expect(s.buffResources.timedCharacterModifiers).toEqual([]);
      expect(getEffectiveCharacter(s,'warrior').stats[stat]).toBe(Math.round(original.warrior.stats[stat]*1.35));
    }
    expect(CHARACTERS_BY_ID).toEqual(original);
  });
  it('Full HP is a valid timed-buff target, character timers are independent and Infinite Arcana composes additively',()=>{
    let s=battle([owned('mass-healing'),owned('sacred-protection'),owned('divine-inspiration'),owned('arcane-power')]);
    s={...s,buffResources:{...s.buffResources,abilityAttackGrowth:{mage:.6},timedPartyModifiers:{attack:{value:.3,remainingMs:50000}}}};
    s=cast(s);
    expect(healed(s)).toHaveLength(0);
    expect(s.buffResources.timedCharacterModifiers).toHaveLength(8);
    expect(getEffectiveCharacter(s,'mage').stats.attack).toBe(Math.round(CHARACTERS_BY_ID.mage.stats.attack*(1+.15+.6+.3+.3)));
    const html=renderToStaticMarkup(createElement(PartyPanel,{combat:s}));
    expect(html).toContain('DEF +30% 20.0s'); expect(html).toContain('ATK +30% 20.0s');
    const first=tickCombat(s,10000,10000);
    const refreshed=resolveHealingPulse(first,'cleric',['mage'],50,1);
    expect(refreshed.buffResources.timedCharacterModifiers.find(e=>e.characterId==='mage')?.remainingMs).toBe(20000);
    expect(refreshed.buffResources.timedCharacterModifiers.find(e=>e.characterId==='warrior')?.remainingMs).toBe(10000);
  });
});

describe('Legendary Heal target sets and pulses',()=>{
  it('Mass Healing gives full normal heal power to living members and uses effective HP extras/shields per target',()=>{
    const s=hp(battle([owned('mass-healing'),owned('healing-prayer'),owned('sacred-healing'),owned('guardian-blessing'),owned('greater-vitality-rune')]),[10,0,10,10]);
    const next=cast(s);
    expect(next.party[1].currentHp).toBe(0);
    expect(healed(next)).toHaveLength(3);
    for(const i of [0,2,3]) {
      const p=next.party[i];
      expect(p.currentHp).toBe(10+60+getExtraHealing(s,'cleric',p.definitionId));
      expect(next.buffResources.shields[p.definitionId]).toBe(.25);
    }
    expect(next.buffResources.shields.mage).toBeUndefined();
  });
  it('Resurrection prioritizes the first Down ally; without it the lowest living HP ratio wins',()=>{
    const base=hp(battle(),[0,0,100,10]);
    expect(selectHealingTargets(base,'cleric')).toEqual(['martial-artist']);
    const s=applyRunBuffs(base,[owned('resurrection'),owned('healing-prayer'),owned('sacred-healing')]);
    expect(selectHealingTargets(s,'cleric')).toEqual(['warrior']);
    const next=cast(s);
    expect(next.party[0].currentHp).toBe(69);
    expect(next.party[1].currentHp).toBe(0);
    expect(healed(next)[0]).toMatchObject({targetId:'warrior',wasRevived:true,amount:69});
    expect(selectHealingTargets(next,'cleric')).toEqual(['mage']);
    const noDown=hp(next,[100,10,100,100]);
    expect(selectHealingTargets(noDown,'cleric')).toEqual(['mage']);
    expect(recoverPartyMember(base,'warrior',0,true).state.party[0].currentHp).toBe(1);
    expect(recoverPartyMember(base,'warrior',999,true).state.party[0].currentHp).toBe(180);
  });
  it('revival preserves current-Battle gauges and clears Down/Guard visual state using the shared recovery primitive',()=>{
    let s=hp(battle([owned('resurrection')]),[0,100,100,100]);
    s={...s,party:s.party.map((p,i)=>i?p:{...p,attackCharge:12,abilityCharge:2,guardCharges:1,statuses:['ability:guard']})};
    const next=cast(s);
    expect(next.party[0]).toMatchObject({currentHp:50,attackCharge:12,abilityCharge:2,guardCharges:0});
    expect(next.party[0].statuses).not.toContain('ability:guard');
    expect(getCharacterVisualState(getEffectiveCharacter(s,'warrior'),s.party[0])).toBe('down');
    expect(getCharacterVisualState(getEffectiveCharacter(next,'warrior'),next.party[0])).toBe('low_hp');
    expect(recoverParty(s,.3,'warrior',true).party[0]).toMatchObject({attackCharge:12,abilityCharge:2,guardCharges:0});
  });
  it('Twin Miracle freezes one target even when its HP ranking changes after pulse one',()=>{
    const next=cast(hp(battle([owned('twin-miracle')]),[10,20,100,100]));
    expect(healed(next).map(e=>e.targetId)).toEqual(['warrior','warrior']);
    expect(next.party[0].currentHp).toBe(110);
    expect(next.party[1].currentHp).toBe(20);
    expect(next.party[2].abilityCharge).toBe(0);
    expect(next.events.filter(e=>e.kind==='ally-ability-triggered'&&e.actorId==='cleric')).toHaveLength(1);
  });
  it.each([
    [['mass-healing','resurrection'],1,4,4,3],
    [['twin-miracle','resurrection'],2,2,1,1],
    [['mass-healing','twin-miracle'],2,1,1,0],
    [['mass-healing','resurrection','twin-miracle'],2,4,4,3],
  ] as const)('composes %j with %s pulses and %s living members', (ids,pulses,living,targets,revives)=>{
    const next=cast(hp(battle(ids.map(id=>owned(id))),[0,0,10,0]));
    expect(next.party.filter(p=>p.currentHp>0)).toHaveLength(living);
    expect(healed(next)).toHaveLength(targets*pulses);
    const reviveCount=healed(next).filter(e=>e.wasRevived).length;
    expect(reviveCount).toBe(revives);
    expect(next.events.filter(e=>e.kind==='ally-ability-triggered'&&e.actorId==='cleric')).toHaveLength(1);
  });
  it('all three Legendaries apply per-pulse support effects to all revived/living targets without stacking timers or shields',()=>{
    const buffs=[owned('divine-momentum',2),...support.filter(b=>b.buffId!=='divine-momentum'),owned('mass-healing'),owned('resurrection'),owned('twin-miracle'),owned('healing-prayer'),owned('sacred-healing'),owned('guardian-blessing')];
    const s=hp(battle(buffs),[0,0,10,0]);
    const next=cast(s);
    for(const p of next.party) {
      const heal=60+getExtraHealing(s,'cleric',p.definitionId);
      expect(p.currentHp).toBe(Math.min(getEffectiveCharacter(next,p.definitionId).stats.maxHp,(p.definitionId==='cleric'?10:0)+2*heal));
      expect(next.buffResources.shields[p.definitionId]).toBe(.25);
      const initialCharge=p.definitionId==='cleric'?1:0; // Down members do not receive the triggering key's base charge.
      const threshold=getEffectiveCharacter(next,p.definitionId).attackThreshold;
      expect(p.attackCharge).toBe(initialCharge+40-(initialCharge+40>=threshold?threshold:0));
    }
    expect(next.buffResources.timedCharacterModifiers).toHaveLength(8);
    expect(next.buffResources.timedCharacterModifiers.every(e=>e.value===.3&&e.remainingMs===20000)).toBe(true);
    expect(healed(next).filter(e=>e.wasRevived)).toHaveLength(3);
    expect(next.events.filter(e=>e.kind==='ally-ability-triggered'&&e.actorId==='cleric')).toHaveLength(1);
  });
  it('Twin still applies target effects at zero actual heal, while Guardian Blessing only applies after actual healing',()=>{
    const next=cast(battle([...support,owned('twin-miracle'),owned('guardian-blessing')]));
    expect(next.party[0].attackCharge).toBe(21);
    expect(next.buffResources.timedCharacterModifiers).toHaveLength(2);
    expect(next.buffResources.shields).toEqual({});
    expect(healed(next)).toHaveLength(0);
    const capped=cast(hp(battle([owned('twin-miracle'),owned('guardian-blessing')]),[179,120,125,142]));
    expect(healed(capped)).toHaveLength(1);
    expect(capped.buffResources.shields.warrior).toBe(.25);
  });
  it('healing support can win combat and terminal/new Battle states clear personal modifiers while Run Buffs persist',()=>{
    let s=hp(battle(support),[10,100,100,100]);
    s={...s,party:s.party.map((p,i)=>i?p:{...p,attackCharge:89}),enemies:s.enemies.map(e=>({...e,currentHp:1}))};
    const next=cast(s);
    expect(next.status).toBe('victory');
    expect(next.buffResources.timedCharacterModifiers).toEqual([]);
    expect(next.events.filter(e=>e.kind==='victory')).toHaveLength(1);
    const active=cast(hp(battle(support),[10,100,100,100]));
    const run={...createDungeonRun(42,'reset'),combat:active,activeBuffs:active.runBuffs,currentRoom:'battle' as const,runStatus:'reward' as const};
    const fresh=reduceDungeon(run,{type:'advance'});
    expect(fresh.combat.buffResources.timedCharacterModifiers).toEqual([]);
    expect(fresh.activeBuffs).toEqual(active.runBuffs);
    const defeat=tickCombat({...active,party:active.party.map(p=>({...p,currentHp:1})),enemies:active.enemies.map(e=>({...e,pendingSpecial:{abilityId:'warden-ruin',remainingMs:0}}))},1,1);
    expect(defeat.status).toBe('defeat');
    expect(defeat.buffResources.timedCharacterModifiers).toEqual([]);
  });
});

describe('Cleric acquisition',()=>{
  it('joins existing rewards and Shop with rarity limits, prices and caps',()=>{
    for(const id of ['sacred-veil','divine-momentum','sacred-protection','divine-inspiration','mass-healing','resurrection','twin-miracle']) {
      const capped=BUFF_DEFINITIONS.filter(b=>b.id!==id).map(b=>owned(b.id,b.maxStacks));
      for(const weights of [BUFF_CONFIG.rarityWeights.battle,BUFF_CONFIG.rarityWeights.elite,TREASURE_CONFIG.buffWeights,TREASURE_CONFIG.rareBuffWeights,ALTAR_CONFIG.bloodWeights,ALTAR_CONFIG.goldWeights,EVENT_CONFIG.buffWeights,SHOP_CONFIG.buffWeights]) {
        expect(generateBuffRewards(capped,'test',42,{weights}).choices).toEqual(weights[BUFFS_BY_ID[id].rarity]>0?[id]:[]);
      }
      expect(generateShop({...createDungeonRun(42,'shop'),activeBuffs:capped}).shop.items.find(p=>p.type==='buff'&&p.buffId===id)?.price).toBe(SHOP_CONFIG.buffPrices[BUFFS_BY_ID[id].rarity]);
      expect(generateBuffRewards([...capped,owned(id,BUFFS_BY_ID[id].maxStacks)],'battle',42).choices).toEqual([]);
    }
  });
});
