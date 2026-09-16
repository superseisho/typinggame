import { ENEMIES_BY_ID } from '../data/enemies';
import { ENEMY_SKILLS } from '../data/enemySkills';
import { usePortraitMotion } from '../hooks/usePortraitMotion';
import type { CombatState, EnemyCombatState, EnemyDefinition } from '../types/game';
import { CombatFeedback } from './CombatFeedback';
import { ProgressBar } from './ProgressBar';
import { PortraitMotionLayer } from './PortraitMotionLayer';
import { StatusChips } from './StatusChips';
import { EnemySkillFeedback } from './EnemySkillFeedback';

function hpSeverity(ratio: number) {
  if (ratio <= .25) return 'danger' as const;
  if (ratio <= .5) return 'caution' as const;
  return 'normal' as const;
}

function specialState(ratio: number) {
  if (ratio >= 1) return 'max';
  if (ratio >= .8) return 'alert';
  if (ratio >= .5) return 'caution';
  return 'normal';
}

function EnemyMotionPortrait({
  combat,
  enemyState,
  enemy,
  targeted,
}: {
  readonly combat: CombatState;
  readonly enemyState: EnemyCombatState;
  readonly enemy: EnemyDefinition;
  readonly targeted: boolean;
}) {
  const motion = usePortraitMotion(combat, 'enemy', enemyState.instanceId, enemyState.currentHp <= 0);
  return (
    <div className="enemy-unit__visual">
      {targeted ? <span className="enemy-target-marker">▼ TARGET</span> : null}
      <PortraitMotionLayer className="enemy-unit__motion" motion={motion}>
        <div className={`enemy-avatar sprite--${enemy.sprite}`}>
          <div className="enemy-avatar__mist" />
          <div className="enemy-avatar__body"><span className="enemy-avatar__eye" /><span className="enemy-avatar__eye" /></div>
          {enemy.sprite === 'shaman' ? <span className="shaman-staff">✦</span> : null}
          {enemy.sprite === 'guardian' ? <span className="guardian-shield" aria-hidden="true" /> : null}
        </div>
      </PortraitMotionLayer>
    </div>
  );
}

export function EnemyPanel({ combat, floorLabel = 'COMBAT TRAINING', onSelectEnemyTarget }: { readonly combat: CombatState; readonly floorLabel?: string; readonly onSelectEnemyTarget?: (enemyId: string) => void }) {
  const livingCount = combat.enemies.filter((enemy) => enemy.currentHp > 0).length;

  return (
    <section className="enemy-panel" aria-label="敵部隊ステータス">
      <header className="battle-zone-heading">
        <div><span className="eyebrow">ENEMY AREA</span><strong>{livingCount} HOSTILES</strong></div>
        <span>{floorLabel}</span>
      </header>

      <div className="enemy-formation">
        {combat.enemies.map((enemyState) => {
          const enemy = ENEMIES_BY_ID[enemyState.definitionId];
          const hpRatio = enemyState.currentHp / enemy.maxHp;
          const specialRatio = enemyState.specialGauge / enemy.specialGaugeMax;
          const attackRatio = Math.max(0, Math.min(1, (enemy.attackCooldown - enemyState.cooldownRemainingMs) / enemy.attackCooldown));
          const knockedOut = enemyState.currentHp <= 0;
          const targeted = combat.status === 'active' && !knockedOut && combat.targetEnemyId === enemyState.instanceId;
          const selectable = combat.status === 'active' && !knockedOut && !!onSelectEnemyTarget;
          const specialLevel = specialState(specialRatio);

          return (
            <article
              className={`enemy-unit hp-${hpSeverity(hpRatio)} special-${specialLevel} ${attackRatio >= .8 ? 'attack-imminent' : ''} ${knockedOut ? 'is-defeated' : ''} ${targeted ? 'is-targeted' : ''} ${selectable ? 'is-selectable' : ''}`}
              key={enemyState.instanceId}
              data-enemy-id={enemyState.instanceId}
            >
              {selectable ? <button type="button" className="enemy-target-hitarea" tabIndex={-1}
                aria-label={`${enemy.name}: Click to target`} aria-pressed={targeted} title="Click to target"
                onPointerDown={event => event.preventDefault()}
                onClick={event => {
                  // No keyboard activation or focus capture: typing uses window keydown.
                  if (event.detail === 0) return;
                  onSelectEnemyTarget?.(enemyState.instanceId);
                  // Also release a previously focused toolbar button, while
                  // preserving any future dedicated typing input's focus.
                  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
                }} /> : null}
              <CombatFeedback events={combat.events} targetId={enemyState.instanceId} />
              <EnemySkillFeedback events={combat.events} enemyId={enemyState.instanceId} />
              {knockedOut ? <span className="down-stamp">DEFEATED</span> : null}
              {specialLevel === 'max' ? <span className="special-warning">WARNING</span> : null}

              <div className="enemy-unit__topline">
                <div>
                  <strong>{enemy.name}</strong>
                  <small>{enemy.englishName}</small>
                </div>
                <em>{enemy.boss ? 'BOSS' : enemy.elite ? 'ELITE' : enemyState.formationIndex === 0 ? 'FRONT' : 'REAR'}</em>
              </div>

              <EnemyMotionPortrait combat={combat} enemyState={enemyState} enemy={enemy} targeted={targeted} />

              <div className="primary-gauge">
                <div className="gauge-label"><span>HP</span><strong>{Math.round(hpRatio * 100)}%</strong></div>
                <ProgressBar value={enemyState.currentHp} max={enemy.maxHp} tone="enemy" severity={hpSeverity(hpRatio)} label={`${enemy.name}のHP`} />
              </div>
              <div className="enemy-unit__gauges">
                <div>
                  <div className="gauge-label"><span>ATTACK</span><strong>{Math.max(0, enemyState.cooldownRemainingMs / 1_000).toFixed(1)}s</strong></div>
                  <ProgressBar value={attackRatio} max={1} tone="attack" severity={attackRatio >= .8 ? 'warning' : 'normal'} compact label={`${enemy.name}の攻撃クールダウン`} />
                </div>
                <div>
                  <div className="gauge-label"><span>SPECIAL</span><strong>{Math.round(specialRatio * 100)}%</strong></div>
                  <ProgressBar value={specialRatio} max={1} tone="special" severity={specialLevel === 'max' || specialLevel === 'alert' ? 'warning' : specialLevel === 'caution' ? 'caution' : 'normal'} compact label={`${enemy.name}の特殊ゲージ`} />
                </div>
              </div>
              <div className="next-action">
                <small>NEXT</small>
                <strong>{knockedOut ? '—' : ENEMY_SKILLS[enemyState.nextActionSkillId ?? '']?.name ?? '—'}</strong>
                {enemyState.cover && enemyState.cover.remainingHits > 0 ? <span className="enemy-cover-counter">Shield ×{enemyState.cover.remainingHits}</span> : null}
              </div>
              <StatusChips statuses={enemyState.statuses} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
