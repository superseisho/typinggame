import type { BuffDefinition, BuffStat } from '../../types/buffs';
import { BUFF_CONFIG } from './buffConfig';

const statNames: Record<BuffStat, string> = {
  attack: 'Attack', defense: 'Defense', maxHp: 'Max HP', attackThreshold: 'Attack必要文字数',
  abilityThreshold: 'Ability必要文字数', abilityDamage: 'Ability威力', healPower: 'Heal基本回復量',
  comboBonus: 'Combo上乗せ倍率', activeAttack: 'Combo中Attack倍率', missGauge: 'ミス時Special Gauge増加量',
};
/** Numeric stack totals are derived from effects, not copied into description strings. */
export function describeBuffTotals(buff: BuffDefinition, stacks: number): string {
  return buff.effects.map(effect => {
    const value = effect.value * stacks;
    const percent = Math.round(value * 100);
    switch (effect.type) {
      case 'modifier': return `${statNames[effect.stat]} ${percent >= 0 ? '+' : ''}${percent}%`;
      case 'guard-heal': return `Guard成功時、Max HPの${percent}%回復`;
      case 'guard-counter': return `Guard後、次のAttack +${percent}%`;
      case 'guard-gauge-shield': return `Guard後、次のミス時Gauge増加 −${value}`;
      case 'heal-extra': return `僧侶のHealに対象Max HPの${percent}%を追加`;
      case 'heal-shield': return `僧侶のHeal対象へ次の被ダメージ −${percent}%`;
      case 'streak-charge': return `${effect.threshold}連続正解ごとにAttack Gauge +${value}文字`;
      case 'streak-damage': return `${effect.threshold}連続正解ごとに敵全体へ威力${value}`;
      case 'streak-heal': return `${effect.threshold}連続正解ごとに生存者のMax HPの${percent}%回復`;
      case 'streak-seal': return `${effect.threshold}連続正解ごとに全敵の最大Special Gaugeの${percent}%減少`;
      case 'miss-protection': return `${value} Charges · ミスの戦闘ペナルティ無効 · 各Chargeは${BUFF_CONFIG.unbrokenFocusRechargeMs / 1000}秒で回復`;
      case 'instant-kill': return `直接攻撃で${percent}%即死（Boss本体を除く）`;
      case 'normal-aoe': return `通常Attackが${percent}%で全体攻撃`;
    }
  }).join(' / ');
}
