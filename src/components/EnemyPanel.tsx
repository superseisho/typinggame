import { ENEMIES_BY_ID } from '../data/enemies';
import type { CombatState } from '../types/game';
import { CombatFeedback } from './CombatFeedback';
import { ProgressBar } from './ProgressBar';
import { StatusChips } from './StatusChips';

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

export function EnemyPanel({ combat }: { readonly combat: CombatState }) {
  const livingCount = combat.enemies.filter((enemy) => enemy.currentHp > 0).length;

  return (
    <section className="enemy-panel" aria-label="敵部隊ステータス">
      <header className="battle-zone-heading">
        <div><span className="eyebrow">ENEMY AREA</span><strong>{livingCount} HOSTILES</strong></div>
        <span>FLOOR 01 · FORGOTTEN CRYPT</span>
      </header>

      <div className="enemy-formation">
        {combat.enemies.map((enemyState) => {
          const enemy = ENEMIES_BY_ID[enemyState.definitionId];
          const hpRatio = enemyState.currentHp / enemy.maxHp;
          const specialRatio = enemyState.specialGauge / enemy.specialGaugeMax;
          const attackRatio = Math.max(0, Math.min(1, (enemy.attackCooldown - enemyState.cooldownRemainingMs) / enemy.attackCooldown));
          const knockedOut = enemyState.currentHp <= 0;
          const specialLevel = specialState(specialRatio);
          const latestImpact = [...combat.events].reverse().find((event) => event.targetId === enemyState.instanceId);
          const latestAction = [...combat.events].reverse().find((event) => event.actorId === enemyState.instanceId);
          const pendingAbility = enemyState.pendingSpecial
            ? enemy.specialAbilities.find((ability) => ability.id === enemyState.pendingSpecial?.abilityId)
            : null;

          return (
            <article
              className={`enemy-unit hp-${hpSeverity(hpRatio)} special-${specialLevel} ${attackRatio >= .8 ? 'attack-imminent' : ''} ${knockedOut ? 'is-defeated' : ''}`}
              key={enemyState.instanceId}
            >
              <CombatFeedback events={combat.events} targetId={enemyState.instanceId} />
              {knockedOut ? <span className="down-stamp">DEFEATED</span> : null}
              {specialLevel === 'max' ? <span className="special-warning">WARNING</span> : null}

              <div className="enemy-unit__topline">
                <div>
                  <strong>{enemy.name}</strong>
                  <small>{enemy.englishName}</small>
                </div>
                <em>{enemy.boss ? 'BOSS' : enemy.elite ? 'ELITE' : enemyState.formationIndex === 0 ? 'FRONT' : 'REAR'}</em>
              </div>

              <div className="enemy-unit__visual" key={`${enemyState.instanceId}-${latestImpact?.id ?? 0}-${latestAction?.id ?? 0}`}>
                <div className={`enemy-avatar sprite--${enemy.sprite} ${latestImpact?.kind === 'ally-attack' ? 'is-hit' : ''} ${latestAction?.kind === 'ally-damaged' ? 'is-attacking' : ''}`}>
                  <div className="enemy-avatar__mist" />
                  <div className="enemy-avatar__body"><span className="enemy-avatar__eye" /><span className="enemy-avatar__eye" /></div>
                  {enemy.sprite === 'shaman' ? <span className="shaman-staff">✦</span> : null}
                </div>
              </div>

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
              <div className={`next-action ${pendingAbility ? 'is-special' : ''}`}>
                <small>{pendingAbility ? 'SPECIAL' : 'NEXT'}</small>
                <strong>{pendingAbility?.name ?? 'Attack'}</strong>
              </div>
              <StatusChips statuses={enemyState.statuses} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
