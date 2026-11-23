/** 语速只保留三档，和其余带音频的应用一致。 */

export const SPEEDS = [0.75, 1, 1.25] as const;
export type Speed = (typeof SPEEDS)[number];

export const DEFAULT_SPEED: Speed = 1;

/** 存过的旧值（比如 0.9）吸附到最近的一档。 */
export function snapSpeed(value: number): Speed {
  if (!Number.isFinite(value)) return DEFAULT_SPEED;
  let best: Speed = DEFAULT_SPEED;
  for (const speed of SPEEDS) {
    if (Math.abs(speed - value) < Math.abs(best - value)) best = speed;
  }
  return best;
}

/** 0.75 -> "0.75×"；1 -> "1×"。 */
export function formatSpeed(speed: number): string {
  return `${speed}×`;
}
