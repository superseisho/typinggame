import { ENEMIES_BY_ID } from '../../data/enemies';
import type { CombatState } from '../../types/game';
import type { SoundId } from '../../types/audio';
import { appendEvent } from './combatEvents';
import { ensureValidEnemyTarget } from './enemyTarget';

export interface DamageRoute { readonly originalTargetId: string; readonly receiverId: string; readonly covered: boolean }

/** One guardian per attack, chosen in display order. Never chain or re-route hits. */
export function snapshotEnemyDamageRoutes(state: CombatState, targetIds: readonly string[]): readonly DamageRoute[] {
  const guardian = state.enemies.find(e => e.currentHp > 0 && (e.cover?.remainingHits ?? 0) > 0);
  return targetIds.filter(id => state.enemies.some(e => e.instanceId === id && e.currentHp > 0)).map(id => ({
    originalTargetId: id, receiverId: guardian?.instanceId ?? id,
    covered: !!guardian && guardian.instanceId !== id,
  }));
}

export function cleanupEnemyState(state: CombatState): CombatState {
  const ended = state.status === 'victory' || state.status === 'defeat';
  return { ...state, enemies: state.enemies.map(e => ended || e.currentHp <= 0
    ? { ...e, nextActionSkillId: null, cover: null, actionDurationMs: 0, pendingSpecial: null, statuses: [], specialGauge: 0, actionRemainingMs: 0,
        attackMultiplier: 1, defenseMultiplier: 1, actionTimeMultiplier: 1, nextAttackEmpowerMultiplier: 1 }
    : e.cover && e.cover.remainingHits <= 0 ? { ...e, cover: null } : e) };
}

/** Synchronous attack transaction: snapshot -> individual hits -> cover/death cleanup. */
export function resolveEnemyDamage(state: CombatState, attack: {
  readonly targetIds: readonly string[]; readonly power: number;
  readonly kind: 'ally-attack' | 'ally-ability-damage'; readonly label: string;
  readonly actorId?: string; readonly abilityId?: string; readonly soundId?: SoundId;
}): CombatState {
  const routes = snapshotEnemyDamageRoutes(state, attack.targetIds);
  const consumed = new Map<string, number>();
  let next = state;
  for (const route of routes) {
    const receiver = next.enemies.find(e => e.instanceId === route.receiverId)!;
    const definition = ENEMIES_BY_ID[receiver.definitionId];
    if (route.covered) {
      consumed.set(receiver.instanceId, (consumed.get(receiver.instanceId) ?? 0) + 1);
      next = appendEvent(next, 'enemy-cover', `${definition.name}がCOVER！`, {
        actorId: receiver.instanceId, targetId: receiver.instanceId, originalTargetId: route.originalTargetId, skillId: 'skill_cover',
      });
    }
    const damage = receiver.currentHp > 0 ? Math.max(1, Math.round(attack.power) - Math.round(definition.defense * receiver.defenseMultiplier)) : 0;
    const hp = Math.max(0, receiver.currentHp - damage);
    next = appendEvent({ ...next, enemies: next.enemies.map(e => e.instanceId === receiver.instanceId ? { ...e, currentHp: hp } : e) },
      attack.kind, `${attack.label} · ${definition.name}へ ${damage} ダメージ。`, {
        actorId: attack.actorId, targetId: receiver.instanceId, originalTargetId: route.originalTargetId,
        amount: damage, actualDamage: receiver.currentHp - hp, targetHpAfter: hp, abilityId: attack.abilityId, soundId: attack.soundId,
      });
  }
  next = { ...next, enemies: next.enemies.map(e => e.cover ? { ...e, cover: {
    remainingHits: Math.max(0, e.cover.remainingHits - (consumed.get(e.instanceId) ?? 0)),
  } } : e) };
  for (const enemy of next.enemies) {
    if (enemy.currentHp === 0 && state.enemies.some(e => e.instanceId === enemy.instanceId && e.currentHp > 0)) {
      next = appendEvent(next, 'enemy-defeated', `${ENEMIES_BY_ID[enemy.definitionId].name}を撃破した。`, { targetId: enemy.instanceId });
    }
  }
  return ensureValidEnemyTarget(cleanupEnemyState(next));
}
