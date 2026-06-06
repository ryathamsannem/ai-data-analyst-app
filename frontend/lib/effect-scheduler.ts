/** Defer a state update until after the current effect commit (lint-safe, same tick). */
export function scheduleEffectUpdate(fn: () => void): void {
  queueMicrotask(fn);
}
