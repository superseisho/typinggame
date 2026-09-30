import { describe, expect, it } from 'vitest';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import { applyCorrectTyping, applyTypingMiss, startCombat, tickCombat } from './combatEngine';
import { getCharacterVisualState } from './characterVisualState';
import { createCombatState } from './createCombatState';
import { handleCombatTyping } from './handleCombatTyping';
import { createTypingEngineState } from '../typing/typingEngine';

describe('combat engine', () => {
  it('routes an o miss at を through the normal combat miss effects', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1000);
    const typing = { ...createTypingEngineState({ id: 'wo-test', text: 'を', reading: 'を', difficulty: 1 }), currentCombo: 20, maxCombo: 20 };
    const active = applyCorrectTyping(started, typing, 1001);
    expect(active.party.find(p => p.definitionId === 'martial-artist')!.statuses).toContain('ability:flow-combo');
    const missed = handleCombatTyping(active, 'o', 1002);
    // A different invalid key must produce exactly the same gameplay/event state.
    expect(missed).toEqual(handleCombatTyping(active, 'x', 1002));
    expect(missed.typing.missCount).toBe(1);
    expect(missed.typing.segmentIndex).toBe(0);
    expect(missed.party.find(p => p.definitionId === 'martial-artist')!.statuses).not.toContain('ability:flow-combo');
    expect(missed.party.map(p => p.attackCharge)).toEqual(active.party.map(p => p.attackCharge));
    expect(missed.enemies[0].specialGauge).toBeGreaterThan(active.enemies[0].specialGauge);
  });
  it('creates one or multiple enemies with unique runtime state', () => {
    expect(createCombatState(['crypt-slime']).enemies).toHaveLength(1);
    const multiple = createCombatState(['crypt-slime', 'crypt-slime', 'grave-shaman']);
    expect(new Set(multiple.enemies.map((enemy) => enemy.instanceId)).size).toBe(3);
  });

  it('charges only living party members from shared correct input', () => {
    const started = startCombat(createCombatState(), 1_000);
    const state = { ...started, party: started.party.map((member, index) => index === 0 ? { ...member, currentHp: 0 } : member) };
    const next = applyCorrectTyping(state, state.typing, 1_001);
    expect(next.party.map((member) => member.attackCharge)).toEqual([0, 1, 1, 1]);
  });

  it('uses the automatic initial target when a threshold is reached', () => {
    let state = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    const mageThreshold = CHARACTERS_BY_ID.mage.attackThreshold;
    for (let index = 0; index < mageThreshold; index += 1) {
      state = applyCorrectTyping(state, state.typing, 1_001 + index);
    }
    const slime = ENEMIES_BY_ID['crypt-slime'];
    expect(state.enemies[0].currentHp).toBe(slime.maxHp - (CHARACTERS_BY_ID.mage.stats.attack - slime.defense) - (24 - slime.defense));
    expect(state.enemies[1].currentHp).toBe(ENEMIES_BY_ID['grave-shaman'].maxHp - 23);
    const attackEvent = state.events.find((event) => event.kind === 'ally-attack');
    expect(attackEvent).toMatchObject({ actorId: 'mage', amount: 20, soundId: 'mage_attack' });
  });

  it('emits an audible cleric heal event at 50 accumulated correct characters', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const injured = {
      ...started,
      party: started.party.map((member) => member.definitionId === 'warrior'
        ? { ...member, currentHp: member.currentHp - 40 }
        : { ...member, abilityCharge: member.definitionId === 'cleric' ? 49 : 0 }),
    };
    const typing = { ...injured.typing, currentCombo: 50, maxCombo: 50, correctCharacterCount: 50 };
    const healed = applyCorrectTyping(injured, typing, 2_000);
    expect(healed.party[0].currentHp).toBe(CHARACTERS_BY_ID.warrior.stats.maxHp);
    expect(healed.events.find((event) => event.kind === 'ally-heal')).toMatchObject({
      actorId: 'cleric',
      targetId: 'warrior',
      amount: 40,
      soundId: 'cleric_heal',
    });
    expect(healed.events.find((event) => (
      event.kind === 'ally-ability-triggered' && event.actorId === 'cleric'
    ))).toMatchObject({ abilityId: 'heal' });
  });

  it('does not emit an ally heal event when nobody can recover HP', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const typing = { ...started.typing, currentCombo: 50, maxCombo: 50, correctCharacterCount: 50 };
    const healed = applyCorrectTyping({ ...started, party: started.party.map(p => ({ ...p, abilityCharge: p.definitionId === 'cleric' ? 49 : 0 })) }, typing, 2_000);

    expect(healed.events.some((event) => event.kind === 'ally-heal')).toBe(false);
  });

  it('activates guard after three prompts and consumes it to block the next attack', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const first = applyCorrectTyping(started, { ...started.typing, completedSentences: 1 }, 1_001);
    const second = applyCorrectTyping(first, { ...first.typing, completedSentences: 2 }, 1_002);
    expect(second.party[0].statuses).not.toContain('ability:guard');
    const guarded = applyCorrectTyping(second, { ...second.typing, completedSentences: 3 }, 1_003);
    expect(guarded.party[0].statuses).toContain('ability:guard');
    expect(getCharacterVisualState(CHARACTERS_BY_ID.warrior, guarded.party[0])).toBe('guard_active');
    expect(guarded.events.find((event) => event.kind === 'ally-ability-triggered')).toMatchObject({
      actorId: 'warrior',
      abilityId: 'guard',
    });

    const attacked = tickCombat(guarded, ENEMIES_BY_ID['crypt-slime'].skills[0].actionTimeMs, 6_000);
    expect(attacked.party[0].currentHp).toBe(CHARACTERS_BY_ID.warrior.stats.maxHp);
    expect(attacked.party[0].statuses).not.toContain('ability:guard');
    expect(getCharacterVisualState(CHARACTERS_BY_ID.warrior, attacked.party[0])).toBe('normal');
    expect(attacked.events.find((event) => event.kind === 'ally-guard-consumed')).toMatchObject({
      actorId: 'crypt-slime-1',
      targetId: 'warrior',
      abilityId: 'guard',
    });
  });

  it('ends the martial artist combo state immediately on a typing miss', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const comboTyping = { ...started.typing, currentCombo: 20, maxCombo: 20 };
    const active = applyCorrectTyping(started, comboTyping, 1_001);
    const activeFighter = active.party.find((member) => member.definitionId === 'martial-artist')!;
    expect(activeFighter.statuses).toContain('ability:flow-combo');
    expect(getCharacterVisualState(CHARACTERS_BY_ID['martial-artist'], activeFighter)).toBe('combo_active');

    const missedTyping = { ...active.typing, currentCombo: 0, missCount: active.typing.missCount + 1 };
    const ended = applyTypingMiss(active, missedTyping, 1_002);
    const endedFighter = ended.party.find((member) => member.definitionId === 'martial-artist')!;
    expect(endedFighter.statuses).not.toContain('ability:flow-combo');
    expect(getCharacterVisualState(CHARACTERS_BY_ID['martial-artist'], endedFighter)).toBe('normal');
    expect(ended.events.find((event) => event.kind === 'ally-ability-ended')).toMatchObject({
      actorId: 'martial-artist',
      abilityId: 'flow-combo',
    });
  });

  it('uses Arcane Burst as an instant all-enemy attack', () => {
    const started = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    const primed = {
      ...started,
      party: started.party.map((member) => ({ ...member, attackCharge: 0, abilityCharge: member.definitionId === 'mage' ? 29 : 0 })),
    };
    const typing = { ...primed.typing, currentCombo: 30, maxCombo: 30 };
    const cast = applyCorrectTyping(primed, typing, 1_001);
    const slime = ENEMIES_BY_ID['crypt-slime'];
    const shaman = ENEMIES_BY_ID['grave-shaman'];
    expect(cast.enemies[0].currentHp).toBe(slime.maxHp - (24 - slime.defense));
    expect(cast.enemies[1].currentHp).toBe(shaman.maxHp - (24 - shaman.defense));
    expect(cast.events.filter((event) => event.kind === 'ally-ability-damage')).toHaveLength(2);
    expect(cast.events.find((event) => event.kind === 'ally-ability-triggered')).toMatchObject({
      actorId: 'mage',
      abilityId: 'arcane-burst',
    });
  });

  it('lets every living enemy advance and perform planned actions', () => {
    const state = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    const next = tickCombat(state, ENEMIES_BY_ID['crypt-slime'].skills[0].actionTimeMs, 6_000);
    expect(next.party[0].currentHp).toBeLessThan(CHARACTERS_BY_ID.warrior.stats.maxHp);
    expect(next.enemies[1].actionRemainingMs).toBe(1_500);
    const hit = next.events.find(event => event.kind === 'ally-damaged')!;
    expect(hit.targetHpAfter).toBe(next.party[0].currentHp);
    expect(hit.amount).toBe(state.party[0].currentHp - next.party[0].currentHp);
  });

  it('raises special gauges on miss and executes damage/healing abilities at max', () => {
    let state = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    state = {
      ...state,
      enemies: state.enemies.map((enemy, index) => index === 0 ? { ...enemy, currentHp: enemy.currentHp - 50 } : enemy),
    };
    const requiredMisses = Math.max(...state.enemies.map(enemy =>
      Math.ceil(ENEMIES_BY_ID[enemy.definitionId].specialGaugeMax / GAME_CONFIG.enemySpecialGaugeOnMiss)));
    for (let index = 0; index < requiredMisses; index += 1) {
      const typing = { ...state.typing, missCount: state.typing.missCount + 1 };
      state = applyTypingMiss(state, typing, 2_000 + index);
    }
    expect(state.enemies.every((enemy) => enemy.pendingSpecial !== null)).toBe(true);
    expect(state.events.filter((event) => event.kind === 'enemy-special-ready')).toHaveLength(2);
    state = tickCombat(state, 750, 2_750);
    expect(state.party.every((member) => member.currentHp < CHARACTERS_BY_ID[member.definitionId].stats.maxHp)).toBe(true);
    expect(state.enemies[0].currentHp).toBeGreaterThan(100);
    expect(state.enemies.every(enemy => enemy.specialGauge === 0)).toBe(true);
    expect(state.log.some((event) => event.kind === 'enemy-special-used')).toBe(true);
    expect(state.events.find((event) => event.kind === 'enemy-special-used')).toMatchObject({
      effectType: 'damage',
      soundId: 'enemy_special_damage',
    });
  });

  it('wins after the final enemy is defeated', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const state = {
      ...started,
      enemies: started.enemies.map((enemy) => ({ ...enemy, currentHp: 1 })),
      party: started.party.map((member) => member.definitionId === 'mage'
        ? { ...member, attackCharge: CHARACTERS_BY_ID.mage.attackThreshold - 1 }
        : member),
    };
    expect(applyCorrectTyping(state, state.typing, 2_000).status).toBe('victory');
  });

  it('ends in defeat when an offensive special knocks out the whole party', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const state = {
      ...started,
      party: started.party.map((member) => ({ ...member, currentHp: 1 })),
      enemies: started.enemies.map((enemy) => ({ ...enemy,
        specialGauge: ENEMIES_BY_ID[enemy.definitionId].specialGaugeMax - GAME_CONFIG.enemySpecialGaugeOnMiss })),
    };
    const typing = { ...state.typing, missCount: 1 };
    const warned = applyTypingMiss(state, typing, 2_000);
    expect(warned.status).toBe('active');
    expect(warned.events.at(-1)?.kind).toBe('enemy-special-ready');
    expect(tickCombat(warned, 750, 2_750).status).toBe('defeat');
  });
});
