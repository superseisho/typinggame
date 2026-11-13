import { appendEvent } from './combatEvents';
import { getEffectiveCharacter, getBuffModifier, getComboMultiplier, getBuffEffectValue } from '../buffs/buffModifiers';
import { handleBuffTrigger, getExtraHealing, consumeDamageShield } from '../buffs/buffEffectHandlers';
import { BUFF_CONFIG, emptyBuffResources } from '../buffs/buffConfig';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import type { CombatState } from '../../types/game';
import type { TypingEngineState } from '../../types/typing';
import { areEnemiesDefeated, isPartyDefeated } from './combatSelectors';
import { chooseEnemyAbility, executeEnemyAbility } from './enemyAbilityEngine';
import { selectLowestPartyHpIndex, selectRandomPartyTarget } from './targeting';
import { ensureValidEnemyTarget, resolveCurrentEnemyTarget } from './enemyTarget';
import { cleanupEnemyState, resolveEnemyDamage, resolveEnemyDamageWithHits } from './enemyDamage';
import { tickEnemyBurns } from './damageOverTime';
import { performEnemySkill, planEnemyAction } from './enemySkillEngine';
import { drawSentence } from '../typing/sentenceDeck';
import { createTypingEngineState } from '../typing/typingEngine';
import { TYPING_SENTENCES_BY_ID } from '../../data/typingSentences';
import { getCorrectInputChargeMultiplier, getTargetedBuffValue } from '../buffs/buffModifiers';
import { syncGuardState } from './guardState';

const ABILITY_STATUS_PREFIX = 'ability:';

function setAbilityStatus(state: CombatState, characterId: string, abilityId: string, active: boolean): CombatState {
  const status = `${ABILITY_STATUS_PREFIX}${abilityId}`;
  return {
    ...state,
    party: state.party.map((member) => member.definitionId !== characterId ? member : {
      ...member,
      statuses: active
        ? member.statuses.includes(status) ? member.statuses : [...member.statuses, status]
        : member.statuses.filter((candidate) => candidate !== status),
    }),
  };
}

function triggerAllyAbility(state: CombatState, characterId: string, applyPersistentStatus: boolean): CombatState {
  const character = CHARACTERS_BY_ID[characterId as keyof typeof CHARACTERS_BY_ID];
  let withStatus = applyPersistentStatus
    ? setAbilityStatus(state, character.id, character.ability.id, true)
    : state;
  if (character.ability.effects.some(effect => effect.type === 'guard-next-hit')) {
    withStatus = syncGuardState({ ...withStatus, party: withStatus.party.map(member => member.definitionId === character.id
      ? { ...member, guardCharges: 1 + getTargetedBuffValue(state.runBuffs, 'guard-extra-charge', character.id) } : member) });
  }
  const isHeal = character.ability.effects.some((effect) => effect.type === 'heal-lowest-ally');
  return appendEvent(
    withStatus,
    'ally-ability-triggered',
    `${character.name}の「${character.ability.name}」が発動した。`,
    {
      actorId: character.id,
      abilityId: character.ability.id,
      soundId: isHeal ? undefined : character.ability.soundId,
    },
  );
}

function applyAreaAbilityDamage(state: CombatState, characterId: string, power: number, attackSnapshot: number): CombatState {
  const character = CHARACTERS_BY_ID[characterId as keyof typeof CHARACTERS_BY_ID];
  const damage = resolveEnemyDamageWithHits(state, {
    targetIds: state.enemies.filter(enemy => enemy.currentHp > 0).map(enemy => enemy.instanceId),
    power, kind: 'ally-ability-damage', label: `${character.name}の「${character.ability.name}」`,
    actorId: character.id, abilityId: character.ability.id, directCharacterDamage: true,
  });
  return handleBuffTrigger(damage.state, { type: 'ability-hit', characterId: character.id, targetIds: damage.hitTargetIds, attackSnapshot });
}

function finishIfDefeated(state: CombatState, now: number): CombatState {
  if (!isPartyDefeated(state.party)) return state;
  return appendEvent(
    cleanupEnemyState({ ...state, targetEnemyId: null, status: 'defeat', stats: { ...state.stats, endedAt: now } }),
    'defeat',
    'パーティーは闇に呑まれた。',
  );
}

