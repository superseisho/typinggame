import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../data/enemies';
import { GAME_CONFIG } from '../../data/gameConfig';
import { createCombatState } from './createCombatState';
import { applyTypingMiss, startCombat, tickCombat } from './combatEngine';
import { executeEnemyAbility } from './enemyAbilityEngine';

describe('SPECIAL gauge resets completely after execution', () => {
  it.each(ENEMY_DEFINITIONS.map(enemy => [enemy.id, enemy.specialGaugeMax] as const))(
    '%s starts again from zero after filling its %i-point gauge', (id, max) => {
      let state = startCombat(createCombatState([id]));
      for (let i = 0; i < Math.ceil(max / GAME_CONFIG.enemySpecialGaugeOnMiss); i++) {
        state = applyTypingMiss(state, state.typing);
      }
      expect(state.enemies[0].specialGauge).toBe(max);
      expect(state.enemies[0].pendingSpecial).not.toBeNull();
      const executed = tickCombat(state, GAME_CONFIG.enemySpecialDelayMs);
      expect(executed.events.some(e => e.kind === 'enemy-special-used')).toBe(true);
      expect(executed.enemies[0].specialGauge).toBe(0);
      expect(executed.enemies[0].pendingSpecial).toBeNull();
      const nextMiss = applyTypingMiss(executed, executed.typing);
      expect(nextMiss.enemies[0].specialGauge).toBe(GAME_CONFIG.enemySpecialGaugeOnMiss + executed.typingCurseBonus);
      expect(nextMiss.enemies[0].pendingSpecial).toBeNull();
    },
  );
  it('only consumes the acting instance gauge, including repeated enemy definitions', () => {
    const initial = startCombat(createCombatState(['crypt-slime', 'crypt-slime']));
    const charged = { ...initial, enemies: initial.enemies.map(e => ({ ...e, specialGauge: 150 })) };
    const ability = ENEMY_DEFINITIONS.find(e => e.id === 'crypt-slime')!.specialAbilities[0];
    const next = executeEnemyAbility(charged, charged.enemies[0].instanceId, ability).state;
    expect(next.enemies.map(e => e.specialGauge)).toEqual([0, 150]);
  });
});
