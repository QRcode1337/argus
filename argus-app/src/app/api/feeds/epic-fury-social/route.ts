import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Nitter RSS proxy configuration
// ---------------------------------------------------------------------------

const NITTER_BASES = [
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
  "https://nitter.1d4.us",
];

const ACCOUNTS: { handle: string; label: string }[] = [
  { handle: "IsraeliPM", label: "Israeli Prime Minister" },
  { handle: "IranIntl", label: "Iran International News" },
  { handle: "IsraelMFA", label: "Israel Foreign Affairs" },
  { handle: "StateDept", label: "US State Department" },
  { handle: "ABORAGIB", label: "UAE official" },
  { handle: "CENTCOM", label: "US Central Command" },
  { handle: "IDF", label: "Israel Defense Forces" },
  { handle: "khaboronline", label: "Iranian media" },
];

const FETCH_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_POSTS = 30;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  posts: SocialPost[];
  ts: number;
}

let cache: CacheEntry | null = null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SocialPost {
  id: string;
  text: string;
  author: string;
  link: string;
  pubDate: string;
  source: "x";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract all <item> blocks from RSS XML and return parsed posts. */
function parseRssItems(xml: string, handle: string): SocialPost[] {
  const posts: SocialPost[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
      || block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);

    const text = titleMatch ? stripHtml(titleMatch[1]) : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const pubDate = dateMatch ? dateMatch[1].trim() : "";
    const guid = guidMatch ? guidMatch[1].trim() : link || `${handle}-${Date.now()}-${posts.length}`;

    if (!text) continue;

    posts.push({
      id: guid,
      text,
      author: `@${handle}`,
      link,
      pubDate,
      source: "x",
    });
  }

  return posts;
}

/** Try each Nitter instance for a given account until one responds. */
async function fetchAccountFeed(handle: string): Promise<SocialPost[]> {
  for (const base of NITTER_BASES) {
    try {
      const url = `${base}/${handle}/rss`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Argus-Intel/1.0" },
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const xml = await res.text();
      const items = parseRssItems(xml, handle);
      if (items.length > 0) return items;
    } catch {
      // Timeout or network error — try next instance
      continue;
    }
  }

  // All instances failed for this account
  return [];
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Return cached data if still fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return NextResponse.json(
        { posts: cache.posts, count: cache.posts.length, cached: true },
        {
          headers: {
            "Cache-Control": "public, max-age=600, s-maxage=600",
          },
        },
      );
    }

    // Fetch all accounts in parallel
    const results = await Promise.allSettled(
      ACCOUNTS.map((a) => fetchAccountFeed(a.handle)),
    );

    const allPosts: SocialPost[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allPosts.push(...result.value);
      }
    }

    // Sort newest first, limit
    allPosts.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

    const posts = allPosts.slice(0, MAX_POSTS);

    // Update cache
    cache = { posts, ts: Date.now() };

    return NextResponse.json(
      { posts, count: posts.length, cached: false },
      {
        headers: {
          "Cache-Control": "public, max-age=600, s-maxage=600",
        },
      },
    );
  } catch (err) {
    console.error("[epic-fury-social] Unexpected error:", err);
    return NextResponse.json(
      { posts: [], count: 0, cached: false, error: "Feed fetch failed" },
      { status: 500 },
    );
  }
}
