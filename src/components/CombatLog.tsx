import type { CombatState } from '../types/game';

export function CombatLog({ combat }: { readonly combat: CombatState }) {
  const latest = combat.log.at(-1)?.message ?? '扉の向こうで何かが蠢いている……';
  return (
    <details className="combat-log">
      <summary>
        <span className="eyebrow">BATTLE RECORD</span>
        <span className="combat-log__latest">{latest}</span>
        <em>{combat.log.length} EVENTS</em>
      </summary>
      <ol aria-label="戦闘ログ">
        {combat.log.length === 0 ? <li className="log-system">扉の向こうで何かが蠢いている……</li> : null}
        {combat.log.map((event) => (
          <li className={`log-${event.kind}`} key={event.id}>{event.message}</li>
        ))}
      </ol>
    </details>
  );
}
