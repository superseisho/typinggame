import { ENEMIES_BY_ID } from '../../data/enemies';
import { ENEMY_SKILL_CONFIG } from '../../data/enemySkills';
import type { CombatState, EnemyCombatState } from '../../types/game';

/** Stable formation order breaks ties; a charge is never stacked or replaced by a weaker one. */
export function empowermentTarget(state: CombatState, actor: EnemyCombatState) {
  return state.enemies.filter(e => e.currentHp > 0 && e.instanceId !== actor.instanceId && e.nextAttackEmpowerMultiplier <= 1)
    .reduce<EnemyCombatState | undefined>((best, e) => !best ||
      ENEMIES_BY_ID[e.definitionId].attack * e.attackMultiplier > ENEMIES_BY_ID[best.definitionId].attack * best.attackMultiplier ? e : best, undefined);
}

export function empowerEnemies(state: CombatState, targetIds: readonly string[], multiplier: number): CombatState {
  return { ...state, enemies: state.enemies.map(e => e.currentHp > 0 && targetIds.includes(e.instanceId)
    ? { ...e, nextAttackEmpowerMultiplier: Math.max(e.nextAttackEmpowerMultiplier, multiplier) } : e) };
}

export function applyTypingCurse(state: CombatState, bonus: number): CombatState {
  return { ...state, typingCurseBonus: Math.max(state.typingCurseBonus, bonus),
    typingCurseRemainingMs: ENEMY_SKILL_CONFIG.wraith.curseDurationMs };
}
