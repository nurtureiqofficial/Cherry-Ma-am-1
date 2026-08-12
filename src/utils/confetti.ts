import confetti from "canvas-confetti";

export function triggerCelebrationConfetti() {
  const duration = 4 * 1000;
  const animationEnd = Date.now() + duration;

  // Rich festive palette: emerald green, neon lime, gold amber, hot pink, vivid purple, sky blue, star white
  const colors = ["#008069", "#c4f500", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ffeb3b", "#ffffff"];

  // 1. Initial burst centered
  try {
    confetti({
      particleCount: 90,
      spread: 120,
      origin: { y: 0.55 },
      colors,
      shapes: ["star", "circle", "square"],
      scalar: 1.25,
      zIndex: 99999,
    });
  } catch (err) {
    console.warn("[Confetti] Initial burst error:", err);
  }

  // 2. Continuous flying confetti and stars around mobile screen & background
  const interval: any = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      return clearInterval(interval);
    }
    const particleCount = 35 * (timeLeft / duration);

    try {
      // Left side cannon
      confetti({
        particleCount,
        angle: 60,
        spread: 80,
        origin: { x: 0, y: 0.65 },
        colors,
        shapes: ["star", "square", "circle"],
        scalar: 1.15,
        zIndex: 99999,
      });

      // Right side cannon
      confetti({
        particleCount,
        angle: 120,
        spread: 80,
        origin: { x: 1, y: 0.65 },
        colors,
        shapes: ["star", "square", "circle"],
        scalar: 1.15,
        zIndex: 99999,
      });
    } catch (err) {
      console.warn("[Confetti] Cannon interval error:", err);
    }
  }, 250);
}
