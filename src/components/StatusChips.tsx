function statusLabel(status: string): { readonly label: string; readonly beneficial: boolean } {
  const [kind, rawName = status] = status.split(':');
  const name = rawName.replace(/actionTime/i, 'HASTE').replace(/attackThreshold/i, 'FOCUS').toUpperCase();
  const beneficial = kind === 'buff' || kind === 'ability';
  return { label: `${kind === 'ability' ? '◆' : beneficial ? '▲' : '▼'} ${name}`, beneficial };
}

export function StatusChips({ statuses }: { readonly statuses: readonly string[] }) {
  const visibleStatuses = statuses.filter((status) => !status.startsWith('ability:'));
  if (visibleStatuses.length === 0) return <div className="status-chips" aria-label="状態効果なし" />;
  return (
    <div className="status-chips" aria-label="状態効果">
      {visibleStatuses.slice(0, 3).map((status, index) => {
        const parsed = statusLabel(status);
        return <span className={parsed.beneficial ? 'is-buff' : 'is-debuff'} title={status} key={`${status}-${index}`}>{parsed.label}</span>;
      })}
    </div>
  );
}
