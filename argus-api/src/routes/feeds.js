const express = require("express");
const { createHash } = require("node:crypto");

const router = express.Router();

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

async function proxyUpstream(res, upstream, options = {}) {
  const { contentType = "application/json", headers = {} } = options;

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers,
    });
    const body = await response.text();

    res.status(response.status);
    res.type(contentType);
    return res.send(body);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Upstream proxy failed",
    });
  }
}

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
    .replace(/&quot;/g, "\"")
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

router.get("/opensky", async (_req, res) => {
  const upstream = process.env.OPENSKY_ENDPOINT ?? "https://opensky-network.org/api/states/all";
  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers: {
      Accept: "application/json",
    },
  });
});

router.get("/adsb-military", async (_req, res) => {
  const upstream = process.env.ADSB_MIL_ENDPOINT ?? "https://api.adsb.lol/v2/mil";
  const headers = {
    Accept: "application/json",
  };

  if (process.env.ADSB_MIL_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ADSB_MIL_API_KEY}`;
  }

  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers,
  });
});

router.get("/usgs", async (_req, res) => {
  const upstream =
    process.env.USGS_ENDPOINT ??
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers: {
      Accept: "application/json",
    },
  });
});

router.get("/celestrak", async (_req, res) => {
  const upstream =
    process.env.CELESTRAK_ENDPOINT ??
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
  await proxyUpstream(res, upstream, {
    contentType: "text/plain; charset=utf-8",
  });
});

router.get("/tfl-cctv", async (_req, res) => {
  const upstream = process.env.CCTV_TFL_ENDPOINT ?? "https://api.tfl.gov.uk/Place/Type/JamCam";
  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers: {
      Accept: "application/json",
    },
  });
});


const redis = require("../redis");

router.get("/news", async (_req, res) => {
  try {
    const data = await redis.get("argus:news");
    if (data) {
      return res.json(JSON.parse(data));
    }
    return res.json({ items: [], meta: { sourcesChecked: 0, fetchedAt: new Date().toISOString(), dedupedCount: 0 }, regions: {} });
  } catch (error) {
    console.error("Error reading news from Redis:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
