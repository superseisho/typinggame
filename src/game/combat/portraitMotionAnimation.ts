import type { PortraitMotion } from './portraitMotion';

export interface PortraitMotionAnimation {
  readonly keyframes: Keyframe[];
  readonly easing: string;
}

const BOUNCE_UP: PortraitMotionAnimation = {
  keyframes: [
    { offset: 0, transform: 'translate3d(0, 0, 0) scale(1)' },
    { offset: 0.38, transform: 'translate3d(0, -13px, 0) scale(1.045, .97)' },
    { offset: 0.68, transform: 'translate3d(0, 2px, 0) scale(.99, 1.015)' },
    { offset: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  ],
  easing: 'cubic-bezier(.22, .72, .28, 1)',
};

const BOUNCE_DOWN: PortraitMotionAnimation = {
  keyframes: [
    { offset: 0, transform: 'translate3d(0, 0, 0) scale(1)', filter: 'none' },
    { offset: 0.36, transform: 'translate3d(0, 11px, 0) scale(1.04, .95)', filter: 'brightness(1.34) sepia(.25) saturate(1.35)' },
    { offset: 0.68, transform: 'translate3d(0, -2px, 0) scale(.99, 1.015)', filter: 'none' },
    { offset: 1, transform: 'translate3d(0, 0, 0) scale(1)', filter: 'none' },
  ],
  easing: 'cubic-bezier(.32, .04, .28, 1)',
};

// Damage moves sideways only; attack owns the vertical bounce.
const DAMAGE_SHAKE: PortraitMotionAnimation = {
  keyframes: [
    { offset: 0, transform: 'translate3d(0, 0, 0) scale(1)' },
    { offset: 0.2, transform: 'translate3d(-5px, 0, 0) scale(1.03, .95)' },
    { offset: 0.45, transform: 'translate3d(5px, 0, 0) scale(1.03, .95)' },
    { offset: 0.7, transform: 'translate3d(-3px, 0, 0) scale(1.02, .97)' },
    { offset: 0.9, transform: 'translate3d(0, 0, 0) scale(1)' },
    { offset: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
  ],
  easing: 'linear',
};

const ORBIT: PortraitMotionAnimation = {
  keyframes: [
    { offset: 0, transform: 'translate3d(0, 0, 0) scale(1)', filter: 'brightness(1)' },
    { offset: 0.18, transform: 'translate3d(8px, -7px, 0) scale(1.02)', filter: 'brightness(1.18)' },
    { offset: 0.42, transform: 'translate3d(10px, 4px, 0) scale(1.025)', filter: 'brightness(1.28)' },
    { offset: 0.68, transform: 'translate3d(-5px, 8px, 0) scale(1.015)', filter: 'brightness(1.18)' },
    { offset: 0.86, transform: 'translate3d(-8px, -3px, 0) scale(1.01)', filter: 'brightness(1.08)' },
    { offset: 1, transform: 'translate3d(0, 0, 0) scale(1)', filter: 'brightness(1)' },
  ],
  easing: 'ease-in-out',
};

const PERSISTENT_PULSE: PortraitMotionAnimation = {
  keyframes: [
    { offset: 0, transform: 'scale(1)', filter: 'brightness(1)' },
    { offset: 0.43, transform: 'scale(1.09)', filter: 'brightness(1.85) saturate(.72)' },
    { offset: 1, transform: 'scale(1)', filter: 'brightness(1)' },
  ],
  easing: 'ease-out',
};

const GUARD_HIT: PortraitMotionAnimation = {
  keyframes: [
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.035)', filter: 'brightness(1.2) drop-shadow(0 0 8px #7db7e2)' },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ],
  easing: 'ease-out',
};

export function getPortraitMotionAnimation(motion: PortraitMotion): PortraitMotionAnimation {
  if (motion === 'ally_attack') return BOUNCE_UP;
  if (motion === 'enemy_attack') return BOUNCE_DOWN;
  if (motion === 'ally_damaged' || motion === 'enemy_damaged') return DAMAGE_SHAKE;
  if (motion === 'ally_persistent_ability') return PERSISTENT_PULSE;
  if (motion === 'ally_guard_hit') return GUARD_HIT;
  return ORBIT;
}
