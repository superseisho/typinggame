import { describe, expect, it } from 'vitest';
import { CHARACTERS_BY_ID } from '../../data/characters';
import { TRANSIENT_ABILITY_VISUAL_MS } from '../../data/gameConfig';
import { createCombatState } from './createCombatState';
import {
  findUnconsumedAbilityTrigger,
  getCharacterVisualState,
  LOW_HP_VISUAL_THRESHOLD,
} from './characterVisualState';

describe('character visual state', () => {
  const combat = createCombatState();
  const warrior = CHARACTERS_BY_ID.warrior;
  const member = combat.party.find((candidate) => candidate.definitionId === warrior.id)!;

  it('uses normal art while HP is above the danger threshold', () => {
    expect(getCharacterVisualState(warrior, member)).toBe('normal');
  });

  it('switches to low HP art only below 30 percent', () => {
    const atThreshold = { ...member, currentHp: warrior.stats.maxHp * LOW_HP_VISUAL_THRESHOLD };
    const belowThreshold = { ...member, currentHp: atThreshold.currentHp - 1 };
    expect(getCharacterVisualState(warrior, atThreshold)).toBe('normal');
    expect(getCharacterVisualState(warrior, belowThreshold)).toBe('low_hp');
  });

  it('prioritizes down over every ability state', () => {
    const down = { ...member, currentHp: 0, statuses: ['ability:guard'] };
    expect(getCharacterVisualState(warrior, down, { sourceEventId: 1, kind: 'guard' })).toBe('down');
  });

  it('prioritizes persistent guard art over low HP', () => {
    const guarding = {
      ...member,
      currentHp: 1,
      statuses: ['ability:guard'],
    };
    expect(getCharacterVisualState(warrior, guarding)).toBe('low_hp_guard_active');
  });

  it('uses combined low HP art for instant cast and returns to low HP afterward', () => {
    const mage = CHARACTERS_BY_ID.mage;
    const mageMember = combat.party.find((candidate) => candidate.definitionId === mage.id)!;
    const injured = { ...mageMember, currentHp: 1 };
    expect(getCharacterVisualState(mage, injured, { sourceEventId: 1, kind: 'cast' })).toBe('low_hp_cast_active');
    expect(getCharacterVisualState(mage, injured)).toBe('low_hp');
  });

  it('shows martial combo only while its combat status remains active', () => {
    const fighter = CHARACTERS_BY_ID['martial-artist'];
    const fighterMember = combat.party.find((candidate) => candidate.definitionId === fighter.id)!;
    expect(getCharacterVisualState(fighter, fighterMember)).toBe('normal');
    const active = { ...fighterMember, statuses: ['ability:flow-combo'] };
    expect(getCharacterVisualState(fighter, active)).toBe('combo_active');
  });

  it.each([
    ['mage', 'cast_active'],
    ['cleric', 'heal_active'],
  ] as const)('uses a one-second instant visual for %s', (characterId, activeState) => {
    const character = CHARACTERS_BY_ID[characterId];
    const characterMember = combat.party.find((candidate) => candidate.definitionId === character.id)!;
    expect(character.ability.visual.persistence).toBe('instant');
    expect(character.ability.visual.displayMs).toBe(TRANSIENT_ABILITY_VISUAL_MS);
    expect(getCharacterVisualState(character, characterMember, {
      sourceEventId: 1,
      kind: character.ability.visual.kind,
    })).toBe(activeState);
    expect(getCharacterVisualState(character, characterMember)).toBe('normal');
  });

  it.each(['mage', 'cleric'] as const)(
    'consumes a %s activation once and never replays it for later misses',
    (characterId) => {
      const activation = {
        id: 12,
        kind: 'ally-ability-triggered' as const,
        actorId: characterId,
        abilityId: CHARACTERS_BY_ID[characterId].ability.id,
        message: 'ability',
      };
      const misses = [13, 14, 15].map((id) => ({
        id,
        kind: 'typing-miss' as const,
        message: 'miss',
      }));
      const events = [activation, ...misses];

      expect(findUnconsumedAbilityTrigger(events, characterId, 11)?.id).toBe(12);
      expect(findUnconsumedAbilityTrigger(events, characterId, 12)).toBeNull();
      expect(findUnconsumedAbilityTrigger(events, characterId, 15)).toBeNull();

      const nextActivation = { ...activation, id: 16 };
      expect(findUnconsumedAbilityTrigger([...events, nextActivation], characterId, 15)?.id).toBe(16);
    },
  );

  it('uses one independent image path for every runtime portrait state', () => {
    for (const character of Object.values(CHARACTERS_BY_ID)) {
      const paths = Object.values(character.art);
      expect(new Set(paths).size).toBe(5);
      expect(paths.every((path) => path.endsWith('.png') && !path.includes('states'))).toBe(true);
    }
  });
});