export function startCombat(state: CombatState, now = Date.now()): CombatState {
  if (state.status !== 'ready') return state;
  const drawn = drawSentence(state.sentenceDeck);
  state = { ...state, status: 'active', sentenceDeck: drawn.deck,
    lastMissProtected: false,
    buffResources: { ...emptyBuffResources(), focusRechargeMs: Array(getBuffEffectValue(state.runBuffs, 'miss-protection')).fill(0) },
    party: state.party.map(member => ({ ...member, guardCharges: 0, statuses: member.statuses.filter(status => status !== 'ability:guard') })),
    typing: createTypingEngineState(TYPING_SENTENCES_BY_ID[drawn.sentenceId]) };
  for (let index = 0; index < state.enemies.length; index++) state = planEnemyAction(state, index);
  return appendEvent(
    { ...state, targetEnemyId: state.enemies.find(enemy => enemy.currentHp > 0)?.instanceId ?? null, status: 'active', stats: { ...state.stats, startedAt: now } },
    'system',
    '戦闘開始 — ローマ字を打ち、仲間の攻撃を導け。',
  );
}

export function applyTypingMiss(
  state: CombatState,
  typing: TypingEngineState,
  _now = Date.now(),
): CombatState {
  if (state.status !== 'active') return state;
  // Consume protection BEFORE every negative Miss effect. The typo remains a recorded Miss.
  const charge = state.buffResources.focusRechargeMs.findIndex(ms => ms <= 0);
  if (charge >= 0 && getBuffEffectValue(state.runBuffs, 'miss-protection') > 0) {
    return appendEvent({ ...state, lastMissProtected: true,
      typing: { ...state.typing, missCount: typing.missCount, lastInput: 'miss' },
      buffResources: { ...state.buffResources, focusRechargeMs: state.buffResources.focusRechargeMs.map((ms, i) => i === charge ? BUFF_CONFIG.unbrokenFocusRechargeMs : ms) },
    }, 'typing-miss', 'PROTECTED · Unbroken Focusがミスの戦闘ペナルティを防いだ。', { abilityId: 'unbroken-focus' });
  }
  const gaugeGain = Math.max(0, (GAME_CONFIG.enemySpecialGaugeOnMiss + state.typingCurseBonus) * Math.max(BUFF_CONFIG.minMissGaugeMultiplier, 1 + getBuffModifier(state.runBuffs, 'missGauge', 'warrior')) - state.buffResources.gaugeShield);
  const endedComboUsers = state.party.filter((member) => {
    const character = CHARACTERS_BY_ID[member.definitionId];
    return character.ability.visual.kind === 'combo'
      && member.statuses.includes(`${ABILITY_STATUS_PREFIX}${character.ability.id}`);
  });
  let nextState = appendEvent(
    {
      ...state,
      lastMissProtected: false,
      typing,
      buffResources: { ...state.buffResources, gaugeShield: 0 },
      party: state.party.map((member) => {
        const character = CHARACTERS_BY_ID[member.definitionId];
        return character.ability.visual.kind !== 'combo' ? member : {
          ...member,
          statuses: member.statuses.filter(
            (status) => status !== `${ABILITY_STATUS_PREFIX}${character.ability.id}`,
          ),
        };
      }),
      enemies: state.enemies.map((enemy) => enemy.currentHp <= 0 ? enemy : {
        ...enemy,
        specialGauge: Math.min(
          ENEMIES_BY_ID[enemy.definitionId].specialGaugeMax,
          enemy.specialGauge + gaugeGain,
        ),
      }),
    },
    'typing-miss',
    '入力ミス — 敵の特殊ゲージが上昇した。',
  );

  for (const member of endedComboUsers) {
    const character = CHARACTERS_BY_ID[member.definitionId];
    nextState = appendEvent(
      nextState,
      'ally-ability-ended',
      `${character.name}の「${character.ability.name}」がミスで途切れた。`,
      { actorId: character.id, abilityId: character.ability.id },
    );
  }

  for (let index = 0; index < nextState.enemies.length; index += 1) {
    const enemy = nextState.enemies[index];
    const previous = state.enemies[index];
    const definition = ENEMIES_BY_ID[enemy.definitionId];
    const reachedMax = previous.specialGauge < definition.specialGaugeMax
      && enemy.specialGauge >= definition.specialGaugeMax;
    if (!reachedMax || enemy.currentHp <= 0 || enemy.pendingSpecial) continue;
    const ability = chooseEnemyAbility(nextState, enemy);
    if (!ability) continue;
    nextState = {
      ...nextState,
      enemies: nextState.enemies.map((candidate, enemyIndex) => enemyIndex === index
        ? { ...candidate, pendingSpecial: { abilityId: ability.id, remainingMs: GAME_CONFIG.enemySpecialDelayMs } }
        : candidate),
    };
    nextState = appendEvent(
      nextState,
      'enemy-special-ready',
      `${definition.name}のSpecial GaugeがMAX！`,
      { actorId: enemy.instanceId, abilityId: ability.id, effectType: ability.effects[0]?.effectType },
    );
  }
  return nextState;
}

