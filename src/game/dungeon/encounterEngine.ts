import { ALTAR_DEFINITION, EVENT_DEFINITIONS } from '../../data/rooms/encounterDefinitions';
import type { DungeonRunState } from '../../types/dungeon';
import type { EventChoice, EventEffect, RarityWeights } from '../../types/encounters';
import { getEffectiveCharacter } from '../buffs/buffModifiers';
import { appendEvent } from '../combat/combatEvents';
import { randomStep } from './roomGenerator';
import { recoverParty } from './roomResolver';

export function getEncounter(run: DungeonRunState) {
  return run.currentRoom === 'altar' ? ALTAR_DEFINITION : EVENT_DEFINITIONS.find(event => event.id === run.encounter?.definitionId);
}
export function enterEncounter(run: DungeonRunState): DungeonRunState {
  const pool = EVENT_DEFINITIONS.filter(event => event.id !== run.lastEventId);
  const random = randomStep(run.rngState);
  const definition = run.currentRoom === 'altar' ? ALTAR_DEFINITION : pool[Math.floor(random.value * pool.length)];
  return { ...run, rngState: run.currentRoom === 'altar' ? run.rngState : random.seed,
    lastEventId: run.currentRoom === 'event' ? definition.id : run.lastEventId,
    encounter: { definitionId: definition.id, selectedChoiceId: null, costPaid: false, resolved: false, pendingGold: 0 } };
}
export function choiceDisabledReason(run: DungeonRunState, choice: EventChoice): string | null {
  for (const requirement of choice.requirements ?? []) {
    if (requirement.type === 'gold' && run.gold < requirement.amount) return 'Not enough Gold';
    if (requirement.type === 'hp') {
      const targets = run.combat.party.filter(p => p.currentHp > 0 && (!requirement.targetId || p.definitionId === requirement.targetId));
      if (!targets.length || targets.some(p => p.currentHp <= Math.ceil(getEffectiveCharacter(run.combat, p.definitionId).stats.maxHp * requirement.ratio))) return 'Not enough HP';
    }
  }
  // Also enforce fixed costs when a future definition omits its display requirement.
  const cost = choice.effects.reduce((sum, effect) => sum + (effect.type === 'gold' ? Math.max(0, -effect.min) : 0), 0);
  return run.gold < cost ? 'Not enough Gold' : null;
}

/** Pure room effects. No DOM, floor progression, or independent Buff ownership. */
export function applyEncounterEffects(initial: DungeonRunState, effects: readonly EventEffect[]) {
  let run = initial;
  let buffWeights: RarityWeights | undefined;
  let goldReward = 0;
  const messages: string[] = [];
  const apply = (effect: EventEffect): void => {
    if (effect.type === 'random') {
      const random = randomStep(run.rngState); run = { ...run, rngState: random.seed };
      let roll = random.value * effect.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
      const outcome = effect.outcomes.find(outcome => (roll -= outcome.weight) < 0) ?? effect.outcomes[effect.outcomes.length - 1];
      outcome.effects.forEach(apply);
    } else if (effect.type === 'gold') {
      const random = randomStep(run.rngState);
      const amount = effect.min + Math.floor(random.value * (effect.max - effect.min + 1));
      run = { ...run, rngState: random.seed, gold: run.gold + Math.min(0, amount) };
      goldReward += Math.max(0, amount);
      messages.push(`Gold ${amount >= 0 ? '+' : ''}${amount}`);
    } else if (effect.type === 'buff') {
      buffWeights = effect.weights;
      messages.push(effect.weights.common === 0 && effect.weights.uncommon === 0 ? 'Rare / Epicの祝福を選択' : '祝福を選択');
    } else if (effect.type === 'heal' || effect.type === 'damage') {
      const before = run.combat;
      let combat = before;
      if (effect.type === 'heal') combat = recoverParty(combat, effect.ratio, effect.targetId);
      else {
        for (const member of before.party) {
          if (member.currentHp <= 0 || (effect.targetId && effect.targetId !== member.definitionId)) continue;
          const hp = Math.max(effect.nonlethal ? 1 : 0, member.currentHp - Math.ceil(getEffectiveCharacter(before, member.definitionId).stats.maxHp * effect.ratio));
          const amount = member.currentHp - hp;
          if (amount <= 0) continue;
          combat = { ...combat, party: combat.party.map(p => p.definitionId === member.definitionId ? { ...p, currentHp: hp } : p) };
          combat = appendEvent(combat, 'ally-damaged', `HP -${amount}`, { targetId: member.definitionId, amount });
        }
      }
      for (const member of combat.party) {
        const delta = member.currentHp - before.party.find(p => p.definitionId === member.definitionId)!.currentHp;
        if (delta) messages.push(`${getEffectiveCharacter(combat, member.definitionId).name} HP ${delta > 0 ? '+' : ''}${delta}`);
      }
      if (combat.party.every((p, i) => p.currentHp === before.party[i].currentHp)) messages.push('HP変化なし');
      run = { ...run, combat };
    } else messages.push('何もせず立ち去った。');
  };
  effects.forEach(apply);
  return { run, buffWeights, goldReward, message: messages.join(' · ') };
}
