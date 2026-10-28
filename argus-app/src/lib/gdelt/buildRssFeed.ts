import type { GdeltEvent } from "../../types/gdelt";
import { QUAD_CLASS_LABELS } from "../../types/gdelt";
import { gdeltEventScore } from "./eventScore";

export interface BuildRssFeedOptions {
  /** Max number of events included, ranked by combined signal score. */
  limit: number;
  generatedAt: Date;
  /** Public URL of this feed itself, used as the RSS <link>/atom:self. */
  feedUrl: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatActor(name: string, country: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed === "?") return country || "Unknown actor";
  return trimmed;
}

function eventTitle(event: GdeltEvent): string {
  const a1 = formatActor(event.actor1Name, event.actor1Country);
  const a2 = formatActor(event.actor2Name, event.actor2Country);
  const place = event.actionGeoName || event.actionGeoCountry || "unknown location";
  return `${a1} → ${a2} in ${place} (Goldstein ${event.goldsteinScale.toFixed(1)})`;
}

function eventDescription(event: GdeltEvent): string {
  const quadLabel = QUAD_CLASS_LABELS[event.quadClass] ?? "Unclassified";
  return (
    `${quadLabel}. Goldstein scale ${event.goldsteinScale.toFixed(1)}, ` +
    `avg tone ${event.avgTone.toFixed(1)}, ` +
    `${event.numMentions} mentions across ${event.numSources} sources.`
  );
}

function eventPubDate(event: GdeltEvent): string {
  // GDELT DATEADDED is YYYYMMDDHHmmss in UTC.
  const v = event.dateAdded;
  if (!/^\d{14}$/.test(v)) return new Date(0).toUTCString();
  const year = Number(v.slice(0, 4));
  const month = Number(v.slice(4, 6)) - 1;
  const day = Number(v.slice(6, 8));
  const hour = Number(v.slice(8, 10));
  const minute = Number(v.slice(10, 12));
  const second = Number(v.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour, minute, second)).toUTCString();
}

/**
 * Builds an RSS 2.0 XML document for the top-N GDELT events by combined
 * signal score (see gdeltEventScore). Each event becomes one <item>.
 */
export function buildGdeltRssFeed(events: GdeltEvent[], options: BuildRssFeedOptions): string {
  const ranked = [...events].sort((a, b) => gdeltEventScore(b) - gdeltEventScore(a));
  const top = ranked.slice(0, Math.max(0, options.limit));

  const items = top
    .map((event) => {
      const link = event.sourceUrl && /^https?:\/\//i.test(event.sourceUrl)
        ? event.sourceUrl
        : options.feedUrl;
      return `    <item>
      <title>${escapeXml(eventTitle(event))}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">gdelt-${escapeXml(event.id)}</guid>
      <pubDate>${eventPubDate(event)}</pubDate>
      <description>${escapeXml(eventDescription(event))}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Argus GDELT Daily Signals</title>
    <link>${escapeXml(options.feedUrl)}</link>
    <description>Top ${top.length} GDELT signals of the day, ranked by combined severity/coverage score.</description>
    <lastBuildDate>${options.generatedAt.toUTCString()}</lastBuildDate>
    <ttl>1440</ttl>
${items}
  </channel>
</rss>
`;
}
