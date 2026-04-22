import { baselines } from "./baselines";
import { corroborationEngine } from "./corroboration";
import { latLonToRegion } from "./countryLookup";

interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  lat?: number;
  lon?: number;
  tags?: string[];
}

export interface BreakingNewsCard {
  headline: string;
  sources: string[];
  region: string;
  corroborationStage: number;
  spikedKeywords: string[];
  timestamp: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "to", "in", "on", "for", "of", "is", "it",
  "and", "or", "but", "not", "with", "at", "by", "from", "as",
  "has", "had", "have", "was", "were", "be", "been", "are",
  "this", "that", "will", "would", "could", "should", "can",
  "its", "his", "her", "their", "our", "my", "your",
  "says", "said", "new", "also", "more", "than",
]);

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function processBreakingNews(items: NewsItem[]): BreakingNewsCard[] {
  const cards: BreakingNewsCard[] = [];

  const keywordCounts = new Map<string, number>();
  for (const item of items) {
    const keywords = extractKeywords(item.title);
    for (const kw of keywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
    }
  }

  const spikedKeywords: string[] = [];
  for (const [keyword, count] of keywordCounts) {
    const key = `news_kw:${keyword}` as const;
    baselines.observe(key, count);
    const z = baselines.zScore(key, count);
    if (z !== null && z > 2) {
      spikedKeywords.push(keyword);
    }
  }

  if (spikedKeywords.length === 0) return cards;

  const regionItems = new Map<string, NewsItem[]>();
  for (const item of items) {
    const keywords = extractKeywords(item.title);
    const hasSpiked = keywords.some((kw) => spikedKeywords.includes(kw));
    if (!hasSpiked) continue;

    const region = item.lat != null && item.lon != null
      ? latLonToRegion(item.lat, item.lon)
      : "GLOBAL";

    const list = regionItems.get(region) ?? [];
    list.push(item);
    regionItems.set(region, list);
  }

  for (const [region, regionNews] of regionItems) {
    const corrobStage = corroborationEngine.getStage(region);
    const hasNonNewsCorroboration = corrobStage >= 3;

    const matchingKeywords = spikedKeywords.filter((kw) =>
      regionNews.some((item) => extractKeywords(item.title).includes(kw)),
    );

    if (hasNonNewsCorroboration || matchingKeywords.length >= 3) {
      cards.push({
        headline: regionNews[0].title,
        sources: [...new Set(regionNews.map((n) => n.source))],
        region,
        corroborationStage: corrobStage,
        spikedKeywords: matchingKeywords.slice(0, 5),
        timestamp: Date.now(),
      });
    }
  }

  return cards;
}
