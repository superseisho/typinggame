import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUFF_DEFINITIONS, BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ShopRoom } from '../../components/dungeon/ShopRoom';
import type { DungeonRunState } from '../../types/dungeon';
import type { ShopItem, TreasureOutcome } from '../../types/rooms';
import { getTypingDisplay } from '../typing/typingEngine';
import { applyRunBuffs } from '../buffs/runBuffManager';
import { generateBuffRewards } from '../buffs/buffRewards';
import { createDungeonRun, reduceDungeon } from './dungeonEngine';
import { generateShop, shopItemUnavailable } from './shopEngine';
import { getEffectiveCharacter } from '../buffs/buffModifiers';
import { recoveryTargets } from './roomResolver';
import { SHOP_CONFIG, RECOVERY_PRODUCTS } from './shopConfig';
import { TREASURE_CONFIG } from './treasureConfig';
import { drawTreasure } from './treasureEngine';

function room(type: 'shop' | 'treasure', initial = createDungeonRun(42, 'test')) {
  return reduceDungeon({ ...initial, runStatus: 'choosing', roomOptions: [{ id: 'test', type }] }, { type: 'choose', optionId: 'test', now: 1 });
}
function wounded(run: DungeonRunState): DungeonRunState {
  return { ...run, gold: 1000, combat: { ...run.combat, party: run.combat.party.map((member, i) => ({ ...member, currentHp: i === 1 ? 0 : 30 })) } };
}
function treasure(outcome: TreasureOutcome, run = wounded(room('treasure'))) {
  let seed = 0;
  while (drawTreasure(Math.imul(seed, 2654435761) >>> 0).outcome !== outcome) seed++;
  return reduceDungeon({ ...run, rngState: Math.imul(seed, 2654435761) >>> 0 }, { type: 'open-treasure' });
}
function withProduct(id: string) {
  const run = wounded(room('shop'));
  const product = RECOVERY_PRODUCTS.find(product => product.id === id)!;
  const item: ShopItem = { id: 'test-stock', type: 'recovery', recoveryId: id, price: product.price, purchased: false };
  return { ...run, shop: { items: [item], rerollCount: 0 } };
}

