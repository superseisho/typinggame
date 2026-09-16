/** Explicit state: reproducible combat and safe React updater retries. */
export function randomStep(seed: number): { seed: number; value: number } {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { seed: next, value: next / 4294967296 };
}
