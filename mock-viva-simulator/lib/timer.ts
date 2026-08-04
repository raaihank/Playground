// Server-side elapsed-time check (spec §9). The client countdown is UX only; the
// server is the source of truth so a candidate can't game the session time limit by
// pausing their clock or reopening the tab.

export function elapsedSeconds(startedAt: string | Date): number {
  const start =
    startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  return (Date.now() - start) / 1000;
}

export function isExpired(
  startedAt: string | Date,
  timeLimitSeconds: number,
): boolean {
  return elapsedSeconds(startedAt) >= timeLimitSeconds;
}

export function remainingSeconds(
  startedAt: string | Date,
  timeLimitSeconds: number,
): number {
  return Math.max(0, Math.round(timeLimitSeconds - elapsedSeconds(startedAt)));
}
