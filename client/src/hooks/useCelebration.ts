import { useCallback } from "react";
import confetti from "canvas-confetti";

export type CelebrationVariant = "deal_closed" | "under_contract" | "task_done" | "connection_made";

const SAVVY_COLORS = ["#6C63FF", "#00C896", "#FFD700", "#FF6B6B", "#4ECDC4"];

export function useCelebration() {
  const celebrate = useCallback((variant: CelebrationVariant = "task_done") => {
    if (variant === "deal_closed") {
      // Big burst for closed deals — two cannons from the sides
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: SAVVY_COLORS,
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: SAVVY_COLORS,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();

      // Extra center burst
      setTimeout(() => {
        confetti({
          particleCount: 120,
          spread: 100,
          origin: { y: 0.5 },
          colors: SAVVY_COLORS,
          scalar: 1.2,
        });
      }, 200);
    } else if (variant === "under_contract") {
      // Medium burst from the top
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.3 },
        colors: SAVVY_COLORS,
      });
    } else if (variant === "task_done") {
      // Quick small burst
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.6 },
        colors: SAVVY_COLORS,
        scalar: 0.9,
      });
    } else if (variant === "connection_made") {
      // Star-shaped burst
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.5 },
        colors: SAVVY_COLORS,
        shapes: ["star"],
        scalar: 1.1,
      });
    }
  }, []);

  return { celebrate };
}