export function applyCorrectTyping(
  state: CombatState,
  typing: TypingEngineState,
  now = Date.now(),
): CombatState {
  if (state.status !== 'active') return state;
  const charge = getCorrectInputChargeMultiplier(state.runBuffs);
  const completedPrompt = typing.completedSentences > state.typing.completedSentences;
  let nextState: CombatState = {
    ...state,
    lastMissProtected: false,
    typing,
    party: state.party.map((character) => {
      if (character.currentHp <= 0) return character;
      const trigger = getEffectiveCharacter(state, character.definitionId).ability.trigger;
      const abilityGain = trigger.type === 'correct-characters' || (completedPrompt && trigger.type === 'completed-prompts') ? charge : 0;
      return { ...character, attackCharge: character.attackCharge + charge, abilityCharge: character.abilityCharge + abilityGain };
    }),
  };
  nextState = appendEvent(nextState, 'typing-correct', '正解入力', {}, false);
  nextState = handleBuffTrigger(nextState, { type: 'perfect-streak', streak: typing.currentCombo });
  const chargedAbilities = new Set<string>();

  for (const combatant of nextState.party) {
    if (combatant.currentHp <= 0) continue;
    const character = getEffectiveCharacter(nextState, combatant.definitionId);
    const trigger = character.ability.trigger;
    if (trigger.type === 'completed-prompts') {
      if (completedPrompt && combatant.abilityCharge >= trigger.threshold) {
        nextState = { ...nextState, party: nextState.party.map(member => member.definitionId === character.id
          ? { ...member, abilityCharge: member.abilityCharge % trigger.threshold } : member) };
        nextState = triggerAllyAbility(nextState, character.id, true);
      }
      continue;
    }
    if (trigger.type === 'correct-characters') {
      const reachedThreshold = combatant.abilityCharge >= trigger.threshold;
      if (!reachedThreshold) continue;
      chargedAbilities.add(character.id);
      nextState = { ...nextState, party: nextState.party.map(member => member.definitionId === character.id
        ? { ...member, abilityCharge: 0 } : member) };
      nextState = triggerAllyAbility(
        nextState,
        character.id,
        character.ability.visual.persistence === 'persistent',
      );
      const attackSnapshot = character.stats.attack;
      // Preserve the existing flat base Ability and Wide Magic. Only battle growth scales
      // it by the same ratio that it adds to Effective Attack, alongside static Attack buffs.
      const withoutGrowth = getEffectiveCharacter({ ...nextState, buffResources: { ...nextState.buffResources,
        abilityAttackGrowth: { ...nextState.buffResources.abilityAttackGrowth, [character.id]: 0 } } }, character.id).stats.attack;
      for (const effect of character.ability.effects) {
        if (effect.type === 'damage-all-enemies') {
          nextState = applyAreaAbilityDamage(nextState, character.id, effect.power * attackSnapshot / Math.max(1, withoutGrowth), attackSnapshot);
        }
      }
      nextState = handleBuffTrigger(nextState, { type: 'ability-resolved', characterId: character.id });
      continue;
    }
    if (trigger.thresholds.some((threshold) => threshold === typing.currentCombo)) {
      nextState = triggerAllyAbility(
        nextState,
        character.id,
        character.ability.visual.persistence === 'persistent',
      );
    }
  }

  if (areEnemiesDefeated(nextState.enemies)) {
    return appendEvent(
      cleanupEnemyState({ ...nextState, targetEnemyId: null, status: 'victory', stats: { ...nextState.stats, endedAt: now } }),
      'victory',
      '敵部隊を殲滅した。',
    );
  }

  for (const combatant of nextState.party) {
    if (combatant.currentHp <= 0) continue;
    const character = getEffectiveCharacter(nextState, combatant.definitionId);
    const trigger = character.ability.trigger;
    if (trigger.type !== 'correct-characters' || !chargedAbilities.has(character.id)) continue;
    for (const effect of character.ability.effects) {
      if (effect.type !== 'heal-lowest-ally') continue;
      const targetIndex = selectLowestPartyHpIndex(nextState);
      if (targetIndex === null) continue;
      const target = nextState.party[targetIndex];
      const targetDefinition = getEffectiveCharacter(nextState, target.definitionId);
      const amount = Math.min(effect.power + getExtraHealing(nextState, character.id, target.definitionId), targetDefinition.stats.maxHp - target.currentHp);
      if (amount <= 0) continue;
      nextState = {
        ...nextState,
        party: nextState.party.map((member, index) => index === targetIndex
          ? { ...member, currentHp: member.currentHp + amount }
          : member),
      };
      nextState = appendEvent(
        nextState,
        'ally-heal',
        `${character.name}の「${character.ability.name}」！ ${targetDefinition.name}のHPが ${amount} 回復した。`,
        {
          actorId: character.id,
          targetId: target.definitionId,
          amount,
          abilityId: character.ability.id,
          soundId: character.ability.soundId,
        },
      );
      nextState = handleBuffTrigger(nextState, { type: 'heal', characterId: character.id, targetId: target.definitionId });
    }
  }

  return resolveReadyAllyAttacks(nextState, now);
}

