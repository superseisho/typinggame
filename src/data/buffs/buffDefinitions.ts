import type { BuffCategory, BuffDefinition, BuffEffect, BuffRarity, BuffStat, BuffTarget } from '../../types/buffs';

const modifier = (stat: BuffStat, value: number, target: BuffTarget = 'party'): BuffEffect => ({ type: 'modifier', stat, value, target });
const define = (id: string, name: string, rarity: BuffRarity, categories: BuffCategory[], description: string, effects: BuffEffect[], maxStacks = 3): BuffDefinition =>
  ({ id, name, rarity, categories, description, effects, stackable: maxStacks > 1, maxStacks });

export const BUFF_DEFINITIONS: readonly BuffDefinition[] = [
  define('power-rune', 'Power Rune', 'common', ['Global'], '味方全員のAttack +10%。', [modifier('attack', .1)]),
  define('vitality-rune', 'Vitality Rune', 'common', ['Global', 'Defensive'], '全員の最大HP +10%。生存者は増加分だけ現在HPも回復。', [modifier('maxHp', .1)]),
  define('swift-fingers', 'Swift Fingers', 'uncommon', ['Global', 'Typing'], '全員のAttack必要文字数 −8%（端数切り上げ・最低5文字）。', [modifier('attackThreshold', -.08)]),
  define('calm-mind', 'Calm Mind', 'uncommon', ['Global', 'Typing'], 'ミスによる敵Special Gauge増加量 −20%。', [modifier('missGauge', -.2)]),
  define('reinforced-shield', 'Reinforced Shield', 'common', ['Knight', 'Defensive'], 'Guard成功時、戦士の最大HPの5%を回復。', [{ type: 'guard-heal', target: 'warrior', value: .05 }]),
  define('guardian-oath', 'Guardian Oath', 'uncommon', ['Knight'], 'Guard成功後、戦士の次の通常Attack +30%。攻撃で消費・重ね掛けなし。', [{ type: 'guard-counter', target: 'warrior', value: .3 }], 1),
  define('fortress', 'Fortress', 'rare', ['Knight', 'Defensive'], 'Guard成功後、次のミスによる敵全体のSpecial Gauge増加を15軽減。1回消費・重ね掛けなし。', [{ type: 'guard-gauge-shield', target: 'warrior', value: 15 }], 1),
  define('arcane-power', 'Arcane Power', 'common', ['Mage'], '魔法使いの通常Attack +15%。', [modifier('attack', .15, 'mage')]),
  define('wide-magic', 'Wide Magic', 'uncommon', ['Mage'], '魔法使いの全体攻撃Abilityの威力 +25%。', [modifier('abilityDamage', .25, 'mage')]),
  define('mana-surge', 'Mana Surge', 'rare', ['Mage', 'Typing'], '魔法使いのAbilityに必要な連続正解数 −20%。端数切り上げ。', [modifier('abilityThreshold', -.2, 'mage')]),
  define('healing-prayer', 'Healing Prayer', 'common', ['Cleric'], '僧侶のHeal基本回復量 +20%。', [modifier('healPower', .2, 'cleric')]),
  define('sacred-healing', 'Sacred Healing', 'uncommon', ['Cleric'], '僧侶のHealに、対象の最大HPの5%を追加。', [{ type: 'heal-extra', target: 'cleric', value: .05 }]),
  define('guardian-blessing', 'Guardian Blessing', 'rare', ['Cleric', 'Defensive'], '僧侶が実際に回復した味方へ、次の被ダメージ −25%の障壁。1回消費・重ね掛けなし。', [{ type: 'heal-shield', target: 'cleric', value: .25 }], 1),
  define('focus', 'Focus', 'common', ['Fighter'], '武闘家のAttack +15%。', [modifier('attack', .15, 'martial-artist')]),
  define('endless-combo', 'Endless Combo', 'uncommon', ['Fighter', 'Typing'], '武闘家のComboによる上乗せ倍率 +25%。ミスで解除。', [modifier('comboBonus', .25, 'martial-artist')]),
  define('perfect-form', 'Perfect Form', 'rare', ['Fighter'], '武闘家のCombo中、Attack倍率をさらに +20%。ミスで解除。', [modifier('activeAttack', .2, 'martial-artist')]),
  define('precision', 'Precision', 'common', ['Typing'], 'ミスによる敵Special Gauge増加量 −10%。', [modifier('missGauge', -.1)]),
  define('flow', 'Flow', 'uncommon', ['Typing', 'Utility'], '50文字連続正解ごとに、生存する全員のAttack Gauge +5文字。', [{ type: 'streak-charge', threshold: 50, value: 5 }]),
  define('perfect-rhythm', 'Perfect Rhythm', 'rare', ['Typing'], '50文字連続正解ごとに、敵全体へ威力15の追加攻撃。防御力を適用。', [{ type: 'streak-damage', threshold: 50, value: 15 }]),
  define('ascendant-rune', 'Ascendant Rune', 'epic', ['Global'], '全員のAttack +20%、最大HP +10%。生存者は最大HP増加分も回復。', [modifier('attack', .2), modifier('maxHp', .1)], 1),
];
export const BUFFS_BY_ID: Readonly<Record<string, BuffDefinition>> = Object.fromEntries(BUFF_DEFINITIONS.map(buff => [buff.id, buff]));
