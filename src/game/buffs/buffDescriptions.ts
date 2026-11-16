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
      case 'heal-attack-charge': return `Heal対象のAttack Gauge +${value}文字 / Pulse`;
      case 'heal-timed-modifier': return `Heal対象の${statNames[effect.stat]} +${percent}% / ${effect.durationMs / 1000}秒（再付与で更新）`;
      case 'heal-all-targets': return 'Heal AbilityがParty全体対象';
      case 'heal-revive': return 'HealでDown者を復活。単体ではDown者をParty順で優先';
      case 'heal-repeat': return `1 Abilityで固定対象へ${value}回Heal`;
      case 'target-weight-modifier': return `ランダム攻撃の対象重み ${Math.round((1 + value) * 100)}%`;
      case 'ability-action-delay': return `Ability命中でACTION +${value / 1000}秒（未消化上限${BUFF_CONFIG.maxPendingFrostDelayMs / 1000}秒）`;
      case 'ability-damage-over-time': return `Ability命中で${effect.durationMs / 1000}秒炎上・${effect.intervalMs / 1000}秒ごとに発動時Attackの${percent}%（Defense無視）`;
      case 'ability-next-normal-aoe': return 'Ability解決後、次の通常Attack1回だけ全体攻撃';
      case 'ability-battle-attack-growth': return `Ability解決ごとに戦闘中Attack +${percent}%（加算）`;
      case 'guard-timed-party-modifier': return `GUARD成功時、Party ${statNames[effect.stat]} +${percent}% / ${effect.durationMs / 1000}秒（再発動で更新）`;
      case 'guard-party-heal': return `GUARD成功時、生存Partyを各Max HPの${percent}%回復`;
      case 'guard-party-attack-charge': return `GUARD成功時、生存PartyのAttack Gauge +現在必要文字数の${percent}%（切り上げ）`;
      case 'guard-retaliation': return `GUARD成功時、AttackerへAttack ${percent}%反撃`;
      case 'guard-battle-threshold-reduction': return `GUARD成功ごとに戦闘中のParty Attack必要文字数 −${value}（最低5）`;
      case 'guard-extra-charge': return `GUARD最大回数 +${value}（発動時に補充）`;
      case 'completed-prompt-threshold-reduction': return `Ability必要文章数 −${value}（最低1）`;
      case 'correct-input-charge-multiplier': return `正解入力の基本Attack・Ability Charge ×${1 + (effect.value - 1) * stacks}（GUARDの文完成進行を含む）`;
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
