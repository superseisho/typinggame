import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { RunBuff } from '../../types/buffs';
import { describeBuffTotals } from '../../game/buffs/buffDescriptions';

export function CurrentBuffs({ buffs }: { readonly buffs: readonly RunBuff[] }) {
  return <details className="current-buffs">
    <summary>✦ BUFFS {buffs.reduce((sum, buff) => sum + buff.stacks, 0)}</summary>
    <div><h2>Current Buffs</h2><p>この探索のみ有効。数値効果は同種・同対象で加算します。</p>
      {buffs.length === 0 ? <p>まだBuffを所持していません。戦闘に勝利して祝福を選びましょう。</p> :
        <ul>{buffs.map(owned => {
          const buff = BUFFS_BY_ID[owned.buffId];
          return <li key={buff.id} className={`rarity-${buff.rarity}`}><strong>{buff.name} ×{owned.stacks}</strong>
            <span className="buff-rarity">{buff.rarity} · {buff.categories.join(' / ')}</span><p>{describeBuffTotals(buff, owned.stacks)}</p>
            <small>{buff.description}</small></li>;
        })}</ul>}
    </div>
  </details>;
}
