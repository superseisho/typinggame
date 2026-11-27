import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { DungeonRunState } from '../../types/dungeon';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';
import { canAddBuff } from '../buffs/runBuffManager';
import { freeRerolls } from '../buffs/freeRerolls';
import { generateBuffRewards } from '../buffs/buffRewards';
import { generateShop } from './shopEngine';
import { SHOP_CONFIG } from './shopConfig';
import { BUFF_CONFIG } from '../buffs/buffConfig';
import { TREASURE_CONFIG } from './treasureConfig';
import { ALTAR_CONFIG, EVENT_CONFIG } from './encounterConfig';
import { drawTreasure } from './treasureEngine';
import { ShopRoom } from '../../components/dungeon/ShopRoom';
import { BuffReward } from '../../components/dungeon/BuffReward';

function base(stacks=3): DungeonRunState {
  const s=createDungeonRun(42,'second-chance');
  return {...s,activeBuffs:stacks?[{buffId:'second-chance',stacks}]:[],gold:1000};
}
function room(s: DungeonRunState,type:'shop'|'treasure'|'altar'|'event') {
  return reduceDungeon({...s,runStatus:'choosing',roomOptions:[{id:'test',type}]},{type:'choose',optionId:'test',now:1});
}
function reward(s=base(),type:'battle'|'elite'|'boss'='battle') {
  return reduceDungeon({...s,currentRoom:type,runStatus:'battle',combat:{...s.combat,status:'victory'}},{type:'tick',deltaMs:50,now:1});
}
const rerollReward=(s:DungeonRunState)=>reduceDungeon(s,{type:'reroll-buff-reward',revision:s.buffRewardReroll?.revision??0});
const rerollShop=(s:DungeonRunState)=>reduceDungeon(s,{type:'reroll-shop',revision:s.shop!.rerollCount});

describe('Second Chance definition and acquisition',()=>{
  it.each([0,1,2,3,4,5])('grants %s free rerolls independently for both destinations',stacks=>{
    for(const target of ['buff-reward','shop'] as const) {
      expect(freeRerolls(base(stacks).activeBuffs,target)).toEqual({max:stacks,remaining:stacks});
      expect(freeRerolls(base(stacks).activeBuffs,target,2).remaining).toBe(Math.max(0,stacks-2));
    }
  });
  it('is Common Global/Utility, caps at five, and joins all supported pools and Shop',()=>{
    expect(BUFFS_BY_ID['second-chance']).toMatchObject({rarity:'common',categories:['Global','Utility'],maxStacks:5,stackable:true});
    expect(canAddBuff([{buffId:'second-chance',stacks:5}],'second-chance')).toBe(false);
    const capped=BUFF_DEFINITIONS.filter(b=>b.id!=='second-chance').map(b=>({buffId:b.id,stacks:b.maxStacks}));
    for(const weights of [BUFF_CONFIG.rarityWeights.battle,BUFF_CONFIG.rarityWeights.elite,TREASURE_CONFIG.buffWeights,EVENT_CONFIG.buffWeights,SHOP_CONFIG.buffWeights]) {
      expect(generateBuffRewards(capped,'test',42,{weights}).choices).toEqual(['second-chance']);
    }
    expect(generateShop({...base(),activeBuffs:capped}).shop.items).toContainEqual(expect.objectContaining({buffId:'second-chance',price:SHOP_CONFIG.buffPrices.common}));
  });
});

