import { useEffect, useState } from 'react';
import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { RECOVERY_PRODUCTS, SHOP_CONFIG } from '../../game/dungeon/shopConfig';
import { shopItemUnavailable } from '../../game/dungeon/shopEngine';
import { recoveryTargets } from '../../game/dungeon/roomResolver';
import type { CharacterId } from '../../types/game';
import type { DungeonRunState } from '../../types/dungeon';
import { RecoveryTargetPicker } from './RecoveryTargetPicker';
import { freeRerolls } from '../../game/buffs/freeRerolls';

export function ShopRoom({ run, onPurchase, onLeave, onReroll }: {
  readonly run: DungeonRunState;
  readonly onPurchase: (productId: string, targetId?: CharacterId) => void;
  readonly onLeave: () => void;
  readonly onReroll: (revision: number) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [rerollPending, setRerollPending] = useState(false);
  useEffect(() => {
    if (!rerollPending) return;
    const timer = window.setTimeout(() => setRerollPending(false), SHOP_CONFIG.rerollUiCooldownMs);
    return () => window.clearTimeout(timer);
  }, [rerollPending]);
  const shop = run.shop;
  if (!shop) return null;
  const allowance = freeRerolls(run.activeBuffs, 'shop', shop.freeRerollsUsed);
  const rerollCost = allowance.remaining > 0 ? 0 : SHOP_CONFIG.rerollCost;
  const selectedItem = shop.items.find(item => item.id === selected);
  const selectedProduct = selectedItem?.type === 'recovery' ? RECOVERY_PRODUCTS.find(product => product.id === selectedItem.recoveryId) : undefined;
  return <section className="dungeon-room shop-room" aria-label="Shop">
    <div className="dungeon-heading"><span className="eyebrow">CHOOSE WHAT YOU NEED</span><h1>Shop</h1>
      <p>回復・蘇生と祝福をGoldで購入。購入後も店に残れます。 <strong>{run.gold} GOLD</strong></p></div>
    {selected ? <RecoveryTargetPicker key={selected} combat={run.combat} targets={recoveryTargets(run.combat, selectedProduct?.effect === 'revive')}
      onCancel={() => setSelected(null)} onChoose={id => { onPurchase(selected, id); setSelected(null); }} /> : null}
    {!selected ? <div className="room-grid shop-stock">{shop.items.map(item => {
      const buff = item.type === 'buff' ? BUFFS_BY_ID[item.buffId] : null;
      const product = item.type === 'recovery' ? RECOVERY_PRODUCTS.find(product => product.id === item.recoveryId)! : null;
      const reason = shopItemUnavailable(run, item);
      const owned = buff ? run.activeBuffs.find(owned => owned.buffId === buff.id)?.stacks ?? 0 : 0;
      return <button type="button" key={item.id} data-shop-item={item.id}
        className={`room-card shop-product ${buff ? 'rarity-' + buff.rarity : ''} ${item.purchased ? 'is-sold' : run.gold < item.price ? 'is-unaffordable' : ''}`}
        disabled={!!reason || !!selected} onClick={() => product?.target === 'single' ? setSelected(item.id) : onPurchase(item.id)}>
        <span className="buff-rarity">{buff ? 'Buff · ' + buff.rarity : product?.effect === 'revive' ? 'Revival Item' : 'Recovery Item'}</span>
        <h2>{buff?.name ?? product?.name}</h2><span className="buff-categories">{buff?.categories.join(' · ') ?? (product?.effect === 'revive' ? 'SINGLE · DOWN 1人' : product?.target === 'party' ? 'PARTY · 生存者全員' : 'SINGLE · 生存者1人')}</span>
        <p>{buff?.description ?? (product?.effect === 'revive' ? `Down状態の味方1人を最大HPの${product.ratio * 100}%で復活させる。` : `最大HPの${product!.ratio * 100}%回復。Downは回復しません。`)}</p>
        <span className="shop-product__purchase"><strong className="shop-price">{item.price} Gold</strong>{buff ? <small>Owned: {owned} / {buff.maxStacks}</small> : null}</span>
        <small>{reason ?? (product?.target === 'single' ? '対象を選んで購入' : '購入する')}</small>
      </button>;
    })}</div> : null}
    <div className="shop-actions">
      <button type="button" className="dungeon-button secondary" disabled={rerollPending || run.gold < rerollCost}
        onClick={() => { setSelected(null); setRerollPending(true); onReroll(shop.rerollCount); }}>REROLL · {allowance.remaining > 0 ? `FREE ${allowance.remaining} / ${allowance.max}` : `${SHOP_CONFIG.rerollCost} Gold`}</button>
      <button className="dungeon-button secondary" type="button" onClick={onLeave}>LEAVE SHOP →</button>
      <small role="status">{run.roomMessage || (run.gold < rerollCost ? 'Reroll: Not enough Gold' : '売り切れを含む全商品を再抽選します')} · Rerolls {shop.rerollCount}</small>
    </div>
  </section>;
}
