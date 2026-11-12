// Preserve elapsed time at low frame rates. A long browser suspension is an
// explicit pause in the application, never a burst of catch-up damage.
export class FrameClock {
  constructor({ maxGap = 2 } = {}) {
    this.maxGap = maxGap;
    this.previous = null;
  }

  reset() { this.previous = null; }

  tick(timestamp) {
    if (!Number.isFinite(timestamp)) return { delta: 0, suspended: false };
    const previous = this.previous;
    this.previous = timestamp;
    if (previous === null) return { delta: 0, suspended: false };
    const delta = Math.max(0, (timestamp - previous) / 1000);
    return delta > this.maxGap
      ? { delta: 0, suspended: true }
      : { delta, suspended: false };
  }
}
