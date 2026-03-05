import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { COMMAND_REGIONS, type CommandRegion, type RegionalPosture } from "@/types/regionalNews";

export const dynamic = "force-dynamic";

type FeedSource = {
  name: string;
  url: string;
  weight: number;
};

type ParsedEntry = {
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
};

type NewsItem = ParsedEntry & {
  id: string;
  tags: string[];
  score: number;
  region: CommandRegion;
};

type RegionSummary = {
  posture: RegionalPosture;
  summary: string;
  keySignals: string[];
  itemCount: number;
};

const DEFAULT_SOURCES: FeedSource[] = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", weight: 1.0 },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", weight: 0.95 },
  { name: "Guardian World", url: "https://www.theguardian.com/world/rss", weight: 0.92 },
  { name: "DW Top", url: "https://rss.dw.com/rdf/rss-en-top", weight: 0.9 },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", weight: 0.88 },
  { name: "Hacker News", url: "https://news.ycombinator.com/rss", weight: 0.74 },
  { name: "GDELT Blog", url: "https://blog.gdeltproject.org/feed/", weight: 0.82 },
];

const TIMEOUT_MS = 7_000;
const DEFAULT_MAX_ITEMS = 100;

const TAG_KEYWORDS: Record<string, string[]> = {
  CYBER: ["cyber", "malware", "ransomware", "ddos", "phishing", "botnet", "hack", "exploit", "zero-day"],
  CONFLICT: ["war", "strike", "missile", "troop", "armed", "attack", "insurgent", "military", "defense", "carrier"],
  INFRA: ["outage", "blackout", "pipeline", "grid", "port", "rail", "telecom", "subsea", "cable", "infrastructure"],
  ECON: ["tariff", "inflation", "oil", "sanction", "market", "gdp", "trade", "rates", "commodities", "currency"],
  SPACE: ["satellite", "orbit", "launch", "spacex", "nasa", "space", "gnss", "gps", "starlink"],
};

const REGION_KEYWORDS: Record<Exclude<CommandRegion, "WORLDCOM">, string[]> = {
  CENTCOM: [
    "iran", "iraq", "syria", "israel", "gaza", "yemen", "saudi", "uae", "qatar", "oman", "kuwait",
    "bahrain", "red sea", "hormuz", "afghanistan", "pakistan", "jordan", "lebanon", "tehran", "riyadh",
  ],
  NORTHCOM: [
    "united states", "u.s.", "us ", "america", "canada", "mexico", "homeland", "north america", "arctic",
    "washington", "pentagon",
  ],
  SOUTHCOM: [
    "south america", "latin america", "caribbean", "brazil", "argentina", "colombia", "venezuela", "ecuador",
    "peru", "chile", "uruguay", "paraguay", "bolivia", "cuba", "haiti", "panama",
  ],
  EUCOM: [
    "europe", "eu ", "nato", "ukraine", "russia", "germany", "france", "uk ", "britain", "poland", "baltic",
    "romania", "balkan", "mediterranean", "black sea",
  ],
  AFRICOM: [
    "africa", "sahel", "sudan", "somalia", "ethiopia", "kenya", "nigeria", "mali", "chad", "libya",
    "algeria", "tunisia", "morocco", "congo", "uganda",
  ],
  INDOPACOM: [
    "indo-pacific", "indopacific", "pacific", "south china sea", "east china sea", "taiwan", "japan",
    "korea", "philippines", "australia", "new zealand", "india", "indonesia", "thailand", "vietnam",
  ],
};

const STOPWORDS = new Set([
  "the", "a", "an", "to", "in", "on", "for", "of", "and", "at", "by", "with", "from", "after", "into",
  "over", "new", "latest", "live", "update",
]);

const safeText = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const canonicalizeUrl = (value: string): string => {
  try {
    const url = new URL(value.trim());
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ocid" || key === "cmpid") {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
};

const extractTag = (block: string, tags: string[]): string => {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const match = block.match(re);
    if (match?.[1]) {
      return safeText(match[1]);
    }
  }
  return "";
};

const extractAtomLink = (block: string): string => {
  const relAlt = block.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (relAlt?.[1]) return relAlt[1];
  const direct = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (direct?.[1]) return direct[1];
  const wrapped = extractTag(block, ["link"]);
  return wrapped;
};

const parseRssItems = (xml: string, source: string): ParsedEntry[] => {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  const entries: ParsedEntry[] = [];

  for (const [block] of blocks) {
    const title = extractTag(block, ["title"]);
    const url = canonicalizeUrl(extractTag(block, ["link", "guid"]));
    if (!title || !url) continue;

    const publishedAt =
      extractTag(block, ["pubDate", "published", "updated"]) || new Date().toISOString();
    const summary = extractTag(block, ["description", "content:encoded", "summary"]).slice(0, 320);

    entries.push({ source, title, url, publishedAt: new Date(publishedAt).toISOString(), summary });
  }

  return entries;
};

const parseAtomItems = (xml: string, source: string): ParsedEntry[] => {
  const blocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
  const entries: ParsedEntry[] = [];

  for (const [block] of blocks) {
    const title = extractTag(block, ["title"]);
    const url = canonicalizeUrl(extractAtomLink(block));
    if (!title || !url) continue;

    const publishedAt =
      extractTag(block, ["updated", "published"]) || new Date().toISOString();
    const summary = extractTag(block, ["summary", "content"]).slice(0, 320);
    entries.push({ source, title, url, publishedAt: new Date(publishedAt).toISOString(), summary });
  }

  return entries;
};

const parseFeed = (xml: string, source: string): ParsedEntry[] => {
  if (/<entry\b/i.test(xml)) {
    return parseAtomItems(xml, source);
  }
  return parseRssItems(xml, source);
};

