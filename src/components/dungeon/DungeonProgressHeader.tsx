import { DUNGEON_CONFIG } from '../../game/dungeon/dungeonConfig';
import { roomName } from '../../game/dungeon/dungeonEngine';
import type { DungeonRunState } from '../../types/dungeon';

/** Exploration information only: callers omit this entire region during combat. */
export function DungeonProgressHeader({ run }: { readonly run: DungeonRunState }) {
  return <header className="dungeon-progress-header" aria-label="ダンジョン進行状況">
    <div className="expedition-bar">
      <span>NORMAL · TIER {run.enemyTier} {run.currentRoom ? `· ${roomName(run.currentRoom)}` : ''}</span>
      <strong>{run.gold} GOLD</strong>
      <div className="floor-meter"><span>FLOOR</span><strong>{String(run.currentFloor).padStart(2, '0')} <em>/ {run.maxFloor}</em></strong></div>
    </div>
    <nav className="floor-progress" aria-label="探索進行">{Array.from({ length: run.maxFloor }, (_, i) => i + 1).map((floor) =>
      <span key={floor} className={floor < run.currentFloor ? 'is-cleared' : floor === run.currentFloor ? 'is-current' : ''} aria-current={floor === run.currentFloor ? 'step' : undefined}>{DUNGEON_CONFIG.bossFloors.includes(floor) ? `${floor} BOSS` : floor}</span>)}</nav>
  </header>;
}
