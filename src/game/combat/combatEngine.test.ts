import { describe, expect, it } from 'vitest';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import { applyCorrectTyping, applyTypingMiss, startCombat, tickCombat } from './combatEngine';
import { createCombatState } from './createCombatState';

describe('combat engine', () => {
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

  it('uses character target rules when a threshold is reached', () => {
    let state = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    const mageThreshold = CHARACTERS_BY_ID.mage.attackThreshold;
    for (let index = 0; index < mageThreshold; index += 1) {
      state = applyCorrectTyping(state, state.typing, 1_001 + index);
    }
    const slime = ENEMIES_BY_ID['crypt-slime'];
    expect(state.enemies[0].currentHp).toBe(slime.maxHp - (CHARACTERS_BY_ID.mage.stats.attack - slime.defense));
    expect(state.enemies[1].currentHp).toBe(ENEMIES_BY_ID['grave-shaman'].maxHp);
    const attackEvent = state.events.find((event) => event.kind === 'ally-attack');
    expect(attackEvent).toMatchObject({ actorId: 'mage', amount: 20, soundId: 'mage_attack' });
  });

  it('emits an audible cleric heal event at a 50-character perfect streak', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const injured = {
      ...started,
      party: started.party.map((member) => member.definitionId === 'warrior'
        ? { ...member, currentHp: member.currentHp - 40 }
        : member),
    };
    const typing = { ...injured.typing, currentCombo: 50, maxCombo: 50, correctCharacterCount: 50 };
    const healed = applyCorrectTyping(injured, typing, 2_000);
    expect(healed.party[0].currentHp).toBe(CHARACTERS_BY_ID.warrior.stats.maxHp - 10);
    expect(healed.events.find((event) => event.kind === 'ally-heal')).toMatchObject({
      actorId: 'cleric',
      targetId: 'warrior',
      amount: 30,
      soundId: 'cleric_heal',
    });
  });

  it('lets every living enemy advance and perform cooldown attacks', () => {
    const state = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    const next = tickCombat(state, ENEMIES_BY_ID['crypt-slime'].attackCooldown, 6_000);
    expect(next.party[0].currentHp).toBeLessThan(CHARACTERS_BY_ID.warrior.stats.maxHp);
    expect(next.enemies[1].cooldownRemainingMs).toBe(1_500);
  });

  it('raises special gauges on miss and executes damage/healing abilities at max', () => {
    let state = startCombat(createCombatState(['crypt-slime', 'grave-shaman']), 1_000);
    state = {
      ...state,
      enemies: state.enemies.map((enemy, index) => index === 0 ? { ...enemy, currentHp: enemy.currentHp - 50 } : enemy),
    };
    for (let index = 0; index < 4; index += 1) {
      const typing = { ...state.typing, missCount: state.typing.missCount + 1 };
      state = applyTypingMiss(state, typing, 2_000 + index);
    }
    expect(state.enemies.every((enemy) => enemy.pendingSpecial !== null)).toBe(true);
    expect(state.events.filter((event) => event.kind === 'enemy-special-ready')).toHaveLength(2);
    state = tickCombat(state, 750, 2_750);
    expect(state.party.every((member) => member.currentHp < CHARACTERS_BY_ID[member.definitionId].stats.maxHp)).toBe(true);
    expect(state.enemies[0].currentHp).toBeGreaterThan(100);
    expect(state.enemies.every((enemy) => enemy.specialGauge === 0)).toBe(true);
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
      enemies: started.enemies.map((enemy) => ({ ...enemy, specialGauge: 75 })),
    };
    const typing = { ...state.typing, missCount: 1 };
    const warned = applyTypingMiss(state, typing, 2_000);
    expect(warned.status).toBe('active');
    expect(warned.events.at(-1)?.kind).toBe('enemy-special-ready');
    expect(tickCombat(warned, 750, 2_750).status).toBe('defeat');
  });
});
