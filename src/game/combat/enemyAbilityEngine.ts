import { getEffectiveCharacter } from '../buffs/buffModifiers';
import { consumeDamageShield } from '../buffs/buffEffectHandlers';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import type {
  CombatEventKind,
  CombatState,
  EnemyAbilityEffect,
  EnemyCombatState,
  EnemySpecialAbility,
} from '../../types/game';
import { selectLowestPartyHpIndex } from './targeting';

export interface AbilityEvent {
  readonly kind: CombatEventKind;
  readonly message: string;
  readonly actorId?: string;
  readonly targetId?: string;
  readonly amount?: number;
  readonly targetHpAfter?: number;
  readonly abilityId?: string;
  readonly effectType?: EnemyAbilityEffect['effectType'];
  readonly soundId?: EnemySpecialAbility['soundId'];
}

export interface AbilityResolution {
  readonly state: CombatState;
  readonly events: readonly AbilityEvent[];
}

function conditionMatches(
  state: CombatState,
  actor: EnemyCombatState,
  condition: (typeof ENEMIES_BY_ID)[string]['aiRules'][number]['condition'],
): boolean {
  if (condition.type === 'always') return true;
  if (condition.type === 'self-hp-below') {
    const definition = ENEMIES_BY_ID[actor.definitionId];
    return actor.currentHp / definition.maxHp < condition.percent / 100;
  }
  return state.enemies.some((enemy) => {
    if (enemy.currentHp <= 0) return false;
    const definition = ENEMIES_BY_ID[enemy.definitionId];
    return enemy.currentHp / definition.maxHp < condition.percent / 100;
  });
}

export function chooseEnemyAbility(
  state: CombatState,
  actor: EnemyCombatState,
): EnemySpecialAbility | null {
  const definition = ENEMIES_BY_ID[actor.definitionId];
  const rules = [...definition.aiRules].sort((left, right) => right.priority - left.priority);
  for (const rule of rules) {
    const ability = definition.specialAbilities.find((candidate) => candidate.id === rule.abilityId);
    if (ability && actor.specialGauge >= ability.gaugeCost && conditionMatches(state, actor, rule.condition)) {
      return ability;
    }
  }
  return null;
}

function enemyTargets(state: CombatState, actorIndex: number, effect: EnemyAbilityEffect): number[] {
  if (effect.targetType === 'self') return [actorIndex];
  const living = state.enemies
    .map((enemy, index) => ({ enemy, index }))
    .filter(({ enemy }) => enemy.currentHp > 0);
  if (effect.targetType === 'allEnemies') return living.map(({ index }) => index);
  if (effect.targetType !== 'singleEnemy' || living.length === 0) return [];
  return [living.reduce((lowest, candidate) => {
    const lowestMax = ENEMIES_BY_ID[lowest.enemy.definitionId].maxHp;
    const candidateMax = ENEMIES_BY_ID[candidate.enemy.definitionId].maxHp;
    return candidate.enemy.currentHp / candidateMax < lowest.enemy.currentHp / lowestMax ? candidate : lowest;
  }).index];
}

function partyTargets(state: CombatState, effect: EnemyAbilityEffect): number[] {
  if (effect.targetType === 'allParty') {
    return state.party.map((member, index) => member.currentHp > 0 ? index : -1).filter((index) => index >= 0);
  }
  if (effect.targetType === 'singleParty') {
    const index = selectLowestPartyHpIndex(state);
    return index === null ? [] : [index];
  }
  return [];
}

function numericEffectValue(effect: Extract<EnemyAbilityEffect, { effectType: 'damage' | 'heal' }>, maxHp: number): number {
  return effect.valueType === 'max-hp-percent'
    ? Math.max(1, Math.round(maxHp * effect.value / 100))
    : effect.value;
}

