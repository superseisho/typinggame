import type { AudioSettings, SoundId } from '../types/audio';
import { useAudioSettings } from '../audio/useAudioSettings';

interface AudioSettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const VOLUME_CONTROLS: readonly {
  readonly key: keyof Pick<AudioSettings, 'masterVolume' | 'bgmVolume' | 'combatSeVolume' | 'typingSeVolume' | 'uiSeVolume'>;
  readonly label: string;
  readonly preview: SoundId;
}[] = [
  { key: 'masterVolume', label: 'MASTER', preview: 'ui_confirm' },
  { key: 'bgmVolume', label: 'BGM', preview: 'ui_confirm' },
  { key: 'combatSeVolume', label: 'COMBAT SE', preview: 'warrior_attack' },
  { key: 'typingSeVolume', label: 'TYPING SE', preview: 'typing_correct' },
  { key: 'uiSeVolume', label: 'UI SE', preview: 'ui_confirm' },
];

const MUTE_CONTROLS: readonly {
  readonly key: keyof Pick<AudioSettings, 'masterMuted' | 'bgmMuted' | 'combatSeMuted' | 'typingSeMuted' | 'uiSeMuted'>;
  readonly label: string;
}[] = [
  { key: 'masterMuted', label: 'MASTER' },
  { key: 'bgmMuted', label: 'BGM' },
  { key: 'combatSeMuted', label: 'COMBAT' },
  { key: 'typingSeMuted', label: 'TYPING' },
  { key: 'uiSeMuted', label: 'UI' },
];

export function AudioSettingsPanel({ open, onClose }: AudioSettingsPanelProps) {
  const { settings, update, preview } = useAudioSettings();
  if (!open) return null;

  return (
    <aside className="audio-settings" aria-label="オーディオ設定" data-combat-input-blocker>
      <div className="audio-settings__heading">
        <div><span className="eyebrow">AUDIO FEEDBACK</span><h2>Sound Settings</h2></div>
        <button type="button" onClick={onClose} aria-label="設定を閉じる">×</button>
      </div>
      <p>重要な戦闘情報とタイピング音を個別に調整できます。</p>
      <div className="audio-sliders">
        {VOLUME_CONTROLS.map((control) => (
          <label key={control.key}>
            <span>{control.label}<strong>{Math.round(settings[control.key] * 100)}</strong></span>
            <div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(settings[control.key] * 100)}
                onChange={(event) => update({ [control.key]: Number(event.target.value) / 100 })}
              />
              <button type="button" onClick={() => preview(control.preview)} aria-label={`${control.label}を試聴`}>▶</button>
            </div>
          </label>
        ))}
      </div>
      <div className="audio-mutes">
        {MUTE_CONTROLS.map((control) => (
          <label key={control.key}>
            <input
              type="checkbox"
              checked={settings[control.key]}
              onChange={(event) => update({ [control.key]: event.target.checked })}
            />
            <span>{control.label}</span>
          </label>
        ))}
      </div>
      <div className="audio-legend">
        <span><i className="tone-good" />上昇音 = 回復・強化</span>
        <span><i className="tone-danger" />警告音 = Special準備</span>
        <span><i className="tone-bad" />下降音 = 被弾・弱体</span>
      </div>
      <div className="audio-feedback-test">
        <span>FEEDBACK TEST</span>
        <div>
          <button type="button" onClick={() => preview('ally_heal')}>HEAL</button>
          <button type="button" onClick={() => preview('ally_buff')}>BUFF</button>
          <button type="button" onClick={() => preview('ally_debuff')}>DEBUFF</button>
          <button type="button" onClick={() => preview('enemy_heal')}>ENEMY HEAL</button>
          <button type="button" onClick={() => preview('enemy_special_warning')}>WARNING</button>
        </div>
      </div>
    </aside>
  );
}
