import type { CorroborationAlert, SourceDomain } from "@/types/intel";
import { baselines } from "./baselines";

export type { SourceDomain, CorroborationAlert };

const WINDOW_MS = 2 * 60 * 60 * 1000;
let alertCounter = 0;

interface RegionEvent {
  domain: SourceDomain;
  region: string;
  timestamp: number;
  severity: number;
  keywords: string[];
}

interface RegionWindow {
  region: string;
  events: RegionEvent[];
  stage: 1 | 2 | 3 | 4 | 5;
  domains: Set<SourceDomain>;
  keywords: Set<string>;
  alertId: string | null;
  createdAt: number;
}

export class CorroborationEngine {
  private windows = new Map<string, RegionWindow>();
  private onAlert: ((alert: CorroborationAlert) => void) | null = null;
  private onUpdate: ((id: string, patch: Partial<CorroborationAlert>) => void) | null = null;

  setCallbacks(
    onAlert: (alert: CorroborationAlert) => void,
    onUpdate: (id: string, patch: Partial<CorroborationAlert>) => void,
  ): void {
    this.onAlert = onAlert;
    this.onUpdate = onUpdate;
  }

  ingest(events: RegionEvent[]): void {
    for (const event of events) {
      let window = this.windows.get(event.region);
      if (!window) {
        window = {
          region: event.region,
          events: [],
          stage: 1,
          domains: new Set(),
          keywords: new Set(),
          alertId: null,
          createdAt: Date.now(),
        };
        this.windows.set(event.region, window);
      }

      window.events.push(event);
      window.domains.add(event.domain);
      for (const kw of event.keywords) window.keywords.add(kw);

      this.evaluateStage(window);
    }

    this.evictStale();
  }

  hasSpikeInRegion(region: string): boolean {
    const window = this.windows.get(region);
    return window !== undefined && window.stage >= 2;
  }

  getStage(region: string): number {
    return this.windows.get(region)?.stage ?? 0;
  }

  promoteToStrategic(region: string): void {
    const window = this.windows.get(region);
    if (!window || window.stage < 4) return;
    window.stage = 5;
    if (window.alertId) {
      this.onUpdate?.(window.alertId, {
        stage: 5,
        summary: this.buildSummary(window),
        updatedAt: Date.now(),
      });
    }
  }

  private evaluateStage(window: RegionWindow): void {
    const prevStage = window.stage;
    const domainCount = window.domains.size;

    let hasSigmaSpike = false;
    for (const event of window.events) {
      const key = `${event.domain}:${event.region}` as const;
      const z = baselines.zScore(key, event.severity);
      if (z !== null && z > 2) {
        hasSigmaSpike = true;
        break;
      }
    }

    let newStage = window.stage;
    if (domainCount >= 3) {
      newStage = 4;
    } else if (domainCount >= 2) {
      newStage = 3;
    } else if (hasSigmaSpike) {
      newStage = Math.max(window.stage, 2) as 1 | 2 | 3 | 4 | 5;
    }

    if (newStage > window.stage) {
      window.stage = newStage as 1 | 2 | 3 | 4 | 5;
    }

    if (window.stage > prevStage || !window.alertId) {
      const isNew = !window.alertId;
      if (!window.alertId) {
        window.alertId = `corr-${++alertCounter}-${window.region}`;
      }

      const alert: CorroborationAlert = {
        id: window.alertId,
        stage: window.stage,
        region: window.region,
        domains: [...window.domains],
        keywords: [...window.keywords].slice(0, 10),
        summary: this.buildSummary(window),
        createdAt: window.createdAt,
        updatedAt: Date.now(),
      };

      if (isNew) {
        this.onAlert?.(alert);
      } else {
        this.onUpdate?.(window.alertId, {
          stage: window.stage,
          domains: [...window.domains],
          keywords: [...window.keywords].slice(0, 10),
          summary: this.buildSummary(window),
          updatedAt: Date.now(),
        });
      }
    }
  }

  private buildSummary(window: RegionWindow): string {
    const stageNames: Record<number, string> = { 1: "Raw Signal", 2: "Developing", 3: "Corroborated", 4: "High Confidence", 5: "Strategic Alert" };
    const domainList = [...window.domains].join(", ");
    const kwList = [...window.keywords].slice(0, 5).join(", ");
    return `[${stageNames[window.stage]}] ${window.region}: ${domainList}${kwList ? ` — ${kwList}` : ""}`;
  }

  private evictStale(): void {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [region, window] of this.windows.entries()) {
      window.events = window.events.filter((e) => e.timestamp > cutoff);
      if (window.events.length === 0) {
        this.windows.delete(region);
      }
    }
  }
}

export const corroborationEngine = new CorroborationEngine();
