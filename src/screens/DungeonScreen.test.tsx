import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDungeonRun } from '../game/dungeon/dungeonEngine';
import { createCombatState } from '../game/combat/createCombatState';
import type { DungeonRunState, RunStatus } from '../types/dungeon';
import { DungeonScreen } from './DungeonScreen';

const fixture = vi.hoisted(() => ({ run: null as DungeonRunState | null }));
vi.mock('../hooks/useDungeon', () => ({ useDungeon: () => ({ run: fixture.run, start: () => {}, dispatch: () => {}, saveError: false }) }));

describe('dungeon exploration / combat layout boundary', () => {
  it.each(['battle', 'elite', 'ambush', 'boss'] as const)('omits every floor element while %s is active', (currentRoom) => {
    fixture.run = { ...createDungeonRun(42, 'layout'), currentRoom, runStatus: 'battle', combat: { ...createCombatState(), status: 'active' } };
    const html = renderToStaticMarkup(<DungeonScreen />);
    expect(html).toContain('dungeon-shell--combat');
    expect(html).not.toContain('dungeon-progress-header');
    expect(html).not.toContain('floor-meter');
    expect(html).not.toContain('floor-progress');
    expect(html).not.toContain('FLOOR');
    expect(html).not.toContain('current-buffs');
    expect(html).toContain('typing-panel');
    expect(html.match(/class="ability-state"/g)).toHaveLength(4);
  });

  it.each([
    ['choosing', null], ['room', 'rest'], ['room', 'shop'], ['reward', 'treasure'],
    ['announcement', 'boss'], ['announcement', 'ambush'], ['reward', 'battle'], ['buff_reward', 'battle'], ['cleared', 'boss'],
  ] as const)('shows progress again in %s / %s', (runStatus, currentRoom) => {
    fixture.run = { ...createDungeonRun(42, 'layout'), runStatus: runStatus as RunStatus, currentRoom };
    const html = renderToStaticMarkup(<DungeonScreen />);
    expect(html).toContain('dungeon-progress-header');
    expect(html).toContain('floor-meter');
    expect(html).toContain('floor-progress');
    expect(html).not.toContain('dungeon-shell--combat');
  });
});
