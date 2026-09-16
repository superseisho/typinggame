import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { resolveEnemyDamage } from '../combat/enemyDamage';
import type { BuffDefinition, BuffEffect } from '../../types/buffs';
import type { CharacterId, CombatState } from '../../types/game';
import { appendEvent } from '../combat/combatEvents';
import { getEffectiveCharacter } from './buffModifiers';

export type BuffTrigger =
  | { type: 'guard'; characterId: CharacterId }
  | { type: 'heal'; characterId: CharacterId; targetId: CharacterId }
  | { type: 'perfect-streak'; streak: number };

function announce(state: CombatState, buff: BuffDefinition, targetId?: string): CombatState {
  return appendEvent(state, 'ally-buff', `${buff.name.toUpperCase()}!`, { targetId, abilityId: buff.id, soundId: buff.soundId, effectType: 'buff' });
}

/** Actual healing only: existing audio / green flash consume this same event. */
export function healFromBuff(state: CombatState, targetId: CharacterId, amount: number, buff: BuffDefinition): CombatState {
  const member = state.party.find(member => member.definitionId === targetId);
  if (!member || member.currentHp <= 0) return state;
  const maxHp = getEffectiveCharacter(state, targetId).stats.maxHp;
  const actual = Math.min(Math.round(amount), maxHp - member.currentHp);
  if (actual <= 0) return state;
  return appendEvent({ ...state, party: state.party.map(member => member.definitionId === targetId ? { ...member, currentHp: member.currentHp + actual } : member) },
    'ally-heal', `${buff.name} · HP +${actual}`, { targetId, amount: actual, abilityId: buff.id });
}

type Handler = (state: CombatState, effect: BuffEffect, stacks: number, trigger: BuffTrigger, buff: BuffDefinition) => CombatState;
const handlers: Partial<Record<BuffEffect['type'], Handler>> = {
  'guard-heal': (state, effect, stacks, trigger, buff) => effect.type === 'guard-heal' && trigger.type === 'guard' && effect.target === trigger.characterId
    ? healFromBuff(state, trigger.characterId, getEffectiveCharacter(state, trigger.characterId).stats.maxHp * effect.value * stacks, buff) : state,
  'guard-counter': (state, effect, stacks, trigger, buff) => {
    if (effect.type !== 'guard-counter' || trigger.type !== 'guard' || effect.target !== trigger.characterId) return state;
    return announce({ ...state, buffResources: { ...state.buffResources, counters: { ...state.buffResources.counters, [trigger.characterId]: effect.value * stacks } } }, buff, trigger.characterId);
  },
  'guard-gauge-shield': (state, effect, stacks, trigger, buff) => {
    if (effect.type !== 'guard-gauge-shield' || trigger.type !== 'guard' || effect.target !== trigger.characterId) return state;
    return announce({ ...state, buffResources: { ...state.buffResources, gaugeShield: effect.value * stacks } }, buff, trigger.characterId);
  },
  'heal-shield': (state, effect, stacks, trigger, buff) => {
    if (effect.type !== 'heal-shield' || trigger.type !== 'heal' || effect.target !== trigger.characterId) return state;
    return announce({ ...state, buffResources: { ...state.buffResources, shields: { ...state.buffResources.shields, [trigger.targetId]: Math.min(.9, effect.value * stacks) } } }, buff, trigger.targetId);
  },
  'streak-charge': (state, effect, stacks, trigger, buff) => {
    if (effect.type !== 'streak-charge' || trigger.type !== 'perfect-streak' || trigger.streak <= 0 || trigger.streak % effect.threshold !== 0) return state;
    return announce({ ...state, party: state.party.map(member => member.currentHp <= 0 ? member : { ...member, attackCharge: member.attackCharge + effect.value * stacks }) }, buff);
  },
  'streak-damage': (state, effect, stacks, trigger, buff) => {
    if (effect.type !== 'streak-damage' || trigger.type !== 'perfect-streak' || trigger.streak <= 0 || trigger.streak % effect.threshold !== 0) return state;
    return resolveEnemyDamage(announce(state, buff), { targetIds: state.enemies.filter(enemy => enemy.currentHp > 0).map(enemy => enemy.instanceId),
      power: effect.value * stacks, kind: 'ally-ability-damage', label: buff.name, abilityId: buff.id });
  },
};

/** Synchronously consume one game trigger, not historical UI events or render updates. */
export function handleBuffTrigger(state: CombatState, trigger: BuffTrigger): CombatState {
  let next = state;
  for (const owned of state.runBuffs) {
    const buff = BUFFS_BY_ID[owned.buffId];
    if (!buff) continue;
    for (const effect of buff.effects) next = handlers[effect.type]?.(next, effect, owned.stacks, trigger, buff) ?? next;
  }
  return next;
}

export function getExtraHealing(state: CombatState, source: CharacterId, target: CharacterId): number {
  const ratio = state.runBuffs.reduce((sum, owned) => sum + (BUFFS_BY_ID[owned.buffId]?.effects ?? []).reduce((total, effect) =>
    total + (effect.type === 'heal-extra' && effect.target === source ? effect.value * owned.stacks : 0), 0), 0);
  return Math.round(getEffectiveCharacter(state, target).stats.maxHp * ratio);
}

/** A shield is consumed by actual incoming damage, not a fully guarded hit. */
export function consumeDamageShield(state: CombatState, target: CharacterId, damage: number): { state: CombatState; damage: number } {
  const reduction = state.buffResources.shields[target] ?? 0;
  if (damage <= 0 || reduction <= 0) return { state, damage };
  return { state: { ...state, buffResources: { ...state.buffResources, shields: { ...state.buffResources.shields, [target]: 0 } } }, damage: Math.max(1, Math.round(damage * (1 - reduction))) };
}
