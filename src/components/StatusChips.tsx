function statusLabel(status: string): { readonly label: string; readonly beneficial: boolean } {
  const [kind, rawName = status] = status.split(':');
  const name = rawName.replace(/attackCooldown/i, 'HASTE').replace(/attackThreshold/i, 'FOCUS').toUpperCase();
  return { label: `${kind === 'buff' ? '▲' : '▼'} ${name}`, beneficial: kind === 'buff' };
}

export function StatusChips({ statuses }: { readonly statuses: readonly string[] }) {
  if (statuses.length === 0) return <div className="status-chips" aria-label="状態効果なし" />;
  return (
    <div className="status-chips" aria-label="状態効果">
      {statuses.slice(0, 3).map((status, index) => {
        const parsed = statusLabel(status);
        return <span className={parsed.beneficial ? 'is-buff' : 'is-debuff'} title={status} key={`${status}-${index}`}>{parsed.label}</span>;
      })}
    </div>
  );
}