const titleSignature = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token))
    .slice(0, 10)
    .sort()
    .join("|");

const classifyTags = (text: string): string[] => {
  const haystack = text.toLowerCase();
  const tags = Object.entries(TAG_KEYWORDS)
    .filter(([, words]) => words.some((word) => haystack.includes(word)))
    .map(([tag]) => tag);
  return tags.length > 0 ? tags : ["GENERAL"];
};

const classifyRegion = (text: string): CommandRegion => {
  const haystack = text.toLowerCase();
  let bestRegion: Exclude<CommandRegion, "WORLDCOM"> | null = null;
  let bestScore = 0;

  for (const [region, words] of Object.entries(REGION_KEYWORDS) as Array<
    [Exclude<CommandRegion, "WORLDCOM">, string[]]
  >) {
    const score = words.reduce((acc, word) => acc + Number(haystack.includes(word)), 0);
    if (score > bestScore) {
      bestScore = score;
      bestRegion = region;
    }
  }

  return bestRegion ?? "WORLDCOM";
};

const scoreItem = (item: ParsedEntry, sourceWeight: number, tags: string[]): number => {
  const now = Date.now();
  const ageHours = Math.max(0, (now - new Date(item.publishedAt).getTime()) / 3_600_000);
  const recencyScore = Math.max(0, 100 - ageHours * 5);
  const sourceScore = sourceWeight * 25;
  const tagScore = tags.includes("GENERAL") ? 3 : tags.length * 7;
  return Number((recencyScore * 0.62 + sourceScore + tagScore).toFixed(2));
};

const buildRegionSummary = (region: CommandRegion, items: NewsItem[]): RegionSummary => {
  if (items.length === 0) {
    return {
      posture: "STABLE",
      summary: `${region} has no fresh items in the current ingest window.`,
      keySignals: [],
      itemCount: 0,
    };
  }

  const tagCounts = new Map<string, number>();
  let riskPoints = 0;
  for (const item of items) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      if (tag === "CONFLICT" || tag === "CYBER") riskPoints += 2;
      else if (tag === "INFRA" || tag === "SPACE") riskPoints += 1;
    }
  }

  const keySignals = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const posture: RegionalPosture =
    riskPoints >= 18 ? "HIGH" : riskPoints >= 8 ? "ELEVATED" : "STABLE";

  const lead = items[0];
  const summary = `${region} posture ${posture.toLowerCase()}. Lead item: ${lead.title}. Primary signals: ${keySignals.join(", ") || "GENERAL"}.`;

  return {
    posture,
    summary,
    keySignals,
    itemCount: items.length,
  };
};

const parseSourcesFromEnv = (): FeedSource[] => {
  const custom = process.env.NEWS_RSS_FEEDS?.trim();
  if (!custom) return DEFAULT_SOURCES;

  const items = custom
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((url, idx) => ({
      name: `Feed ${idx + 1}`,
      url,
      weight: 0.8,
    }));

  return items.length > 0 ? items : DEFAULT_SOURCES;
};

async function fetchSourceFeed(source: FeedSource): Promise<ParsedEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "User-Agent": "ArgusNewsBot/1.0 (+https://argus.local)",
      },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseFeed(xml, source.name);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const sources = parseSourcesFromEnv();
  const maxItems = Number(process.env.NEWS_MAX_ITEMS ?? DEFAULT_MAX_ITEMS);

  const sourceResults = await Promise.all(
    sources.map(async (source) => ({
      source,
      items: await fetchSourceFeed(source),
    })),
  );

  const sourceWeightMap = new Map<string, number>(
    sourceResults.map(({ source }) => [source.name, source.weight]),
  );

  const allEntries = sourceResults.flatMap(({ items }) => items);
  const deduped: NewsItem[] = [];
  const seenUrls = new Set<string>();
  const seenTitleSigs = new Set<string>();

  for (const entry of allEntries) {
    const url = canonicalizeUrl(entry.url);
    if (!url || seenUrls.has(url)) continue;

    const sig = titleSignature(entry.title);
    if (sig && seenTitleSigs.has(sig)) continue;

    const tags = classifyTags(`${entry.title} ${entry.summary}`);
    const region = classifyRegion(`${entry.title} ${entry.summary}`);
    const sourceWeight = sourceWeightMap.get(entry.source) ?? 0.75;

    const item: NewsItem = {
      ...entry,
      url,
      tags,
      region,
      score: scoreItem(entry, sourceWeight, tags),
      id: createHash("sha1").update(`${entry.title}|${url}`).digest("hex").slice(0, 12),
    };

    seenUrls.add(url);
    if (sig) seenTitleSigs.add(sig);
    deduped.push(item);
  }

  const byScore = deduped
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, Math.max(10, Math.min(maxItems, 500)));

  const regionBuckets: Record<CommandRegion, NewsItem[]> = {
    WORLDCOM: [...byScore],
    CENTCOM: [],
    NORTHCOM: [],
    SOUTHCOM: [],
    EUCOM: [],
    AFRICOM: [],
    INDOPACOM: [],
  };

  for (const item of byScore) {
    if (item.region !== "WORLDCOM") {
      regionBuckets[item.region].push(item);
    }
  }

  const regionSummaries = Object.fromEntries(
    COMMAND_REGIONS.map((region) => [
      region,
      buildRegionSummary(region, regionBuckets[region].slice(0, 15)),
    ]),
  ) as Record<CommandRegion, RegionSummary>;

  return NextResponse.json({
    items: byScore,
    meta: {
      sourcesChecked: sources.length,
      fetchedAt: new Date().toISOString(),
      dedupedCount: byScore.length,
    },
    regions: regionSummaries,
  });
}