/** One normal attack per ready living ally; shared by typing and successful-guard effects. */
export function resolveReadyAllyAttacks(state: CombatState, now = Date.now()): CombatState {
  if (state.status !== 'active') return state;
  let nextState = finishIfVictorious(state, now);
  if (nextState.status !== 'active') return nextState;
  for (let partyIndex = 0; partyIndex < nextState.party.length; partyIndex += 1) {
    const combatant = nextState.party[partyIndex];
    const character = getEffectiveCharacter(nextState, combatant.definitionId);
    if (combatant.currentHp <= 0 || combatant.attackCharge < character.attackThreshold) continue;
    nextState = ensureValidEnemyTarget(nextState);
    const target = resolveCurrentEnemyTarget(nextState);
    if (!target) break;
    const comboMultiplier = getComboMultiplier(nextState, character.id);
    const counterBonus = nextState.buffResources.counters[character.id] ?? 0;
    const power = Math.round(character.stats.attack * comboMultiplier * (1 + counterBonus));
    const guaranteedAoe = nextState.buffResources.nextNormalAoe[character.id] ?? false;
    nextState = {
      ...nextState,
      party: nextState.party.map((member, index) => index === partyIndex
        ? {
            ...member,
            attackCharge: member.attackCharge - character.attackThreshold,
          }
        : member),
      buffResources: { ...nextState.buffResources, counters: { ...nextState.buffResources.counters, [character.id]: 0 },
        nextNormalAoe: { ...nextState.buffResources.nextNormalAoe, [character.id]: false } },
    };
    nextState = resolveEnemyDamage(nextState, { targetIds: guaranteedAoe ? nextState.enemies.filter(e => e.currentHp > 0).map(e => e.instanceId) : [target.instanceId], power,
      kind: 'ally-attack', label: `${character.name}の攻撃`, actorId: character.id, soundId: character.audio.attack, directCharacterDamage: true, guaranteedAoe });
    if (areEnemiesDefeated(nextState.enemies)) {
      return appendEvent(
        cleanupEnemyState({ ...nextState, targetEnemyId: null, status: 'victory', stats: { ...nextState.stats, endedAt: now } }),
        'victory',
        '敵部隊を殲滅した。',
      );
    }
  }
  return ensureValidEnemyTarget(nextState);
}

function finishIfVictorious(state: CombatState, now: number): CombatState {
  if (state.status !== 'active' || !areEnemiesDefeated(state.enemies)) return state;
  return appendEvent(cleanupEnemyState({ ...state, targetEnemyId: null, status: 'victory', stats: { ...state.stats, endedAt: now } }),
    'victory', '敵部隊を殲滅した。');
}