describe('Buff reward rerolls',()=>{
  it.each(['battle','elite','boss'] as const)('%s preserves its original weight table, count, caps and RNG without claiming anything',type=>{
    const s=reward({...base(),activeBuffs:[...base().activeBuffs,{buffId:'power-rune',stacks:3}]},type);
    const weights=BUFF_CONFIG.rarityWeights[type==='battle'?'battle':'elite'];
    expect(s.buffRewardReroll?.weights).toEqual(weights);
    const expected=generateBuffRewards(s.activeBuffs,type,s.rngState,{weights,count:BUFF_CONFIG.choices});
    const next=rerollReward(s);
    expect(next.buffOptions).toEqual(expected.choices);
    expect(next.rngState).toBe(expected.seed);
    expect(next.buffOptions).not.toEqual(s.buffOptions);
    expect(next.buffOptions).toHaveLength(3);
    expect(new Set(next.buffOptions).size).toBe(3);
    expect(next.buffOptions).not.toContain('power-rune');
    expect(next.activeBuffs).toEqual(s.activeBuffs);
    expect(next.gold).toBe(s.gold);
    expect(next.clearedRooms).toEqual(s.clearedRooms);
    expect(next.buffRewardReroll).toMatchObject({revision:1,freeRerollsUsed:1});
    expect(reduceDungeon(next,{type:'reroll-buff-reward',revision:0})).toBe(next);
  });
  it('exhausts only this reward, prevents rerolls after selection and restores on the next reward',()=>{
    let s=reward();
    for(let i=0;i<3;i++) s=rerollReward(s);
    expect(rerollReward(s)).toBe(s);
    const claimed=reduceDungeon(s,{type:'choose-buff',buffId:s.buffOptions[0]});
    expect(claimed.runStatus).toBe('buff_acquired');
    expect(rerollReward(claimed)).toBe(claimed);
    const next=reward({...s,currentFloor:2});
    expect(next.buffRewardReroll?.freeRerollsUsed).toBe(0);
    expect(rerollReward(next).buffRewardReroll?.freeRerollsUsed).toBe(1);
  });
  it.each(['buff','rare_buff'] as const)('retains %s Treasure restrictions for every reroll and claims only once',outcome=>{
    let seed=0;while(drawTreasure(seed).outcome!==outcome) seed++;
    let s=room(base(),'treasure');
    s=reduceDungeon({...s,rngState:seed},{type:'open-treasure'});
    const weights=outcome==='rare_buff'?TREASURE_CONFIG.rareBuffWeights:TREASURE_CONFIG.buffWeights;
    expect(s.buffRewardReroll?.weights).toEqual(weights);
    const next=rerollReward(s);
    expect(next.buffOptions).toEqual(generateBuffRewards(s.activeBuffs,'treasure',s.rngState,{weights}).choices);
    if(outcome==='rare_buff') expect(next.buffOptions.every(id=>['rare','epic','legendary'].includes(BUFFS_BY_ID[id].rarity))).toBe(true);
    expect(next.treasure?.resolved).toBe(false);
    const claimed=reduceDungeon(next,{type:'choose-buff',buffId:next.buffOptions[0]});
    expect(claimed.treasure?.resolved).toBe(true);
    expect(claimed.clearedRooms).toHaveLength(1);
  });
  it.each(['blood','gold'])('retains Altar %s restrictions without paying the cost again',choiceId=>{
    const s=reduceDungeon(room(base(),'altar'),{type:'encounter-choice',choiceId,now:1});
    expect(s.runStatus).toBe('buff_reward');
    const next=rerollReward(s);
    const weights=choiceId==='blood'?ALTAR_CONFIG.bloodWeights:ALTAR_CONFIG.goldWeights;
    expect(next.buffRewardReroll?.weights).toEqual(weights);
    expect(next.gold).toBe(s.gold);
    expect(next.combat.party).toEqual(s.combat.party);
    expect(next.encounter).toEqual(s.encounter);
  });
  it('preserves Event choices and pending rewards',()=>{
    const entered=room(base(),'event');
    const traveler={...entered,encounter:{...entered.encounter!,definitionId:'traveler'}};
    const s=reduceDungeon(traveler,{type:'encounter-choice',choiceId:'pay',now:1});
    expect(s.runStatus).toBe('buff_reward');
    expect(s.buffRewardReroll?.weights).toEqual(EVENT_CONFIG.buffWeights);
    const next=rerollReward(s);
    expect(next.gold).toBe(s.gold);
    expect(next.encounter).toEqual(s.encounter);
  });
  it('has no free reroll without the buff',()=>{
    const s=reward(base(0));expect(rerollReward(s)).toBe(s);
  });
});

