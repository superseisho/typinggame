import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { BuffEffect, RunBuff } from '../../types/buffs';
import type { CharacterId } from '../../types/game';

type TargetedEffect = Extract<BuffEffect, { readonly target: CharacterId }>;
export function getTargetedBuffValue(buffs: readonly RunBuff[], type: TargetedEffect['type'], id: CharacterId): number {
  return buffs.reduce((sum, owned) => sum + (BUFFS_BY_ID[owned.buffId]?.effects ?? []).reduce((value, effect) =>
    value + (effect.type === type && 'target' in effect && effect.target === id ? effect.value * owned.stacks : 0), 0), 0);
}
