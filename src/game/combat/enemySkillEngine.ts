import { ENEMIES_BY_ID } from '../../data/enemies';
import { ENEMY_SKILLS, ENEMY_SKILL_CONFIG, type EnemySkillDefinition } from '../../data/enemySkills';
import type { CombatState, EnemyCombatState } from '../../types/game';
import { randomStep } from '../../utils/random';
import { appendEvent } from './combatEvents';

export function lowestInjuredEnemy(state: CombatState): EnemyCombatState | undefined {
  return state.enemies.filter(e => e.currentHp > 0 && e.currentHp < ENEMIES_BY_ID[e.definitionId].maxHp)
    .reduce<EnemyCombatState | undefined>((lowest, e) => !lowest || e.currentHp / ENEMIES_BY_ID[e.definitionId].maxHp < lowest.currentHp / ENEMIES_BY_ID[lowest.definitionId].maxHp ? e : lowest, undefined);
}
const conditions: Record<EnemySkillDefinition['requirement'], (s: CombatState, a: EnemyCombatState) => boolean> = {
  always: () => true,
  'other-alive': (s,a) => s.enemies.some(e => e.instanceId !== a.instanceId && e.currentHp > 0),
  'injured-alive': s => !!lowestInjuredEnemy(s),
};
export function usableEnemySkills(state: CombatState, actor: EnemyCombatState) {
  if (actor.currentHp <= 0) return [];
  return ENEMIES_BY_ID[actor.definitionId].skills.filter(binding => {
    const skill = ENEMY_SKILLS[binding.skillId];
    return binding.weight > 0 && skill && (actor.skillCooldowns[skill.id] ?? 0) <= 0 && conditions[skill.requirement](state, actor);
  });
}
export function chooseEnemySkill(state: CombatState, actor: EnemyCombatState) {
  const candidates = usableEnemySkills(state, actor);
  if (!candidates.length) return { state, skill: null };
  const random = randomStep(state.skillRngState);
  let roll = random.value * candidates.reduce((sum, c) => sum + c.weight, 0);
  const selected = candidates.find(c => (roll -= c.weight) < 0) ?? candidates[candidates.length - 1];
  return { state: { ...state, skillRngState: random.seed }, skill: ENEMY_SKILLS[selected.skillId] };
}

type NormalAttack = (state: CombatState, actorIndex: number, now: number) => CombatState;
/** Only called at battle/cycle boundaries, never from rendering or typing. */
export function planEnemyAction(state: CombatState, actorIndex: number): CombatState {
  const actor = state.enemies[actorIndex];
  if (!actor || actor.currentHp <= 0 || state.status !== 'active') return state;
  const selection = chooseEnemySkill(state, actor);
  return { ...selection.state, enemies: selection.state.enemies.map((e, index) => index === actorIndex
    ? { ...e, nextActionSkillId: selection.skill?.id ?? null } : e) };
}

/** A stale plan falls back deterministically; execution never draws a new skill. */
export function resolvePlannedEnemySkill(state: CombatState, actor: EnemyCombatState) {
  const usable = usableEnemySkills(state, actor);
  const binding = usable.find(s => s.skillId === actor.nextActionSkillId)
    ?? usable.find(s => ENEMY_SKILLS[s.skillId].effect === 'attack')
    ?? usable[0];
  return binding ? ENEMY_SKILLS[binding.skillId] : null;
}

export function performEnemySkill(state: CombatState, actorIndex: number, now: number, attack: NormalAttack): CombatState {
  const actor = state.enemies[actorIndex];
  if (!actor || state.status !== 'active' || actor.currentHp <= 0) return state;
  const skill = resolvePlannedEnemySkill(state, actor);
  if (!skill) return state;
  const definition = ENEMIES_BY_ID[actor.definitionId];
  let next = appendEvent(state, 'enemy-skill-used', `${definition.name} · ${skill.name}`, {
    actorId: actor.instanceId, skillId: skill.id, abilityId: skill.id,
  }, false);
  if (skill.effect === 'attack') return planEnemyAction(attack(next, actorIndex, now), actorIndex);
  next = { ...next, enemies: next.enemies.map(e => e.instanceId === actor.instanceId ? { ...e,
    cooldownRemainingMs: Math.max(0, e.cooldownRemainingMs + definition.attackCooldown * e.cooldownMultiplier),
    skillCooldowns: { ...e.skillCooldowns, [skill.id]: skill.cooldownMs },
    cover: skill.effect === 'cover' ? { remainingHits: ENEMY_SKILL_CONFIG.guardian.maxHits } : e.cover,
  } : e) };
  if (skill.effect === 'heal') {
    const target = lowestInjuredEnemy(next)!;
    const maxHp = ENEMIES_BY_ID[target.definitionId].maxHp;
    const amount = Math.min(maxHp - target.currentHp, Math.round(maxHp * ENEMY_SKILL_CONFIG.shaman.healRatio));
    next = appendEvent({ ...next, enemies: next.enemies.map(e => e.instanceId === target.instanceId ? { ...e, currentHp: e.currentHp + amount } : e) },
      'enemy-heal', `${definition.name}のHEAL · +${amount}`, { actorId: actor.instanceId, targetId: target.instanceId, amount, skillId: skill.id, soundId: 'enemy_heal' });
  }
  return planEnemyAction(next, actorIndex);
}