function applyEffect(
  state: CombatState,
  actorIndex: number,
  effect: EnemyAbilityEffect,
  ability: EnemySpecialAbility,
): AbilityResolution {
  const events: AbilityEvent[] = [];
  const actor = state.enemies[actorIndex];

  if (effect.effectType === 'damage') {
    const targets = partyTargets(state, effect);
    const party = state.party.map((member, index) => {
      if (!targets.includes(index)) return member;
      const definition = getEffectiveCharacter(state, member.definitionId);
      const incoming = consumeDamageShield(state, member.definitionId, numericEffectValue(effect, definition.stats.maxHp));
      state = incoming.state;
      const damage = incoming.damage;
      const currentHp = Math.max(0, member.currentHp - damage);
      events.push({
        kind: 'ally-damaged',
        message: `${definition.name}は ${damage} の特殊ダメージを受けた。`,
        actorId: actor.instanceId,
        targetId: member.definitionId,
        amount: member.currentHp - currentHp,
        targetHpAfter: currentHp,
        abilityId: ability.id,
        effectType: effect.effectType,
      });
      if (currentHp === 0 && member.currentHp > 0) {
        events.push({ kind: 'ally-defeated', message: `${definition.name}は戦闘不能になった。`, targetId: member.definitionId });
      }
      return { ...member, currentHp };
    });
    return { state: { ...state, party }, events };
  }

  if (effect.effectType === 'heal') {
    const targets = enemyTargets(state, actorIndex, effect);
    const enemies = state.enemies.map((enemy, index) => {
      if (!targets.includes(index)) return enemy;
      const definition = ENEMIES_BY_ID[enemy.definitionId];
      const healing = numericEffectValue(effect, definition.maxHp);
      const actualHealing = Math.min(healing, definition.maxHp - enemy.currentHp);
      events.push({
        kind: 'enemy-heal',
        message: `${definition.name}のHPが ${actualHealing} 回復した。`,
        actorId: actor.instanceId,
        targetId: enemy.instanceId,
        amount: actualHealing,
        abilityId: ability.id,
        effectType: effect.effectType,
      });
      return { ...enemy, currentHp: enemy.currentHp + actualHealing };
    });
    return { state: { ...state, enemies }, events };
  }

  const targets = enemyTargets(state, actorIndex, effect);
  if (targets.length === 0) {
    const targetsParty = partyTargets(state, effect);
    if (targetsParty.length === 0) return { state, events };
    const party = state.party.map((member, index) => targetsParty.includes(index)
      ? { ...member, statuses: [...member.statuses, `${effect.effectType}:${effect.stat}`] }
      : member);
    for (const index of targetsParty) {
      const member = state.party[index];
      events.push({
        kind: effect.effectType === 'buff' ? 'ally-buff' : 'ally-debuff',
        message: `${CHARACTERS_BY_ID[member.definitionId].name}に${effect.effectType === 'buff' ? '強化' : '弱体'}効果。`,
        actorId: actor.instanceId,
        targetId: member.definitionId,
        abilityId: ability.id,
        effectType: effect.effectType,
      });
    }
    return { state: { ...state, party }, events };
  }
  const multiplier = 1 + effect.value / 100;
  const enemies = state.enemies.map((enemy, index) => {
    if (!targets.includes(index)) return enemy;
    if (effect.stat === 'attack') return { ...enemy, attackMultiplier: enemy.attackMultiplier * multiplier };
    if (effect.stat === 'defense') return { ...enemy, defenseMultiplier: enemy.defenseMultiplier * multiplier };
    if (effect.stat === 'actionTime') return { ...enemy, actionTimeMultiplier: enemy.actionTimeMultiplier * multiplier };
    return enemy;
  });
  for (const index of targets) {
    const target = state.enemies[index];
    events.push({
      kind: effect.effectType === 'buff' ? 'enemy-buff' : 'enemy-debuff',
      message: `${ENEMIES_BY_ID[target.definitionId].name}に${effect.effectType === 'buff' ? '強化' : '弱体'}効果。`,
      actorId: actor.instanceId,
      targetId: target.instanceId,
      abilityId: ability.id,
      effectType: effect.effectType,
    });
  }
  return { state: { ...state, enemies }, events };
}

export function executeEnemyAbility(
  state: CombatState,
  actorInstanceId: string,
  ability: EnemySpecialAbility,
): AbilityResolution {
  const actorIndex = state.enemies.findIndex((enemy) => enemy.instanceId === actorInstanceId);
  if (actorIndex < 0) return { state, events: [] };
  const actor = state.enemies[actorIndex];
  const definition = ENEMIES_BY_ID[actor.definitionId];
  let nextState: CombatState = {
    ...state,
    enemies: state.enemies.map((enemy, index) =>
      index === actorIndex ? {
        ...enemy,
        specialGauge: Math.max(0, enemy.specialGauge - ability.gaugeCost),
        pendingSpecial: null,
      } : enemy
    ),
  };
  const primaryEffect = ability.effects[0]?.effectType;
  const events: AbilityEvent[] = [{
    kind: 'enemy-special-used',
    message: `${definition.name}の特殊行動「${ability.name}」！`,
    actorId: actor.instanceId,
    abilityId: ability.id,
    effectType: primaryEffect,
    soundId: ability.soundId,
  }];
  for (const effect of ability.effects) {
    const resolution = applyEffect(nextState, actorIndex, effect, ability);
    nextState = resolution.state;
    events.push(...resolution.events);
  }
  return { state: nextState, events };
}
