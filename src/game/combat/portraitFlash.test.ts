import { describe, expect, it } from 'vitest';
import { HEAL_FLASH_DURATION_MS } from '../../data/gameConfig';
import type { CombatEvent } from '../../types/game';
import { collectUnconsumedHealFlashes, getPortraitHealFlashCue } from './portraitFlash';

function event(details: Partial<CombatEvent> & Pick<CombatEvent, 'kind'>): CombatEvent {
  return { id: 1, message: 'event', ...details };
}

describe('portrait heal flash mapping', () => {
  it('flashes only the ally that actually recovered HP', () => {
    const heal = event({ kind: 'ally-heal', actorId: 'cleric', targetId: 'warrior', amount: 30 });

    expect(getPortraitHealFlashCue(heal, 'warrior')).toEqual({
      eventId: 1,
      kind: 'ally_heal',
      durationMs: HEAL_FLASH_DURATION_MS,
    });
    expect(getPortraitHealFlashCue(heal, 'mage')).toBeNull();
  });

  it('does not flash for a zero heal, a damage event, or consumed history', () => {
    const zeroHeal = event({ id: 10, kind: 'ally-heal', targetId: 'warrior', amount: 0 });
    const damage = event({ id: 11, kind: 'ally-damaged', targetId: 'warrior', amount: 10 });
    const healed = event({ id: 12, kind: 'ally-heal', targetId: 'warrior', amount: 5 });

    expect(getPortraitHealFlashCue(zeroHeal, 'warrior')).toBeNull();
    expect(getPortraitHealFlashCue(damage, 'warrior')).toBeNull();
    expect(collectUnconsumedHealFlashes([zeroHeal, damage, healed], 12, 'warrior')).toEqual([]);
  });

  it('queues independent flashes for repeated or multi-target healing events', () => {
    const events = [
      event({ id: 20, kind: 'ally-heal', targetId: 'warrior', amount: 10 }),
      event({ id: 21, kind: 'ally-heal', targetId: 'mage', amount: 12 }),
      event({ id: 22, kind: 'ally-heal', targetId: 'warrior', amount: 8 }),
    ];

    expect(collectUnconsumedHealFlashes(events, 19, 'warrior').map((cue) => cue.eventId))
      .toEqual([20, 22]);
    expect(collectUnconsumedHealFlashes(events, 19, 'mage').map((cue) => cue.eventId))
      .toEqual([21]);
  });
});
