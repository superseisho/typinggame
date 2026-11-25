import { getEffectiveCharacter, getComboMultiplier } from '../game/buffs/buffModifiers';
import { getComboView, getNormalAttackHitCount } from '../game/combat/fighterCombo';
import type { CharacterDefinition, CombatState } from '../types/game';
import { CharacterStateArt } from './CharacterStateArt';
import { CombatFeedback } from './CombatFeedback';
import { ProgressBar } from './ProgressBar';
import { StatusChips } from './StatusChips';

function hpSeverity(ratio: number) {
  if (ratio < .3) return 'danger' as const;
  if (ratio <= .5) return 'caution' as const;
  return 'normal' as const;
}

function abilityView(character: CharacterDefinition, combat: CombatState) {
  const trigger = character.ability.trigger;
  if (trigger.type === 'completed-prompts' || trigger.type === 'correct-characters') {
    const value = combat.party.find(member => member.definitionId === character.id)?.abilityCharge ?? 0;
    return { value, max: trigger.threshold, text: `${value} / ${trigger.threshold}` };
  }
  const combo = getComboView(combat, character.id);
  const multiplier = getComboMultiplier(combat, character.id);
  return { value: Math.min(combo.count, combo.stages.at(-1)?.threshold ?? 80), max: combo.stages.at(-1)?.threshold ?? 80,
    text: `S${combo.stage}/${combo.maxStage} · ×${multiplier.toFixed(multiplier === 1 ? 1 : 2)}` };
}

export function PartyPanel({ combat }: { readonly combat: CombatState }) {
  const livingCount = combat.party.filter((member) => member.currentHp > 0).length;
  const temporary = Object.entries(combat.buffResources.timedPartyModifiers)
    .filter(([, effect]) => effect.remainingMs > 0)
    .map(([stat, effect]) => `${stat === 'attack' ? 'ATK' : 'DEF'} +${Math.round(effect.value * 100)}% ${(effect.remainingMs / 1000).toFixed(1)}s`).join(' · ');

  return (
    <section className="party-panel" aria-label="パーティーステータス">
      <header className="battle-zone-heading">
        <div><span className="eyebrow">PARTY AREA</span><strong>{livingCount} / {combat.party.length} ACTIVE</strong></div>
        <span aria-live="off">{temporary || 'SHARED INPUT · INDEPENDENT GAUGES'}</span>
      </header>
      <div className="party-grid">
        {combat.party.map((member) => {
          const character = getEffectiveCharacter(combat, member.definitionId);
          const hpRatio = member.currentHp / character.stats.maxHp;
          const knockedOut = member.currentHp <= 0;
          const ability = abilityView(character, combat);
          const hitCount = getNormalAttackHitCount(combat, member.definitionId);
          const personalLabel = (stat: 'attack' | 'defense') => {
            const active = combat.buffResources.timedCharacterModifiers.filter(effect => effect.characterId === member.definitionId && effect.stat === stat && effect.remainingMs > 0);
            return active.length ? ` · ${stat === 'attack' ? 'ATK' : 'DEF'} +${Math.round(active.reduce((sum, effect) => sum + effect.value, 0) * 100)}% ${(Math.min(...active.map(effect => effect.remainingMs)) / 1000).toFixed(1)}s` : '';
          };
          return (
            <article
              className={`character-card hp-${hpSeverity(hpRatio)} ${knockedOut ? 'is-knocked-out' : ''}`}
              key={member.definitionId}
              style={{ '--character-accent': character.accentColor } as React.CSSProperties}
            >
              <CombatFeedback events={combat.events} targetId={member.definitionId} />

              <div className="character-card__showcase">
                <div className="character-name"><h3>{character.name}</h3><p>{character.roleLabel}</p></div>
                <CharacterStateArt character={character} member={member} combat={combat} />
                <strong className="threshold">{character.attackThreshold}<small>KEYS</small></strong>
              </div>

              <div className="primary-gauge">
                <div className="gauge-label"><span>HP{personalLabel('defense')}</span><strong>{Math.round(hpRatio * 100)}%</strong></div>
                <ProgressBar value={member.currentHp} max={character.stats.maxHp} tone="health" severity={hpSeverity(hpRatio)} label={`${character.name}のHP`} />
              </div>
              <div className="character-card__stat">
                <div className="gauge-label"><span>ATTACK{personalLabel('attack')}</span><strong>{member.attackCharge} / {character.attackThreshold}</strong></div>
                <ProgressBar value={member.attackCharge} max={character.attackThreshold} tone="attack" compact label={`${character.name}の攻撃ゲージ`} />
              </div>
              <div className="ability-state">
                <div><span>{character.ability.name}{member.guardCharges > 0 ? ` ×${member.guardCharges}` : ''}{hitCount > 1 ? ` · ${hitCount} HIT` : ''}</span><strong>{knockedOut ? 'STOP' : ability.text}</strong></div>
                <ProgressBar value={knockedOut ? 0 : ability.value} max={ability.max} tone="ability" compact label={`${character.name}のAbility状態`} />
              </div>
              <StatusChips statuses={[
                ...(combat.buffResources.nextNormalAoe[member.definitionId] ? ['buff:BARRAGE READY'] : []),
                ...((combat.buffResources.abilityAttackGrowth[member.definitionId] ?? 0) > 0 ? [`buff:ARCANA +${Math.round(combat.buffResources.abilityAttackGrowth[member.definitionId]! * 100)}%`] : []),
                ...member.statuses,
              ]} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