describe('Shop', () => {
  it('generates eight deterministic fixed items, two distinct recovery then six distinct buffs', () => {
    for (let seed = 0; seed < 100; seed++) {
      const run = room('shop', createDungeonRun(seed, 'test'));
      expect(run.shop!.items).toHaveLength(8);
      expect(run.shop!.items.filter(item => item.type === 'recovery')).toHaveLength(2);
      expect(run.shop!.items.slice(0,2).every(item=>item.type==='recovery')).toBe(true);
      expect(new Set(run.shop!.items.map(item=>item.id)).size).toBe(8);
      expect(new Set(run.shop!.items.filter(item=>item.type==='recovery').map(item=>item.recoveryId)).size).toBe(2);
      const buffs = run.shop!.items.filter(item => item.type === 'buff');
      expect(buffs).toHaveLength(6);
      expect(new Set(buffs.map(item => item.buffId)).size).toBe(6);
      for (const item of buffs) expect(item.price).toBe(SHOP_CONFIG.buffPrices[BUFFS_BY_ID[item.buffId].rarity]);
      expect(generateShop(run)).toEqual(generateShop(run));
      expect(reduceDungeon(run, { type: 'tick', deltaMs: 50, now: 10 })).toBe(run);
    }
  });
  it('can sell all five rarities; excludes Unique and capped buffs', () => {
    const rarities = new Set<string>();
    for (let seed = 0; seed < 500; seed++) {
      const run = createDungeonRun(Math.imul(seed, 2654435761), 'test');
      for (const item of generateShop({ ...run, activeBuffs: [{ buffId: 'power-rune', stacks: 3 }, { buffId: 'guardian-oath', stacks: 1 }] }).shop.items) {
        if (item.type !== 'buff') continue;
        expect(item.buffId).not.toBe('power-rune'); expect(item.buffId).not.toBe('guardian-oath');
        rarities.add(BUFFS_BY_ID[item.buffId].rarity);
      }
    }
    expect(rarities.size).toBe(5);
  });
  it.each(['small-potion', 'large-potion'])('%s requires a living wounded target and buys once', id => {
    const run = withProduct(id);
    const action = { type: 'purchase', productId: 'test-stock', targetId: 'warrior' } as const;
    expect(reduceDungeon(run, { ...action, targetId: 'mage' })).toBe(run);
    expect(reduceDungeon(run, { type: 'purchase', productId: 'test-stock' })).toBe(run);
    const bought = reduceDungeon(run, action);
    const product = RECOVERY_PRODUCTS.find(product => product.id === id)!;
    expect(bought.gold).toBe(1000 - product.price);
    expect(bought.combat.party[0].currentHp).toBe(30 + Math.ceil(180 * product.ratio));
    expect(bought.combat.party[1].currentHp).toBe(0);
    expect(bought.shop!.items[0].purchased).toBe(true);
    expect(bought.runStatus).toBe('room');
    expect(reduceDungeon(bought, action)).toBe(bought);
  });
  it('Party Potion heals all living wounded allies, never revives, uses boosted Max HP', () => {
    const run = withProduct('party-potion');
    const buffed = { ...run, combat: applyRunBuffs(run.combat, [{ buffId: 'vitality-rune', stacks: 1 }]) };
    const bought = reduceDungeon(buffed, { type: 'purchase', productId: 'test-stock' });
    expect(bought.combat.party[0].currentHp).toBe(39 + Math.ceil(189 * .2));
    expect(bought.combat.party[1].currentHp).toBe(0);
    expect(bought.combat.events.filter(event => event.kind === 'ally-heal')).toHaveLength(3);
  });
  it('buys buffs through shared manager, enforces Gold and permits multiple purchases', () => {
    const run = { ...wounded(room('shop')), gold: 3000 };
    const buffs = run.shop!.items.filter(item => item.type === 'buff');
    let bought = run;
    for (const item of buffs) {
      const poor = { ...bought, gold: item.price - 1 };
      expect(reduceDungeon(poor, { type: 'purchase', productId: item.id })).toBe(poor);
      bought = reduceDungeon(bought, { type: 'purchase', productId: item.id });
      expect(bought.activeBuffs.some(buff => buff.buffId === item.buffId)).toBe(true);
      expect(bought.combat.runBuffs).toEqual(bought.activeBuffs);
    }
    expect(buffs).toHaveLength(6);
    expect(bought.gold).toBe(3000 - buffs.reduce((sum, item) => sum + item.price, 0));
    expect(bought.currentFloor).toBe(1);
  });
  it('rerolls once per revision, charges Gold, rejects stale purchases and leaves freely', () => {
    const run = wounded(room('shop'));
    const action = { type: 'reroll-shop', revision: 0 } as const;
    const rerolled = reduceDungeon(run, action);
    expect(rerolled.gold).toBe(960); expect(rerolled.shop!.rerollCount).toBe(1);
    expect(rerolled.shop!.items).toHaveLength(8);
    expect(rerolled.shop!.items.filter(item=>item.type==='recovery')).toHaveLength(2);
    expect(rerolled.shop!.items.filter(item=>item.type==='buff')).toHaveLength(6);
    expect(rerolled.rngState).not.toBe(run.rngState);
    expect(rerolled.shop!.items.every(item => !item.purchased)).toBe(true);
    expect(reduceDungeon(rerolled, action)).toBe(rerolled);
    expect(reduceDungeon(rerolled, { type: 'purchase', productId: run.shop!.items[0].id, targetId: 'warrior' })).toBe(rerolled);
    const poor = { ...run, gold: 39 };
    expect(reduceDungeon(poor, action)).toBe(poor);
    const left = reduceDungeon(poor, { type: 'leave-shop' });
    expect(left.currentFloor).toBe(2); expect(left.clearedRooms).toHaveLength(1);
    expect(reduceDungeon(left, { type: 'leave-shop' }, 1)).toBe(left);
  });
  it('distinguishes sold stock from unaffordable stock and disables reroll', () => {
    const base = withProduct('small-potion');
    const run = { ...base, gold: 0, shop: { ...base.shop!, items: [...base.shop!.items, { ...base.shop!.items[0], id: 'sold', purchased: true }] } };
    const html = renderToStaticMarkup(createElement(ShopRoom, { run, onPurchase: () => {}, onLeave: () => {}, onReroll: () => {} }));
    expect(html).toContain('SOLD OUT'); expect(html).toContain('Not enough Gold');
    expect(html).toContain('is-unaffordable'); expect(html).toContain('is-sold'); expect(html).toContain('LEAVE SHOP');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it('keeps current rarity weights, prices, reroll price and cooldown unchanged', () => {
    expect(SHOP_CONFIG.buffWeights).toEqual({common:40,uncommon:30,rare:19,epic:8,legendary:3});
    expect(SHOP_CONFIG.buffPrices).toEqual({common:100,uncommon:140,rare:200,epic:280,legendary:400});
    expect(SHOP_CONFIG.rerollCost).toBe(40);
    expect(SHOP_CONFIG.rerollUiCooldownMs).toBe(350);
  });
  it('uniformly draws two products without replacement from the four-product pool, including Revival on reroll', () => {
    expect(RECOVERY_PRODUCTS).toHaveLength(4);
    const seen=new Set<string>();
    for(let seed=0;seed<40;seed++) {
      const initial=room('shop',createDungeonRun(Math.imul(seed,2654435761),'test'));
      for(const run of [initial,reduceDungeon({...initial,gold:1000},{type:'reroll-shop',revision:0})]) {
        const stock=run.shop!.items.filter(item=>item.type==='recovery');
        expect(stock).toHaveLength(2);
        expect(stock[0].recoveryId).not.toBe(stock[1].recoveryId);
        stock.forEach(item=>seen.add(item.recoveryId));
      }
    }
    expect([...seen].sort()).toEqual(RECOVERY_PRODUCTS.map(p=>p.id).sort());
    expect(RECOVERY_PRODUCTS.find(p=>p.effect==='revive')).toMatchObject({id:'revival-potion',price:180,ratio:.3,target:'single'});
  });
  it('Revival Potion accepts only a selected Down ally and uses boosted Max HP through shared revival', () => {
    const base=withProduct('revival-potion');
    const run={...base,combat:applyRunBuffs(base.combat,[{buffId:'vitality-rune',stacks:3}])};
    expect(recoveryTargets(run.combat,true).map(p=>p.definitionId)).toEqual(['mage']);
    expect(reduceDungeon(run,{type:'purchase',productId:'test-stock'})).toBe(run);
    expect(reduceDungeon(run,{type:'purchase',productId:'test-stock',targetId:'warrior'})).toBe(run);
    const bought=reduceDungeon(run,{type:'purchase',productId:'test-stock',targetId:'mage'});
    expect(bought.combat.party[1].currentHp).toBe(Math.ceil(getEffectiveCharacter(run.combat,'mage').stats.maxHp*.3));
    expect(bought.combat.party.filter(p=>p.definitionId!=='mage')).toEqual(run.combat.party.filter(p=>p.definitionId!=='mage'));
    expect(bought.combat.party[1].attackCharge).toBe(run.combat.party[1].attackCharge);
    expect(bought.combat.party[1].abilityCharge).toBe(run.combat.party[1].abilityCharge);
    expect(bought.gold).toBe(820);
    expect(bought.shop!.items[0].purchased).toBe(true);
    expect(bought.combat.events).toContainEqual(expect.objectContaining({targetId:'mage',wasRevived:true,soundId:'ally_heal',amount:bought.combat.party[1].currentHp}));
    expect(shopItemUnavailable(bought,bought.shop!.items[0])).toBe('SOLD OUT');
    expect(reduceDungeon(bought,{type:'purchase',productId:'test-stock',targetId:'mage'})).toBe(bought);
  });
  it('rejects Revival without Gold or Down targets, with no purchase mutation', () => {
    const run=withProduct('revival-potion');
    const poor={...run,gold:179};
    expect(reduceDungeon(poor,{type:'purchase',productId:'test-stock',targetId:'mage'})).toBe(poor);
    const alive={...run,combat:{...run.combat,party:run.combat.party.map(p=>({...p,currentHp:1}))}};
    expect(shopItemUnavailable(alive,alive.shop!.items[0])).toBe('蘇生対象なし');
    expect(reduceDungeon(alive,{type:'purchase',productId:'test-stock',targetId:'mage'})).toBe(alive);
    const html=renderToStaticMarkup(createElement(ShopRoom,{run:alive,onPurchase:()=>{},onLeave:()=>{},onReroll:()=>{}}));
    expect(html).toContain('蘇生対象なし');
    expect(html).toContain('最大HPの30%で復活');
    expect(html).not.toContain('蘇生はRestで');
  });
  it('keeps unique recovery fallback when fewer than six Buffs remain and never invents capped Buffs', () => {
    const base=createDungeonRun(42,'test');
    for(const available of [0,1,5]) {
      const activeBuffs=BUFF_DEFINITIONS.slice(available).map(b=>({buffId:b.id,stacks:b.maxStacks}));
      const {shop}=generateShop({...base,activeBuffs});
      const buffs=shop.items.filter(item=>item.type==='buff');
      const recovery=shop.items.filter(item=>item.type==='recovery');
      expect(buffs).toHaveLength(available);
      expect(recovery).toHaveLength(Math.min(4,8-available));
      expect(new Set(recovery.map(item=>item.recoveryId)).size).toBe(recovery.length);
      expect(buffs.every(item=>BUFF_DEFINITIONS.slice(0,available).some(b=>b.id===item.buffId))).toBe(true);
    }
  });
  it('preserves eight-item stock, purchases and RNG through a plain-state serialization round trip', () => {
    const run={...room('shop'),gold:3000};
    const item=run.shop!.items.find(item=>item.type==='buff')!;
    const bought=reduceDungeon(run,{type:'purchase',productId:item.id});
    const restored: DungeonRunState=JSON.parse(JSON.stringify(bought));
    expect(restored.shop).toEqual(bought.shop);
    expect(restored.gold).toBe(bought.gold);
    expect(reduceDungeon(restored,{type:'purchase',productId:item.id})).toBe(restored);
    expect(reduceDungeon(restored,{type:'reroll-shop',revision:0})).toEqual(reduceDungeon(bought,{type:'reroll-shop',revision:0}));
  });
});

describe('Treasure', () => {
  it('waits for OPEN and samples all five outcomes with configured weights', () => {
    const run = room('treasure');
    expect(run.runStatus).toBe('room'); expect(run.treasure!.opened).toBe(false); expect(run.gold).toBe(0);
    expect(reduceDungeon(run, { type: 'advance' })).toBe(run);
    const counts: Partial<Record<TreasureOutcome, number>> = {};
    for (let i = 0; i < 10000; i++) {
      const result = drawTreasure(Math.imul(i, 2654435761) >>> 0);
      counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
    }
    for (const [outcome, weight] of Object.entries(TREASURE_CONFIG.outcomeWeights)) expect(Math.abs(counts[outcome as TreasureOutcome]! / 100 - weight)).toBeLessThan(1);
  });
  it.each(['buff', 'rare_buff'] as const)('%s reuses the reward flow, completes only after choosing once', outcome => {
    const run = treasure(outcome);
    expect(run.runStatus).toBe('buff_reward'); expect(run.buffOptions).toHaveLength(3);
    expect(run.clearedRooms).toHaveLength(0);
    if (outcome === 'rare_buff') for (const id of run.buffOptions) expect(['rare', 'epic', 'legendary']).toContain(BUFFS_BY_ID[id].rarity);
    expect(reduceDungeon(run, { type: 'open-treasure' })).toBe(run);
    expect(reduceDungeon(run, { type: 'advance' })).toBe(run);
    const picked = reduceDungeon(run, { type: 'choose-buff', buffId: run.buffOptions[0] });
    expect(picked.activeBuffs).toHaveLength(1); expect(picked.gold).toBe(run.gold); expect(picked.treasure!.resolved).toBe(true);
    expect(picked.clearedRooms).toHaveLength(1);
    expect(reduceDungeon(picked, { type: 'choose-buff', buffId: run.buffOptions[0] })).toBe(picked);
    const next = reduceDungeon(picked, { type: 'finish-buff' });
    expect(next.currentFloor).toBe(2); expect(next.treasure).toBeNull();
  });
  it('Rare Treasure never falls back to common tiers, even if all high tiers are capped', () => {
    const capped = BUFF_DEFINITIONS.filter(buff => ['rare', 'epic', 'legendary'].includes(buff.rarity)).map(buff => ({ buffId: buff.id, stacks: buff.maxStacks }));
    expect(generateBuffRewards(capped, 'treasure', 2, { weights: TREASURE_CONFIG.rareBuffWeights }).choices).toEqual([]);
    const run = treasure('rare_buff', { ...room('treasure'), activeBuffs: capped });
    expect(run.runStatus).toBe('reward'); expect(run.gold).toBe(60); expect(run.buffOptions).toEqual([]);
  });
  it('Gold pays 150–250 exactly once, then waits for confirmation', () => {
    const run = treasure('gold');
    expect(run.gold - 1000).toBeGreaterThanOrEqual(150); expect(run.gold - 1000).toBeLessThanOrEqual(250);
    expect(run.goldEarned).toBe(run.gold - 1000); expect(run.runStatus).toBe('reward');
    expect(reduceDungeon(run, { type: 'open-treasure' })).toBe(run);
    const next = reduceDungeon(run, { type: 'advance' });
    expect(next.currentFloor).toBe(2); expect(reduceDungeon(next, { type: 'advance' }, 1)).toBe(next);
  });
  it('Party Heal uses actual healing, does not revive, caps at maximum', () => {
    const run = treasure('party_heal');
    expect(run.combat.party.map(member => member.currentHp)).toEqual([84, 0, 68, 30 + Math.ceil(CHARACTERS_BY_ID['martial-artist'].stats.maxHp * .3)]);
    expect(run.combat.events.filter(event => event.kind === 'ally-heal')).toHaveLength(3);
    expect(reduceDungeon(run, { type: 'open-treasure' })).toBe(run);
    expect(treasure('party_heal', room('treasure')).combat.events.some(event => event.kind === 'ally-heal')).toBe(false);
  });
  it('Trap preserves Treasure identity, HP and Buffs, then awards only small Gold on victory', () => {
    const initial = wounded(room('treasure'));
    const activeBuffs = [{ buffId: 'power-rune', stacks: 2 }];
    const source = { ...initial, activeBuffs, combat: applyRunBuffs(initial.combat, activeBuffs) };
    let run = treasure('trap_battle', source);
    expect(run.currentRoom).toBe('treasure'); expect(run.combatSource).toBe('treasure_trap'); expect(run.runStatus).toBe('announcement');
    expect(run.combat.party.map(member => member.currentHp)).toEqual(source.combat.party.map(member => member.currentHp));
    expect(run.combat.runBuffs).toEqual(activeBuffs);
    expect(reduceDungeon(run, { type: 'open-treasure' })).toBe(run);
    run = reduceDungeon(run, { type: 'enter-battle', now: 10 });
    for (let i = 0; i < 1000 && run.runStatus === 'battle'; i++) run = reduceDungeon(run, { type: 'key', key: getTypingDisplay(run.combat.typing).current, now: 20 + i });
    expect(run.runStatus).toBe('reward'); expect(run.buffOptions).toEqual([]); expect(run.treasure!.resolved).toBe(true);
    expect(run.activeBuffs).toEqual(activeBuffs);
    expect(run.gold - 1000).toBeGreaterThanOrEqual(10); expect(run.gold - 1000).toBeLessThanOrEqual(25);
    expect(run.clearedRooms[0].roomType).toBe('treasure'); expect(run.clearedRooms).toHaveLength(1);
    expect(reduceDungeon(run, { type: 'tick', deltaMs: 50, now: 9999 })).toBe(run);
    expect(reduceDungeon(run, { type: 'advance' }).currentFloor).toBe(2);
  });
  it('Trap defeat is Game Over, never grants treasure or battle rewards', () => {
    let run = treasure('trap_battle');
    run = reduceDungeon(run, { type: 'enter-battle', now: 10 });
    run = { ...run, combat: { ...run.combat, party: run.combat.party.map((member, i) => ({ ...member, currentHp: i ? 0 : 1 })), enemies: run.combat.enemies.map(enemy => ({ ...enemy, actionRemainingMs: 0 })) } };
    run = reduceDungeon(run, { type: 'tick', deltaMs: 50, now: 100 });
    expect(run.runStatus).toBe('game_over'); expect(run.gold).toBe(1000); expect(run.buffOptions).toEqual([]);
    expect(run.clearedRooms[0]).toMatchObject({ roomType: 'treasure', result: 'failed', goldReward: 0 });
  });
});
