"use client";

import { useState, useEffect, useMemo } from "react";
import { ARGUS_CONFIG, CAMERA_PRESETS } from "@/lib/config";
import type { IntelBriefing, AlertSeverity, IntelAlert, ThreatLevel } from "@/lib/intel/analysisEngine";
import { fetchNewsFeed, type NewsItem, type RegionDigest } from "@/lib/ingest/news";
import { useArgusStore } from "@/store/useArgusStore";
import type { LayerKey, PlatformMode, PlaybackSpeed, SelectedIntel, VisualMode } from "@/types/intel";
import { COMMAND_REGIONS, type CommandRegion } from "@/types/regionalNews";
import { VideoOverlay } from "./VideoOverlay";

type HudOverlayProps = {
  onFlyToPoi: (poiId: string) => void;
  onResetCamera: () => void;
  onToggleCollision: () => void;
  collisionEnabled: boolean;
  analyticsStatus: string | null;
  selectedIntel: SelectedIntel | null;
  showFullIntel: boolean;
  onToggleFullIntel: () => void;
  onCloseIntel: () => void;
  onFlyToEntity: () => void;
  onTrackEntity: (entityId: string | null) => void;
  trackedEntityId: string | null;
  intelBriefing: IntelBriefing | null;
  onFlyToCoordinates: (lat: number, lon: number) => void;
  onFlyToEntityById: (entityId: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTiltUp: () => void;
  onTiltDown: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onPlayPause?: () => void;
  onSeek?: (timestampMs: number) => void;
  onPlaybackSpeedChange?: (speed: number) => void;
};

type SliderDef = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

const layerDefs: { key: LayerKey; label: string; feed: string }[] = [
  { key: "flights", label: "Live Flights", feed: "OpenSky" },
  { key: "military", label: "Military Flights", feed: "ADS-B" },
  { key: "bases", label: "Military Bases", feed: "Static Intel" },
  { key: "seismic", label: "Earthquakes (24h)", feed: "USGS" },
  { key: "satellites", label: "Satellites", feed: "CelesTrak" },
  { key: "satelliteLinks", label: "Sat Link Lines", feed: "Derived" },
  { key: "cctv", label: "CCTV Mesh", feed: "TFL + Windy" },
  { key: "outages", label: "Internet Outages", feed: "CF Radar" },
  { key: "threats", label: "Cyber Threats", feed: "OTX" },
];

const modeDefs: { key: VisualMode; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "crt", label: "CRT" },
  { key: "nvg", label: "NVG" },
  { key: "flir", label: "FLIR" },
];

const fmtDate = (ts: number | null): string => {
  if (!ts) return "never";
  return new Date(ts).toLocaleTimeString();
};

const compact = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return `${value}`;
};

const threatLevelColors: Record<ThreatLevel, { text: string; border: string; bg: string }> = {
  GREEN: { text: "text-[#99ffca]", border: "border-[#3b9b6b]", bg: "bg-[#001a0f]" },
  AMBER: { text: "text-[#e3ad50]", border: "border-[#e3ad50]", bg: "bg-[#1a0f00]" },
  RED: { text: "text-[#ff4444]", border: "border-[#ff4444]", bg: "bg-[#1a0000]" },
};

const severityColors: Record<AlertSeverity, string> = {
  CRITICAL: "text-[#ff4444]",
  WARNING: "text-[#e3ad50]",
  INFO: "text-[#2ad4ff]",
};

const severityIcons: Record<AlertSeverity, string> = {
  CRITICAL: "\u25C6",
  WARNING: "\u25B2",
  INFO: "\u25CB",
};

const workspaceDefs = [
  { id: "intel", label: "Intel" },
  { id: "news", label: "News" },
  { id: "feeds", label: "Feeds" },
  { id: "signal", label: "Signal" },
  { id: "status", label: "Status" },
] as const;

type WorkspaceId = (typeof workspaceDefs)[number]["id"];
type TimeRange = "1h" | "6h" | "24h" | "48h" | "7d" | "ALL";

const timeRangeHours: Record<Exclude<TimeRange, "ALL">, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "48h": 48,
  "7d": 168,
};

function TacticalGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className ?? "h-2.5 w-2.5"} aria-hidden>
      <circle cx="10" cy="10" r="8" fill="#071a24" stroke="#2ad4ff" strokeWidth="1.2" />
      <path d="M10 3L11.7 8.3L17 10L11.7 11.7L10 17L8.3 11.7L3 10L8.3 8.3Z" fill="#8fefff" />
    </svg>
  );
}