describe('Shop independent free allowance and paid fallback',()=>{
  it('uses free rerolls at zero Gold then rejects paid rerolls without Gold',()=>{
    let s={...room(base(),'shop'),gold:0};
    const original=s.shop!.items;
    for(let i=1;i<=3;i++) {
      const before=s;
      s=rerollShop(s);
      expect(s.gold).toBe(0);
      expect(s.shop).toMatchObject({freeRerollsUsed:i,rerollCount:i});
      expect(s.shop!.items).toHaveLength(8);
      expect(s.shop!.items.filter(p=>p.type==='recovery')).toHaveLength(2);
      expect(s.shop!.items.filter(p=>p.type==='buff')).toHaveLength(6);
      expect(s.shop!.items.every(p=>!p.purchased)).toBe(true);
      expect(s.rngState).not.toBe(before.rngState);
      expect(reduceDungeon(s,{type:'reroll-shop',revision:i-1})).toBe(s);
    }
    expect(s.shop!.items).not.toEqual(original);
    expect(rerollShop(s)).toBe(s);
    s={...s,gold:100};
    const paid=rerollShop(s);
    expect(paid.gold).toBe(100-SHOP_CONFIG.rerollCost);
    expect(paid.shop).toMatchObject({freeRerollsUsed:3,rerollCount:4});
    expect(paid.activeBuffs).toEqual(s.activeBuffs);
  });
  it('maintains sold-stock semantics and rejects delayed purchases from the previous stock',()=>{
    const s=room(base(),'shop');
    const item=s.shop!.items.find(p=>p.type==='buff')!;
    const bought=reduceDungeon(s,{type:'purchase',productId:item.id});
    const rerolled=rerollShop(bought);
    expect(rerolled.gold).toBe(bought.gold);
    expect(rerolled.shop!.items.every(p=>!p.purchased)).toBe(true);
    expect(reduceDungeon(rerolled,{type:'purchase',productId:item.id})).toBe(rerolled);
  });
  it('keeps reward and Shop usage independent and resets only on new instances',()=>{
    const used=rerollReward(reward());
    const shop=room({...used,currentFloor:2},'shop');
    expect(shop.shop?.freeRerollsUsed).toBe(0);
    const spent=rerollShop(shop);
    expect(spent.buffRewardReroll?.freeRerollsUsed).toBe(1);
    expect(reduceDungeon(spent,{type:'choose',optionId:'test',now:1})).toBe(spent);
    const left=reduceDungeon(spent,{type:'leave-shop'});
    expect(left.buffRewardReroll).toBeNull();
    expect(room(left,'shop').shop?.freeRerollsUsed).toBe(0);
    expect(reward(left).buffRewardReroll?.freeRerollsUsed).toBe(0);
  });
});

describe('Plain Run snapshots and UI',()=>{
  it('preserves used counters through JSON restoration, while legacy counters default safely',()=>{
    for(const s of [rerollShop(room(base(),'shop')),rerollReward(reward())]) {
      const restored: DungeonRunState=JSON.parse(JSON.stringify(s));
      expect(restored).toEqual(s);
      expect(freeRerolls(restored.activeBuffs,'shop',restored.shop?.freeRerollsUsed)).toEqual(freeRerolls(s.activeBuffs,'shop',s.shop?.freeRerollsUsed));
      const next=s.currentRoom==='shop'?rerollShop(restored):rerollReward(restored);
      expect(s.currentRoom==='shop'?next.shop?.freeRerollsUsed:next.buffRewardReroll?.freeRerollsUsed).toBe(2);
    }
    const shop=room(base(),'shop');
    const legacy={...shop,shop:{items:shop.shop!.items,rerollCount:2}};
    expect(rerollShop(legacy).shop?.freeRerollsUsed).toBe(1);
    const oldReward={...reward(),buffRewardReroll:undefined};
    expect(rerollReward(oldReward).buffRewardReroll?.freeRerollsUsed).toBe(1);
  });
  it('shows free balance, disabled exhausted rewards, paid Shop fallback and no button without the buff',()=>{
    const html=(run:DungeonRunState)=>renderToStaticMarkup(createElement(BuffReward,{run,onChoose:()=>{},onReroll:()=>{}}));
    expect(html(reward())).toContain('FREE 3 / 3');
    expect(html(reward(base(0)))).not.toContain('REROLL');
    let s=reward();for(let i=0;i<3;i++)s=rerollReward(s);
    expect(html(s)).toMatch(/disabled=""[^>]*>REROLL · FREE 0/);
    const shop=(run:DungeonRunState)=>renderToStaticMarkup(createElement(ShopRoom,{run,onPurchase:()=>{},onLeave:()=>{},onReroll:()=>{}}));
    const entered=room(base(),'shop');
    expect(shop({...entered,gold:0})).toContain('REROLL · FREE 3 / 3');
    expect(shop({...entered,shop:{...entered.shop!,freeRerollsUsed:3}})).toContain(`REROLL · ${SHOP_CONFIG.rerollCost} Gold`);
  });
  it('restores legacy Altar reward policy from the recorded choice without reapplying its cost',()=>{
    const s=reduceDungeon(room(base(),'altar'),{type:'encounter-choice',choiceId:'blood',now:1});
    const legacy={...s,buffRewardReroll:undefined};
    const next=rerollReward(legacy);
    expect(next.buffRewardReroll).toMatchObject({weights:ALTAR_CONFIG.bloodWeights,freeRerollsUsed:1});
    expect(next.combat.party).toEqual(s.combat.party);
    expect(next.buffOptions.every(id=>['rare','epic','legendary'].includes(BUFFS_BY_ID[id].rarity))).toBe(true);
  });
});