function performEnemyAttack(state: CombatState, enemyIndex: number, now: number, powerMultiplier = 1): CombatState {
  const actor = state.enemies[enemyIndex];
  if (!actor || actor.currentHp <= 0) return state;
  const livingParty = state.party
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.currentHp > 0);
  if (livingParty.length === 0) return finishIfDefeated(state, now);

  const guardedIndex = state.party.findIndex((member) => (
    member.currentHp > 0 && member.guardCharges > 0
  ));
  const selection = guardedIndex >= 0 ? { state, index: guardedIndex } : selectRandomPartyTarget(state);
  state = selection.state;
  const targetIndex = selection.index!;
  const target = state.party[targetIndex];
  const targetDefinition = getEffectiveCharacter(state, target.definitionId);
  const enemyDefinition = ENEMIES_BY_ID[actor.definitionId];
  const attack = Math.round(enemyDefinition.attack * actor.attackMultiplier * powerMultiplier * actor.nextAttackEmpowerMultiplier);
  const guarded = guardedIndex === targetIndex;
  const incoming = consumeDamageShield(state, target.definitionId, guarded ? 0 : Math.max(1, attack - targetDefinition.stats.defense));
  state = incoming.state;
  const damage = incoming.damage;
  const targetHp = Math.max(0, target.currentHp - damage);

  let nextState: CombatState = {
    ...state,
    party: state.party.map((member, index) => index === targetIndex ? {
      ...member,
      currentHp: targetHp,
      guardCharges: guarded ? Math.max(0, member.guardCharges - 1) : member.guardCharges,
      statuses: guarded && member.guardCharges <= 1
        ? member.statuses.filter((status) => status !== `${ABILITY_STATUS_PREFIX}guard`)
        : member.statuses,
    } : member),
    partyTargetCursor: state.partyTargetCursor + 1,
    enemies: state.enemies.map((enemy, index) => index === enemyIndex
      ? { ...enemy, nextAttackEmpowerMultiplier: 1 } : enemy),
  };
  nextState = guarded
    ? appendEvent(
        nextState,
        'ally-guard-consumed',
        `${targetDefinition.name}のGUARDが攻撃を防いだ。`,
        { actorId: actor.instanceId, targetId: target.definitionId, abilityId: 'guard' },
      )
    : appendEvent(
        nextState,
        'ally-damaged',
        `${enemyDefinition.name}の攻撃！ ${targetDefinition.name}は ${damage} ダメージ。`,
        { actorId: actor.instanceId, targetId: target.definitionId, amount: target.currentHp - targetHp, targetHpAfter: targetHp },
      );
  if (guarded) {
    nextState = handleBuffTrigger(nextState, { type: 'guard', characterId: target.definitionId, attackerEnemyInstanceId: actor.instanceId });
    nextState = resolveReadyAllyAttacks(nextState, now);
  }
  if (targetHp === 0) {
    nextState = appendEvent(nextState, 'ally-defeated', `${targetDefinition.name}は戦闘不能になった。`, { targetId: target.definitionId });
  }
  return finishIfDefeated(syncGuardState(nextState), now);
}

export function tickCombat(state: CombatState, deltaMs: number, now = Date.now()): CombatState {
  if (state.status !== 'active' || deltaMs <= 0) return state;
  const typingCurseRemainingMs = Math.max(0, state.typingCurseRemainingMs - deltaMs);
  let nextState: CombatState = {
    ...state,
    buffResources: { ...state.buffResources, focusRechargeMs: state.buffResources.focusRechargeMs.map(ms => Math.max(0, ms - deltaMs)),
      timedPartyModifiers: Object.fromEntries(Object.entries(state.buffResources.timedPartyModifiers)
        .filter(([, modifier]) => modifier.remainingMs > deltaMs)
        .map(([stat, modifier]) => [stat, { ...modifier, remainingMs: modifier.remainingMs - deltaMs }])) },
    typingCurseRemainingMs,
    typingCurseBonus: typingCurseRemainingMs > 0 ? state.typingCurseBonus : 0,
    enemies: state.enemies.map((enemy) => enemy.currentHp <= 0
      ? enemy
      : {
          ...enemy,
          actionRemainingMs: enemy.actionRemainingMs - deltaMs,
          pendingFrostDelayMs: Math.max(0, enemy.pendingFrostDelayMs - deltaMs),
          pendingSpecial: enemy.pendingSpecial
            ? { ...enemy.pendingSpecial, remainingMs: enemy.pendingSpecial.remainingMs - deltaMs }
            : null,
        }),
  };

  nextState = finishIfVictorious(tickEnemyBurns(nextState, deltaMs), now);
  if (nextState.status !== 'active') return nextState;

  for (let index = 0; index < nextState.enemies.length; index += 1) {
    const actor = nextState.enemies[index];
    if (actor.currentHp <= 0 || !actor.pendingSpecial || actor.pendingSpecial.remainingMs > 0) continue;
    const ability = ENEMIES_BY_ID[actor.definitionId].specialAbilities.find(
      (candidate) => candidate.id === actor.pendingSpecial?.abilityId,
    );
    if (!ability) continue;
    const resolution = executeEnemyAbility(nextState, actor.instanceId, ability);
    nextState = resolution.events.reduce(
      (current, event) => appendEvent(current, event.kind, event.message, event),
      resolution.state,
    );
    nextState = finishIfDefeated(nextState, now);
    if (nextState.status === 'defeat') return nextState;
  }

  for (let index = 0; index < nextState.enemies.length; index += 1) {
    if (nextState.enemies[index].currentHp > 0 && nextState.enemies[index].actionRemainingMs <= 0) {
      nextState = performEnemySkill(nextState, index, now, performEnemyAttack);
      if (nextState.status !== 'active') break;
    }
  }
  return ensureValidEnemyTarget(nextState);
}
