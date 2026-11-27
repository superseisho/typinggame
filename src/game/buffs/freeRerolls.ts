import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { RunBuff } from '../../types/buffs';

/** Allowance is derived from Run buffs; usage belongs to each reward/Shop instance. */
export function freeRerolls(buffs: readonly RunBuff[], target: 'buff-reward' | 'shop', used = 0) {
  const max = buffs.reduce((sum, owned) => sum + (BUFFS_BY_ID[owned.buffId]?.effects ?? []).reduce((total, effect) =>
    total + (effect.type === 'free-reroll' && effect.targets.includes(target) ? effect.value * owned.stacks : 0), 0), 0);
  return { max, remaining: Math.max(0, max - used) };
}
