const cron = require("node-cron");
const { createHash } = require("node:crypto");
const redis = require("../redis");

const DEFAULT_NEWS_SOURCES = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", weight: 1.0 },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", weight: 0.95 },
  { name: "Guardian World", url: "https://www.theguardian.com/world/rss", weight: 0.92 },
  { name: "DW Top", url: "https://rss.dw.com/rdf/rss-en-top", weight: 0.9 },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", weight: 0.88 },
  { name: "Hacker News", url: "https://news.ycombinator.com/rss", weight: 0.74 },
  { name: "GDELT Blog", url: "https://blog.gdeltproject.org/feed/", weight: 0.82 },
];

const REGION_KEYWORDS = {
  CENTCOM: ["iran", "iraq", "syria", "israel", "gaza", "yemen", "red sea", "hormuz", "uae", "qatar", "kuwait", "bahrain", "saudi"],
  NORTHCOM: ["united states", "u.s.", "us ", "canada", "mexico", "north america", "homeland", "arctic"],
  SOUTHCOM: ["south america", "latin america", "caribbean", "brazil", "argentina", "colombia", "venezuela", "ecuador", "peru", "chile"],
  EUCOM: ["europe", "eu ", "nato", "ukraine", "russia", "germany", "france", "poland", "baltic", "balkan", "black sea"],
  AFRICOM: ["africa", "sahel", "sudan", "somalia", "ethiopia", "kenya", "nigeria", "mali", "chad", "libya"],
  INDOPACOM: ["indo-pacific", "pacific", "south china sea", "taiwan", "japan", "korea", "philippines", "india", "australia", "indonesia"],
};
const COMMAND_REGIONS = ["WORLDCOM", "CENTCOM", "NORTHCOM", "SOUTHCOM", "EUCOM", "AFRICOM", "INDOPACOM"];

const TAG_KEYWORDS = {
  CYBER: ["cyber", "malware", "ransomware", "hack", "ddos"],
  CONFLICT: ["war", "strike", "missile", "troop", "attack", "military"],
  INFRA: ["outage", "blackout", "pipeline", "port", "rail", "telecom", "cable"],
  ECON: ["tariff", "inflation", "oil", "sanction", "market", "gdp", "trade"],
  SPACE: ["satellite", "orbit", "launch", "space", "gps"],
};

function parseNewsSources() {
  const raw = process.env.NEWS_RSS_FEEDS?.trim();
  if (!raw) return DEFAULT_NEWS_SOURCES;
  const urls = raw.split(",").map((chunk) => chunk.trim()).filter(Boolean);
  if (urls.length === 0) return DEFAULT_NEWS_SOURCES;
  return urls.map((url, idx) => ({ name: `Feed ${idx + 1}`, url, weight: 0.8 }));
}

function cleanText(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '\"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tags) {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const match = block.match(re);
    if (match?.[1]) return cleanText(match[1]);
  }
  return "";
}

function extractAtomLink(block) {
  const relAlt = block.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (relAlt?.[1]) return relAlt[1];
  const direct = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (direct?.[1]) return direct[1];
  return extractTag(block, ["link"]);
}

