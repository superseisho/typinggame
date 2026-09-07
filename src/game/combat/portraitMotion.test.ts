import { describe, expect, it } from 'vitest';
import { PORTRAIT_MOTION_DURATION_MS } from '../../data/gameConfig';
import { CHARACTERS_BY_ID } from '../../data/characters';
import type { CombatEvent } from '../../types/game';
import { applyCorrectTyping, startCombat, tickCombat } from './combatEngine';
import { createCombatState } from './createCombatState';
import { getPortraitMotionAnimation } from './portraitMotionAnimation';
import { collectUnconsumedPortraitMotions, getPortraitMotionCue } from './portraitMotion';

function event(details: Partial<CombatEvent> & Pick<CombatEvent, 'kind'>): CombatEvent {
  return { id: 1, message: 'event', ...details };
}

describe('portrait motion mapping', () => {
  it.each([
    [event({ kind: 'ally-attack', actorId: 'mage', targetId: 'slime-1' }), 'ally', 'mage', 'ally_attack'],
    [event({ kind: 'ally-attack', actorId: 'mage', targetId: 'slime-1' }), 'enemy', 'slime-1', 'enemy_damaged'],
    [event({ kind: 'ally-damaged', actorId: 'slime-1', targetId: 'mage' }), 'ally', 'mage', 'ally_damaged'],
    [event({ kind: 'ally-damaged', actorId: 'slime-1', targetId: 'mage' }), 'enemy', 'slime-1', 'enemy_attack'],
    [event({ kind: 'ally-ability-triggered', actorId: 'mage' }), 'ally', 'mage', 'ally_transient_ability'],
    [event({ kind: 'ally-ability-triggered', actorId: 'warrior' }), 'ally', 'warrior', 'ally_persistent_ability'],
    [event({ kind: 'ally-ability-triggered', actorId: 'martial-artist' }), 'ally', 'martial-artist', 'ally_persistent_ability'],
    [event({ kind: 'enemy-special-used', actorId: 'shaman-1' }), 'enemy', 'shaman-1', 'enemy_special'],
  ] as const)('maps %s for the matching portrait only', (combatEvent, entityType, entityId, motion) => {
    expect(getPortraitMotionCue(combatEvent, entityType, entityId)?.motion).toBe(motion);
    expect(getPortraitMotionCue(combatEvent, entityType, 'someone-else')).toBeNull();
  });

  it('uses configurable short durations', () => {
    expect(getPortraitMotionCue(event({ kind: 'ally-attack', actorId: 'mage' }), 'ally', 'mage')?.durationMs)
      .toBe(PORTRAIT_MOTION_DURATION_MS.allyAttack);
    expect(getPortraitMotionCue(event({ kind: 'enemy-special-used', actorId: 'shaman-1' }), 'enemy', 'shaman-1')?.durationMs)
      .toBe(PORTRAIT_MOTION_DURATION_MS.enemySpecial);
  });

  it('does not add a normal enemy attack bounce for special damage', () => {
    const specialDamage = event({
      kind: 'ally-damaged',
      actorId: 'shaman-1',
      targetId: 'mage',
      abilityId: 'meteor',
    });
    expect(getPortraitMotionCue(specialDamage, 'enemy', 'shaman-1')).toBeNull();
    expect(getPortraitMotionCue(specialDamage, 'ally', 'mage')?.motion).toBe('ally_damaged');
  });

  it('consumes each event id once while allowing later events of the same kind', () => {
    const events = [
      event({ id: 10, kind: 'ally-attack', actorId: 'mage' }),
      event({ id: 11, kind: 'typing-miss' }),
      event({ id: 12, kind: 'ally-attack', actorId: 'mage' }),
    ];
    expect(collectUnconsumedPortraitMotions(events, 9, 'ally', 'mage').map((cue) => cue.eventId))
      .toEqual([10, 12]);
    expect(collectUnconsumedPortraitMotions(events, 12, 'ally', 'mage')).toEqual([]);
  });

  it('collects attack and hit motions from a real combat transition', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const primed = {
      ...started,
      party: started.party.map((member) => member.definitionId === 'mage'
        ? { ...member, attackCharge: CHARACTERS_BY_ID.mage.attackThreshold - 1 }
        : member),
    };
    const cursor = primed.eventSequence;
    const attacked = applyCorrectTyping(primed, primed.typing, 1_001);

    expect(collectUnconsumedPortraitMotions(attacked.events, cursor, 'ally', 'mage'))
      .toEqual([expect.objectContaining({ motion: 'ally_attack' })]);
    expect(collectUnconsumedPortraitMotions(attacked.events, cursor, 'enemy', 'crypt-slime-1'))
      .toEqual([expect.objectContaining({ motion: 'enemy_damaged' })]);
  });

  it('collects enemy attack and ally hit motions from a real combat tick', () => {
    const started = startCombat(createCombatState(['crypt-slime']), 1_000);
    const cursor = started.eventSequence;
    const attacked = tickCombat(started, 5_000, 6_000);

    expect(collectUnconsumedPortraitMotions(attacked.events, cursor, 'enemy', 'crypt-slime-1'))
      .toEqual([expect.objectContaining({ motion: 'enemy_attack' })]);
    expect(collectUnconsumedPortraitMotions(attacked.events, cursor, 'ally', 'warrior'))
      .toEqual([expect.objectContaining({ motion: 'ally_damaged' })]);
  });

  it('defines visible vertical and orbit paths for browser animation', () => {
    const up = getPortraitMotionAnimation('ally_attack').keyframes;
    const down = getPortraitMotionAnimation('ally_damaged').keyframes;
    const orbit = getPortraitMotionAnimation('ally_transient_ability').keyframes;

    expect(up.some((frame) => String(frame.transform).includes('-13px'))).toBe(true);
    expect(down.some((frame) => String(frame.transform).includes('11px'))).toBe(true);
    expect(orbit.map((frame) => String(frame.transform))).toEqual(expect.arrayContaining([
      expect.stringContaining('8px, -7px'),
      expect.stringContaining('10px, 4px'),
      expect.stringContaining('-5px, 8px'),
      expect.stringContaining('-8px, -3px'),
    ]));
    expect(orbit.at(-1)?.transform).toBe('translate3d(0, 0, 0) scale(1)');
  });
});
