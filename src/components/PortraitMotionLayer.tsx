import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { getPortraitMotionAnimation } from '../game/combat/portraitMotionAnimation';
import type { PortraitMotionCue } from '../game/combat/portraitMotion';
import type { PortraitFlashCue } from '../game/combat/portraitFlash';

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
      <span
        ref={flashRef}
        className="portrait-heal-flash"
        data-heal-flash-event={flash?.eventId}
      />
    </div>
  );
}