function canonicalizeUrl(value) {
  try {
    const url = new URL(value.trim());
    [...url.searchParams.keys()].forEach((key) => {
      if (key.startsWith("utm_") || key === "ocid" || key === "cmpid") {
        url.searchParams.delete(key);
      }
    });
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function titleSignature(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .sort()
    .join("|");
}

function classifyTags(text) {
  const lower = text.toLowerCase();
  const tags = Object.entries(TAG_KEYWORDS)
    .filter(([, words]) => words.some((word) => lower.includes(word)))
    .map(([tag]) => tag);
  return tags.length ? tags : ["GENERAL"];
}

function classifyRegion(text) {
  const lower = text.toLowerCase();
  let best = "WORLDCOM";
  let score = 0;
  for (const [region, words] of Object.entries(REGION_KEYWORDS)) {
    const nextScore = words.reduce((acc, word) => acc + Number(lower.includes(word)), 0);
    if (nextScore > score) {
      best = region;
      score = nextScore;
    }
  }
  return best;
}

function parseFeed(xml, source) {
  const isAtom = /<entry\b/i.test(xml);
  const blocks = [...xml.matchAll(new RegExp(isAtom ? "<entry\\b[\\s\\S]*?<\\/entry>" : "<item\\b[\\s\\S]*?<\\/item>", "gi"))];
  const entries = [];
  for (const [block] of blocks) {
    const title = extractTag(block, ["title"]);
    const url = canonicalizeUrl(isAtom ? extractAtomLink(block) : extractTag(block, ["link", "guid"]));
    if (!title || !url) continue;
    const publishedAt = extractTag(block, ["pubDate", "published", "updated"]) || new Date().toISOString();
    const summary = extractTag(block, ["description", "summary", "content:encoded", "content"]).slice(0, 320);
    entries.push({
      title,
      source,
      url,
      summary,
      publishedAt: new Date(publishedAt).toISOString(),
    });
  }
  return entries;
}

function computeScore(item, weight, tags) {
  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000);
  const recency = Math.max(0, 100 - ageHours * 5);
  const tagBoost = tags.includes("GENERAL") ? 2 : tags.length * 7;
  return Number((recency * 0.62 + weight * 25 + tagBoost).toFixed(2));
}

function buildRegionSummary(region, items) {
  if (!items.length) {
    return {
      posture: "STABLE",
      summary: `${region} has no fresh items in the current ingest window.`,
      keySignals: [],
      itemCount: 0,
    };
  }

  const counts = new Map();
  let riskPoints = 0;
  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
      if (tag === "CONFLICT" || tag === "CYBER") riskPoints += 2;
      else if (tag === "INFRA" || tag === "SPACE") riskPoints += 1;
    }
  }

  const keySignals = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const posture = riskPoints >= 18 ? "HIGH" : riskPoints >= 8 ? "ELEVATED" : "STABLE";
  return {
    posture,
    summary: `${region} posture ${posture.toLowerCase()}. Lead item: ${items[0].title}. Primary signals: ${keySignals.join(", ") || "GENERAL"}.`,
    keySignals,
    itemCount: items.length,
  };
}

async function fetchNews() {
  console.log("Fetching news...");
  const sources = parseNewsSources();
  const maxItems = Math.max(10, Math.min(500, Number(process.env.NEWS_MAX_ITEMS ?? 100)));

  const feedResults = await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          cache: "no-store",
          headers: {
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
            "User-Agent": "ArgusNewsBot/1.0",
          },
        });
        if (!response.ok) return { source, items: [] };
        const xml = await response.text();
        return { source, items: parseFeed(xml, source.name) };
      } catch {
        return { source, items: [] };
      }
    }),
  );

  const weightBySource = new Map(feedResults.map((entry) => [entry.source.name, entry.source.weight]));
  const deduped = [];
  const seenUrls = new Set();
  const seenSignatures = new Set();

  for (const item of feedResults.flatMap((entry) => entry.items)) {
    const url = canonicalizeUrl(item.url);
    if (!url || seenUrls.has(url)) continue;
    const sig = titleSignature(item.title);
    if (sig && seenSignatures.has(sig)) continue;

    const tags = classifyTags(`${item.title} ${item.summary}`);
    const region = classifyRegion(`${item.title} ${item.summary}`);
    const score = computeScore(item, weightBySource.get(item.source) ?? 0.75, tags);
    deduped.push({
      ...item,
      id: createHash("sha1").update(`${item.title}|${url}`).digest("hex").slice(0, 12),
      url,
      tags,
      region,
      score,
    });
    seenUrls.add(url);
    if (sig) seenSignatures.add(sig);
  }

  const items = deduped
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, maxItems);

  const buckets = {
    WORLDCOM: [...items],
    CENTCOM: [],
    NORTHCOM: [],
    SOUTHCOM: [],
    EUCOM: [],
    AFRICOM: [],
    INDOPACOM: [],
  };
  for (const item of items) {
    if (item.region !== "WORLDCOM" && buckets[item.region]) {
      buckets[item.region].push(item);
    }
  }

  const regions = {};
  for (const region of COMMAND_REGIONS) {
    regions[region] = buildRegionSummary(region, buckets[region].slice(0, 15));
  }

  const result = {
    items,
    meta: {
      sourcesChecked: sources.length,
      fetchedAt: new Date().toISOString(),
      dedupedCount: items.length,
    },
    regions,
  };

  await redis.set("argus:news", JSON.stringify(result));
  console.log(`News fetched and cached in Redis. ${items.length} items.`);
}

cron.schedule("*/10 * * * *", fetchNews);
// Run immediately on startup
setTimeout(fetchNews, 1000);
