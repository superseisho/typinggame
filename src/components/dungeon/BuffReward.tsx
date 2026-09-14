import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { DungeonRunState } from '../../types/dungeon';

export function BuffReward({ run, onChoose }: { readonly run: DungeonRunState; readonly onChoose: (id: string) => void }) {
  const acquired = run.runStatus === 'buff_acquired';
  const rareTreasure = run.treasure?.outcome === 'rare_buff';
  const encounter = run.currentRoom === 'event' || run.currentRoom === 'altar';
  return <section className={`dungeon-room buff-reward${rareTreasure ? ' rare-treasure' : ''}${encounter ? ' buff-reward--encounter' : ''}`} aria-label="Buff Reward">
    <div className="dungeon-heading" aria-live="polite"><span className="eyebrow">{run.roomMessage}</span>
      <h1>{acquired ? 'BLESSING ACQUIRED' : rareTreasure ? 'RARE TREASURE!' : 'CHOOSE A BLESSING'}</h1>
      <p>{acquired ? BUFFS_BY_ID[run.acquiredBuffId!].name : encounter ? '1つ選び、結果確認後にCONTINUEで進みます。この探索中だけ効果が続きます。' : '1つ選んで次の階へ。この探索中だけ効果が続きます。'}</p></div>
    <div className="room-grid">{run.buffOptions.map(id => {
      const buff = BUFFS_BY_ID[id];
      const stacks = run.activeBuffs.find(owned => owned.buffId === id)?.stacks ?? 0;
      return <button type="button" key={id} className={`room-card buff-card rarity-${buff.rarity}${run.acquiredBuffId === id ? ' is-acquired' : ''}`}
        disabled={acquired} onClick={() => onChoose(id)} aria-label={`${buff.name}を取得`}>
        <span className="buff-rarity">{buff.rarity}</span><h2>{buff.name}</h2>
        <span className="buff-categories">{buff.categories.join(' · ')}</span><p>{buff.description}</p>
        <strong>{buff.stackable ? `Owned: ${stacks} / ${buff.maxStacks}` : stacks ? 'ACQUIRED' : 'UNIQUE · 重複不可'}</strong>
        <small>{acquired ? run.acquiredBuffId === id ? '✦ 次の戦闘へ引き継ぎます' : '—' : buff.stackable ? `取得後 ×${stacks + 1} · 効果はStack数に応じて加算` : 'この探索のビルドに追加'}</small>
      </button>;
    })}</div>
  </section>;
}
