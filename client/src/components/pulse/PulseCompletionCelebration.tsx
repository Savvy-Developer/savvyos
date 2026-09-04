import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { CheckCircle2, Sparkles } from "lucide-react";

type Variant = "todo" | "issue" | "milestone";
type Celebration = { id: number; variant: Variant; message: string; left: number; top: number; reducedMotion: boolean } | null;

export function usePulseCompletionCelebration() {
  const [celebration, setCelebration] = useState<Celebration>(null);
  const dismissTimer = useRef<number | null>(null);
  useEffect(() => () => { if (dismissTimer.current) window.clearTimeout(dismissTimer.current); }, []);
  const celebrate = useCallback((anchor: HTMLElement | null, variant: Variant, message: string) => {
    const rect = anchor?.getBoundingClientRect();
    const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    setCelebration({ id: Date.now(), variant, message, left: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, top: rect ? rect.top + rect.height / 2 : window.innerHeight / 2, reducedMotion });
    dismissTimer.current = window.setTimeout(() => { setCelebration(null); dismissTimer.current = null; }, reducedMotion ? 1150 : 1450);
  }, []);
  return { celebration, celebrate };
}

export function PulseCompletionCelebration({ celebration }: { celebration: Celebration }) {
  useEffect(() => {
    if (!celebration || celebration.reducedMotion) return;
    const host = document.getElementById(`pulse-celebration-${celebration.id}`);
    const canvas = host?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const burst = confetti.create(canvas, { resize: true, useWorker: true });
    const options = celebration.variant === "issue"
      ? { particleCount: 22, spread: 42, startVelocity: 22, scalar: 0.8, colors: ["#0284c7", "#14b8a6", "#f59e0b", "#ffffff"] }
      : celebration.variant === "milestone"
        ? { particleCount: 26, spread: 48, startVelocity: 24, scalar: 0.9, colors: ["#ca8a04", "#fbbf24", "#14b8a6", "#ffffff"] }
        : { particleCount: 16, spread: 32, startVelocity: 19, scalar: 0.72, colors: ["#0284c7", "#14b8a6", "#ffffff"] };
    burst({ ...options, origin: { x: 0.5, y: 0.72 }, gravity: 1.2, ticks: 85 });
    let secondBurst: number | undefined;
    if (celebration.variant === "issue") secondBurst = window.setTimeout(() => burst({ ...options, particleCount: 12, spread: 28, startVelocity: 15, origin: { x: 0.5, y: 0.75 }, gravity: 1.25, ticks: 72 }), 160);
    const cleanup = window.setTimeout(() => burst.reset(), 1450);
    return () => { if (secondBurst) window.clearTimeout(secondBurst); window.clearTimeout(cleanup); burst.reset(); };
  }, [celebration]);
  if (!celebration) return null;
  const isMilestone = celebration.variant === "milestone";
  return <><div aria-live="polite" className="sr-only">{celebration.message}</div><div id={`pulse-celebration-${celebration.id}`} aria-hidden="true" className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2" style={{ left: celebration.left, top: celebration.top, width: 210, height: 145 }}><canvas className={celebration.reducedMotion ? "hidden" : "h-full w-full"} /><div className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${isMilestone ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}><span className={celebration.reducedMotion ? "" : "animate-in fade-in zoom-in duration-200"}>{isMilestone ? <Sparkles className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}</span>{celebration.message}</div></div></>;
}
