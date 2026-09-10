import { useState } from 'react';
import { SHOP_PRODUCTS } from '../../game/dungeon/dungeonConfig';
import { recoveryTargets } from '../../game/dungeon/roomResolver';
import type { CharacterId } from '../../types/game';
import type { DungeonRunState } from '../../types/dungeon';
import { RecoveryTargetPicker } from './RecoveryTargetPicker';

export function ShopRoom({ run, onPurchase, onLeave }: {
  readonly run: DungeonRunState;
  readonly onPurchase: (productId: string, targetId: CharacterId) => void;
  readonly onLeave: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const targets = recoveryTargets(run.combat);
  return <section className="dungeon-room" aria-label="Shop">
    <div className="dungeon-heading"><span className="eyebrow">SPEND WISELY</span><h1>Shop</h1><p>ポーションは対象へ即時使用。各商品はこの部屋で1個まで購入できます。</p></div>
    <p className="room-message" role="status">{run.roomMessage || `所持金 ${run.gold} Gold`}</p>
    {selected ? <RecoveryTargetPicker combat={run.combat} targets={targets} onCancel={() => setSelected(null)} onChoose={(id) => { onPurchase(selected, id); setSelected(null); }} /> :
      <div className="room-grid shop-grid">{SHOP_PRODUCTS.map((product) => {
        const sold = run.purchasedProducts.includes(product.id);
        return <button className="room-card" type="button" key={product.id} disabled={sold || run.gold < product.price || targets.length === 0} onClick={() => setSelected(product.id)}>
          <span className="room-card__icon">⚗</span><h2>{product.name}</h2><p>生存者1人 · HP +{product.recoveryRatio * 100}%</p><strong>{sold ? 'SOLD OUT' : `${product.price} Gold`}</strong>
          <small>{!sold && run.gold < product.price ? 'Gold不足' : targets.length === 0 ? '回復対象なし' : '対象を選んで購入'}</small>
        </button>;
      })}</div>}
    <button className="dungeon-button secondary" type="button" onClick={onLeave}>Shopを出る →</button>
  </section>;
}