function SliderControl({ label, value, onChange }: SliderDef) {
  return (
    <div className="rounded-lg border border-[#17374c] bg-[#071020] px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-[#6c8ea2]">
        <span>{label}</span>
        <span className="text-[#9be3ff]">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#2ad4ff]"
      />
    </div>
  );
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#113446] last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2.5 transition hover:bg-[#0a1a2e]"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#4e9ca8]">
            {isOpen ? "\u25BE" : "\u25B8"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#e3ad50]">
            {title}
          </span>
        </div>
        {badge ? (
          <span className="rounded-md border border-[#284f63] bg-[#081322] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6c8ea2]">
            {badge}
          </span>
        ) : null}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

const controlInputClass =
  "w-full rounded-lg border border-[#284f63] bg-[#081322] px-3 py-2 font-mono text-[12px] text-[#d5f7ff] focus:border-[#2ad4ff] focus:outline-none";

const actionButtonClass =
  "rounded-lg border border-[#284f63] bg-[#081322] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9ceaff] transition hover:border-[#2ad4ff]";

const camBtnClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-[#1a3a4f] bg-[#050b17d9] font-mono text-[14px] text-[#9ceaff] shadow-[0_0_12px_rgba(10,145,223,0.15)] backdrop-blur-md transition hover:border-[#2ad4ff] hover:text-white active:bg-[#0a2a44]";

export function HudOverlay({
  onFlyToPoi,
  onResetCamera,
  onToggleCollision,
  collisionEnabled,
  analyticsStatus,
  selectedIntel,
  showFullIntel,
  onToggleFullIntel,
  onCloseIntel,
  onFlyToEntity,
  onTrackEntity,
  trackedEntityId,
  intelBriefing,
  onFlyToCoordinates,
  onFlyToEntityById,
  onZoomIn,
  onZoomOut,
  onTiltUp,
  onTiltDown,
  onRotateLeft,
  onRotateRight,
  onPlayPause,
  onSeek,
  onPlaybackSpeedChange,
}: HudOverlayProps) {
  const {
    layers,
    toggleLayer,
    setLayer,
    counts,
    camera,
    feedHealth,
    activePoiId,
    setActivePoiId,
    visualMode,
    visualIntensity,
    visualParams,
    setVisualMode,
    setVisualIntensity,
    setVisualParam,
    platformMode,
    setPlatformMode,
    analyticsLayers,
    toggleAnalyticsLayer,
    cctvCategoryFilter,
    setCctvCategoryFilter,
    sceneMode,
    setSceneMode,
    dayNight,
    toggleDayNight,
  } = useArgusStore();

  const cameras = useArgusStore((s) => s.cameras);
  const searchQuery = useArgusStore((s) => s.searchQuery);
  const setSearchQuery = useArgusStore((s) => s.setSearchQuery);
  const searchResults = useArgusStore((s) => s.searchResults);
  const isPlaying = useArgusStore((s) => s.isPlaying);
  const playbackSpeed = useArgusStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useArgusStore((s) => s.setPlaybackSpeed);
  const playbackTimeRange = useArgusStore((s) => s.playbackTimeRange);
  const playbackCurrentTime = useArgusStore((s) => s.playbackCurrentTime);

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceId>("news");
  const [alertFilter, setAlertFilter] = useState<AlertSeverity | null>(null);
  const [enlargedStream, setEnlargedStream] = useState<{ src: string; title: string } | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  const [mobileTab, setMobileTab] = useState<"intel" | "feeds" | "controls" | "status" | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [newsSearch, setNewsSearch] = useState("");
  const [newsSortMode, setNewsSortMode] = useState<"score" | "newest">("score");
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsRegions, setNewsRegions] = useState<Record<CommandRegion, RegionDigest> | null>(null);
  const [newsSourceFilter, setNewsSourceFilter] = useState<string>("ALL");
  const [newsRegionFilter, setNewsRegionFilter] = useState<CommandRegion>("WORLDCOM");
  const [newsMeta, setNewsMeta] = useState<{ dedupedCount: number; fetchedAt: string } | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadNews = async () => {
      setNewsLoading(true);
      try {
        const payload = await fetchNewsFeed(ARGUS_CONFIG.endpoints.news);
        if (cancelled) return;
        setNewsItems(payload.items);
        setNewsRegions(payload.regions);
        setNewsMeta({
          dedupedCount: payload.meta.dedupedCount,
          fetchedAt: payload.meta.fetchedAt,
        });
        setNewsError(null);
      } catch (error) {
        if (cancelled) return;
        setNewsError(error instanceof Error ? error.message : "Failed to load news feed");
      } finally {
        if (!cancelled) setNewsLoading(false);
      }
    };

    void loadNews();
    const timer = setInterval(() => {
      void loadNews();
    }, ARGUS_CONFIG.pollMs.news);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const analyticsLayerDefs: {
    key: "gfs_weather" | "sentinel_imagery";
    label: string;
    source: string;
    available: boolean;
  }[] = [
    { key: "gfs_weather", label: "GFS Weather", source: "NOAA GFS", available: true },
    { key: "sentinel_imagery", label: "Sentinel Imagery", source: "Copernicus", available: false },
  ];

  const modeLabel = modeDefs.find((mode) => mode.key === visualMode)?.label ?? "Normal";
  const newsSources = useMemo(() => {
    const set = new Set(newsItems.map((item) => item.source));
    return ["ALL", ...Array.from(set).sort()];
  }, [newsItems]);

  const filteredNewsItems = useMemo(() => {
    const now = Date.now();
    let next = newsItems.filter((item) =>
      newsRegionFilter === "WORLDCOM" ? true : item.region === newsRegionFilter,
    );

    if (timeRange !== "ALL") {
      const horizon = now - timeRangeHours[timeRange] * 3_600_000;
      next = next.filter((item) => new Date(item.publishedAt).getTime() >= horizon);
    }

    if (newsSourceFilter !== "ALL") {
      next = next.filter((item) => item.source === newsSourceFilter);
    }

    const query = newsSearch.trim().toLowerCase();
    if (query) {
      next = next.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.summary.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    if (newsSortMode === "newest") {
      return next.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
    }

    return next.sort((a, b) => b.score - a.score);
  }, [newsItems, newsRegionFilter, newsSearch, newsSortMode, newsSourceFilter, timeRange]);

  const activeRegionDigest = newsRegions?.[newsRegionFilter] ?? null;
  const recTimestamp = Math.max(
    feedHealth.opensky.lastSuccessAt ?? 0,
    feedHealth.adsb.lastSuccessAt ?? 0,
    feedHealth.celestrak.lastSuccessAt ?? 0,
    feedHealth.usgs.lastSuccessAt ?? 0,
    feedHealth.tfl.lastSuccessAt ?? 0,
    feedHealth.cfradar.lastSuccessAt ?? 0,
    feedHealth.otx.lastSuccessAt ?? 0,
    feedHealth.fred.lastSuccessAt ?? 0,
    feedHealth.ais.lastSuccessAt ?? 0,
  );

  const modeSliders: SliderDef[] =
    visualMode === "nvg"
      ? [
          {
            label: "Gain",
            value: visualParams.nvg.gain,
            onChange: (value) => setVisualParam("nvg", "gain", value),
          },
          {
            label: "Bloom",
            value: visualParams.nvg.bloom,
            onChange: (value) => setVisualParam("nvg", "bloom", value),
          },
          {
            label: "Scanlines",
            value: visualParams.nvg.scanlines,
            onChange: (value) => setVisualParam("nvg", "scanlines", value),
          },
          {
            label: "Pixelation",
            value: visualParams.nvg.pixelation,
            onChange: (value) => setVisualParam("nvg", "pixelation", value),
          },
        ]
      : visualMode === "flir"
        ? [
            {
              label: "Bias",
              value: visualParams.flir.bias,
              onChange: (value) => setVisualParam("flir", "bias", value),
            },
            {
              label: "Contrast",
              value: visualParams.flir.contrast,
              onChange: (value) => setVisualParam("flir", "contrast", value),
            },
            {
              label: "Posterize",
              value: visualParams.flir.posterize,
              onChange: (value) => setVisualParam("flir", "posterize", value),
            },
          ]
        : visualMode === "crt"
          ? [
              {
                label: "Scanline Density",
                value: visualParams.crt.scanlineDensity,
                onChange: (value) => setVisualParam("crt", "scanlineDensity", value),
              },
              {
                label: "Chromatic Shift",
                value: visualParams.crt.chromaticShift,
                onChange: (value) => setVisualParam("crt", "chromaticShift", value),
              },
              {
                label: "Distortion",
                value: visualParams.crt.distortion,
                onChange: (value) => setVisualParam("crt", "distortion", value),
              },
              {
                label: "Instability",
                value: visualParams.crt.instability,
                onChange: (value) => setVisualParam("crt", "instability", value),
              },
            ]
          : [];

  const totalLiveCount =
    counts.flights +
    counts.military +
    counts.seismic +
    counts.satellites +
    counts.satelliteLinks +
    counts.cctv +
    counts.bases +
    counts.outages +
    counts.threats;

  const activeFeedCount = Object.values(feedHealth).filter(
    (fh) => fh.status === "ok",
  ).length;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 text-[10px] text-[#99ffca]">
      {/* Top info strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[25] hidden h-8 items-center justify-between border-b border-[#113446] bg-[#040a12e6] px-4 font-mono uppercase tracking-[0.22em] text-[#6f93a5] md:flex">
        <span>Global Situation</span>
        <span>{new Date().toUTCString().replace("GMT", "UTC")}</span>
      </div>

      {/* Bottom info strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] hidden h-7 items-center justify-between border-t border-[#113446] bg-[#040a12e6] px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6f93a5] md:flex">
        <span>Live Entities: {compact(totalLiveCount)} · Active Feeds: {activeFeedCount}/9</span>
        <span>
          Region {newsRegionFilter} · {activeRegionDigest?.posture ?? "STABLE"}
        </span>
      </div>

      {/* Time range strip */}
      <div className="pointer-events-auto absolute left-4 top-10 hidden rounded-md border border-[#123244] bg-[#040b17e0] p-1 md:flex">
        {(["1h", "6h", "24h", "48h", "7d", "ALL"] as TimeRange[]).map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => setTimeRange(range)}
            className={`rounded-sm px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              timeRange === range
                ? "bg-[#29efab] text-[#03120d]"
                : "text-[#6f93a5] hover:bg-[#0a1a2e] hover:text-[#9ceaff]"
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      {/* ARGUS header */}
      <header className="absolute left-3 top-2 font-mono md:left-6 md:top-10">
        <h1 className="text-[20px] font-semibold leading-none tracking-[0.34em] text-[#e8fcff] md:text-[42px]">
          ARG<span className="text-[#2ad4ff]">US</span>
        </h1>
        <p className="mt-1 hidden text-[10px] uppercase tracking-[0.45em] text-[#4e9ca8] md:block">Epsilon LLC</p>
      </header>

      {/* Active style display (top-right) — desktop only */}
      <div className="absolute right-8 top-10 hidden text-right font-mono uppercase tracking-[0.28em] text-[#4e9ca8] md:block">
        <div className="text-[10px] text-[#6b8d97]">Active Style</div>
        <div className="text-[26px] text-[#2ad4ff]">{modeLabel}</div>
      </div>

      {/* Selected intel panel (right side) — desktop only */}
      {selectedIntel && !isMobile ? (
        <section className="pointer-events-auto absolute right-8 top-[5.5rem] w-[348px] rounded-2xl border border-[#113446] bg-[#050b17d9] p-4 shadow-[0_0_40px_rgba(10,145,223,0.24)] backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[12px] uppercase tracking-[0.3em] text-[#e3ad50]">Target Intel</div>
            <button
              type="button"
              onClick={onCloseIntel}
              className="rounded-md border border-[#284f63] bg-[#081322] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7aa1b3] hover:border-[#2ad4ff]"
            >
              Clear
            </button>
          </div>

          <div className="mt-2 rounded-xl border border-[#123244] bg-[#040b17] p-3 font-mono">
            <div className="text-[15px] text-[#d5f7ff]">{selectedIntel.name}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#6c8ea2]">
              {selectedIntel.kind} · {selectedIntel.importance === "important" ? "Priority Target" : "Standard Target"}
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-[#123244] bg-[#040b17] p-3 font-mono text-[11px] text-[#7fb4c5]">
            {selectedIntel.quickFacts.map((fact) => (
              <div key={`quick-${fact.label}`}>
                {fact.label}: {fact.value}
              </div>
            ))}
          </div>

          {selectedIntel.importance === "important" || showFullIntel ? (
            <div className="mt-2 max-h-[180px] overflow-auto rounded-xl border border-[#123244] bg-[#040b17] p-3 font-mono text-[11px] text-[#7fb4c5]">
              {selectedIntel.fullFacts.map((fact) => (
                <div key={`full-${fact.label}`}>
                  {fact.label}: {fact.value}
                </div>
              ))}
            </div>
          ) : null}

          {selectedIntel.streamUrl ? (
            <div className="relative mt-2">
              <iframe
                src={selectedIntel.streamUrl}
                title={selectedIntel.name}
                className="h-44 w-full rounded border border-[#284f63]"
                allow="autoplay; encrypted-media"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
              />
              <button
                type="button"
                onClick={() =>
                  setEnlargedStream({
                    src: selectedIntel.streamUrl!,
                    title: selectedIntel.name,
                  })
                }
                className="absolute right-1.5 top-1.5 rounded border border-[#284f63] bg-[#081322]/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#2ad4ff] transition hover:border-[#2ad4ff] hover:bg-[#081322]"
              >
                Enlarge
              </button>
              <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                <span className="font-mono text-[8px] uppercase tracking-wider text-red-400/80">Live</span>
              </div>
            </div>
          ) : selectedIntel.imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedIntel.imageUrl}
                alt={selectedIntel.name}
                className="mt-2 h-32 w-full rounded border border-[#284f63] object-cover"
              />
            </>
          ) : selectedIntel.kind === "cctv" ? (
            <div className="mt-2 flex h-32 w-full items-center justify-center rounded border border-[#1a3040] bg-[#040b17]">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#4e6a7a]">
                No live feed
              </span>
            </div>
          ) : null}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onFlyToEntity}
              className={actionButtonClass}
            >
              Fly To
            </button>
            {(selectedIntel.kind === "flight" || selectedIntel.kind === "military" || selectedIntel.kind === "satellite") && (
              <button
                type="button"
                onClick={() =>
                  trackedEntityId === selectedIntel.id
                    ? onTrackEntity(null)
                    : onTrackEntity(selectedIntel.id)
                }
                className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                  trackedEntityId === selectedIntel.id
                    ? "border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                    : "border-[#284f63] bg-[#081322] text-[#9ceaff] hover:border-[#2ad4ff]"
                }`}
              >
                {trackedEntityId === selectedIntel.id ? "Stop Tracking" : "Track"}
              </button>
            )}
          </div>

          {trackedEntityId === selectedIntel.id && (
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#2ad4ff]">
              Tracking Active
            </div>
          )}

          {selectedIntel.importance !== "important" ? (
            <button
              type="button"
              onClick={onToggleFullIntel}
              className="mt-2 w-full rounded-lg border border-[#284f63] bg-[#081322] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7aa1b3] hover:border-[#2ad4ff]"
            >
              {showFullIntel ? "Hide Full Intel" : "Load Full Intel"}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Decorative side text — desktop only */}
      <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 rotate-90 font-mono text-[10px] uppercase tracking-[0.45em] text-[#2f5467] md:block">
        BAND-PAN BITS: 11 LVL: 1A
      </div>

      {/* LEFT SIDEBAR - Collapsible Accordion Panels — desktop only */}
      {sidebarVisible && !isMobile ? (
        <nav className="pointer-events-auto absolute left-4 top-24 w-[260px] rounded-2xl border border-[#113446] bg-[#050b17d9] shadow-[0_0_40px_rgba(10,145,223,0.24)] backdrop-blur-md">
          {/* Sidebar header with hide button */}
          <div className="flex items-center justify-between border-b border-[#113446] px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.33em] text-[#6c8ea2]">
              {platformMode === "analytics" ? "Analytics" : platformMode === "playback" ? "Playback" : "Live"} Panels
            </span>
            <button
              type="button"
              onClick={() => setSidebarVisible(false)}
              className="rounded border border-[#284f63] bg-[#081322] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#7298a8] transition hover:border-[#2ad4ff] hover:text-[#9ceaff]"
            >
              Hide
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1 border-b border-[#113446] px-2 py-1.5">
            {workspaceDefs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkspace(tab.id)}
                className={`rounded px-1 py-1 font-mono text-[8px] uppercase tracking-[0.12em] transition ${
                  workspace === tab.id
                    ? "border border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                    : "border border-transparent text-[#6c8ea2] hover:border-[#284f63] hover:bg-[#081322]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {workspace === "news" && (
            <section className="space-y-2 border-b border-[#113446] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#e3ad50]">Live News</div>
                <div className="font-mono text-[8px] text-[#6c8ea2]">
                  {newsMeta ? `${newsMeta.dedupedCount} items` : "--"}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {COMMAND_REGIONS.map((region) => (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setNewsRegionFilter(region)}
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] ${
                      newsRegionFilter === region
                        ? "border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                        : "border-[#284f63] bg-[#081322] text-[#7298a8]"
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>

              <div className="rounded-md border border-[#123244] bg-[#040b17] px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#6c8ea2]">AI Summary</span>
                  <span className="font-mono text-[8px] text-[#2ad4ff]">{activeRegionDigest?.posture ?? "STABLE"}</span>
                </div>
                <p className="mt-1 font-mono text-[9px] leading-relaxed text-[#8bb8c9]">
                  {activeRegionDigest?.summary ?? "Collecting source headlines for regional summary..."}
                </p>
              </div>

              <input
                type="text"
                placeholder="Search headlines..."
                value={newsSearch}
                onChange={(e) => setNewsSearch(e.target.value)}
                className="w-full rounded-md border border-[#284f63] bg-[#081322] px-2 py-1.5 font-mono text-[10px] text-[#d5f7ff] placeholder-[#4e6a7a] focus:border-[#2ad4ff] focus:outline-none"
              />

              <div className="flex gap-1">
                <select
                  value={newsSourceFilter}
                  onChange={(e) => setNewsSourceFilter(e.target.value)}
                  className="flex-1 rounded-md border border-[#284f63] bg-[#081322] px-2 py-1 font-mono text-[9px] text-[#d5f7ff] focus:border-[#2ad4ff] focus:outline-none"
                >
                  {newsSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setNewsSortMode((prev) => (prev === "score" ? "newest" : "score"))}
                  className="rounded-md border border-[#284f63] bg-[#081322] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#9ceaff]"
                >
                  {newsSortMode === "score" ? "Intel" : "Newest"}
                </button>
              </div>

              {newsError ? (
                <div className="rounded-md border border-[#712d2d] bg-[#2a1010] px-2 py-1.5 font-mono text-[9px] text-[#ff9191]">
                  {newsError}
                </div>
              ) : null}

              {newsLoading && filteredNewsItems.length === 0 ? (
                <div className="rounded-md border border-[#123244] bg-[#040b17] px-2 py-1.5 font-mono text-[9px] text-[#7faec0]">
                  Pulling feeds...
                </div>
              ) : null}

              <div className="max-h-[390px] space-y-1 overflow-y-auto pr-0.5">
                {filteredNewsItems.slice(0, 60).map((item) => (
                  <article
                    key={item.id}
                    className="rounded-md border border-[#123244] bg-[#040b17] px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[8px] uppercase tracking-[0.1em] text-[#6c8ea2]">
                        {item.source}
                      </span>
                      <span className="font-mono text-[8px] text-[#4e6a7a]">
                        {new Date(item.publishedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block font-mono text-[10px] leading-snug text-[#d5f7ff] hover:text-[#9ceaff]"
                    >
                      {item.title}
                    </a>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[8px] text-[#6c8ea2]">
                        {item.tags.join(" · ")}
                      </span>
                      <span className="font-mono text-[8px] text-[#2ad4ff]">{item.score.toFixed(1)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* INTEL BRIEF section */}
          {workspace === "intel" && platformMode === "live" && (
            <CollapsibleSection
              title="Intel Brief"
              badge={
                intelBriefing
                  ? intelBriefing.threatLevel
                  : "STANDBY"
              }
              defaultOpen
            >
              {intelBriefing ? (
                <div className="space-y-2">
                  {/* Threat level indicator */}
                  <div
                    className={`rounded-lg border px-2.5 py-2 font-mono ${threatLevelColors[intelBriefing.threatLevel].border} ${threatLevelColors[intelBriefing.threatLevel].bg}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase tracking-[0.28em] text-[#6c8ea2]">
                        Threat Level
                      </span>
                      <span
                        className={`text-[13px] font-bold tracking-[0.2em] ${threatLevelColors[intelBriefing.threatLevel].text}`}
                      >
                        {intelBriefing.threatLevel}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10px] text-[#7fb4c5]">
                      {intelBriefing.summary}
                    </div>
                  </div>

                  {/* Alert count breakdown — clickable to filter */}
                  <div className="flex gap-1.5">
                    {([
                      { sev: "CRITICAL" as const, label: "Crit", count: intelBriefing.criticalCount, color: "#ff4444" },
                      { sev: "WARNING" as const, label: "Warn", count: intelBriefing.warningCount, color: "#e3ad50" },
                      { sev: "INFO" as const, label: "Info", count: intelBriefing.infoCount, color: "#2ad4ff" },
                    ] as const).map(({ sev, label, count, color }) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setAlertFilter((prev) => (prev === sev ? null : sev))}
                        className={`flex-1 rounded-md border px-1.5 py-1 text-center transition ${
                          alertFilter === sev
                            ? `border-[${color}] bg-[${color}]/20`
                            : `border-[${color}]/30 bg-[${color}]/5 hover:bg-[${color}]/10`
                        }`}
                        style={{
                          borderColor: alertFilter === sev ? color : `${color}4d`,
                          backgroundColor: alertFilter === sev ? `${color}33` : `${color}0d`,
                        }}
                      >
                        <div className="font-mono text-[12px] font-bold" style={{ color }}>
                          {count}
                        </div>
                        <div className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: `${color}b3` }}>
                          {label}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Alerts list — clickable, filterable, scrollable */}
                  {(() => {
                    const filtered = alertFilter
                      ? intelBriefing.alerts.filter((a: IntelAlert) => a.severity === alertFilter)
                      : intelBriefing.alerts;

                    return filtered.length > 0 ? (
                      <div className="space-y-1">
                        {alertFilter && (
                          <button
                            type="button"
                            onClick={() => setAlertFilter(null)}
                            className="mb-1 rounded border border-[#284f63] bg-[#081322] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#7298a8] transition hover:border-[#2ad4ff]"
                          >
                            Clear Filter ({filtered.length})
                          </button>
                        )}
                        <div className="max-h-[400px] space-y-1 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#284f63]">
                          {filtered.map((alert: IntelAlert) => (
                            <button
                              key={alert.id}
                              type="button"
                              onClick={() => {
                                if (alert.entityId) {
                                  onFlyToEntityById(alert.entityId);
                                } else if (alert.coordinates) {
                                  onFlyToCoordinates(alert.coordinates.lat, alert.coordinates.lon);
                                }
                              }}
                              className={`w-full rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 text-left transition ${
                                alert.coordinates || alert.entityId
                                  ? "cursor-pointer hover:border-[#2ad4ff] hover:bg-[#0a1a2e]"
                                  : "cursor-default"
                              }`}
                            >
                              <div className="flex items-start gap-1.5">
                                <span
                                  className={`mt-px text-[10px] ${severityColors[alert.severity]}`}
                                >
                                  {severityIcons[alert.severity]}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={`font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${severityColors[alert.severity]}`}
                                  >
                                    {alert.title}
                                  </div>
                                  <div className="mt-0.5 font-mono text-[9px] leading-relaxed text-[#6c8ea2]">
                                    {alert.detail}
                                  </div>
                                  {alert.coordinates && (
                                    <div className="mt-0.5 font-mono text-[8px] text-[#2ad4ff]/60">
                                      {alert.coordinates.lat.toFixed(2)}N {alert.coordinates.lon.toFixed(2)}E
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2.5 py-2 font-mono text-[10px] text-[#4e9ca8]">
                  Awaiting first intelligence cycle...
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* SEARCH section */}
          {workspace === "intel" && platformMode === "live" && (
            <CollapsibleSection title="Search" badge={searchResults.length > 0 ? `${searchResults.length}` : null}>
              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder="Search entities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#284f63] bg-[#081322] px-2.5 py-1.5 font-mono text-[11px] text-[#d5f7ff] placeholder-[#4e6a7a] focus:border-[#2ad4ff] focus:outline-none"
                />
                {searchResults.length > 0 && (
                  <div className="max-h-[180px] space-y-1 overflow-y-auto">
                    {searchResults.map((result) => {
                      const kindColors: Record<string, string> = {
                        flight: "text-[#9ceaff]",
                        military: "text-[#e3ad50]",
                        satellite: "text-[#99ffca]",
                        earthquake: "text-[#ff6b6b]",
                        cctv: "text-[#c4b5fd]",
                      };
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            onFlyToEntityById(result.id);
                            setSearchQuery("");
                          }}
                          className="w-full rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 text-left transition hover:border-[#2ad4ff] hover:bg-[#0a1a2e]"
                        >
                          <div className="truncate font-mono text-[10px] text-[#d5f7ff]">
                            {result.name}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono text-[8px] uppercase tracking-[0.14em] ${kindColors[result.kind] ?? "text-[#6c8ea2]"}`}>
                              {result.kind}
                            </span>
                            {result.lat !== null && result.lon !== null && (
                              <span className="font-mono text-[8px] text-[#4e6a7a]">
                                {result.lat.toFixed(1)}N {result.lon.toFixed(1)}E
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {searchQuery.trim() && searchResults.length === 0 && (
                  <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2.5 py-2 font-mono text-[10px] text-[#4e9ca8]">
                    No entities found
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* FEATURED FEEDS — curated live streams with thumbnails */}
          {workspace === "feeds" && platformMode === "live" && cameras.length > 0 && (() => {
            const filtered = cameras.filter((cam) => cctvCategoryFilter === "All" || cam.category === cctvCategoryFilter);
            const featured = filtered.filter((cam) => cam.streamUrl);
            const cctv = filtered.filter((cam) => !cam.streamUrl);
            return (
              <>
                {featured.length > 0 && (
                  <CollapsibleSection title="Featured Feeds" badge={`${featured.length} live`}>
                    <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
                      {featured.map((cam) => (
                        <button
                          key={cam.id}
                          type="button"
                          onClick={() => {
                            if (!layers.cctv) setLayer("cctv", true);
                            onFlyToEntityById(`cctv-${cam.id}`);
                            setEnlargedStream({ src: cam.streamUrl!, title: cam.name });
                          }}
                          className="flex w-full items-center gap-2 rounded-lg border border-[#123244] bg-[#040b17] p-1.5 text-left transition hover:border-[#2ad4ff] hover:bg-[#0a1a2e]"
                        >
                          <div className="h-10 w-14 shrink-0 overflow-hidden rounded border border-[#1a3040]">
                            {cam.imageUrl && cam.imageUrl !== "/camera-placeholder.svg" ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={cam.imageUrl}
                                alt={cam.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[#071020] font-mono text-[9px] text-[#4e6a7a]">
                                LIVE
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-mono text-[9px] text-[#d5f7ff]">
                              {cam.name}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#4e9ca8]">
                                {cam.category}
                              </span>
                              <span className="inline-block h-1 w-1 rounded-full bg-red-500 animate-pulse" />
                              <span className="font-mono text-[7px] text-red-400">LIVE</span>
                            </div>
                          </div>
                          <TacticalGlyph className="h-3 w-3 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* CCTV MESH — compact list of all TFL/bulk cameras */}
                {cctv.length > 0 && (
                  <CollapsibleSection title="CCTV Mesh" badge={`${cctv.length}`}>
                    <div className="max-h-[300px] overflow-y-auto">
                      {cctv.map((cam) => (
                        <button
                          key={cam.id}
                          type="button"
                          onClick={() => {
                            if (!layers.cctv) setLayer("cctv", true);
                            onFlyToEntityById(`cctv-${cam.id}`);
                          }}
                          className="flex w-full items-center gap-1.5 border-b border-[#0d1f2d] px-1 py-[3px] text-left transition hover:bg-[#0a1a2e]"
                        >
                          <TacticalGlyph className="h-2.5 w-2.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-[#8eb8c8]">
                            {cam.name}
                          </span>
                          <span className="shrink-0 font-mono text-[7px] text-[#3a5a6a]">
                            {cam.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
              </>
            );
          })()}

          {/* INTEL FEEDS section */}
          {workspace === "feeds" && (
          <CollapsibleSection
            title="Intel Feeds"
            badge={platformMode === "analytics" ? "Raster" : `${compact(totalLiveCount)}`}
          >
            {platformMode === "analytics" ? (
              <div className="space-y-1.5">
                {analyticsLayerDefs.map((layer) => (
                  <button
                    key={layer.key}
                    type="button"
                    onClick={() => layer.available && toggleAnalyticsLayer(layer.key)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition ${
                      !layer.available
                        ? "cursor-not-allowed border-[#1a2a35] bg-[#030a10] opacity-40"
                        : analyticsLayers[layer.key]
                          ? "border-[#e3ad50] bg-[#1a0f00]"
                          : "border-[#123244] bg-[#040b17] hover:border-[#2eb8d4]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px] text-[#d5f7ff]">{layer.label}</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6c8ea2]">
                        {layer.source}{!layer.available ? " \u00B7 Phase 4" : ""}
                      </div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                        !layer.available
                          ? "border-[#415f70] bg-[#071321] text-[#668092]"
                          : analyticsLayers[layer.key]
                            ? "border-[#e3ad50] bg-[#1a0f00] text-[#e3ad50]"
                            : "border-[#415f70] bg-[#071321] text-[#668092]"
                      }`}
                    >
                      {!layer.available ? "Soon" : analyticsLayers[layer.key] ? "On" : "Off"}
                    </span>
                  </button>
                ))}

                {analyticsStatus ? (
                  <div className="rounded-lg border border-[#1f3f52] bg-[#071020] px-2 py-1.5 font-mono text-[9px] text-[#7fb4c5]">
                    {analyticsStatus}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
                {layerDefs.map((layer) => {
                  const valueMap: Record<LayerKey, number> = {
                    flights: counts.flights,
                    military: counts.military,
                    satellites: counts.satellites,
                    satelliteLinks: counts.satelliteLinks,
                    seismic: counts.seismic,
                    cctv: counts.cctv,
                    bases: counts.bases,
                    outages: counts.outages,
                    threats: counts.threats,
                  };
                  const value = valueMap[layer.key];

                  return (
                    <button
                      key={layer.key}
                      type="button"
                      onClick={() => toggleLayer(layer.key)}
                      className="flex w-full items-center justify-between rounded-lg border border-[#123244] bg-[#040b17] px-2.5 py-1.5 text-left transition hover:border-[#2eb8d4]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] text-[#d5f7ff]">{layer.label}</div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6c8ea2]">{layer.feed}</div>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2 text-right font-mono">
                        <span className="text-[11px] text-[#a5f0ff]">{compact(value)}</span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] ${
                            layers[layer.key]
                              ? "border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                              : "border-[#415f70] bg-[#071321] text-[#668092]"
                          }`}
                        >
                          {layers[layer.key] ? "On" : "Off"}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {layers.cctv && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(["All", "Traffic", "Nature", "Landmark", "Wildlife", "Scenic", "Infrastructure"] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCctvCategoryFilter(cat)}
                        className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] transition ${
                          cctvCategoryFilter === cat
                            ? "border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                            : "border-[#284f63] bg-[#081322] text-[#7298a8] hover:border-[#2ad4ff]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
          )}

          {/* SIGNAL section */}
          {workspace === "signal" && (
          <CollapsibleSection title="Signal" badge={modeLabel}>
            <div className="space-y-1.5">
              <SliderControl
                label="Master Blend"
                value={visualIntensity}
                onChange={(value) => setVisualIntensity(value)}
              />

              {modeSliders.length > 0 ? (
                modeSliders.map((slider) => <SliderControl key={slider.label} {...slider} />)
              ) : (
                <div className="rounded-lg border border-[#17374c] bg-[#071020] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#66889b]">
                  Normal mode has no active shader params.
                </div>
              )}
            </div>
          </CollapsibleSection>
          )}

          {/* STATUS section */}
          {workspace === "status" && (
          <CollapsibleSection title="Status" badge={`${activeFeedCount}/9`}>
            <div className="space-y-1.5">
              <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6c8ea2]">Feed Health</div>
                <div>OpenSky: {feedHealth.opensky.status} @ {fmtDate(feedHealth.opensky.lastSuccessAt)}</div>
                <div>ADS-B: {feedHealth.adsb.status} @ {fmtDate(feedHealth.adsb.lastSuccessAt)}</div>
                <div>CelesTrak: {feedHealth.celestrak.status} @ {fmtDate(feedHealth.celestrak.lastSuccessAt)}</div>
                <div>USGS: {feedHealth.usgs.status} @ {fmtDate(feedHealth.usgs.lastSuccessAt)}</div>
                <div>TFL: {feedHealth.tfl.status} @ {fmtDate(feedHealth.tfl.lastSuccessAt)}</div>
                <div>CF Radar: {feedHealth.cfradar.status} @ {fmtDate(feedHealth.cfradar.lastSuccessAt)}</div>
                <div>OTX: {feedHealth.otx.status} @ {fmtDate(feedHealth.otx.lastSuccessAt)}</div>
                <div>FRED: {feedHealth.fred.status} @ {fmtDate(feedHealth.fred.lastSuccessAt)}</div>
                <div>AISStream: {feedHealth.ais.status} @ {fmtDate(feedHealth.ais.lastSuccessAt)}</div>
              </div>

              <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6c8ea2]">Camera</div>
                <div>REC 2026-02-12 {fmtDate(recTimestamp || null)}</div>
                <div>ALT {camera.altMeters.toFixed(0)}m</div>
                <div>{camera.lat.toFixed(4)}N {camera.lon.toFixed(4)}E</div>
              </div>
            </div>
          </CollapsibleSection>
          )}
        </nav>
      ) : (
        <button
          type="button"
          onClick={() => setSidebarVisible(true)}
          className="pointer-events-auto absolute left-4 top-24 hidden rounded-lg border border-[#113446] bg-[#050b17d9] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#6c8ea2] shadow-[0_0_40px_rgba(10,145,223,0.24)] backdrop-blur-md transition hover:border-[#2ad4ff] hover:text-[#9ceaff] md:block"
        >
          Panels
        </button>
      )}

      {/* Bottom control bar — desktop only */}
      <section className="pointer-events-auto absolute bottom-4 left-1/2 hidden w-[min(95vw,900px)] -translate-x-1/2 rounded-2xl border border-[#113446] bg-[#050b17d9] p-3 shadow-[0_0_30px_rgba(10,171,255,0.18)] backdrop-blur-md md:block">
        <div className="grid gap-2 md:grid-cols-5">
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
            Location
            <select
              className={`${controlInputClass} mt-1`}
              value={activePoiId ?? ""}
              onChange={(event) => {
                const nextPoi = event.target.value || null;
                setActivePoiId(nextPoi);
                if (nextPoi) {
                  onFlyToPoi(nextPoi);
                }
              }}
            >
              <option value="">Select location</option>
              {CAMERA_PRESETS.map((poi) => (
                <option key={poi.id} value={poi.id}>
                  {poi.label}
                </option>
              ))}
            </select>
          </label>

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
            <span className="flex items-center gap-1.5">
              Platform
              {platformMode === "live" && (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" title="Recording" />
              )}
            </span>
            <select
              className={`${controlInputClass} mt-1`}
              value={platformMode}
              onChange={(event) => setPlatformMode(event.target.value as PlatformMode)}
            >
              <option value="live">Live</option>
              <option value="playback">Playback</option>
              <option value="analytics">Analytics</option>
            </select>
          </label>

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
            Camera Mode
            <select
              className={`${controlInputClass} mt-1`}
              value={visualMode}
              onChange={(event) => setVisualMode(event.target.value as VisualMode)}
            >
              {modeDefs.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
            View
            <select
              className={`${controlInputClass} mt-1`}
              value={sceneMode}
              onChange={(event) => setSceneMode(event.target.value as "globe" | "map")}
            >
              <option value="globe">Globe</option>
              <option value="map">Map</option>
            </select>
          </label>

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
            Lighting
            <select
              className={`${controlInputClass} mt-1`}
              value={dayNight ? "on" : "off"}
              onChange={() => toggleDayNight()}
            >
              <option value="off">Uniform</option>
              <option value="on">Day / Night</option>
            </select>
          </label>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (activePoiId) {
                onFlyToPoi(activePoiId);
              }
            }}
            className={actionButtonClass}
            disabled={!activePoiId}
          >
            Fly To Selected
          </button>
          <button type="button" onClick={onResetCamera} className={actionButtonClass}>
            Reset View
          </button>
          <button type="button" onClick={onToggleCollision} className={actionButtonClass}>
            Terrain Collision: {collisionEnabled ? "On" : "Off"}
          </button>
        </div>
      </section>

      {/* Camera controls - floating right side — desktop only */}
      <div className="pointer-events-auto absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-1 md:flex">
        <button type="button" onClick={onZoomIn} className={camBtnClass} title="Zoom In">+</button>
        <button type="button" onClick={onZoomOut} className={camBtnClass} title="Zoom Out">&minus;</button>
        <div className="my-1 h-px w-6 bg-[#1a3a4f]" />
        <button type="button" onClick={onTiltUp} className={camBtnClass} title="Tilt Up">&uarr;</button>
        <div className="flex gap-1">
          <button type="button" onClick={onRotateLeft} className={camBtnClass} title="Rotate Left">&larr;</button>
          <button type="button" onClick={onRotateRight} className={camBtnClass} title="Rotate Right">&rarr;</button>
        </div>
        <button type="button" onClick={onTiltDown} className={camBtnClass} title="Tilt Down">&darr;</button>
      </div>

      {/* ═══ MOBILE TAB BAR + SHEETS ═══ */}
      {isMobile && (
        <>
          {/* Slide-up sheet */}
          {mobileTab && (
            <div className="pointer-events-auto fixed inset-x-0 bottom-[52px] z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-[#113446] bg-[#050b17f0] backdrop-blur-xl">
              {/* Drag handle */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#113446] bg-[#050b17f0] px-4 py-2 backdrop-blur-xl">
                <span className="font-mono text-[10px] uppercase tracking-[0.33em] text-[#e3ad50]">
                  {mobileTab === "intel" ? "Intel Brief" : mobileTab === "feeds" ? "Live Feeds" : mobileTab === "controls" ? "Controls" : "Status"}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileTab(null)}
                  className="rounded border border-[#284f63] bg-[#081322] px-2 py-0.5 font-mono text-[9px] text-[#7298a8]"
                >
                  Close
                </button>
              </div>

              <div className="p-3">
                {/* INTEL TAB */}
                {mobileTab === "intel" && (
                  <div className="space-y-2">
                    {intelBriefing ? (
                      <>
                        <div className={`rounded-lg border px-2.5 py-2 font-mono ${threatLevelColors[intelBriefing.threatLevel].border} ${threatLevelColors[intelBriefing.threatLevel].bg}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] uppercase tracking-[0.28em] text-[#6c8ea2]">Threat Level</span>
                            <span className={`text-[14px] font-bold ${threatLevelColors[intelBriefing.threatLevel].text}`}>{intelBriefing.threatLevel}</span>
                          </div>
                          <div className="mt-1 text-[9px] text-[#7fb4c5]">{intelBriefing.summary}</div>
                        </div>
                        <div className="space-y-1">
                          {(() => {
                            const alerts = intelBriefing.alerts;
                            const filtered = alertFilter ? alerts.filter((a) => a.severity === alertFilter) : alerts;
                            return filtered.map((alert: IntelAlert) => (
                              <button
                                key={alert.id}
                                type="button"
                                onClick={() => {
                                  if (alert.entityId) onFlyToEntityById(alert.entityId);
                                  else if (alert.coordinates) onFlyToCoordinates(alert.coordinates.lat, alert.coordinates.lon);
                                  setMobileTab(null);
                                }}
                                className="w-full rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 text-left"
                              >
                                <div className="flex items-start gap-1.5">
                                  <span className={`mt-px text-[10px] ${severityColors[alert.severity]}`}>{severityIcons[alert.severity]}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className={`font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${severityColors[alert.severity]}`}>{alert.title}</div>
                                    <div className="mt-0.5 font-mono text-[9px] text-[#6c8ea2]">{alert.detail}</div>
                                  </div>
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2.5 py-2 font-mono text-[10px] text-[#4e9ca8]">
                        Awaiting first intelligence cycle...
                      </div>
                    )}
                  </div>
                )}

                {/* FEEDS TAB */}
                {mobileTab === "feeds" && (() => {
                  const filtered = cameras.filter((cam) => cctvCategoryFilter === "All" || cam.category === cctvCategoryFilter);
                  const featured = filtered.filter((cam) => cam.streamUrl);
                  const cctvList = filtered.filter((cam) => !cam.streamUrl);
                  return (
                    <div className="space-y-3">
                      {/* Category filter chips */}
                      <div className="flex flex-wrap gap-1">
                        {(["All", "Traffic", "Nature", "Landmark", "Wildlife", "Scenic", "Infrastructure"] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setCctvCategoryFilter(cat)}
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] transition ${
                              cctvCategoryFilter === cat
                                ? "border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                                : "border-[#284f63] bg-[#081322] text-[#7298a8]"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* Featured streams */}
                      {featured.length > 0 && (
                        <div>
                          <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.28em] text-[#6c8ea2]">Featured Feeds ({featured.length})</div>
                          <div className="space-y-1">
                            {featured.map((cam) => (
                              <button
                                key={cam.id}
                                type="button"
                                onClick={() => {
                                  if (!layers.cctv) setLayer("cctv", true);
                                  onFlyToEntityById(`cctv-${cam.id}`);
                                  setEnlargedStream({ src: cam.streamUrl!, title: cam.name });
                                  setMobileTab(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg border border-[#123244] bg-[#040b17] p-1.5 text-left"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-mono text-[9px] text-[#d5f7ff]">{cam.name}</div>
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-[7px] text-[#4e9ca8]">{cam.category}</span>
                                    <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-red-500" />
                                    <span className="font-mono text-[7px] text-red-400">LIVE</span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CCTV list */}
                      {cctvList.length > 0 && (
                        <div>
                          <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.28em] text-[#6c8ea2]">CCTV Mesh ({cctvList.length})</div>
                          <div className="max-h-[200px] overflow-y-auto">
                            {cctvList.map((cam) => (
                              <button
                                key={cam.id}
                                type="button"
                                onClick={() => {
                                  if (!layers.cctv) setLayer("cctv", true);
                                  onFlyToEntityById(`cctv-${cam.id}`);
                                  setMobileTab(null);
                                }}
                                className="flex w-full items-center gap-1.5 border-b border-[#0d1f2d] px-1 py-[3px] text-left"
                              >
                                <TacticalGlyph className="h-2.5 w-2.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-[#8eb8c8]">{cam.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CONTROLS TAB */}
                {mobileTab === "controls" && (
                  <div className="space-y-3">
                    {/* Location select */}
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
                      Location
                      <select
                        className={`${controlInputClass} mt-1`}
                        value={activePoiId ?? ""}
                        onChange={(event) => {
                          const nextPoi = event.target.value || null;
                          setActivePoiId(nextPoi);
                          if (nextPoi) { onFlyToPoi(nextPoi); setMobileTab(null); }
                        }}
                      >
                        <option value="">Select location</option>
                        {CAMERA_PRESETS.map((poi) => (
                          <option key={poi.id} value={poi.id}>{poi.label}</option>
                        ))}
                      </select>
                    </label>

                    {/* Camera mode */}
                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
                      Camera Mode
                      <select
                        className={`${controlInputClass} mt-1`}
                        value={visualMode}
                        onChange={(event) => setVisualMode(event.target.value as VisualMode)}
                      >
                        {modeDefs.map((mode) => (
                          <option key={mode.key} value={mode.key}>{mode.label}</option>
                        ))}
                      </select>
                    </label>

                    {/* View / Lighting */}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
                        View
                        <select
                          className={`${controlInputClass} mt-1`}
                          value={sceneMode}
                          onChange={(event) => setSceneMode(event.target.value as "globe" | "map")}
                        >
                          <option value="globe">Globe</option>
                          <option value="map">Map</option>
                        </select>
                      </label>
                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b8d97]">
                        Lighting
                        <select
                          className={`${controlInputClass} mt-1`}
                          value={dayNight ? "on" : "off"}
                          onChange={() => toggleDayNight()}
                        >
                          <option value="off">Uniform</option>
                          <option value="on">Day / Night</option>
                        </select>
                      </label>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { onResetCamera(); setMobileTab(null); }} className={actionButtonClass}>Reset View</button>
                      <button type="button" onClick={onToggleCollision} className={actionButtonClass}>
                        Terrain: {collisionEnabled ? "On" : "Off"}
                      </button>
                    </div>

                    {/* D-pad controls */}
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.28em] text-[#6c8ea2]">Camera Controls</div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={onZoomIn} className={camBtnClass}>+</button>
                        <button type="button" onClick={onZoomOut} className={camBtnClass}>&minus;</button>
                      </div>
                      <button type="button" onClick={onTiltUp} className={camBtnClass}>&uarr;</button>
                      <div className="flex gap-1">
                        <button type="button" onClick={onRotateLeft} className={camBtnClass}>&larr;</button>
                        <button type="button" onClick={onRotateRight} className={camBtnClass}>&rarr;</button>
                      </div>
                      <button type="button" onClick={onTiltDown} className={camBtnClass}>&darr;</button>
                    </div>

                    {/* Layer toggles */}
                    <div className="space-y-1">
                      <div className="font-mono text-[8px] uppercase tracking-[0.28em] text-[#6c8ea2]">Layers</div>
                      {layerDefs.map((layer) => (
                        <button
                          key={layer.key}
                          type="button"
                          onClick={() => toggleLayer(layer.key)}
                          className="flex w-full items-center justify-between rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 text-left"
                        >
                          <span className="font-mono text-[10px] text-[#d5f7ff]">{layer.label}</span>
                          <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                            layers[layer.key]
                              ? "border-[#2ad4ff] bg-[#0a2a44] text-[#9ceaff]"
                              : "border-[#415f70] bg-[#071321] text-[#668092]"
                          }`}>
                            {layers[layer.key] ? "On" : "Off"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* STATUS TAB */}
                {mobileTab === "status" && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6c8ea2]">Feed Health</div>
                      <div>OpenSky: {feedHealth.opensky.status} @ {fmtDate(feedHealth.opensky.lastSuccessAt)}</div>
                      <div>ADS-B: {feedHealth.adsb.status} @ {fmtDate(feedHealth.adsb.lastSuccessAt)}</div>
                      <div>CelesTrak: {feedHealth.celestrak.status} @ {fmtDate(feedHealth.celestrak.lastSuccessAt)}</div>
                      <div>USGS: {feedHealth.usgs.status} @ {fmtDate(feedHealth.usgs.lastSuccessAt)}</div>
                      <div>TFL: {feedHealth.tfl.status} @ {fmtDate(feedHealth.tfl.lastSuccessAt)}</div>
                      <div>CF Radar: {feedHealth.cfradar.status} @ {fmtDate(feedHealth.cfradar.lastSuccessAt)}</div>
                      <div>OTX: {feedHealth.otx.status} @ {fmtDate(feedHealth.otx.lastSuccessAt)}</div>
                      <div>FRED: {feedHealth.fred.status} @ {fmtDate(feedHealth.fred.lastSuccessAt)}</div>
                      <div>AISStream: {feedHealth.ais.status} @ {fmtDate(feedHealth.ais.lastSuccessAt)}</div>
                    </div>
                    <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6c8ea2]">Camera</div>
                      <div>ALT {camera.altMeters.toFixed(0)}m</div>
                      <div>{camera.lat.toFixed(4)}N {camera.lon.toFixed(4)}E</div>
                    </div>
                    <div className="rounded-lg border border-[#123244] bg-[#040b17] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6c8ea2]">Counts</div>
                      <div>Flights: {counts.flights} · Military: {counts.military}</div>
                      <div>Satellites: {counts.satellites} · Quakes: {counts.seismic}</div>
                      <div>Cameras: {counts.cctv}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 flex border-t border-[#113446] bg-[#050b17f0] backdrop-blur-xl">
            {([
              { id: "intel" as const, label: "Intel", icon: "\u25C6" },
              { id: "feeds" as const, label: "Feeds", icon: "\u25CE" },
              { id: "controls" as const, label: "Controls", icon: "\u2699" },
              { id: "status" as const, label: "Status", icon: "\u2588" },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(mobileTab === tab.id ? null : tab.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                  mobileTab === tab.id
                    ? "text-[#2ad4ff]"
                    : "text-[#4e6a7a]"
                }`}
              >
                <span className="text-[14px]">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Enlarged video overlay */}
      {enlargedStream && (
        <VideoOverlay
          src={enlargedStream.src}
          title={enlargedStream.title}
          onClose={() => setEnlargedStream(null)}
        />
      )}

      {/* Playback Timeline Bar */}
      {platformMode === "playback" && playbackTimeRange && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded border border-cyan-800/50 bg-black/80 px-4 py-2 font-mono text-xs text-cyan-400 backdrop-blur-sm">
          <button
            type="button"
            onClick={onPlayPause}
            className="flex h-7 w-7 items-center justify-center rounded border border-cyan-700/50 bg-cyan-900/30 text-cyan-400 transition-colors hover:bg-cyan-800/40"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <span className="min-w-[70px] text-center tabular-nums">
            {new Date(playbackCurrentTime).toLocaleTimeString()}
          </span>

          <input
            type="range"
            min={playbackTimeRange.start}
            max={playbackTimeRange.end}
            value={playbackCurrentTime}
            onChange={(e) => onSeek?.(Number(e.target.value))}
            className="h-1 w-48 cursor-pointer accent-cyan-500"
          />

          <select
            value={playbackSpeed}
            onChange={(e) => {
              const speed = Number(e.target.value) as PlaybackSpeed;
              setPlaybackSpeed(speed);
              onPlaybackSpeedChange?.(speed);
            }}
            className="rounded border border-cyan-800/50 bg-black/60 px-1.5 py-0.5 text-xs text-cyan-400"
          >
            <option value={1}>1x</option>
            <option value={3}>3x</option>
            <option value={5}>5x</option>
            <option value={15}>15x</option>
            <option value={60}>60x</option>
          </select>

          <button
            type="button"
            onClick={() => setPlatformMode("live")}
            className="rounded border border-red-700/50 bg-red-900/30 px-2 py-0.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-800/40"
          >
            LIVE
          </button>
        </div>
      )}
    </div>
  );
}
