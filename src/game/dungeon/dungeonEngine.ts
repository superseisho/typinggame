import { createCombatState } from '../combat/createCombatState';
import { startCombat, tickCombat } from '../combat/combatEngine';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import type { CombatState } from '../../types/game';
import type { DungeonAction, DungeonRoomType, DungeonRunState } from '../../types/dungeon';
import { DUNGEON_CONFIG, TIER_ONE_ENCOUNTERS } from './dungeonConfig';
import { GAME_CONFIG } from '../../data/gameConfig';
import { ROOMS_BY_TYPE } from '../../data/rooms/roomDefinitions';
import { generateRoomOptions, randomStep } from './roomGenerator';
import { purchasableProduct, recoverParty, recoveryTargets, resolveRest } from './roomResolver';
import { addBuff, applyRunBuffs } from '../buffs/runBuffManager';
import { generateBuffRewards } from '../buffs/buffRewards';
import { BUFF_CONFIG, emptyBuffResources } from '../buffs/buffConfig';
import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { appendEvent } from '../combat/combatEvents';

type BattleRoom = keyof typeof TIER_ONE_ENCOUNTERS;

function freshCombat(previous: CombatState, enemies: readonly string[] = []): CombatState {
  const fresh = createCombatState(enemies);
  return { ...fresh, runBuffs: previous.runBuffs, eventSequence: previous.eventSequence, party: fresh.party.map((member) => ({
    ...member, currentHp: previous.party.find((old) => old.definitionId === member.definitionId)?.currentHp ?? member.currentHp,
  })) };
}

function prepareBattle(run: DungeonRunState, room: BattleRoom, announce: boolean, now: number): DungeonRunState {
  const random = randomStep(run.rngState);
  const formations = TIER_ONE_ENCOUNTERS[room];
  const enemies = formations[Math.floor(random.value * formations.length)];
  const combat = freshCombat(run.combat, enemies);
  return { ...run, rngState: random.seed, currentRoom: room, roomOptions: [], currentCombatMs: 0,
    runStatus: announce ? 'announcement' : 'battle', combat: announce ? combat : startCombat(combat, now) };
}

function enterFloor(run: DungeonRunState): DungeonRunState {
  // Boss / safe exclusions are checked before drawing the ambush roll.
  if (DUNGEON_CONFIG.bossFloors.includes(run.currentFloor)) return prepareBattle(run, 'boss', true, 0);
  if (!DUNGEON_CONFIG.safeFloors.includes(run.currentFloor)) {
    const random = randomStep(run.rngState);
    run = { ...run, rngState: random.seed };
    if (random.value < DUNGEON_CONFIG.ambushChance) return prepareBattle(run, 'ambush', true, 0);
  }
  const { options, seed } = generateRoomOptions(run.rngState, run.currentFloor);
  return { ...run, rngState: seed, runStatus: 'choosing', roomOptions: options };
}

export function createDungeonRun(seed: number, id: string): DungeonRunState {
  return enterFloor({
    activeBuffs: [], buffOptions: [], acquiredBuffId: null,
    id, rngState: seed >>> 0, currentFloor: 1, maxFloor: DUNGEON_CONFIG.maxFloor, enemyTier: 1,
    selectedDifficulty: 'normal', gold: DUNGEON_CONFIG.startingGold, goldEarned: 0,
    currentRoom: null, runStatus: 'choosing', roomOptions: [], combat: createCombatState([]),
    currentCombatMs: 0, statistics: { correctCharacters: 0, misses: 0, maxCombo: 0, timeoutCount: 0, combatMs: 0, enemiesDefeated: 0 },
    clearedRooms: [], purchasedProducts: [], roomMessage: '', endedAt: null,
  });
}

