import { CHARACTERS_BY_ID } from '../data/characters';
import type { CharacterDefinition, CombatState } from '../types/game';
import { CombatFeedback } from './CombatFeedback';
import { ProgressBar } from './ProgressBar';
import { StatusChips } from './StatusChips';

function hpSeverity(ratio: number) {
  if (ratio < .25) return 'danger' as const;
  if (ratio <= .5) return 'caution' as const;
  return 'normal' as const;
}

function abilityView(character: CharacterDefinition, combat: CombatState) {
  const trigger = character.ability.trigger;
  if (trigger.type === 'completed-prompts') {
    const value = combat.typing.completedSentences % trigger.threshold;
    return { value, max: trigger.threshold, text: `${value} / ${trigger.threshold}` };
  }
  if (trigger.type === 'perfect-streak') {
    const value = combat.typing.currentCombo % trigger.threshold;
    return { value, max: trigger.threshold, text: `${value} / ${trigger.threshold}` };
  }
  const combo = combat.typing.currentCombo;
  const reached = trigger.thresholds.filter((threshold) => combo >= threshold).length;
  const effect = character.ability.effects.find((candidate) => candidate.type === 'combo-attack-scaling');
  const multiplier = effect?.type === 'combo-attack-scaling' && reached > 0 ? effect.multipliers[reached - 1] : 1;
  return { value: Math.min(combo, trigger.thresholds.at(-1) ?? 80), max: trigger.thresholds.at(-1) ?? 80, text: `×${multiplier.toFixed(multiplier === 1 ? 1 : 2)}` };
}

export function PartyPanel({ combat }: { readonly combat: CombatState }) {
  const livingCount = combat.party.filter((member) => member.currentHp > 0).length;

  return (
    <section className="party-panel" aria-label="パーティーステータス">
      <header className="battle-zone-heading">
        <div><span className="eyebrow">PARTY AREA</span><strong>{livingCount} / {combat.party.length} ACTIVE</strong></div>
        <span>SHARED INPUT · INDEPENDENT GAUGES</span>
      </header>
      <div className="party-grid">
        {combat.party.map((member) => {
          const character = CHARACTERS_BY_ID[member.definitionId];
          const hpRatio = member.currentHp / character.stats.maxHp;
          const knockedOut = member.currentHp <= 0;
          const ability = abilityView(character, combat);
          const latestImpact = [...combat.events].reverse().find((event) => event.targetId === member.definitionId);
          const latestAction = [...combat.events].reverse().find((event) => event.actorId === member.definitionId);
          return (
            <article
              className={`character-card hp-${hpSeverity(hpRatio)} ${knockedOut ? 'is-knocked-out' : ''}`}
              key={member.definitionId}
              style={{ '--character-accent': character.accentColor } as React.CSSProperties}
            >
              <CombatFeedback events={combat.events} targetId={member.definitionId} />
              {knockedOut ? <span className="down-stamp">DOWN</span> : null}

              <div className="character-card__identity">
                <div className={`portrait-action ${latestAction?.kind === 'ally-attack' ? 'is-attacking' : ''}`} key={`${member.definitionId}-${latestAction?.id ?? 0}-${latestImpact?.id ?? 0}`}>
                  <div className={`portrait ${latestImpact?.kind === 'ally-damaged' ? 'is-hit' : ''}`}><span>{character.portraitGlyph}</span></div>
                </div>
                <div className="character-name"><h3>{character.name}</h3><p>{character.roleLabel}</p></div>
                <strong className="threshold">{character.attackThreshold}<small>KEYS</small></strong>
              </div>

              <div className="primary-gauge">
                <div className="gauge-label"><span>HP</span><strong>{Math.round(hpRatio * 100)}%</strong></div>
                <ProgressBar value={member.currentHp} max={character.stats.maxHp} tone="health" severity={hpSeverity(hpRatio)} label={`${character.name}のHP`} />
              </div>
              <div className="character-card__stat">
                <div className="gauge-label"><span>ATTACK</span><strong>{member.attackCharge} / {character.attackThreshold}</strong></div>
                <ProgressBar value={member.attackCharge} max={character.attackThreshold} tone="attack" compact label={`${character.name}の攻撃ゲージ`} />
              </div>
              <div className="ability-state">
                <div><span>{character.ability.name}</span><strong>{knockedOut ? 'STOP' : ability.text}</strong></div>
                <ProgressBar value={knockedOut ? 0 : ability.value} max={ability.max} tone="ability" compact label={`${character.name}のAbility状態`} />
              </div>
              <StatusChips statuses={member.statuses} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
