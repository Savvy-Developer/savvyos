import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

/** Exact Savvy STR Agents logo palette: cyan, black, and white. */
const SAVVY_CONFETTI_COLORS = ["#0fc0df", "#000000", "#ffffff"];

type Variant = "todo" | "issue" | "milestone";
type Celebration = { id: number; message: string; reducedMotion: boolean } | null;

function viewportOrigin(anchor: HTMLElement | null) {
  const rect = anchor?.getBoundingClientRect();
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  return {
    x: Math.min(0.9, Math.max(0.1, rect ? (rect.left + rect.width / 2) / width : 0.5)),
    y: Math.min(0.86, Math.max(0.18, rect ? (rect.top + Math.min(rect.height / 2, 120)) / height : 0.55)),
  };
}

function launchSavvyConfetti(anchor: HTMLElement | null, variant: Variant) {
  const origin = viewportOrigin(anchor);
  const options = variant === "issue"
    ? { particleCount: 52, spread: 72, startVelocity: 31, scalar: 0.94 }
    : variant === "milestone"
      ? { particleCount: 58, spread: 78, startVelocity: 34, scalar: 1 }
      : { particleCount: 40, spread: 62, startVelocity: 28, scalar: 0.88 };
  confetti({ ...options, colors: SAVVY_CONFETTI_COLORS, origin, gravity: 1.06, ticks: 150, disableForReducedMotion: true, zIndex: 100 });
  if (variant === "issue" || variant === "milestone") {
    window.setTimeout(() => confetti({ ...options, particleCount: Math.ceil(options.particleCount * 0.45), spread: 46, startVelocity: 20, colors: SAVVY_CONFETTI_COLORS, origin: { x: origin.x, y: Math.min(0.88, origin.y + 0.05) }, gravity: 1.1, ticks: 120, disableForReducedMotion: true, zIndex: 100 }), 145);
  }
}

export function usePulseCompletionCelebration() {
  const [celebration, setCelebration] = useState<Celebration>(null);
  const dismissTimer = useRef<number | null>(null);
  useEffect(() => () => { if (dismissTimer.current) window.clearTimeout(dismissTimer.current); }, []);
  const celebrate = useCallback((anchor: HTMLElement | null, variant: Variant, message: string) => {
    const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) launchSavvyConfetti(anchor, variant);
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    setCelebration({ id: Date.now(), message, reducedMotion });
    dismissTimer.current = window.setTimeout(() => { setCelebration(null); dismissTimer.current = null; }, 1150);
  }, []);
  return { celebration, celebrate };
}

/**
 * Confetti is launched synchronously from the success handler rather than from
 * this component. That keeps the celebration visible if a completed item is
 * removed from the current list during the same query refresh.
 */
export function PulseCompletionCelebration({ celebration }: { celebration: Celebration }) {
  if (!celebration) return null;
  return <div aria-live="polite" className="sr-only">{celebration.message}{celebration.reducedMotion ? " Completion acknowledged." : ""}</div>;
}