function completeRoom(run: DungeonRunState, reward: number, message: string, now = 0): DungeonRunState {
  if (!run.currentRoom) return run;
  const cleared = run.currentFloor === run.maxFloor;
  return { ...run, runStatus: cleared ? 'cleared' : 'reward', gold: run.gold + reward, goldEarned: run.goldEarned + reward,
    roomMessage: message, endedAt: cleared ? now : null,
    clearedRooms: [...run.clearedRooms, { floor: run.currentFloor, roomType: run.currentRoom, result: 'cleared', goldReward: reward }] };
}

function clearRunBuffs(run: DungeonRunState): DungeonRunState {
  return { ...run, activeBuffs: [], buffOptions: [], acquiredBuffId: null,
    combat: { ...applyRunBuffs(run.combat, []), buffResources: emptyBuffResources() } };
}

function advanceFloor(run: DungeonRunState): DungeonRunState {
  return enterFloor({ ...run, currentFloor: run.currentFloor + 1, currentRoom: null, roomMessage: '', purchasedProducts: [],
    buffOptions: [], acquiredBuffId: null, combat: freshCombat(run.combat), currentCombatMs: 0 });
}

function settleCombat(run: DungeonRunState, combat: CombatState, now: number): DungeonRunState {
  if (combat.status !== 'victory' && combat.status !== 'defeat') return { ...run, combat };
  const old = run.statistics;
  const next = { ...run, combat, statistics: {
    correctCharacters: old.correctCharacters + combat.typing.correctCharacterCount,
    misses: old.misses + combat.typing.missCount,
    maxCombo: Math.max(old.maxCombo, combat.typing.maxCombo),
    timeoutCount: old.timeoutCount + combat.stats.timeoutCount,
    combatMs: old.combatMs + run.currentCombatMs,
    enemiesDefeated: old.enemiesDefeated + combat.enemies.filter((enemy) => enemy.currentHp <= 0).length,
  } };
  if (combat.status === 'defeat') return clearRunBuffs({ ...next, runStatus: 'game_over', endedAt: now,
    clearedRooms: [...run.clearedRooms, { floor: run.currentFloor, roomType: run.currentRoom!, result: 'failed', goldReward: 0 }] });
  const range = DUNGEON_CONFIG.rewards[run.currentRoom as BattleRoom];
  const random = randomStep(run.rngState);
  const gold = range[0] + Math.floor(random.value * (range[1] - range[0] + 1));
  const completed = completeRoom({ ...next, rngState: random.seed }, gold, `VICTORY · Gold +${gold}`, now);
  if (completed.runStatus === 'cleared') return clearRunBuffs(completed);
  const reward = generateBuffRewards(completed.activeBuffs, run.currentRoom!, completed.rngState);
  if (reward.choices.length === 0) return { ...completed, rngState: reward.seed,
    gold: completed.gold + BUFF_CONFIG.fallbackGold, goldEarned: completed.goldEarned + BUFF_CONFIG.fallbackGold,
    clearedRooms: completed.clearedRooms.map((room, index) => index === completed.clearedRooms.length - 1
      ? { ...room, goldReward: room.goldReward + BUFF_CONFIG.fallbackGold } : room),
    roomMessage: `${completed.roomMessage} · 取得可能なBuffなし：追加Gold +${BUFF_CONFIG.fallbackGold}` };
  return { ...completed, rngState: reward.seed, runStatus: 'buff_reward', buffOptions: reward.choices };
}

