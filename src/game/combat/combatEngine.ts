import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import type { CombatEvent, CombatEventKind, CombatState } from '../../types/game';
import type { TypingEngineState } from '../../types/typing';
import { areEnemiesDefeated, isPartyDefeated } from './combatSelectors';
import { chooseEnemyAbility, executeEnemyAbility } from './enemyAbilityEngine';
import { selectEnemyTargetIndex, selectLowestPartyHpIndex } from './targeting';

type CombatEventDetails = Omit<Partial<CombatEvent>, 'id' | 'kind' | 'message'>;
const ABILITY_STATUS_PREFIX = 'ability:';

function appendEvent(
  state: CombatState,
  kind: CombatEventKind,
  message: string,
  details: CombatEventDetails = {},
  visibleInLog = true,
): CombatState {
  const id = state.eventSequence + 1;
  const event: CombatEvent = { id, kind, message, ...details };
  return {
    ...state,
    eventSequence: id,
    events: [...state.events, event].slice(-GAME_CONFIG.combatEventHistoryLimit),
    log: visibleInLog ? [...state.log, event].slice(-GAME_CONFIG.combatLogLimit) : state.log,
  };
}

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
  const withStatus = applyPersistentStatus
    ? setAbilityStatus(state, character.id, character.ability.id, true)
    : state;
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

function applyAreaAbilityDamage(state: CombatState, characterId: string, power: number): CombatState {
  const character = CHARACTERS_BY_ID[characterId as keyof typeof CHARACTERS_BY_ID];
  let nextState = state;
  for (const target of state.enemies) {
    if (target.currentHp <= 0) continue;
    const enemy = ENEMIES_BY_ID[target.definitionId];
    const defense = Math.round(enemy.defense * target.defenseMultiplier);
    const damage = Math.max(1, power - defense);
    const targetHp = Math.max(0, target.currentHp - damage);
    nextState = {
      ...nextState,
      enemies: nextState.enemies.map((candidate) => candidate.instanceId === target.instanceId
        ? { ...candidate, currentHp: targetHp }
        : candidate),
    };
    nextState = appendEvent(
      nextState,
      'ally-ability-damage',
      `${character.name}の「${character.ability.name}」！ ${enemy.name}へ ${damage} ダメージ。`,
      {
        actorId: character.id,
        targetId: target.instanceId,
        amount: damage,
        abilityId: character.ability.id,
      },
    );
    if (targetHp === 0) {
      nextState = appendEvent(nextState, 'enemy-defeated', `${enemy.name}を撃破した。`, { targetId: target.instanceId });
    }
  }
  return nextState;
}

function finishIfDefeated(state: CombatState, now: number): CombatState {
  if (!isPartyDefeated(state.party)) return state;
  return appendEvent(
    { ...state, status: 'defeat', stats: { ...state.stats, endedAt: now } },
    'defeat',
    'パーティーは闇に呑まれた。',
  );
}

