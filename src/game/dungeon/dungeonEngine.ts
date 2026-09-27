import { createCombatState } from '../combat/createCombatState';
import { startCombat, tickCombat } from '../combat/combatEngine';
import { moveEnemyTarget, selectEnemyTarget } from '../combat/enemyTarget';
import { handleCombatTyping } from '../combat/handleCombatTyping';
import type { CombatState } from '../../types/game';
import type { DungeonAction, DungeonRoomType, DungeonRunState } from '../../types/dungeon';
import { DUNGEON_CONFIG } from './dungeonConfig';
import { BOSS_ENCOUNTERS } from './enemyEncounterConfig';
import { generateEnemyEncounter } from './enemyEncounterGenerator';
import { GAME_CONFIG } from '../../data/gameConfig';
import { ROOMS_BY_TYPE } from '../../data/rooms/roomDefinitions';
import { generatePreBossRooms, generateRoomOptions, randomStep } from './roomGenerator';
import { isPreBossFloor } from './floorRules';
import { applyEncounterEffects, choiceDisabledReason, enterEncounter, getEncounter } from './encounterEngine';
import { recoverParty, resolveRest } from './roomResolver';
import { generateShop, purchaseShopItem } from './shopEngine';
import { SHOP_CONFIG } from './shopConfig';
import { TREASURE_CONFIG } from './treasureConfig';
import { drawTreasure } from './treasureEngine';
import { addBuff, applyRunBuffs } from '../buffs/runBuffManager';
import { generateBuffRewards } from '../buffs/buffRewards';
import { BUFF_CONFIG, emptyBuffResources } from '../buffs/buffConfig';
import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { appendEvent } from '../combat/combatEvents';
import { createSentenceDeck } from '../typing/sentenceDeck';

type BattleRoom = 'battle' | 'elite' | 'ambush' | 'boss';

function freshCombat(previous: CombatState, enemies: readonly string[] = []): CombatState {
  const fresh = createCombatState(enemies, previous.sentenceDeck);
  return { ...fresh, runBuffs: previous.runBuffs, eventSequence: previous.eventSequence, party: fresh.party.map((member) => ({
    ...member, currentHp: previous.party.find((old) => old.definitionId === member.definitionId)?.currentHp ?? member.currentHp,
  })) };
}

function prepareBattle(run: DungeonRunState, room: BattleRoom, announce: boolean, now: number, trap = false): DungeonRunState {
  const encounter = room === 'boss'
    ? { enemyIds: BOSS_ENCOUNTERS[run.enemyTier], seed: run.rngState }
    : generateEnemyEncounter(run.rngState, trap ? 'treasure_trap' : room, run.enemyTier);
  const combat = { ...freshCombat(run.combat, encounter.enemyIds), skillRngState: encounter.seed, buffRngState: (encounter.seed ^ 0x62756666) >>> 0 };
  return { ...run, rngState: encounter.seed, currentRoom: trap ? 'treasure' : room, combatSource: trap ? 'treasure_trap' : 'room', roomOptions: [], currentCombatMs: 0,
    runStatus: announce ? 'announcement' : 'battle', combat: announce ? combat : startCombat(combat, now) };
}

