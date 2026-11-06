// Attack scheduling and its presentation share the authoritative step size.
export const COMBAT_STEP_MS = 100;

export function attackIntervalMs(interval: number): number {
  return Math.ceil(Math.max(COMBAT_STEP_MS, interval) / COMBAT_STEP_MS) * COMBAT_STEP_MS;
}

export function attackSpeedGrade(rate: number): string {
  if (rate < 0.7) return "매우 느림";
  if (rate < 0.9) return "느림";
  if (rate < 1.1) return "보통";
  if (rate < 1.3) return "빠름";
  return "매우 빠름";
}

export function attackSpeedFor(interval: number) {
  const rate = 1000 / attackIntervalMs(interval);
  const text = rate.toFixed(2);
  // Classify the displayed value so rounding cannot contradict its grade.
  return { rate, text, grade: attackSpeedGrade(Number(text)) };
}
