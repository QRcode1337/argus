import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { FeedKey } from "@/types/intel";

export type FeedHealthStatus = {
  feedName: FeedKey;
  status: "unknown" | "ok" | "degraded" | "error";
  lastSuccess: string | null;
  lastCheck: string | null;
  errorReason: string | null;
};

const SNAPSHOT_PATH =
  process.env.ARGUS_FEED_HEALTH_PATH ??
  join(tmpdir(), "argus-feed-health.json");

const KNOWN_FEEDS: FeedKey[] = [
  "opensky",
  "celestrak",
  "usgs",
  "adsb",
  "adsblol",
  "cfradar",
  "otx",
  "fred",
  "ais",
  "gdelt",
  "threatradar",
  "phantom",
  "acled",
  "polymarket",
  "gdacs",
  "faa",
  "news",
  "firms",
];

const LEGACY_FEED_KEY_MAP: Record<string, FeedKey> = {
  "adsb-military": "adsb",
  "adsb-lol-all": "adsblol",
  aisstream: "ais",
  "cloudflare-radar": "cfradar",
};

function emptyStatus(feedName: FeedKey): FeedHealthStatus {
  return {
    feedName,
    status: "unknown",
    lastSuccess: null,
    lastCheck: null,
    errorReason: null,
  };
}

function createEmptySnapshot(): Record<FeedKey, FeedHealthStatus> {
  return Object.fromEntries(
    KNOWN_FEEDS.map((feedName) => [feedName, emptyStatus(feedName)]),
  ) as Record<FeedKey, FeedHealthStatus>;
}

function normalizeFeedKey(feedName: string): FeedKey | null {
  const normalized = LEGACY_FEED_KEY_MAP[feedName] ?? feedName;
  return KNOWN_FEEDS.includes(normalized as FeedKey)
    ? (normalized as FeedKey)
    : null;
}

async function readSnapshotFile(): Promise<Record<string, FeedHealthStatus>> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, FeedHealthStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSnapshotFile(
  snapshot: Record<FeedKey, FeedHealthStatus>,
): Promise<void> {
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function getFeedHealth(): Promise<Record<FeedKey, FeedHealthStatus>> {
  const merged = createEmptySnapshot();
  const fileSnapshot = await readSnapshotFile();

  for (const [rawKey, status] of Object.entries(fileSnapshot)) {
    const feedKey = normalizeFeedKey(rawKey);
    if (!feedKey) continue;

    merged[feedKey] = {
      feedName: feedKey,
      status: status.status,
      lastSuccess: status.lastSuccess ?? null,
      lastCheck: status.lastCheck ?? null,
      errorReason: status.errorReason ?? null,
    };
  }

  return merged;
}

export async function reportFeedHealth(
  feedName: string,
  status: "ok" | "degraded" | "error",
  errorReason?: string,
): Promise<void> {
  const feedKey = normalizeFeedKey(feedName);
  if (!feedKey) return;

  const now = new Date().toISOString();
  const snapshot = await getFeedHealth();
  const existing = snapshot[feedKey] ?? emptyStatus(feedKey);

  snapshot[feedKey] = {
    feedName: feedKey,
    status,
    lastSuccess: status === "ok" ? now : existing.lastSuccess,
    lastCheck: now,
    errorReason: errorReason ?? null,
  };

  await writeSnapshotFile(snapshot);
}
