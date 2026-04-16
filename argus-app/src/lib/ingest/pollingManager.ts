export type PollingTask = {
  id: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type CircuitState = "closed" | "open" | "half-open";

interface FeedState {
  task: PollingTask;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  consecutiveFailures: number;
  circuitState: CircuitState;
  cooldownUntil: number;
  currentIntervalMs: number;
}

const BACKOFF_CAP = 4;
const CIRCUIT_OPEN_THRESHOLD = 2;
const COOLDOWN_MS = 5 * 60_000;
const HIDDEN_TAB_MULTIPLIER = 5;
const JITTER_RANGE = 0.1;

export class PollingManager {
  private feeds = new Map<string, FeedState>();
  private tabHidden = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        this.tabHidden = document.hidden;
        for (const state of this.feeds.values()) {
          if (state.timer !== null) {
            clearTimeout(state.timer);
            state.timer = null;
            this.scheduleNext(state);
          }
        }
      });
    }
  }

  add(task: PollingTask): void {
    if (this.feeds.has(task.id)) return;

    const state: FeedState = {
      task,
      timer: null,
      inFlight: false,
      consecutiveFailures: 0,
      circuitState: "closed",
      cooldownUntil: 0,
      currentIntervalMs: task.intervalMs,
    };

    this.feeds.set(task.id, state);
    void this.execute(state);
  }

  stop(id: string): void {
    const state = this.feeds.get(id);
    if (!state) return;
    if (state.timer !== null) clearTimeout(state.timer);
    this.feeds.delete(id);
  }

  stopAll(): void {
    for (const id of this.feeds.keys()) {
      this.stop(id);
    }
  }

  getState(id: string): { consecutiveFailures: number; circuitState: CircuitState } | null {
    const state = this.feeds.get(id);
    if (!state) return null;
    return {
      consecutiveFailures: state.consecutiveFailures,
      circuitState: state.circuitState,
    };
  }

  private computeInterval(state: FeedState): number {
    let ms = state.currentIntervalMs;
    if (this.tabHidden) ms *= HIDDEN_TAB_MULTIPLIER;
    const jitter = 1 + (Math.random() * 2 - 1) * JITTER_RANGE;
    return Math.round(ms * jitter);
  }

  private scheduleNext(state: FeedState): void {
    const delay = this.computeInterval(state);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.execute(state);
    }, delay);
  }

  private async execute(state: FeedState): Promise<void> {
    if (state.inFlight) return;

    if (state.circuitState === "open") {
      if (Date.now() < state.cooldownUntil) {
        this.scheduleNext(state);
        return;
      }
      state.circuitState = "half-open";
    }

    state.inFlight = true;
    try {
      await state.task.run();
      state.consecutiveFailures = 0;
      state.currentIntervalMs = state.task.intervalMs;
      state.circuitState = "closed";
    } catch {
      state.consecutiveFailures++;
      const backoffMultiplier = Math.min(
        BACKOFF_CAP,
        Math.pow(2, state.consecutiveFailures - 1),
      );
      state.currentIntervalMs = state.task.intervalMs * backoffMultiplier;

      if (state.consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
        state.circuitState = "open";
        state.cooldownUntil = Date.now() + COOLDOWN_MS;
      }
    } finally {
      state.inFlight = false;
      if (this.feeds.has(state.task.id)) {
        this.scheduleNext(state);
      }
    }
  }
}
