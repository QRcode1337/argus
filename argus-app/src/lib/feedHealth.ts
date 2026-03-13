export type FeedHealthStatus = {
  feedName: string;
  status: "ok" | "degraded" | "error";
  lastSuccess: string | null;
  lastCheck: string;
  errorReason: string | null;
};

const registry = new Map<string, FeedHealthStatus>();

export function reportFeedHealth(
  feedName: string,
  status: "ok" | "degraded" | "error",
  errorReason?: string,
): void {
  const now = new Date().toISOString();
  const existing = registry.get(feedName);

  registry.set(feedName, {
    feedName,
    status,
    lastSuccess: status === "ok" ? now : (existing?.lastSuccess ?? null),
    lastCheck: now,
    errorReason: errorReason ?? null,
  });
}

export function getFeedHealth(): Record<string, FeedHealthStatus> {
  const result: Record<string, FeedHealthStatus> = {};
  for (const [key, value] of registry) {
    result[key] = value;
  }
  return result;
}
