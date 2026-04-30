import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type FeedSource = {
  name: string;
  url: string;
};

type EpicFuryItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
};

/* ------------------------------------------------------------------ */
/*  Sources & keywords                                                */
/* ------------------------------------------------------------------ */

const SOURCES: FeedSource[] = [
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "Times of Israel", url: "https://www.timesofisrael.com/feed/" },
  { name: "Tehran Times", url: "https://www.tehrantimes.com/rss" },
  { name: "CENTCOM", url: "https://www.centcom.mil/RSS/" },
  { name: "Middle East Eye", url: "https://www.middleeasteye.net/rss" },
  { name: "Arab News", url: "https://www.arabnews.com/rss.xml" },
  { name: "Reuters World", url: "https://feeds.reuters.com/Reuters/worldNews" },
];

const CENTCOM_KEYWORDS = [
  "iran", "iraq", "israel", "gaza", "palestine", "syria", "yemen",
  "saudi", "uae", "qatar", "oman", "kuwait", "bahrain", "hormuz",
  "lebanon", "hezbollah", "hamas", "houthi", "irgc", "idf",
  "pentagon", "centcom", "tehran", "riyadh", "jerusalem",
];

const TIMEOUT_MS = 7_000;
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes
const MAX_ITEMS = 50;

/* ------------------------------------------------------------------ */
/*  Cache                                                             */
/* ------------------------------------------------------------------ */

let cache: { items: EpicFuryItem[]; ts: number } | null = null;

/* ------------------------------------------------------------------ */
/*  XML helpers                                                       */
/* ------------------------------------------------------------------ */

const safeText = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const safeIsoDate = (s: string): string => {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

const extractTag = (block: string, tags: string[]): string => {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const match = block.match(re);
    if (match?.[1]) return safeText(match[1]);
  }
  return "";
};

const extractAtomLink = (block: string): string => {
  const relAlt = block.match(
    /<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i,
  );
  if (relAlt?.[1]) return relAlt[1];
  const direct = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (direct?.[1]) return direct[1];
  return extractTag(block, ["link"]);
};

/* ------------------------------------------------------------------ */
/*  Parsers                                                           */
/* ------------------------------------------------------------------ */

type RawEntry = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
};

const parseRssItems = (xml: string, source: string): RawEntry[] => {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  const entries: RawEntry[] = [];

  for (const [block] of blocks) {
    const title = extractTag(block, ["title"]);
    const link = extractTag(block, ["link", "guid"]) || extractAtomLink(block);
    if (!title || !link) continue;

    const pubDate =
      extractTag(block, ["pubDate", "published", "updated"]) ||
      new Date().toISOString();
    const description = extractTag(block, [
      "description",
      "content:encoded",
      "summary",
    ]).slice(0, 200);

    entries.push({ title, link: link.trim(), pubDate, source, description });
  }

  return entries;
};

const parseAtomItems = (xml: string, source: string): RawEntry[] => {
  const blocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
  const entries: RawEntry[] = [];

  for (const [block] of blocks) {
    const title = extractTag(block, ["title"]);
    const link = extractAtomLink(block);
    if (!title || !link) continue;

    const pubDate =
      extractTag(block, ["updated", "published"]) || new Date().toISOString();
    const description = extractTag(block, ["summary", "content"]).slice(0, 200);

    entries.push({ title, link: link.trim(), pubDate, source, description });
  }

  return entries;
};

const parseFeed = (xml: string, source: string): RawEntry[] => {
  if (/<entry\b/i.test(xml)) return parseAtomItems(xml, source);
  return parseRssItems(xml, source);
};

/* ------------------------------------------------------------------ */
/*  Keyword filter                                                    */
/* ------------------------------------------------------------------ */

const matchesCentcom = (entry: RawEntry): boolean => {
  const haystack =
    `${entry.title} ${entry.description}`.toLowerCase();
  return CENTCOM_KEYWORDS.some((kw) => haystack.includes(kw));
};

/* ------------------------------------------------------------------ */
/*  Fetch a single feed                                               */
/* ------------------------------------------------------------------ */

async function fetchFeed(source: FeedSource): Promise<RawEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "User-Agent": "ArgusNewsBot/1.0 (+https://argus.local)",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml, source.name);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/*  GET handler                                                       */
/* ------------------------------------------------------------------ */

export async function GET() {
  // Return cached data if still fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({
      items: cache.items,
      count: cache.items.length,
      cached: true,
    });
  }

  const results = await Promise.allSettled(
    SOURCES.map((source) => fetchFeed(source)),
  );

  const allEntries: RawEntry[] = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  // Filter to CENTCOM-relevant items
  const filtered = allEntries.filter(matchesCentcom);

  // Deduplicate by link
  const seenLinks = new Set<string>();
  const unique: RawEntry[] = [];
  for (const entry of filtered) {
    if (seenLinks.has(entry.link)) continue;
    seenLinks.add(entry.link);
    unique.push(entry);
  }

  // Sort by date descending
  unique.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  // Limit to 50 items and map to final shape
  const items: EpicFuryItem[] = unique.slice(0, MAX_ITEMS).map((entry) => ({
    id: createHash("sha256").update(entry.link).digest("hex").slice(0, 12),
    title: entry.title,
    link: entry.link,
    source: entry.source,
    pubDate: safeIsoDate(entry.pubDate),
    snippet: entry.description.slice(0, 200),
  }));

  // Update cache
  cache = { items, ts: Date.now() };

  return NextResponse.json({
    items,
    count: items.length,
    cached: false,
  });
}
