import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import type { RunBuff } from '../../types/buffs';
import type { CombatState } from '../../types/game';
import { getEffectiveCharacter } from './buffModifiers';

export function canAddBuff(buffs: readonly RunBuff[], id: string): boolean {
  const definition = BUFFS_BY_ID[id];
  const stacks = buffs.find(buff => buff.buffId === id)?.stacks ?? 0;
  return !!definition && stacks < (definition.stackable ? definition.maxStacks : 1);
}
export function addBuff(buffs: readonly RunBuff[], id: string): readonly RunBuff[] {
  if (!canAddBuff(buffs, id)) return buffs;
  return buffs.some(buff => buff.buffId === id)
    ? buffs.map(buff => buff.buffId === id ? { ...buff, stacks: buff.stacks + 1 } : buff)
    : [...buffs, { buffId: id, stacks: 1 }];
}
export function removeBuff(buffs: readonly RunBuff[], id: string): readonly RunBuff[] {
  return buffs.filter(buff => buff.buffId !== id);
}
/** Shared acquisition/removal adapter for rewards, future shops and events. Down never revives. */
export function applyRunBuffs(state: CombatState, runBuffs: readonly RunBuff[]): CombatState {
  return { ...state, runBuffs, party: state.party.map(member => {
    const oldMax = getEffectiveCharacter(state, member.definitionId).stats.maxHp;
    const newMax = getEffectiveCharacter({ runBuffs }, member.definitionId).stats.maxHp;
    return { ...member, currentHp: member.currentHp <= 0 ? 0 : Math.max(1, Math.min(newMax, member.currentHp + newMax - oldMax)) };
  }) };
}
