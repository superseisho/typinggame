import type { CombatState } from '../types/game';
import { EnemyPanel } from './EnemyPanel';
import { TypingPanel } from './TypingPanel';
import { PartyPanel } from './PartyPanel';
import { CombatLog } from './CombatLog';

/** Shared by standalone combat and dungeon encounters. Rules remain outside UI. */
export function BattleStage({ combat, floorLabel, onSelectEnemyTarget }: { readonly combat: CombatState; readonly floorLabel?: string; readonly onSelectEnemyTarget?: (enemyId: string) => void }) {
  return <div className="battle-stage">
    <EnemyPanel combat={combat} floorLabel={floorLabel} onSelectEnemyTarget={onSelectEnemyTarget} />
    <TypingPanel combat={combat} />
    <PartyPanel combat={combat} />
    <CombatLog combat={combat} />
  </div>;
}
