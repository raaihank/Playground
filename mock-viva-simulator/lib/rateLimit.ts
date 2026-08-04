// Session-creation rate limit (spec §11). In-memory sliding window keyed by client
// IP. Good enough for the single-instance private validation phase; swap for a
// shared store (Redis/DB) before any multi-instance deploy.
import "server-only";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const globalForRl = globalThis as unknown as {
  _bcsHits?: Map<string, number[]>;
};
const hits = (globalForRl._bcsHits ??= new Map<string, number[]>());

function maxPerHour(): number {
  const n = Number(process.env.MAX_SESSIONS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Returns true if this request is within the limit (and records it).
export function allowSessionCreate(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= maxPerHour()) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
