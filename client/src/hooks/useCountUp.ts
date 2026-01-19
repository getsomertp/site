import { useEffect, useMemo, useRef, useState } from "react";

type CountUpOptions = {
  start?: boolean;
  durationMs?: number;
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Count a number up from 0 -> target over durationMs.
 * - Respects prefers-reduced-motion
 * - Uses requestAnimationFrame for smooth updates
 */
export function useCountUp(target: number, options: CountUpOptions = {}) {
  const { start = true, durationMs = 1100 } = options;
  const safeTarget = Number.isFinite(target) ? target : 0;

  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [value, setValue] = useState<number>(() => (start && reduced ? safeTarget : 0));
  const rafRef = useRef<number | null>(null);
  const startedForTarget = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setValue(safeTarget);
      return;
    }

    // If target changes while animating, restart for the new target.
    startedForTarget.current = safeTarget;
    setValue(0);

    const startTs = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTs;
      const t = Math.max(0, Math.min(1, elapsed / durationMs));
      const eased = easeOutCubic(t);
      const next = Math.round(eased * safeTarget);
      setValue(next);
      if (t < 1 && startedForTarget.current === safeTarget) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [safeTarget, start, durationMs, reduced]);

  return value;
}
