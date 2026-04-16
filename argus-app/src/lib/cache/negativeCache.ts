interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  cachedAt: number;
  isNegative: boolean;
}

interface NegativeCacheOptions {
  /** TTL for negative (failure) entries in ms. Default: 120_000 (2 min) */
  negativeTtlMs?: number;
  /** TTL for positive (success) entries in ms. Default: 0 (no positive caching) */
  positiveTtlMs?: number;
}

export class NegativeCache<T> {
  private entry: CacheEntry<T> | null = null;
  private readonly negativeTtlMs: number;
  private readonly positiveTtlMs: number;

  constructor(options: NegativeCacheOptions = {}) {
    this.negativeTtlMs = options.negativeTtlMs ?? 120_000;
    this.positiveTtlMs = options.positiveTtlMs ?? 0;
  }

  async fetch(fn: () => Promise<T>): Promise<T & { _stale?: boolean; _cached_at?: number; _error?: string }> {
    type Result = T & { _stale?: boolean; _cached_at?: number; _error?: string };

    // Check positive cache
    if (this.entry && !this.entry.isNegative && this.positiveTtlMs > 0) {
      if (Date.now() - this.entry.cachedAt < this.positiveTtlMs) {
        return this.entry.data as Result;
      }
    }

    // Check negative cache (don't even try upstream)
    if (this.entry?.isNegative) {
      if (Date.now() - this.entry.cachedAt < this.negativeTtlMs) {
        if (this.entry.data) {
          return {
            ...(this.entry.data as T & object),
            _stale: true,
            _cached_at: this.entry.cachedAt,
            _error: this.entry.error ?? undefined,
          } as T & { _stale?: boolean; _cached_at?: number; _error?: string };
        }
        throw new Error(this.entry.error ?? "Upstream unavailable (negative cached)");
      }
    }

    try {
      const result = await fn();
      this.entry = { data: result, error: null, cachedAt: Date.now(), isNegative: false };
      return result as Result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const lastGoodData = this.entry?.data ?? null;
      this.entry = { data: lastGoodData, error: errorMsg, cachedAt: Date.now(), isNegative: true };

      if (lastGoodData) {
        return {
          ...(lastGoodData as T & object),
          _stale: true,
          _cached_at: this.entry.cachedAt,
          _error: errorMsg,
        } as T & { _stale?: boolean; _cached_at?: number; _error?: string };
      }
      throw err;
    }
  }
}