export function startCombat(state: CombatState, now = Date.now()): CombatState {
  if (state.status !== 'ready') return state;
  return appendEvent(
    { ...state, status: 'active', stats: { ...state.stats, startedAt: now } },
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
  const endedComboUsers = state.party.filter((member) => {
    const character = CHARACTERS_BY_ID[member.definitionId];
    return character.ability.visual.kind === 'combo'
      && member.statuses.includes(`${ABILITY_STATUS_PREFIX}${character.ability.id}`);
  });
  let nextState = appendEvent(
    {
      ...state,
      typing,
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
          enemy.specialGauge + GAME_CONFIG.enemySpecialGaugeOnMiss,
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
  let nextState: CombatState = {
    ...state,
    typing,
    party: state.party.map((character) => character.currentHp <= 0
      ? character
      : { ...character, attackCharge: character.attackCharge + 1 }),
  };
  nextState = appendEvent(nextState, 'typing-correct', '正解入力', {}, false);

  for (const combatant of nextState.party) {
    if (combatant.currentHp <= 0) continue;
    const character = CHARACTERS_BY_ID[combatant.definitionId];
    const trigger = character.ability.trigger;
    if (trigger.type === 'completed-prompts') {
      const justCompletedPrompt = typing.completedSentences > state.typing.completedSentences;
      if (justCompletedPrompt && typing.completedSentences % trigger.threshold === 0) {
        nextState = triggerAllyAbility(nextState, character.id, true);
      }
      continue;
    }
    if (trigger.type === 'perfect-streak') {
      const reachedThreshold = typing.currentCombo > 0 && typing.currentCombo % trigger.threshold === 0;
      if (!reachedThreshold) continue;
      nextState = triggerAllyAbility(
        nextState,
        character.id,
        character.ability.visual.persistence === 'persistent',
      );
      for (const effect of character.ability.effects) {
        if (effect.type === 'damage-all-enemies') {
          nextState = applyAreaAbilityDamage(nextState, character.id, effect.power);
        }
      }
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
      { ...nextState, status: 'victory', stats: { ...nextState.stats, endedAt: now } },
      'victory',
      '敵部隊を殲滅した。',
    );
  }

  for (const combatant of nextState.party) {
    if (combatant.currentHp <= 0) continue;
    const character = CHARACTERS_BY_ID[combatant.definitionId];
    const trigger = character.ability.trigger;
    if (trigger.type !== 'perfect-streak'
      || typing.currentCombo === 0
      || typing.currentCombo % trigger.threshold !== 0) continue;
    for (const effect of character.ability.effects) {
      if (effect.type !== 'heal-lowest-ally') continue;
      const targetIndex = selectLowestPartyHpIndex(nextState);
      if (targetIndex === null) continue;
      const target = nextState.party[targetIndex];
      const targetDefinition = CHARACTERS_BY_ID[target.definitionId];
      const amount = Math.min(effect.power, targetDefinition.stats.maxHp - target.currentHp);
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
    }
  }

  for (let partyIndex = 0; partyIndex < nextState.party.length; partyIndex += 1) {
    const combatant = nextState.party[partyIndex];
    const character = CHARACTERS_BY_ID[combatant.definitionId];
    if (combatant.currentHp <= 0 || combatant.attackCharge < character.attackThreshold) continue;
    const targetIndex = selectEnemyTargetIndex(nextState, character.targetRule);
    if (targetIndex === null) break;

    const target = nextState.enemies[targetIndex];
    const enemy = ENEMIES_BY_ID[target.definitionId];
    const defense = Math.round(enemy.defense * target.defenseMultiplier);
    const comboEffect = character.ability.effects.find((effect) => effect.type === 'combo-attack-scaling');
    const comboTrigger = character.ability.trigger.type === 'combo-milestones' ? character.ability.trigger : null;
    const reachedComboTier = comboTrigger
      ? comboTrigger.thresholds.filter((threshold) => typing.currentCombo >= threshold).length
      : 0;
    const comboMultiplier = comboEffect?.type === 'combo-attack-scaling' && reachedComboTier > 0
      ? comboEffect.multipliers[reachedComboTier - 1]
      : 1;
    const damage = Math.max(1, Math.round(character.stats.attack * comboMultiplier) - defense);
    const targetHp = Math.max(0, target.currentHp - damage);
    nextState = {
      ...nextState,
      party: nextState.party.map((member, index) => index === partyIndex
        ? {
            ...member,
            attackCharge: member.attackCharge - character.attackThreshold,
          }
        : member),
      enemies: nextState.enemies.map((member, index) => index === targetIndex
        ? { ...member, currentHp: targetHp }
        : member),
      enemyTargetCursor: nextState.enemyTargetCursor + 1,
    };
    nextState = appendEvent(
      nextState,
      'ally-attack',
      `${character.name}の攻撃！ ${enemy.name}へ ${damage} ダメージ。`,
      {
        actorId: character.id,
        targetId: target.instanceId,
        amount: damage,
        soundId: character.audio.attack,
      },
    );

    if (targetHp === 0) {
      nextState = appendEvent(nextState, 'enemy-defeated', `${enemy.name}を撃破した。`, { targetId: target.instanceId });
    }
    if (areEnemiesDefeated(nextState.enemies)) {
      return appendEvent(
        { ...nextState, status: 'victory', stats: { ...nextState.stats, endedAt: now } },
        'victory',
        '敵部隊を殲滅した。',
      );
    }
  }
  return nextState;
}

function performEnemyAttack(state: CombatState, enemyIndex: number, now: number): CombatState {
  const actor = state.enemies[enemyIndex];
  if (!actor || actor.currentHp <= 0) return state;
  const livingParty = state.party
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.currentHp > 0);
  if (livingParty.length === 0) return finishIfDefeated(state, now);

  const guardedIndex = state.party.findIndex((member) => (
    member.currentHp > 0 && member.statuses.includes(`${ABILITY_STATUS_PREFIX}guard`)
  ));
  const targetIndex = guardedIndex >= 0
    ? guardedIndex
    : livingParty[state.partyTargetCursor % livingParty.length].index;
  const target = state.party[targetIndex];
  const targetDefinition = CHARACTERS_BY_ID[target.definitionId];
  const enemyDefinition = ENEMIES_BY_ID[actor.definitionId];
  const attack = Math.round(enemyDefinition.attack * actor.attackMultiplier);
  const guarded = guardedIndex === targetIndex;
  const damage = guarded ? 0 : Math.max(1, attack - targetDefinition.stats.defense);
  const targetHp = Math.max(0, target.currentHp - damage);
  const cooldown = enemyDefinition.attackCooldown * actor.cooldownMultiplier;

  let nextState: CombatState = {
    ...state,
    party: state.party.map((member, index) => index === targetIndex ? {
      ...member,
      currentHp: targetHp,
      statuses: guarded
        ? member.statuses.filter((status) => status !== `${ABILITY_STATUS_PREFIX}guard`)
        : member.statuses,
    } : member),
    enemies: state.enemies.map((enemy, index) => index === enemyIndex
      ? { ...enemy, cooldownRemainingMs: Math.max(0, cooldown + enemy.cooldownRemainingMs) }
      : enemy),
    partyTargetCursor: state.partyTargetCursor + 1,
  };
  nextState = guarded
    ? appendEvent(
        nextState,
        'ally-guard-consumed',
        `${targetDefinition.name}のGUARDが攻撃を防いだ。`,
        { actorId: target.definitionId, targetId: target.definitionId, abilityId: 'guard' },
      )
    : appendEvent(
        nextState,
        'ally-damaged',
        `${enemyDefinition.name}の攻撃！ ${targetDefinition.name}は ${damage} ダメージ。`,
        { actorId: actor.instanceId, targetId: target.definitionId, amount: damage },
      );
  if (targetHp === 0) {
    nextState = appendEvent(nextState, 'ally-defeated', `${targetDefinition.name}は戦闘不能になった。`, { targetId: target.definitionId });
  }
  return finishIfDefeated(nextState, now);
}

export function tickCombat(state: CombatState, deltaMs: number, now = Date.now()): CombatState {
  if (state.status !== 'active' || deltaMs <= 0) return state;
  let nextState: CombatState = {
    ...state,
    enemies: state.enemies.map((enemy) => enemy.currentHp <= 0
      ? enemy
      : {
          ...enemy,
          cooldownRemainingMs: enemy.cooldownRemainingMs - deltaMs,
          pendingSpecial: enemy.pendingSpecial
            ? { ...enemy.pendingSpecial, remainingMs: enemy.pendingSpecial.remainingMs - deltaMs }
            : null,
        }),
  };

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
    if (nextState.enemies[index].currentHp > 0 && nextState.enemies[index].cooldownRemainingMs <= 0) {
      nextState = performEnemyAttack(nextState, index, now);
      if (nextState.status === 'defeat') break;
    }
  }
  return nextState;
}