/** Each command is valid in exactly one phase. Callers also supply a floor/run token. */
export function reduceDungeon(run: DungeonRunState, action: DungeonAction, expectedFloor = run.currentFloor, expectedRunId = run.id): DungeonRunState {
  if (run.currentFloor !== expectedFloor || run.id !== expectedRunId) return run;
  if (run.runStatus === 'cleared' || run.runStatus === 'game_over') return run;
  switch (action.type) {
    case 'choose-buff': {
      if (run.runStatus !== 'buff_reward' || !run.buffOptions.includes(action.buffId)) return run;
      const activeBuffs = addBuff(run.activeBuffs, action.buffId);
      if (activeBuffs === run.activeBuffs) return run;
      const buff = BUFFS_BY_ID[action.buffId];
      return { ...run, activeBuffs, runStatus: 'buff_acquired', acquiredBuffId: buff.id,
        combat: appendEvent(applyRunBuffs(run.combat, activeBuffs), 'ally-buff', `BLESSING ACQUIRED · ${buff.name}`, { abilityId: buff.id, soundId: buff.soundId }) };
    }
    case 'finish-buff':
      return run.runStatus === 'buff_acquired' ? advanceFloor(run) : run;
    case 'choose': {
      if (run.runStatus !== 'choosing') return run;
      const option = run.roomOptions.find((candidate) => candidate.id === action.optionId);
      if (!option) return run;
      if (option.type === 'battle' || option.type === 'elite') {
        return prepareBattle(run, option.type, false, action.now);
      }
      const next: DungeonRunState = { ...run, currentRoom: option.type, runStatus: 'room', roomOptions: [] };
      if (option.type !== 'treasure') return next;
      const random = randomStep(run.rngState);
      const treasure = DUNGEON_CONFIG.treasure;
      return random.value < treasure.goldChance
        ? completeRoom({ ...next, rngState: random.seed }, treasure.gold, `Treasure · Gold +${treasure.gold}`)
        : completeRoom({ ...next, rngState: random.seed, combat: recoverParty(next.combat, treasure.recoveryRatio) }, 0, `Treasure · 生存者のHP +${treasure.recoveryRatio * 100}%`);
    }
    case 'enter-battle':
      if (run.runStatus !== 'announcement') return run;
      return { ...run, runStatus: 'battle', combat: startCombat(run.combat, action.now) };
    case 'tick': {
      if (run.runStatus !== 'battle' || !Number.isFinite(action.deltaMs) || action.deltaMs <= 0) return run;
      const elapsed = Math.min(action.deltaMs, GAME_CONFIG.maxFrameDeltaMs);
      return settleCombat({ ...run, currentCombatMs: run.currentCombatMs + elapsed }, tickCombat(run.combat, elapsed, action.now), action.now);
    }
    case 'key':
      return run.runStatus !== 'battle' ? run : settleCombat(run, handleCombatTyping(run.combat, action.key, action.now), action.now);
    case 'rest': {
      if (run.runStatus !== 'room' || run.currentRoom !== 'rest') return run;
      const combat = resolveRest(run.combat, action.action, action.targetId);
      return combat ? completeRoom({ ...run, combat }, 0, action.action === 'revive' ? 'Revive · 味方が復活した' : 'Recovery · 休息を終えた') : run;
    }
    case 'purchase': {
      if (run.runStatus !== 'room' || run.currentRoom !== 'shop') return run;
      const product = purchasableProduct(action.productId, run.gold, run.purchasedProducts);
      if (!product || !recoveryTargets(run.combat).some((member) => member.definitionId === action.targetId)) return run;
      return { ...run, gold: run.gold - product.price, purchasedProducts: [...run.purchasedProducts, product.id],
        combat: recoverParty(run.combat, product.recoveryRatio, action.targetId), roomMessage: `${product.name} を使用した · −${product.price} Gold` };
    }
    case 'leave-shop':
      return run.runStatus === 'room' && run.currentRoom === 'shop' ? completeRoom(run, 0, 'Shop · 買い物を終えた') : run;
    case 'advance':
      if (run.runStatus !== 'reward') return run;
      return advanceFloor(run);
  }
}

export function roomName(type: DungeonRoomType | null): string {
  return type === 'boss' ? 'Boss Battle' : type === 'ambush' ? 'Ambush' : type ? ROOMS_BY_TYPE[type].name : '';
}

export function getRunResults(run: DungeonRunState) {
  const stats = run.statistics;
  const total = stats.correctCharacters + stats.misses;
  return { ...stats, accuracy: total === 0 ? 100 : stats.correctCharacters / total * 100,
    wpm: stats.combatMs <= 0 ? 0 : stats.correctCharacters / 5 / (stats.combatMs / 60000) };
}
