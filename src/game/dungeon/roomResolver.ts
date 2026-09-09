import { CHARACTERS_BY_ID } from '../../data/characters';
import { GAME_CONFIG } from '../../data/gameConfig';
import type { CharacterId, CombatState } from '../../types/game';
import type { RestAction } from '../../types/dungeon';
import { DUNGEON_CONFIG, SHOP_PRODUCTS } from './dungeonConfig';

export function recoveryTargets(combat: CombatState, revive = false) {
  return combat.party.filter((member) => revive ? member.currentHp <= 0 : member.currentHp > 0 && member.currentHp < CHARACTERS_BY_ID[member.definitionId].stats.maxHp);
}

/** Actual HP changes emit existing events, so room heals reuse green flashes / SE. */
export function recoverParty(combat: CombatState, ratio: number, targetId?: CharacterId, revive = false): CombatState {
  let eventSequence = combat.eventSequence;
  const events = [...combat.events];
  const party = combat.party.map((member) => {
    if (targetId && member.definitionId !== targetId) return member;
    if (revive ? member.currentHp > 0 : member.currentHp <= 0) return member;
    const definition = CHARACTERS_BY_ID[member.definitionId];
    const hp = Math.min(definition.stats.maxHp, member.currentHp + Math.ceil(definition.stats.maxHp * ratio));
    const amount = hp - member.currentHp;
    if (amount <= 0) return member;
    events.push({ id: ++eventSequence, kind: revive ? 'system' : 'ally-heal', targetId: member.definitionId, amount,
      message: `${definition.name} ${revive ? '蘇生' : '回復'} +${amount}`, soundId: 'ally_heal' });
    return { ...member, currentHp: hp };
  });
  return { ...combat, party, eventSequence, events: events.slice(-GAME_CONFIG.combatEventHistoryLimit), log: events.slice(-GAME_CONFIG.combatLogLimit) };
}

export function resolveRest(combat: CombatState, action: RestAction, targetId?: CharacterId): CombatState | null {
  if (action === 'party') return recoverParty(combat, DUNGEON_CONFIG.rest.partyRatio);
  if (!targetId || !recoveryTargets(combat, action === 'revive').some((member) => member.definitionId === targetId)) return null;
  return recoverParty(combat, action === 'revive' ? DUNGEON_CONFIG.rest.reviveRatio : DUNGEON_CONFIG.rest.focusedRatio, targetId, action === 'revive');
}

export function purchasableProduct(productId: string, gold: number, purchased: readonly string[]) {
  return SHOP_PRODUCTS.find((item) => item.id === productId && item.price <= gold && !purchased.includes(item.id));
}
