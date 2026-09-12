/**
 * Shared gateway for api.adsb.lol.
 *
 * Both /api/feeds/adsb-military and /api/feeds/adsb-lol-all hit the same
 * upstream host, which rate-limits per source IP and replies with an nginx
 * `429 Too Many Requests` HTML page. Because every browser tab polls
 * adsb-military on a 10s interval and adsb-lol-all fans out across dozens of
 * endpoints, the droplet was tripping that limit constantly and taking both
 * feeds down together.
 *
 * This module funnels every adsb.lol call through one process-wide queue that
 * paces requests and backs off after a 429, so the two routes cannot starve
 * each other.
 */

/**
 * adsb.lol documents ~1 request/second but enforces a tighter sustained quota
 * in practice — a 25-call sweep paced at 1.1s still tripped it. 2s holds.
 */
const MIN_INTERVAL_MS = 2_000;

/** How long to stop calling upstream entirely after it returns a 429. */
const COOLDOWN_MS = 60_000;

export class AdsbRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`adsb.lol rate limited; backing off for ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "AdsbRateLimitError";
  }
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let cooldownUntil = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True while we are deliberately not calling upstream after a 429. */
export function isCoolingDown(): boolean {
  return Date.now() < cooldownUntil;
}

async function run(url: string, timeoutMs: number, priority: boolean): Promise<Response> {
  // The wide-area sweep is what normally trips the limit, so it must yield
  // during a cooldown. The military feed is a single call on a 10s interval —
  // let it keep trying rather than starving the primary layer for a full minute.
  if (!priority && isCoolingDown()) {
    throw new AdsbRateLimitError(cooldownUntil - Date.now());
  }

  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status === 429) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    throw new AdsbRateLimitError(COOLDOWN_MS);
  }

  // A healthy response clears any lingering backoff.
  cooldownUntil = 0;
  return response;
}

/**
 * Perform a paced request to adsb.lol. Calls are serialized process-wide, so
 * concurrent callers queue rather than burst.
 *
 * @throws {AdsbRateLimitError} when upstream is rate limiting us.
 */
export function adsbLolFetch(url: string, timeoutMs = 8_000, priority = false): Promise<Response> {
  const result = queue.then(
    () => run(url, timeoutMs, priority),
    () => run(url, timeoutMs, priority),
  );
  // Keep the chain alive regardless of individual failures.
  queue = result.catch(() => undefined);
  return result;
}

/** Paced JSON fetch that resolves to null on any non-fatal failure. */
export async function adsbLolJson<T>(url: string, timeoutMs = 8_000): Promise<T | null> {
  try {
    const response = await adsbLolFetch(url, timeoutMs);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