function enterFloor(run: DungeonRunState): DungeonRunState {
  // Boss / safe exclusions are checked before drawing the ambush roll.
  if (DUNGEON_CONFIG.bossFloors.includes(run.currentFloor)) return prepareBattle(run, 'boss', true, 0);
  // Safe preparation: neither the ambush roll nor normal room generation runs here.
  if (isPreBossFloor(run.currentFloor)) return { ...run, runStatus: 'choosing', roomOptions: generatePreBossRooms(run.currentFloor) };
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
    encounter: null, lastEventId: null,
    shop: null, treasure: null, combatSource: 'room',
    activeBuffs: [], buffOptions: [], acquiredBuffId: null,
    id, rngState: seed >>> 0, currentFloor: 1, maxFloor: DUNGEON_CONFIG.maxFloor, enemyTier: 1,
    selectedDifficulty: 'normal', gold: DUNGEON_CONFIG.startingGold, goldEarned: 0,
    currentRoom: null, runStatus: 'choosing', roomOptions: [], combat: createCombatState([], createSentenceDeck((seed ^ 0x73656e74) >>> 0)),
    currentCombatMs: 0, statistics: { correctCharacters: 0, misses: 0, maxCombo: 0, timeoutCount: 0, combatMs: 0, enemiesDefeated: 0 },
    clearedRooms: [], roomMessage: '', endedAt: null,
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
  return enterFloor({ ...run, currentFloor: run.currentFloor + 1, currentRoom: null, roomMessage: '', shop: null, treasure: null, encounter: null, combatSource: 'room',
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
  const trap = run.combatSource === 'treasure_trap';
  const range = trap ? TREASURE_CONFIG.trapGold : DUNGEON_CONFIG.rewards[run.currentRoom as BattleRoom];
  const random = randomStep(run.rngState);
  const gold = range[0] + Math.floor(random.value * (range[1] - range[0] + 1));
  const completed = completeRoom({ ...next, rngState: random.seed }, gold, `VICTORY · Gold +${gold}`, now);
  if (completed.runStatus === 'cleared') return clearRunBuffs(completed);
  if (trap) return { ...completed, treasure: { opened: true, outcome: 'trap_battle', resolved: true }, roomMessage: `TRAP DEFEATED · Gold +${gold} · 宝箱の報酬はありません` };
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
      const claimed = run.encounter && !run.encounter.resolved
        ? completeRoom({ ...run, encounter: { ...run.encounter, resolved: true, pendingGold: 0 } }, run.encounter.pendingGold, `${run.roomMessage} · BLESSING ACQUIRED: ${buff.name}`)
        : run.currentRoom === 'treasure' && run.treasure && !run.treasure.resolved
        ? completeRoom({ ...run, treasure: { ...run.treasure, resolved: true } }, 0, `TREASURE FOUND · ${buff.name}`) : run;
      return { ...claimed, activeBuffs, runStatus: 'buff_acquired', acquiredBuffId: buff.id,
        combat: appendEvent(applyRunBuffs(run.combat, activeBuffs), 'ally-buff', `BLESSING ACQUIRED · ${buff.name}`, { abilityId: buff.id, soundId: buff.soundId }) };
    }
    case 'finish-buff':
      return run.runStatus === 'buff_acquired' ? run.encounter ? { ...run, runStatus: 'reward' } : advanceFloor(run) : run;
    case 'choose': {
      if (run.runStatus !== 'choosing') return run;
      const option = run.roomOptions.find((candidate) => candidate.id === action.optionId);
      if (!option) return run;
      if (option.type === 'battle' || option.type === 'elite') {
        return prepareBattle(run, option.type, false, action.now);
      }
      const next: DungeonRunState = { ...run, currentRoom: option.type, runStatus: 'room', roomOptions: [] };
      if (option.type === 'event' || option.type === 'altar') return enterEncounter(next);
      if (option.type === 'shop') {
        const generated = generateShop(next);
        return { ...next, shop: generated.shop, rngState: generated.seed };
      }
      return option.type === 'treasure' ? { ...next, treasure: { opened: false, outcome: null, resolved: false } } : next;
    }
    case 'encounter-choice': {
      if (run.runStatus !== 'room' || !run.encounter || run.encounter.selectedChoiceId || (run.currentRoom !== 'event' && run.currentRoom !== 'altar')) return run;
      const choice = getEncounter(run)?.choices.find(choice => choice.id === action.choiceId);
      if (!choice || choiceDisabledReason(run, choice)) return run;
      const result = applyEncounterEffects(run, choice.effects);
      const next: DungeonRunState = { ...result.run, roomMessage: result.message,
        encounter: { ...run.encounter, selectedChoiceId: choice.id, costPaid: true, pendingGold: result.goldReward } };
      if (next.combat.party.every(member => member.currentHp <= 0)) return clearRunBuffs({ ...next, runStatus: 'game_over', endedAt: action.now,
        encounter: { ...next.encounter!, resolved: true },
        clearedRooms: [...next.clearedRooms, { floor: next.currentFloor, roomType: next.currentRoom!, result: 'failed', goldReward: 0 }] });
      if (result.buffWeights) {
        const reward = generateBuffRewards(next.activeBuffs, next.currentRoom!, next.rngState, { weights: result.buffWeights });
        if (reward.choices.length) return { ...next, rngState: reward.seed, runStatus: 'buff_reward', buffOptions: reward.choices };
        return completeRoom({ ...next, rngState: reward.seed, encounter: { ...next.encounter!, resolved: true, pendingGold: 0 } }, result.goldReward + BUFF_CONFIG.fallbackGold,
          `${result.message} · 取得可能なBuffなし · Gold +${BUFF_CONFIG.fallbackGold}`);
      }
      return completeRoom({ ...next, encounter: { ...next.encounter!, resolved: true, pendingGold: 0 } }, result.goldReward, result.message);
    }
    case 'open-treasure': {
      if (run.runStatus !== 'room' || run.currentRoom !== 'treasure' || !run.treasure || run.treasure.opened) return run;
      const result = drawTreasure(run.rngState);
      const next: DungeonRunState = { ...run, rngState: result.seed, treasure: { opened: true, outcome: result.outcome, resolved: false } };
      if (result.outcome === 'trap_battle') return prepareBattle(next, 'battle', true, 0, true);
      if (result.outcome === 'buff' || result.outcome === 'rare_buff') {
        const reward = generateBuffRewards(run.activeBuffs, 'treasure', next.rngState,
          { weights: result.outcome === 'rare_buff' ? TREASURE_CONFIG.rareBuffWeights : TREASURE_CONFIG.buffWeights });
        const message = result.outcome === 'rare_buff' ? 'RARE TREASURE! · Rare以上確定' : 'TREASURE FOUND! · 無料の祝福';
        if (reward.choices.length) return { ...next, rngState: reward.seed, runStatus: 'buff_reward', buffOptions: reward.choices, roomMessage: message };
        return completeRoom({ ...next, rngState: reward.seed, treasure: { ...next.treasure!, resolved: true } }, BUFF_CONFIG.fallbackGold, `${message} · 取得可能なBuffなし · Gold +${BUFF_CONFIG.fallbackGold}`);
      }
      const resolved = { ...next, treasure: { ...next.treasure!, resolved: true } };
      if (result.outcome === 'party_heal') return completeRoom({ ...resolved, combat: recoverParty(run.combat, TREASURE_CONFIG.healRatio) }, 0, `PARTY RECOVERED · 生存者HP +${TREASURE_CONFIG.healRatio * 100}%（Downは回復しません）`);
      const random = randomStep(next.rngState);
      const gold = TREASURE_CONFIG.gold.min + Math.floor(random.value * (TREASURE_CONFIG.gold.max - TREASURE_CONFIG.gold.min + 1));
      return completeRoom({ ...resolved, rngState: random.seed }, gold, `TREASURE FOUND! · +${gold} GOLD`);
    }
    case 'enter-battle':
      if (run.runStatus !== 'announcement') return run;
      return { ...run, runStatus: 'battle', combat: startCombat(run.combat, action.now) };
    case 'tick': {
      if (run.runStatus !== 'battle' || !Number.isFinite(action.deltaMs) || action.deltaMs <= 0) return run;
      const elapsed = Math.min(action.deltaMs, GAME_CONFIG.maxFrameDeltaMs);
      return settleCombat({ ...run, currentCombatMs: run.currentCombatMs + elapsed }, tickCombat(run.combat, elapsed, action.now), action.now);
    }
    case 'move-enemy-target': {
      if (run.runStatus !== 'battle') return run;
      const combat = moveEnemyTarget(run.combat, action.direction);
      return combat === run.combat ? run : { ...run, combat };
    }
    case 'select-enemy-target': {
      if (run.runStatus !== 'battle') return run;
      const combat = selectEnemyTarget(run.combat, action.enemyId);
      return combat === run.combat ? run : { ...run, combat };
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
      return purchaseShopItem(run, action.productId, action.targetId);
    }
    case 'reroll-shop': {
      if (run.runStatus !== 'room' || run.currentRoom !== 'shop' || !run.shop || action.revision !== run.shop.rerollCount || run.gold < SHOP_CONFIG.rerollCost) return run;
      const generated = generateShop(run, run.shop.rerollCount + 1);
      return { ...run, gold: run.gold - SHOP_CONFIG.rerollCost, rngState: generated.seed, shop: generated.shop, roomMessage: '商品を入れ替えました' };
    }
    case 'leave-shop':
      return run.runStatus === 'room' && run.currentRoom === 'shop' ? advanceFloor(completeRoom(run, 0, 'Shop · 買い物を終えた')) : run;
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
