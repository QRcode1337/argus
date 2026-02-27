export type PollingTask = {
  id: string;
  intervalMs: number;
  run: () => Promise<void>;
};

export class PollingManager {
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  private inFlight = new Set<string>();

  add(task: PollingTask): void {
    if (this.timers.has(task.id)) {
      return;
    }

    const wrapped = async () => {
      if (this.inFlight.has(task.id)) {
        return;
      }

      this.inFlight.add(task.id);
      try {
        await task.run();
      } finally {
        this.inFlight.delete(task.id);
      }
    };

    void wrapped();
    const timer = setInterval(() => {
      void wrapped();
    }, task.intervalMs);

    this.timers.set(task.id, timer);
  }

  stop(id: string): void {
    const timer = this.timers.get(id);
    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.timers.delete(id);
    this.inFlight.delete(id);
  }

  stopAll(): void {
    for (const id of this.timers.keys()) {
      this.stop(id);
    }
  }
}
