import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  FiberController,
  FiberState,
  FiberVariant,
} from './fiber-renderer';
import { useFiberCopy } from './fiber.copy';
import './fiber-motion.css';

export function FiberMotion({ variant = 'light' }: { variant?: FiberVariant }) {
  const copy = useFiberCopy();
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<FiberController | null>(null);
  const [media] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)'),
  );
  const [reducedMotion, setReducedMotion] = useState(media.matches);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<FiberState>('loading');
  const latestMotion = useRef(!media.matches);

  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [media]);

  useEffect(() => {
    latestMotion.current = !paused && !reducedMotion;
    controllerRef.current?.setMotion(latestMotion.current);
  }, [paused, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setState('loading');
    // The local fallback is already visible; identity and forms do not await graphics.
    void import('./fiber-renderer')
      .then(({ mountFiber }) => {
        if (cancelled) return;
        controllerRef.current = mountFiber({
          host,
          variant,
          motion: latestMotion.current,
          onState: setState,
        });
      })
      .catch(() => {
        if (!cancelled) setState('fallback');
      });
    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [variant]);

  const label =
    state === 'fallback'
      ? copy.unavailable
      : state === 'loading'
        ? copy.loading
        : reducedMotion
          ? copy.reduced
          : paused
            ? copy.resume
            : copy.pause;
  const canControl =
    state !== 'fallback' && state !== 'loading' && !reducedMotion;

  return (
    <div className="fiber-motion" data-motion-state={state}>
      <picture className="fiber-fallback" aria-hidden="true">
        <source
          media="(max-width: 700px)"
          srcSet={`/prisme/wave-${variant}-mobile.png`}
        />
        <img src={`/prisme/wave-${variant}-desktop.png`} alt="" />
      </picture>
      <div className="fiber-canvas-host" ref={hostRef} aria-hidden="true" />
      <button
        className="fiber-motion-control"
        type="button"
        aria-label={label}
        title={label}
        disabled={!canControl}
        onClick={() => setPaused((value) => !value)}
      >
        {paused || reducedMotion || state === 'fallback' ? (
          <Play aria-hidden="true" />
        ) : (
          <Pause aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
