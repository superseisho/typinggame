import type { EventChoice, EventDefinition } from '../../types/encounters';
import { ALTAR_CONFIG as A, EVENT_CONFIG as E } from '../../game/dungeon/encounterConfig';

const leave: EventChoice = { id: 'leave', label: 'Leave', description: '何もせず立ち去る。代償・報酬なし。', effects: [{ type: 'none' }] };
export const EVENT_DEFINITIONS: readonly EventDefinition[] = [
  { id: 'traveler', title: 'Mysterious Traveler', description: '薄暗い通路で奇妙な旅人が囁く。「少しの金で、力を授けよう」', choices: [
    { id: 'pay', label: `Pay ${E.travelerCost} Gold`, description: `${E.travelerCost} Goldを支払い、通常Buff候補から1つ選ぶ。`, requirements: [{ type: 'gold', amount: E.travelerCost }], effects: [{ type: 'gold', min: -E.travelerCost, max: -E.travelerCost }, { type: 'buff', weights: E.buffWeights }] },
    { ...leave, label: 'Refuse' },
  ] },
  { id: 'camp', title: 'Abandoned Camp', description: '誰かが使っていた野営地が残されている。まだ利用できそうだ。', choices: [
    { id: 'rest', label: 'Take a Rest', description: `生存者全員を最大HPの${E.campHeal * 100}%回復。`, effects: [{ type: 'heal', ratio: E.campHeal }] },
    { id: 'search', label: 'Search the Camp', description: `${E.campGold[0]}–${E.campGold[1]} Goldを得る。`, effects: [{ type: 'gold', min: E.campGold[0], max: E.campGold[1] }] }, leave,
  ] },
  { id: 'chest', title: 'Bloodstained Chest', description: '血の付いた小箱が置かれている。開けるべきだろうか。', choices: [
    { id: 'open', label: 'Open', description: `${E.chestGoldChance}%でGold +${E.chestGold[0]}–${E.chestGold[1]}。残りは生存者全員に最大HPの${E.chestDamage * 100}%ダメージ（戦闘不能の危険あり）。`, effects: [{ type: 'random', outcomes: [
      { weight: E.chestGoldChance, effects: [{ type: 'gold', min: E.chestGold[0], max: E.chestGold[1] }] },
      { weight: 100 - E.chestGoldChance, effects: [{ type: 'damage', ratio: E.chestDamage }] },
    ] }] }, leave,
  ] },
  { id: 'fountain', title: 'Healing Fountain', description: '石の隙間から澄んだ水が湧き出している。', choices: [
    { id: 'drink', label: 'Drink', description: `生存者全員を最大HPの${E.fountainHeal * 100}%回復。`, effects: [{ type: 'heal', ratio: E.fountainHeal }] },
    { id: 'bottle', label: 'Fill a Bottle', description: `水を換金し、${E.fountainGold[0]}–${E.fountainGold[1]} Goldを得る。`, effects: [{ type: 'gold', min: E.fountainGold[0], max: E.fountainGold[1] }] }, leave,
  ] },
  { id: 'inscription', title: 'Ancient Inscription', description: '古代文字が壁に刻まれている。その知識が探索の助けになるかもしれない。', choices: [
    { id: 'study', label: 'Study the Inscription', description: '無料で通常Buff候補から1つ獲得する。', effects: [{ type: 'buff', weights: E.buffWeights }] },
    { ...leave, label: 'Ignore It' },
  ] },
];
export const ALTAR_DEFINITION: EventDefinition = {
  id: 'altar', title: 'Altar', description: '恩恵には代償が伴う。一度捧げたものは戻らない。', choices: [
    { id: 'blood', label: 'Blood Offering', description: `COST: 生存者全員に最大HPの${A.bloodDamage * 100}%ダメージ（最低HP1）。REWARD: Rare以上から1つ選択。Epic ${A.bloodWeights.epic}% / Legendary ${A.bloodWeights.legendary}%。`, effects: [{ type: 'damage', ratio: A.bloodDamage, nonlethal: true }, { type: 'buff', weights: A.bloodWeights }] },
    { id: 'gold', label: 'Gold Offering', description: `COST: ${A.goldCost} Gold。REWARD: Rare以上から1つ選択。Epic ${A.goldWeights.epic}% / Legendary ${A.goldWeights.legendary}%。`, requirements: [{ type: 'gold', amount: A.goldCost }], effects: [{ type: 'gold', min: -A.goldCost, max: -A.goldCost }, { type: 'buff', weights: A.goldWeights }] },
    { ...leave, label: 'LEAVE ALTAR' },
  ],
};
