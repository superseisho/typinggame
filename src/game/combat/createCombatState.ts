import { CHARACTER_DEFINITIONS } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import { TYPING_SENTENCES } from '../../data/typingSentences';
import type { CombatState } from '../../types/game';
import { createTypingEngineState } from '../typing/typingEngine';
import { emptyBuffResources } from '../buffs/buffConfig';

export function createCombatState(enemyIds: readonly string[] = GAME_CONFIG.firstEncounterEnemyIds): CombatState {
  const enemies = enemyIds.map((enemyId, index) => {
    const enemy = ENEMIES_BY_ID[enemyId];
    if (!enemy) throw new Error(`Unknown enemy: ${enemyId}`);
    return {
      skillCooldowns: {},
      nextActionSkillId: null,
      cover: null,
      instanceId: `${enemyId}-${index + 1}`,
      definitionId: enemy.id,
      formationIndex: index,
      currentHp: enemy.maxHp,
      cooldownRemainingMs: enemy.attackCooldown,
      specialGauge: 0,
      attackMultiplier: 1,
      defenseMultiplier: 1,
      cooldownMultiplier: 1,
      statuses: [],
      pendingSpecial: null,
    };
  });

  return {
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
    typing: createTypingEngineState(TYPING_SENTENCES[0]),
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
