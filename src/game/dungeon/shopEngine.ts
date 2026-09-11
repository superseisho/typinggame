import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { DungeonRunState } from '../../types/dungeon';
import type { CharacterId } from '../../types/game';
import type { ShopItem, ShopState } from '../../types/rooms';
import { generateBuffRewards } from '../buffs/buffRewards';
import { addBuff, applyRunBuffs, canAddBuff } from '../buffs/runBuffManager';
import { appendEvent } from '../combat/combatEvents';
import { randomStep } from './roomGenerator';
import { recoverParty, recoveryTargets } from './roomResolver';
import { RECOVERY_PRODUCTS, SHOP_CONFIG } from './shopConfig';

export function generateShop(run: DungeonRunState, revision = 0): { shop: ShopState; seed: number } {
  let seed = run.rngState;
  const items: ShopItem[] = [];
  const pool = [...RECOVERY_PRODUCTS];
  const id = () => `shop-${run.currentFloor}-${revision}-${items.length}`;
  for (let i = 0; i < SHOP_CONFIG.recoveryCount && pool.length; i++) {
    const random = randomStep(seed); seed = random.seed;
    const product = pool.splice(Math.floor(random.value * pool.length), 1)[0];
    items.push({ id: id(), type: 'recovery', recoveryId: product.id, price: product.price, purchased: false });
  }
  const buffs = generateBuffRewards(run.activeBuffs, 'shop', seed, { weights: SHOP_CONFIG.buffWeights, count: SHOP_CONFIG.itemCount - items.length });
  seed = buffs.seed;
  for (const buffId of buffs.choices) items.push({ id: id(), type: 'buff', buffId, price: SHOP_CONFIG.buffPrices[BUFFS_BY_ID[buffId].rarity], purchased: false });
  // Exhausted Buff inventory: keep useful recovery stock, never sell capped buffs.
  while (items.length < SHOP_CONFIG.itemCount && pool.length) {
    const product = pool.shift()!;
    items.push({ id: id(), type: 'recovery', recoveryId: product.id, price: product.price, purchased: false });
  }
  return { shop: { items, rerollCount: revision }, seed };
}

export function shopItemUnavailable(run: DungeonRunState, item: ShopItem): string | null {
  if (item.purchased) return 'SOLD OUT';
  if (run.gold < item.price) return 'Not enough Gold';
  if (item.type === 'buff') return canAddBuff(run.activeBuffs, item.buffId) ? null : '最大Stack / 取得済み';
  return recoveryTargets(run.combat).length ? null : '回復対象なし';
}

export function purchaseShopItem(run: DungeonRunState, itemId: string, targetId?: CharacterId): DungeonRunState {
  if (!run.shop) return run;
  const item = run.shop.items.find(item => item.id === itemId);
  if (!item || shopItemUnavailable(run, item)) return run;
  let combat = run.combat;
  let activeBuffs = run.activeBuffs;
  let name: string;
  if (item.type === 'buff') {
    activeBuffs = addBuff(activeBuffs, item.buffId);
    const buff = BUFFS_BY_ID[item.buffId]; name = buff.name;
    combat = appendEvent(applyRunBuffs(combat, activeBuffs), 'ally-buff', `PURCHASED · ${name}`, { abilityId: buff.id, soundId: buff.soundId });
  } else {
    const product = RECOVERY_PRODUCTS.find(product => product.id === item.recoveryId);
    if (!product) return run;
    if (product.target === 'single' && (!targetId || !recoveryTargets(combat).some(member => member.definitionId === targetId))) return run;
    combat = recoverParty(combat, product.ratio, product.target === 'single' ? targetId : undefined);
    name = product.name;
  }
  return { ...run, combat, activeBuffs, gold: run.gold - item.price,
    shop: { ...run.shop, items: run.shop.items.map(candidate => candidate.id === item.id ? { ...candidate, purchased: true } : candidate) },
    roomMessage: `PURCHASED · ${name} · −${item.price} Gold` };
}
