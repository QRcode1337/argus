const STORAGE_KEY = "argus_baselines";
const MIN_SAMPLES = 20;

export interface BaselineStat {
  count: number;
  mean: number;
  m2: number;
  lastUpdated: number;
}

export type BaselineKey = `${string}:${string}`;

export class BaselineTracker {
  private stats = new Map<BaselineKey, BaselineStat>();

  constructor() {
    this.load();
  }

  observe(key: BaselineKey, value: number): void {
    let stat = this.stats.get(key);
    if (!stat) {
      stat = { count: 0, mean: 0, m2: 0, lastUpdated: 0 };
      this.stats.set(key, stat);
    }

    stat.count++;
    const delta = value - stat.mean;
    stat.mean += delta / stat.count;
    const delta2 = value - stat.mean;
    stat.m2 += delta * delta2;
    stat.lastUpdated = Date.now();
  }

  zScore(key: BaselineKey, observed: number): number | null {
    const stat = this.stats.get(key);
    if (!stat || stat.count < MIN_SAMPLES) return null;

    const variance = stat.m2 / (stat.count - 1);
    if (variance === 0) return 0;
    const sigma = Math.sqrt(variance);
    return (observed - stat.mean) / sigma;
  }

  get(key: BaselineKey): BaselineStat | undefined {
    return this.stats.get(key);
  }

  getMean(key: BaselineKey): number | null {
    return this.stats.get(key)?.mean ?? null;
  }

  save(): void {
    try {
      const data = Object.fromEntries(this.stats.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage quota exceeded
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, BaselineStat>;
      for (const [key, stat] of Object.entries(data)) {
        this.stats.set(key as BaselineKey, stat);
      }
    } catch {
      // Corrupted — start fresh
    }
  }
}

export const baselines = new BaselineTracker();
