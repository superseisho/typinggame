import { CHARACTER_DEFINITIONS } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import { createSentenceDeck } from '../typing/sentenceDeck';
import type { CombatState } from '../../types/game';
import { createTypingEngineState } from '../typing/typingEngine';
import { emptyBuffResources } from '../buffs/buffConfig';

export function createCombatState(enemyIds: readonly string[] = GAME_CONFIG.firstEncounterEnemyIds, sentenceDeck = createSentenceDeck(0x73656e74)): CombatState {
  const enemies = enemyIds.map((enemyId, index) => {
    const enemy = ENEMIES_BY_ID[enemyId];
    if (!enemy) throw new Error(`Unknown enemy: ${enemyId}`);
    return {
      nextAttackEmpowerMultiplier: 1,
      actionDurationMs: 0,
      nextActionSkillId: null,
      cover: null,
      instanceId: `${enemyId}-${index + 1}`,
      definitionId: enemy.id,
      formationIndex: index,
      currentHp: enemy.maxHp,
      actionRemainingMs: 0,
      specialGauge: 0,
      attackMultiplier: 1,
      defenseMultiplier: 1,
      actionTimeMultiplier: 1,
      statuses: [],
      pendingSpecial: null,
    };
  });

  return {
    buffRngState: 0x62756666,
    lastMissProtected: false,
    sentenceDeck,
    typingCurseBonus: 0,
    typingCurseRemainingMs: 0,
    skillRngState: 0x12345678,
    targetEnemyId: enemies[0]?.instanceId ?? null,
    runBuffs: [],
    buffResources: emptyBuffResources(),
    status: 'ready',
    party: CHARACTER_DEFINITIONS.map((character) => ({
      definitionId: character.id,
      currentHp: character.stats.maxHp,
      attackCharge: 0,
      abilityCharge: 0,
      statuses: [],
    })),
    enemies,
    // Exploration / announcement does not display or consume a sentence.
    typing: { ...createTypingEngineState({ id: '', text: '', reading: '', difficulty: 1 }), completed: true },
    stats: {
      startedAt: null,
      endedAt: null,
      timeoutCount: 0,
    },
    partyTargetCursor: 0,
    eventSequence: 0,
    events: [],
    log: [],
  };
}
