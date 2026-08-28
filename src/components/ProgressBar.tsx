interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  readonly tone?: 'health' | 'enemy' | 'attack' | 'ability' | 'special';
  readonly compact?: boolean;
  readonly label: string;
  readonly severity?: 'normal' | 'caution' | 'danger' | 'warning';
}

export function ProgressBar({
  value,
  max,
  tone = 'health',
  compact = false,
  label,
  severity = 'normal',
}: ProgressBarProps) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={`progress progress--${tone} progress--${severity} ${compact ? 'progress--compact' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
