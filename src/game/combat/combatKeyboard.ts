import type { EnemyTargetDirection } from './enemyTarget';

/** Used by existing input listeners; never registers an additional listener. */
export function isCombatKeyboardBlocked(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing
    || (event.target instanceof HTMLElement && !!event.target.closest('input, button, select, textarea, [contenteditable]:not([contenteditable="false"])'))
    || !!document.querySelector('[data-combat-input-blocker]');
}

export function consumeTargetNavigationKey(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'preventDefault'>,
  active: boolean, move: (direction: EnemyTargetDirection) => void): boolean {
  if (!active || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return false;
  event.preventDefault();
  // Consume repeats too: no scrolling and no forwarding to TypingEngine.
  if (!event.repeat) move(event.key === 'ArrowLeft' ? 'left' : 'right');
  return true;
}
