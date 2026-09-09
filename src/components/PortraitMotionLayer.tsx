import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { getPortraitMotionAnimation } from '../game/combat/portraitMotionAnimation';
import { isDamageMotion, type PortraitMotionCue } from '../game/combat/portraitMotion';
import type { PortraitFlashCue } from '../game/combat/portraitFlash';
import { DAMAGE_FLASH_DURATION_MS } from '../data/gameConfig';

export function PortraitMotionLayer({
  className,
  motion,
  flash = null,
  children,
}: {
  readonly className: string;
  readonly motion: PortraitMotionCue | null;
  readonly flash?: PortraitFlashCue | null;
  readonly children: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const hitFlashRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !motion) return;

    const definition = getPortraitMotionAnimation(motion.motion);
    const animation = layer.animate(definition.keyframes, {
      duration: motion.durationMs,
      easing: definition.easing,
      iterations: 1,
    });
    return () => animation.cancel();
  }, [motion]);

  // Opacity on its own layer: never replaces the motion's transform or the
  // independent green heal aura, even when both effects happen together.
  useLayoutEffect(() => {
    const hitLayer = hitFlashRef.current;
    if (!hitLayer || !motion || !isDamageMotion(motion.motion)) return;
    const animation = hitLayer.animate([
      { offset: 0, opacity: 0 },
      { offset: 0.2, opacity: 0.65 },
      { offset: 0.5, opacity: 0.4 },
      { offset: 1, opacity: 0 },
    ], { duration: DAMAGE_FLASH_DURATION_MS, easing: 'ease-out', iterations: 1 });
    return () => animation.cancel();
  }, [motion]);

  useLayoutEffect(() => {
    const flashLayer = flashRef.current;
    if (!flashLayer || !flash) return;

    const animation = flashLayer.animate([
      { offset: 0, opacity: 0, transform: 'scale(.9)' },
      { offset: 0.28, opacity: 0.9, transform: 'scale(1.04)' },
      { offset: 0.62, opacity: 0.58, transform: 'scale(1)' },
      { offset: 1, opacity: 0, transform: 'scale(1.08)' },
    ], {
      duration: flash.durationMs,
      easing: 'ease-out',
      iterations: 1,
    });
    return () => animation.cancel();
  }, [flash]);

  return (
    <div
      ref={layerRef}
      className={`portrait-motion-layer ${className}`}
      data-portrait-motion={motion?.motion}
      data-portrait-motion-event={motion?.eventId}
      aria-hidden="true"
    >
      {children}
      {motion?.motion === 'ally_guard_hit' ? <span className="portrait-guard-impact">⬡</span> : null}
      <span ref={hitFlashRef} className="portrait-hit-flash" />
      <span
        ref={flashRef}
        className="portrait-heal-flash"
        data-heal-flash-event={flash?.eventId}
      />
    </div>
  );
}
