"use client";

import { useState, useEffect, useMemo } from "react";
import { ARGUS_CONFIG, CAMERA_PRESETS } from "@/lib/config";
import { LIVE_FEEDS } from "@/data/liveFeeds";
import type { IntelBriefing, AlertSeverity, IntelAlert, ThreatLevel } from "@/lib/intel/analysisEngine";
import { fetchNewsFeed, type NewsItem, type RegionDigest } from "@/lib/ingest/news";
import { useArgusStore } from "@/store/useArgusStore";
import type { ClickedCoordinates, LayerKey, PlatformMode, PlaybackSpeed, SceneMode, SelectedIntel, VisualMode } from "@/types/intel";
import { COMMAND_REGIONS, type CommandRegion } from "@/types/regionalNews";
import { VideoOverlay } from "./VideoOverlay";
import PneumaHud from "./PneumaHud";

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
  clickedCoordinates: ClickedCoordinates | null;
  onSelectIntel: (intel: SelectedIntel | null) => void;
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
  { key: "outages", label: "Internet Outages", feed: "CF Radar" },
  { key: "threats", label: "Cyber Threats", feed: "OTX" },
  { key: "gdelt", label: "GDELT Events", feed: "GDELT" },
  { key: "anomalies", label: "Chaos Anomalies", feed: "Phantom" },
  { key: "weather", label: "Weather Radar", feed: "RainViewer" },
  { key: "vessels", label: "AIS Vessels", feed: "AISStream" },
];

const analyticsIntelDefs: { key: LayerKey; label: string; feed: string }[] = [
  { key: "outages", label: "Internet Outages", feed: "CF Radar" },
  { key: "threats", label: "Cyber Threats", feed: "OTX" },
  { key: "gdelt", label: "GDELT Events", feed: "GDELT" },
];

const modeDefs: { key: VisualMode; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "crt", label: "CRT" },
  { key: "nvg", label: "NVG" },
  { key: "flir", label: "FLIR" },
];

const sceneModeDefs: { key: SceneMode; label: string }[] = [
  { key: "globe_sat", label: "Globe Sat" },
  { key: "globe_street", label: "Globe Street" },
  { key: "flat_map", label: "Flat Map" },
  { key: "globe_map", label: "Globe Map" },
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
  GREEN: { text: "text-[#b8bb26]", border: "border-[#98971a]", bg: "bg-[#1a2e1a]" },
  AMBER: { text: "text-[#fabd2f]", border: "border-[#fabd2f]", bg: "bg-[#2e2a1a]" },
  RED: { text: "text-[#fb4934]", border: "border-[#fb4934]", bg: "bg-[#2e1a1a]" },
};

const severityColors: Record<AlertSeverity, string> = {
  CRITICAL: "text-[#fb4934]",
  WARNING: "text-[#fabd2f]",
  INFO: "text-[#83a598]",
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
  { id: "settings", label: "Settings" },
] as const;

type WorkspaceId = (typeof workspaceDefs)[number]["id"];
type MobileTabId = "brief" | "news" | "ops";
type TimeRange = "1h" | "6h" | "24h" | "48h" | "7d" | "ALL";

const timeRangeHours: Record<Exclude<TimeRange, "ALL">, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "48h": 48,
  "7d": 168,
};

const mobileTabDefs = [
  { id: "brief" as const, label: "Brief", icon: "◆" },
  { id: "news" as const, label: "News", icon: "◫" },
  { id: "ops" as const, label: "Ops", icon: "⚙" },
];

function SliderControl({ label, value, onChange }: SliderDef) {
  return (
    <div className="rounded-lg border border-[#3c3836] bg-[#282828] px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-[#a89984]">
        <span>{label}</span>
        <span className="text-[#d5c4a1]">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#83a598]"
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
    <div className="border-b border-[#3c3836] last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2.5 transition hover:bg-[#3c3836]"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#928374]">
            {isOpen ? "\u25BE" : "\u25B8"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#fabd2f]">
            {title}
          </span>
        </div>
        {badge ? (
          <span className="rounded-md border border-[#504945] bg-[#282828] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#a89984]">
            {badge}
          </span>
        ) : null}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

const controlInputClass =
  "w-full rounded-lg border border-[#504945] bg-[#282828] px-3 py-2 font-mono text-[12px] text-[#ebdbb2] focus:border-[#83a598] focus:outline-none";

const actionButtonClass =
  "rounded-lg border border-[#504945] bg-[#282828] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#d5c4a1] transition hover:border-[#83a598]";

const camBtnClass =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-[#504945] bg-[#1d2021d9] font-mono text-[14px] text-[#d5c4a1] shadow-[0_0_12px_rgba(131,165,152,0.12)] backdrop-blur-md transition hover:border-[#83a598] hover:text-white active:bg-[#504945]";

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
  clickedCoordinates,
  onSelectIntel,
}: HudOverlayProps) {
  const {
    layers,
    toggleLayer,
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
    sceneMode,
    setSceneMode,
    dayNight,
    toggleDayNight,
  } = useArgusStore();

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
  const [mobileTab, setMobileTab] = useState<MobileTabId | null>(null);
  const [utcTimestamp, setUtcTimestamp] = useState("");
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
  const [llmProvider, setLlmProvider] = useState<"ollama" | "openai_compatible">("ollama");
  const [llmEndpoint, setLlmEndpoint] = useState("http://localhost:11434");
  const [llmModel, setLlmModel] = useState("llama3");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [showPneumaPanel, setShowPneumaPanel] = useState(false);
  const [gdeltDigestLoading, setGdeltDigestLoading] = useState(false);
  const [hypotheses, setHypotheses] = useState([
    { id: 1, text: "Submarine cable cut in Atlantic linked to observed vessel patterns.", score: 0 },
    { id: 2, text: "Unusual troop movement correlates with recent cyber outages.", score: 0 },
  ]);
  const [cognitiveLens, setCognitiveLens] = useState<"tactical" | "strategic" | "anomaly">("tactical");

  useEffect(() => {
    const syncClock = () => setUtcTimestamp(new Date().toUTCString().replace("GMT", "UTC"));
    syncClock();
    const timer = window.setInterval(syncClock, 1000);
    return () => window.clearInterval(timer);
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

  useEffect(() => {
    if (workspace !== "settings" || settingsLoaded) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.llm) {
          setLlmProvider(data.llm.provider ?? "ollama");
          setLlmEndpoint(data.llm.endpoint ?? "http://localhost:11434");
          setLlmModel(data.llm.model ?? "llama3");
          setLlmApiKey(data.llm.apiKey ?? "");
        }
        setSettingsLoaded(true);
      })
      .catch(() => {});
  }, [workspace, settingsLoaded]);

  const analyticsLayerDefs: {
    key: "gfs_weather" | "sentinel_imagery";
    label: string;
    source: string;
    available: boolean;
  }[] = [
    { key: "gfs_weather", label: "GFS Weather", source: "NOAA GFS", available: true },
    { key: "sentinel_imagery", label: "Sentinel Imagery", source: "EOX Sentinel-2", available: true },
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
    counts.bases;

  const activeFeedCount = Object.values(feedHealth).filter(
    (fh) => fh.status === "ok",
  ).length;
  const feedTotal = Object.keys(feedHealth).length;
  const activeLayerCount = Object.values(layers).filter(Boolean).length;
  const activePoiLabel = CAMERA_PRESETS.find((poi) => poi.id === activePoiId)?.label ?? null;
  const mobileAlerts = useMemo(() => {
    if (!intelBriefing) return [];
    return alertFilter
      ? intelBriefing.alerts.filter((alert) => alert.severity === alertFilter)
      : intelBriefing.alerts;
  }, [intelBriefing, alertFilter]);
  const mobileAlertPreview = useMemo(() => mobileAlerts.slice(0, 5), [mobileAlerts]);
  const mobileHeadlinePreview = useMemo(() => filteredNewsItems.slice(0, 8), [filteredNewsItems]);
  const activeViewLabel = sceneModeDefs.find((mode) => mode.key === sceneMode)?.label ?? sceneMode;

  const openChaosInfoPanel = () => {
    onSelectIntel({
      id: "chaos-anomalies-info",
      name: "Chaos Anomalies",
      kind: "info",
      importance: "important",
      quickFacts: [
        { label: "Source", value: "Phantom Analysis Engine" },
        { label: "Active Anomalies", value: String(counts.anomalies) },
        { label: "Feed Status", value: feedHealth.phantom.status.toUpperCase() },
        { label: "Coverage", value: "Flight & Seismic" },
      ],
      fullFacts: [
        {
          label: "What is this?",
          value:
            "Chaos Anomalies are unusual patterns detected across live data feeds by the Phantom analysis engine. These include unexpected earthquake clusters, abnormal seismic depths, flight path deviations, unusual military activity, and other statistical outliers.",
        },
        {
          label: "Severity Levels",
          value:
            "Critical (red) \u2014 extreme deviation requiring immediate attention. High (orange) \u2014 significant anomaly. Medium (yellow) \u2014 notable pattern. Low (cyan) \u2014 minor irregularity worth monitoring.",
        },
        {
          label: "How it works",
          value:
            "The Phantom engine continuously analyzes incoming flight and seismic data, scoring each event for chaos indicators like magnitude spikes, depth clustering, trajectory deviations, and spatial anomalies. Events scoring above threshold are flagged on the globe.",
        },
        {
          label: "Chaos Score",
          value:
            "Each anomaly receives a score from 0 to 1. Scores above 0.7 are marked as important. Click individual anomaly markers on the globe for detailed breakdowns.",
        },
      ],
      analysisSummary: `Currently tracking ${counts.anomalies} anomalies across flight and seismic feeds. Toggle this layer to show or hide anomaly markers on the globe. Click individual markers for detailed analysis.`,
    });
  };

  const selectNewsIntel = (item: NewsItem) => {
    onSelectIntel({
      id: `news-${item.id}`,
      name: item.title,
      kind: "news",
      importance: item.score >= 80 ? "important" : "normal",
      quickFacts: [
        { label: "Source", value: item.source },
        { label: "Region", value: item.region },
        { label: "Published", value: new Date(item.publishedAt).toLocaleString() },
        { label: "Score", value: item.score.toFixed(1) },
      ],
      fullFacts: [
        { label: "Summary", value: item.summary },
        { label: "Tags", value: item.tags.join(", ") || "GENERAL" },
        { label: "URL", value: item.url },
      ],
      externalUrl: item.url,
      externalLabel: "Open Source",
      analysisSummary: `${item.source} reports ${item.summary || item.title} Region: ${item.region}. Key tags: ${item.tags.join(", ") || "GENERAL"}. Intel score ${item.score.toFixed(1)}.`,
    });
  };

  const saveSettings = async () => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm: {
            provider: llmProvider,
            endpoint: llmEndpoint,
            model: llmModel,
            apiKey: llmApiKey || undefined,
          },
        }),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {}
  };

  const requestAiSummary = async (intel: SelectedIntel) => {
    if (aiSummaryLoading) return;
    setAiSummaryLoading(true);
    try {
      const text = [
        intel.name,
        ...intel.quickFacts.map((f) => `${f.label}: ${f.value}`),
        ...intel.fullFacts.map((f) => `${f.label}: ${f.value}`),
      ].join("\n");
      const context = intel.kind === "info" ? "anomaly" : intel.kind;
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const data = await res.json();
      if (data.summary) {
        onSelectIntel({
          ...intel,
          analysisSummary: data.summary,
        });
      } else if (data.error) {
        onSelectIntel({
          ...intel,
          analysisSummary: `[AI Summary unavailable: ${data.error}]`,
        });
      }
    } catch (err) {
      onSelectIntel({
        ...intel,
        analysisSummary: `[AI Summary failed: ${err instanceof Error ? err.message : "network error"}]`,
      });
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const requestGdeltDigest = async () => {
    if (gdeltDigestLoading) return;
    setGdeltDigestLoading(true);
    try {
      const res = await fetch("/api/ai/gdelt-digest");
      const data = await res.json();
      if (data.summary) {
        setShowPneumaPanel(false);
        onSelectIntel({
          id: `gdelt-digest-${Date.now()}`,
          name: "GDELT Strategic Digest",
          kind: "gdelt",
          importance: "important",
          quickFacts: [
            { label: "Type", value: "AI-Generated Digest" },
            { label: "Events Analyzed", value: `${data.analyzedCount ?? "?"} of ${data.eventCount ?? "?"}` },
            { label: "Source", value: "GDELT Global Event Database" },
            { label: "Generated", value: new Date().toUTCString() },
          ],
          fullFacts: [
            { label: "What is GDELT?", value: "The Global Database of Events, Language, and Tone monitors news media worldwide, translating events into structured data with actors, locations, and sentiment scores. Goldstein scale ranges from -10 (extreme conflict) to +10 (extreme cooperation)." },
          ],
          analysisSummary: data.summary,
        });
      }
    } catch {} finally {
      setGdeltDigestLoading(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 text-[10px] text-[#b8bb26]">
      {/* Top info strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[25] hidden h-8 items-center justify-between border-b border-[#3c3836] bg-[#1d2021e6] px-4 font-mono uppercase tracking-[0.22em] text-[#928374] md:flex">
        <span>Global Situation</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setShowPneumaPanel((prev) => !prev);
              if (!showPneumaPanel) onCloseIntel();
            }}
            className={`pointer-events-auto rounded-md border px-3 py-0.5 text-[11px] font-black tracking-[0.35em] transition ${
              showPneumaPanel
                ? "border-[#fabd2f] bg-[#fabd2f]/20 text-[#fabd2f]"
                : "border-[#504945] text-[#d5c4a1] hover:border-[#fabd2f] hover:text-[#fabd2f]"
            }`}
            style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
          >
            PNEUMA
          </button>
          <span>{utcTimestamp || "SYNCING UTC"}</span>
        </div>
      </div>

      {/* Bottom info strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] hidden h-7 items-center justify-between border-t border-[#3c3836] bg-[#1d2021e6] px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-[#928374] md:flex">
        <span>Live Entities: {compact(totalLiveCount)} · Active Feeds: {activeFeedCount}/{feedTotal}</span>
        <span className="flex items-center gap-3">
          <span>Region {newsRegionFilter} · {activeRegionDigest?.posture ?? "STABLE"}{clickedCoordinates ? ` · ${clickedCoordinates.lat.toFixed(3)}, ${clickedCoordinates.lon.toFixed(3)}` : ""}</span>
          <a
            href="https://github.com/QRcode1337/argus"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto inline-flex items-center gap-1 text-[#504945] transition hover:text-[#83a598]"
            title="View on GitHub"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
        </span>
      </div>

      {/* Time range strip */}
      <div className="pointer-events-auto absolute left-4 top-10 hidden rounded-md border border-[#3c3836] bg-[#1d2021e0] p-1 md:flex">
        {(["1h", "6h", "24h", "48h", "7d", "ALL"] as TimeRange[]).map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => setTimeRange(range)}
            className={`rounded-sm px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
              timeRange === range
                ? "bg-[#b8bb26] text-[#1d2021]"
                : "text-[#928374] hover:bg-[#3c3836] hover:text-[#d5c4a1]"
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      {/* ARGUS header */}
      <header className="absolute left-3 top-[calc(var(--safe-top)+0.35rem)] font-mono md:left-6 md:top-[5.5rem]">
        <h1 className="text-[20px] font-semibold leading-none tracking-[0.34em] text-[#ebdbb2] md:text-[42px]">
          ARG<span className="text-[#83a598]">US</span>
        </h1>
        <p className="mt-1 hidden text-[10px] uppercase tracking-[0.45em] text-[#928374] md:block">Epsilon LLC</p>
      </header>

      {/* Active style display (top-right) — desktop only */}
      <div className="absolute right-8 top-10 hidden text-right font-mono uppercase tracking-[0.28em] text-[#928374] md:block">
        <div className="text-[10px] text-[#928374]">Active Style</div>
        <div className="text-[26px] text-[#83a598]">{modeLabel}</div>
      </div>

      <section className="pointer-events-auto absolute left-1/2 top-[calc(var(--safe-top)+2.9rem)] z-[28] block w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 rounded-[1.35rem] border border-[#3c3836] bg-[#1d2021eb] p-2.5 shadow-[0_0_24px_rgba(10,171,255,0.12)] backdrop-blur-xl md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[8px] uppercase tracking-[0.24em] text-[#fabd2f]">Field Summary</div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${
                  intelBriefing
                    ? `${threatLevelColors[intelBriefing.threatLevel].border} ${threatLevelColors[intelBriefing.threatLevel].text} ${threatLevelColors[intelBriefing.threatLevel].bg}`
                    : "border-[#504945] bg-[#282828] text-[#a89984]"
                }`}>
                  {intelBriefing?.threatLevel ?? "STANDBY"}
                </span>
                <span className="rounded-full border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#83a598]">
                  {newsRegionFilter}
                </span>
                <span className="rounded-full border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#7298a8]">
                  {platformMode}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileTab(mobileTab === "brief" ? null : "brief")}
              className="rounded-lg border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[#d5c4a1] transition hover:border-[#83a598]"
            >
              {mobileTab === "brief" ? "Close" : "Brief"}
            </button>
          </div>

          <p className="mt-2 line-clamp-2 font-mono text-[10px] leading-relaxed text-[#7fb4c5]">
            {intelBriefing?.summary ?? "Collecting live feeds and generating the first mobile brief..."}
          </p>

          <div className="mt-2 flex flex-wrap gap-1">
            {[
              { label: "Live", value: compact(totalLiveCount), tone: "text-[#ebdbb2]" },
              { label: "Feeds", value: `${activeFeedCount}/${feedTotal}`, tone: "text-[#83a598]" },
              { label: "Layers", value: `${activeLayerCount}/${layerDefs.length}`, tone: "text-[#fabd2f]" },
            ].map((item) => (
              <div key={item.label} className="rounded-full border border-[#3c3836] bg-[#1d2021] px-2 py-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#a89984]">{item.label}</span>
                <span className={`ml-1 font-mono text-[9px] font-semibold ${item.tone}`}>{item.value}</span>
              </div>
            ))}
            {(selectedIntel?.name ?? activePoiLabel) ? (
              <div className="max-w-[12rem] truncate rounded-full border border-[#3c3836] bg-[#1d2021] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#7298a8]">
                Target <span className="text-[#d5c4a1] normal-case tracking-normal">{selectedIntel?.name ?? activePoiLabel}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.18em] text-[#728899]">
            <span>{utcTimestamp || "Syncing UTC"}</span>
            <button
              type="button"
              onClick={() => setMobileTab("ops")}
              className="shrink-0 rounded-lg border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[#7298a8] transition hover:border-[#83a598] hover:text-[#d5c4a1]"
            >
              Ops
            </button>
          </div>
      </section>

      {/* Selected intel panel (right side) — desktop only */}
      {selectedIntel ? (
        <section className="pointer-events-auto absolute right-8 top-[5.5rem] hidden w-[348px] rounded-2xl border border-[#3c3836] bg-[#1d2021d9] p-4 shadow-[0_0_40px_rgba(131,165,152,0.2)] backdrop-blur-md md:block">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[12px] uppercase tracking-[0.3em] text-[#fabd2f]">Target Intel</div>
            <button
              type="button"
              onClick={onCloseIntel}
              className="rounded-md border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89984] hover:border-[#83a598]"
            >
              Clear
            </button>
          </div>

          <div className="mt-2 rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono">
            <div className="text-[15px] text-[#ebdbb2]">{selectedIntel.name}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#a89984]">
              {selectedIntel.kind} · {selectedIntel.importance === "important" ? "Priority Target" : "Standard Target"}
            </div>
          </div>

          <div className="mt-2 rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[11px] text-[#7fb4c5]">
            {selectedIntel.quickFacts.map((fact) => (
              <div key={`quick-${fact.label}`}>
                {fact.label}: {fact.value}
              </div>
            ))}
          </div>

          {selectedIntel.analysisSummary ? (
            <div className="mt-2 rounded-xl border border-[#5b4a1f] bg-[#2a2415] p-3 font-mono text-[11px] leading-relaxed text-[#f3d98b]">
              {selectedIntel.analysisSummary}
            </div>
          ) : null}

          {selectedIntel.importance === "important" || showFullIntel ? (
            <div className="mt-2 max-h-[180px] overflow-auto rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[11px] text-[#7fb4c5]">
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
                className="h-44 w-full rounded border border-[#504945]"
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
                className="absolute right-1.5 top-1.5 rounded border border-[#504945] bg-[#282828]/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#83a598] transition hover:border-[#83a598] hover:bg-[#282828]"
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
                className="mt-2 h-32 w-full rounded border border-[#504945] object-cover"
              />
            </>
          ) : null}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onFlyToEntity}
              className={actionButtonClass}
            >
              Fly To
            </button>
            {selectedIntel.externalUrl ? (
              <a
                href={selectedIntel.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={actionButtonClass}
              >
                {selectedIntel.externalLabel ?? "External"}
              </a>
            ) : null}
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
                    ? "border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                    : "border-[#504945] bg-[#282828] text-[#d5c4a1] hover:border-[#83a598]"
                }`}
              >
                {trackedEntityId === selectedIntel.id ? "Stop Tracking" : "Track"}
              </button>
            )}
          </div>

          {trackedEntityId === selectedIntel.id && (
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#83a598]">
              Tracking Active
            </div>
          )}

          {selectedIntel.importance !== "important" ? (
            <button
              type="button"
              onClick={onToggleFullIntel}
              className="mt-2 w-full rounded-lg border border-[#504945] bg-[#282828] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89984] hover:border-[#83a598]"
            >
              {showFullIntel ? "Hide Full Intel" : "Load Full Intel"}
            </button>
          ) : null}

          {(!selectedIntel.analysisSummary || selectedIntel.kind === "gdelt" || selectedIntel.kind === "anomaly" || selectedIntel.kind === "info") ? (
            <button
              type="button"
              onClick={() => requestAiSummary(selectedIntel)}
              disabled={aiSummaryLoading}
              className="mt-2 w-full rounded-lg border border-[#504945] bg-[#282828] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#83a598] transition hover:border-[#83a598] disabled:opacity-50"
            >
              {aiSummaryLoading ? "Generating AI Summary..." : selectedIntel.analysisSummary ? "Generate Detailed AI Summary" : "Generate AI Summary"}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Decorative side text — desktop only */}
      <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 rotate-90 font-mono text-[10px] uppercase tracking-[0.45em] text-[#2f5467] md:block">
        BAND-PAN BITS: 11 LVL: 1A
      </div>

      {/* LEFT SIDEBAR - Collapsible Accordion Panels — desktop only */}
      {sidebarVisible ? (
        <nav className="pointer-events-auto absolute left-4 top-[8.5rem] hidden max-h-[calc(100vh-11rem)] w-[260px] overflow-y-auto rounded-2xl border border-[#3c3836] bg-[#1d2021d9] shadow-[0_0_40px_rgba(131,165,152,0.2)] backdrop-blur-md md:block">
          {/* Sidebar header with hide button */}
          <div className="flex items-center justify-between border-b border-[#3c3836] px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.33em] text-[#a89984]">
              {platformMode === "analytics" ? "Analytics" : platformMode === "playback" ? "Playback" : "Live"} Panels
            </span>
            <button
              type="button"
              onClick={() => setSidebarVisible(false)}
              className="rounded border border-[#504945] bg-[#282828] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#7298a8] transition hover:border-[#83a598] hover:text-[#d5c4a1]"
            >
              Hide
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1 border-b border-[#3c3836] px-2 py-1.5">
            {workspaceDefs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkspace(tab.id)}
                className={`rounded px-1 py-1 font-mono text-[8px] uppercase tracking-[0.12em] transition ${
                  workspace === tab.id
                    ? "border border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                    : "border border-transparent text-[#a89984] hover:border-[#504945] hover:bg-[#282828]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {workspace === "news" && (
            <section className="space-y-2 border-b border-[#3c3836] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#fabd2f]">Live News</div>
                <div className="font-mono text-[8px] text-[#a89984]">
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
                        ? "border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                        : "border-[#504945] bg-[#282828] text-[#7298a8]"
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>

              <div className="rounded-md border border-[#3c3836] bg-[#1d2021] px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#a89984]">AI Summary</span>
                  <span className="font-mono text-[8px] text-[#83a598]">{activeRegionDigest?.posture ?? "STABLE"}</span>
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
                className="w-full rounded-md border border-[#504945] bg-[#282828] px-2 py-1.5 font-mono text-[10px] text-[#ebdbb2] placeholder-[#4e6a7a] focus:border-[#83a598] focus:outline-none"
              />

              <div className="flex gap-1">
                <select
                  value={newsSourceFilter}
                  onChange={(e) => setNewsSourceFilter(e.target.value)}
                  className="flex-1 rounded-md border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[9px] text-[#ebdbb2] focus:border-[#83a598] focus:outline-none"
                >
                  {newsSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setNewsSortMode((prev) => (prev === "score" ? "newest" : "score"))}
                  className="rounded-md border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#d5c4a1]"
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
                <div className="rounded-md border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 font-mono text-[9px] text-[#7faec0]">
                  Pulling feeds...
                </div>
              ) : null}

              <div className="max-h-[390px] space-y-1 overflow-y-auto pr-0.5">
                {filteredNewsItems.slice(0, 60).map((item) => (
                  <article
                    key={item.id}
                    className="rounded-md border border-[#3c3836] bg-[#1d2021] px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[8px] uppercase tracking-[0.1em] text-[#a89984]">
                        {item.source}
                      </span>
                      <span className="font-mono text-[8px] text-[#4e6a7a]">
                        {new Date(item.publishedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectNewsIntel(item)}
                      className="mt-1 block w-full text-left font-mono text-[10px] leading-snug text-[#ebdbb2] transition hover:text-[#d5c4a1]"
                    >
                      {item.title}
                    </button>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[8px] text-[#a89984]">
                        {item.tags.join(" · ")}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[8px] text-[#83a598]">{item.score.toFixed(1)}</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7298a8] hover:text-[#83a598]"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* INTEL BRIEF section */}
          {workspace === "intel" && (platformMode === "live" || platformMode === "analytics") && (
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
                      <span className="text-[9px] uppercase tracking-[0.28em] text-[#a89984]">
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
                      { sev: "CRITICAL" as const, label: "Crit", count: intelBriefing.criticalCount, color: "#fb4934" },
                      { sev: "WARNING" as const, label: "Warn", count: intelBriefing.warningCount, color: "#fabd2f" },
                      { sev: "INFO" as const, label: "Info", count: intelBriefing.infoCount, color: "#83a598" },
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

                  {/* GDELT Digest button */}
                  {counts.gdelt > 0 && (
                    <button
                      type="button"
                      onClick={requestGdeltDigest}
                      disabled={gdeltDigestLoading}
                      className="w-full rounded-lg border border-[#3498db]/40 bg-[#3498db]/10 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#3498db] transition hover:border-[#3498db] hover:bg-[#3498db]/20 disabled:opacity-50"
                    >
                      {gdeltDigestLoading ? "Generating GDELT Digest..." : `Generate GDELT Digest (${compact(counts.gdelt)} events)`}
                    </button>
                  )}

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
                            className="mb-1 rounded border border-[#504945] bg-[#282828] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#7298a8] transition hover:border-[#83a598]"
                          >
                            Clear Filter ({filtered.length})
                          </button>
                        )}
                        <div className="max-h-[400px] space-y-1 overflow-y-auto pr-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#504945]">
                          {filtered.map((alert: IntelAlert) => (
                            <button
                              key={alert.id}
                              type="button"
                              onClick={() => {
                                if (alert.category === "PHANTOM") {
                                  setShowPneumaPanel(false);
                                  onSelectIntel({
                                    id: alert.id,
                                    name: alert.title,
                                    kind: "anomaly",
                                    importance: alert.severity === "CRITICAL" ? "important" : "normal",
                                    quickFacts: [
                                      { label: "Severity", value: alert.severity },
                                      { label: "Category", value: "Chaos Anomaly" },
                                      { label: "Source", value: "Phantom Detection Engine" },
                                      ...(alert.coordinates ? [
                                        { label: "Latitude", value: alert.coordinates.lat.toFixed(4) },
                                        { label: "Longitude", value: alert.coordinates.lon.toFixed(4) },
                                      ] : []),
                                    ],
                                    fullFacts: [
                                      { label: "Detail", value: alert.detail },
                                      { label: "Detection", value: new Date(alert.timestamp).toUTCString() },
                                      { label: "What is this?", value: "Chaos Anomalies are statistically improbable patterns detected across seismic, flight, and electromagnetic feeds. The Phantom engine flags correlated outliers that deviate from baseline models — potential indicators of novel geophysical, military, or infrastructure events." },
                                    ],
                                    coordinates: alert.coordinates,
                                  });
                                  if (alert.coordinates) {
                                    onFlyToCoordinates(alert.coordinates.lat, alert.coordinates.lon);
                                  }
                                } else if (alert.entityId) {
                                  onFlyToEntityById(alert.entityId);
                                } else if (alert.coordinates) {
                                  onFlyToCoordinates(alert.coordinates.lat, alert.coordinates.lon);
                                }
                              }}
                              className={`w-full rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 text-left transition ${
                                alert.coordinates || alert.entityId
                                  ? "cursor-pointer hover:border-[#83a598] hover:bg-[#3c3836]"
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
                                  <div className="mt-0.5 font-mono text-[9px] leading-relaxed text-[#a89984]">
                                    {alert.detail}
                                  </div>
                                  {alert.coordinates && (
                                    <div className="mt-0.5 font-mono text-[8px] text-[#83a598]/60">
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
                <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2.5 py-2 font-mono text-[10px] text-[#928374]">
                  Awaiting first intelligence cycle...
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* SEARCH section */}
          {workspace === "intel" && (platformMode === "live" || platformMode === "analytics") && (
            <CollapsibleSection title="Search" badge={searchResults.length > 0 ? `${searchResults.length}` : null}>
              <div className="space-y-1.5">
                <input
                  type="text"
                  placeholder="Search entities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#504945] bg-[#282828] px-2.5 py-1.5 font-mono text-[11px] text-[#ebdbb2] placeholder-[#4e6a7a] focus:border-[#83a598] focus:outline-none"
                />
                {searchResults.length > 0 && (
                  <div className="max-h-[180px] space-y-1 overflow-y-auto">
                    {searchResults.map((result) => {
                      const kindColors: Record<string, string> = {
                        flight: "text-[#d5c4a1]",
                        military: "text-[#fabd2f]",
                        satellite: "text-[#b8bb26]",
                        earthquake: "text-[#ff6b6b]",
                      };
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            onFlyToEntityById(result.id);
                            setSearchQuery("");
                          }}
                          className="w-full rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 text-left transition hover:border-[#83a598] hover:bg-[#3c3836]"
                        >
                          <div className="truncate font-mono text-[10px] text-[#ebdbb2]">
                            {result.name}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono text-[8px] uppercase tracking-[0.14em] ${kindColors[result.kind] ?? "text-[#a89984]"}`}>
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
                  <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2.5 py-2 font-mono text-[10px] text-[#928374]">
                    No entities found
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}


          {/* INTEL FEEDS section */}
          {workspace === "feeds" && (
          <>
          <CollapsibleSection
            title="Intel Feeds"
            badge={`${compact(totalLiveCount)}`}
          >
              <div className="space-y-1">
                {layerDefs
                  .filter((layer) => layer.key !== "outages" && layer.key !== "threats" && layer.key !== "gdelt")
                  .map((layer) => {
                  const valueMap: Record<LayerKey, number> = {
                    flights: counts.flights,
                    military: counts.military,
                    satellites: counts.satellites,
                    satelliteLinks: counts.satelliteLinks,
                    seismic: counts.seismic,
                    bases: counts.bases,
                    outages: counts.outages,
                    threats: counts.threats,
                    gdelt: counts.gdelt,
                    anomalies: counts.anomalies,
                    weather: counts.weather,
                    vessels: counts.vessels,
                  };
                  const value = valueMap[layer.key];

                  return (
                    <button
                      key={layer.key}
                      type="button"
                      onClick={() => {
                        toggleLayer(layer.key);
                        if (layer.key === "anomalies") openChaosInfoPanel();
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-[#3c3836] bg-[#1d2021] px-2.5 py-1.5 text-left transition hover:border-[#2eb8d4]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] text-[#ebdbb2]">{layer.label}</div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a89984]">{layer.feed}</div>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2 text-right font-mono">
                        <span className="text-[11px] text-[#a5f0ff]">{compact(value)}</span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] ${
                            layers[layer.key]
                              ? "border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                              : "border-[#504945] bg-[#282828] text-[#a89984]"
                          }`}
                        >
                          {layers[layer.key] ? "On" : "Off"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
          </CollapsibleSection>

          {platformMode === "analytics" && (
          <CollapsibleSection
            title="Analytics Raster"
            badge="Raster"
            defaultOpen
          >
              <div className="space-y-1.5">
                {analyticsLayerDefs.map((layer) => (
                  <button
                    key={layer.key}
                    type="button"
                    onClick={() => layer.available && toggleAnalyticsLayer(layer.key)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left transition ${
                      !layer.available
                        ? "cursor-not-allowed border-[#3c3836] bg-[#1d2021] opacity-40"
                        : analyticsLayers[layer.key]
                          ? "border-[#fabd2f] bg-[#2e2a1a]"
                          : "border-[#3c3836] bg-[#1d2021] hover:border-[#2eb8d4]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[11px] text-[#ebdbb2]">{layer.label}</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a89984]">
                        {layer.source}{!layer.available ? " \u00B7 Phase 4" : ""}
                      </div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                        !layer.available
                          ? "border-[#504945] bg-[#282828] text-[#a89984]"
                          : analyticsLayers[layer.key]
                            ? "border-[#fabd2f] bg-[#2e2a1a] text-[#fabd2f]"
                            : "border-[#504945] bg-[#282828] text-[#a89984]"
                      }`}
                    >
                      {!layer.available ? "Soon" : analyticsLayers[layer.key] ? "On" : "Off"}
                    </span>
                  </button>
                ))}

                {analyticsStatus ? (
                  <div className="rounded-lg border border-[#1f3f52] bg-[#282828] px-2 py-1.5 font-mono text-[9px] text-[#7fb4c5]">
                    {analyticsStatus}
                  </div>
                ) : null}

                <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#a89984]">
                    Intel Analytics Layers
                  </div>
                  <div className="space-y-1">
                    {analyticsIntelDefs.map((layer) => {
                      const valueMap: Record<LayerKey, number> = {
                        flights: counts.flights,
                        military: counts.military,
                        satellites: counts.satellites,
                        satelliteLinks: counts.satelliteLinks,
                        seismic: counts.seismic,
                        bases: counts.bases,
                        outages: counts.outages,
                        threats: counts.threats,
                        gdelt: counts.gdelt,
                        anomalies: counts.anomalies,
                        weather: counts.weather,
                        vessels: counts.vessels,
                      };
                      const value = valueMap[layer.key];

                      return (
                        <button
                          key={`analytics-${layer.key}`}
                          type="button"
                          onClick={() => {
                            toggleLayer(layer.key);
                            if (layer.key === "anomalies") openChaosInfoPanel();
                          }}
                          className="flex w-full items-center justify-between rounded border border-[#3c3836] bg-[#282828] px-2 py-1 text-left transition hover:border-[#83a598]"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-mono text-[10px] text-[#ebdbb2]">{layer.label}</div>
                            <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#a89984]">{layer.feed}</div>
                          </div>
                          <div className="ml-2 flex items-center gap-2 font-mono text-[9px]">
                            <span className="text-[#83a598]">{compact(value)}</span>
                            <span className={layers[layer.key] ? "text-[#d5c4a1]" : "text-[#928374]"}>
                              {layers[layer.key] ? "On" : "Off"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
          </CollapsibleSection>
          )}
          {platformMode !== "analytics" ? (
            <CollapsibleSection title="Live Feeds" badge={`${LIVE_FEEDS.length}`}>
              <div className="space-y-1">
                {LIVE_FEEDS.map((feed) => (
                  <div
                    key={feed.id}
                    className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] text-[#ebdbb2]">{feed.title}</div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a89984]">
                          {feed.region} · {feed.category}
                        </div>
                      </div>
                      <span className="rounded border border-[#504945] bg-[#282828] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#83a598]">
                        Live
                      </span>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectIntel({
                            id: `live-feed-${feed.id}`,
                            name: feed.title,
                            kind: "live-feed",
                            importance: "normal",
                            quickFacts: [
                              { label: "Region", value: feed.region },
                              { label: "Category", value: feed.category },
                            ],
                            fullFacts: [
                              { label: "Stream", value: feed.streamUrl },
                              ...(feed.sourceUrl ? [{ label: "Source", value: feed.sourceUrl }] : []),
                            ],
                            streamUrl: feed.streamUrl,
                            externalUrl: feed.sourceUrl,
                            externalLabel: "Source",
                            analysisSummary: `${feed.title} is a live external stream from ${feed.region}. Use this feed for real-time visual context.`,
                            ...(feed.lat != null && feed.lon != null
                              ? { coordinates: { lat: feed.lat, lon: feed.lon } }
                              : {}),
                          });
                          if (feed.lat != null && feed.lon != null) {
                            // Ensure the globe is visible before flying to feed coordinates.
                            setSceneMode("globe_sat");
                            onFlyToCoordinates(feed.lat, feed.lon);
                          }
                        }}
                        className="rounded border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#d5c4a1] transition hover:border-[#83a598]"
                      >
                        Load Intel
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEnlargedStream({
                            src: feed.streamUrl,
                            title: feed.title,
                          })
                        }
                        className="rounded border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#83a598] transition hover:border-[#83a598]"
                      >
                        Enlarge
                      </button>
                      {feed.sourceUrl ? (
                        <a
                          href={feed.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#7298a8] transition hover:border-[#83a598]"
                        >
                          Source
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          ) : null}
          </>
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
                <div className="rounded-lg border border-[#3c3836] bg-[#282828] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#66889b]">
                  Normal mode has no active shader params.
                </div>
              )}
            </div>
          </CollapsibleSection>
          )}

          {/* STATUS section */}
          {workspace === "status" && (
          <CollapsibleSection title="Status" badge={`${activeFeedCount}/${feedTotal}`}>
            <div className="space-y-1.5">
              <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Feed Health</div>
                <div>OpenSky: {feedHealth.opensky.status} @ {fmtDate(feedHealth.opensky.lastSuccessAt)}</div>
                <div>ADS-B: {feedHealth.adsb.status} @ {fmtDate(feedHealth.adsb.lastSuccessAt)}</div>
                <div>CelesTrak: {feedHealth.celestrak.status} @ {fmtDate(feedHealth.celestrak.lastSuccessAt)}</div>
                <div>USGS: {feedHealth.usgs.status} @ {fmtDate(feedHealth.usgs.lastSuccessAt)}</div>

                <div>CF Radar: {feedHealth.cfradar.status} @ {fmtDate(feedHealth.cfradar.lastSuccessAt)}</div>
                <div>OTX: {feedHealth.otx.status} @ {fmtDate(feedHealth.otx.lastSuccessAt)}</div>
                <div>FRED: {feedHealth.fred.status} @ {fmtDate(feedHealth.fred.lastSuccessAt)}</div>
                <div>AISStream: {feedHealth.ais.status} @ {fmtDate(feedHealth.ais.lastSuccessAt)}</div>
              </div>

              <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 font-mono text-[10px] text-[#7fb4c5]">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Camera</div>
                <div>REC 2026-02-12 {fmtDate(recTimestamp || null)}</div>
                <div>ALT {camera.altMeters.toFixed(0)}m</div>
                <div>{camera.lat.toFixed(4)}N {camera.lon.toFixed(4)}E</div>
              </div>
            </div>
          </CollapsibleSection>
          )}

          {workspace === "settings" && (
          <CollapsibleSection title="LLM Configuration" defaultOpen={true}>
            <div className="space-y-2">
              <label className="block">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Provider</span>
                <select
                  className={`${controlInputClass} mt-1`}
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value as "ollama" | "openai_compatible")}
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai_compatible">OpenAI-Compatible</option>
                </select>
              </label>
              <label className="block">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Endpoint URL</span>
                <input
                  type="text"
                  className={`${controlInputClass} mt-1`}
                  value={llmEndpoint}
                  onChange={(e) => setLlmEndpoint(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Model</span>
                <input
                  type="text"
                  className={`${controlInputClass} mt-1`}
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="llama3"
                />
              </label>
              {llmProvider === "openai_compatible" && (
                <label className="block">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">API Key (optional)</span>
                  <input
                    type="password"
                    className={`${controlInputClass} mt-1`}
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </label>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveSettings}
                  className={actionButtonClass}
                >
                  {settingsSaved ? "Saved!" : "Save Settings"}
                </button>
              </div>
              <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 font-mono text-[9px] text-[#928374]">
                Configure a local LLM (Ollama, LM Studio, etc.) to enable AI-powered intel summaries. Your keys stay on your server.
              </div>
            </div>
          </CollapsibleSection>
          )}
        </nav>
      ) : (
        <button
          type="button"
          onClick={() => setSidebarVisible(true)}
          className="pointer-events-auto absolute left-4 top-24 hidden rounded-lg border border-[#3c3836] bg-[#1d2021d9] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#a89984] shadow-[0_0_40px_rgba(131,165,152,0.2)] backdrop-blur-md transition hover:border-[#83a598] hover:text-[#d5c4a1] md:block"
        >
          Panels
        </button>
      )}

      {/* Bottom control bar — desktop only */}
      <section className="pointer-events-auto absolute bottom-4 left-1/2 hidden w-[min(95vw,900px)] -translate-x-1/2 rounded-2xl border border-[#3c3836] bg-[#1d2021d9] p-3 shadow-[0_0_30px_rgba(10,171,255,0.18)] backdrop-blur-md md:block">
        <div className="grid gap-2 md:grid-cols-5">
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
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

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
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

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
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

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
            View
            <select
              className={`${controlInputClass} mt-1`}
              value={sceneMode}
              onChange={(event) => setSceneMode(event.target.value as SceneMode)}
            >
              {sceneModeDefs.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
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
        <div className="my-1 h-px w-6 bg-[#504945]" />
        <button type="button" onClick={onTiltUp} className={camBtnClass} title="Tilt Up">&uarr;</button>
        <div className="flex gap-1">
          <button type="button" onClick={onRotateLeft} className={camBtnClass} title="Rotate Left">&larr;</button>
          <button type="button" onClick={onRotateRight} className={camBtnClass} title="Rotate Right">&rarr;</button>
        </div>
        <button type="button" onClick={onTiltDown} className={camBtnClass} title="Tilt Down">&darr;</button>
      </div>

      {/* ═══ MOBILE TAB BAR + SHEETS ═══ */}
      <div className="md:hidden">
        <>
          {mobileTab && (
            <div className="pointer-events-auto fixed bottom-[calc(var(--safe-bottom)+4.15rem)] left-1/2 z-50 max-h-[56vh] w-[calc(100%-1rem)] max-w-md -translate-x-1/2 overflow-y-auto rounded-[1.35rem] border border-[#3c3836] bg-[#1d2021f2] shadow-[0_-18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#3c3836] bg-[#1d2021f2] px-4 py-2.5 backdrop-blur-xl">
                <span className="font-mono text-[10px] uppercase tracking-[0.33em] text-[#fabd2f]">
                  {mobileTab === "brief" ? "Mission Brief" : mobileTab === "news" ? "News Feed" : "Operations"}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileTab(null)}
                  className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[9px] text-[#7298a8]"
                >
                  Close
                </button>
              </div>

              <div className="p-3">
                {mobileTab === "brief" && (
                  <div className="space-y-3">
                    {intelBriefing ? (
                      <div className={`rounded-xl border px-3 py-2.5 font-mono ${threatLevelColors[intelBriefing.threatLevel].border} ${threatLevelColors[intelBriefing.threatLevel].bg}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] uppercase tracking-[0.28em] text-[#a89984]">Threat Level</span>
                          <span className={`text-[14px] font-bold tracking-[0.18em] ${threatLevelColors[intelBriefing.threatLevel].text}`}>{intelBriefing.threatLevel}</span>
                        </div>
                        <div className="mt-1.5 text-[10px] leading-relaxed text-[#7fb4c5]">{intelBriefing.summary}</div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {([
                            { sev: "CRITICAL" as const, label: "Crit", count: intelBriefing.criticalCount, color: "#fb4934" },
                            { sev: "WARNING" as const, label: "Warn", count: intelBriefing.warningCount, color: "#fabd2f" },
                            { sev: "INFO" as const, label: "Info", count: intelBriefing.infoCount, color: "#83a598" },
                          ] as const).map(({ sev, label, count, color }) => (
                            <button
                              key={sev}
                              type="button"
                              onClick={() => setAlertFilter((prev) => (prev === sev ? null : sev))}
                              className="rounded-lg border px-2 py-1.5 text-center transition"
                              style={{
                                borderColor: alertFilter === sev ? color : `${color}4d`,
                                backgroundColor: alertFilter === sev ? `${color}33` : `${color}12`,
                              }}
                            >
                              <div className="font-mono text-[12px] font-bold" style={{ color }}>{count}</div>
                              <div className="font-mono text-[8px] uppercase tracking-[0.16em]" style={{ color: `${color}b3` }}>{label}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5 font-mono text-[10px] text-[#928374]">
                        Awaiting first intelligence cycle...
                      </div>
                    )}

                    {selectedIntel ? (
                      <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#a89984]">Selected Target</div>
                            <div className="truncate font-mono text-[12px] text-[#ebdbb2]">{selectedIntel.name}</div>
                            <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#83a598]">
                              {selectedIntel.kind} · {selectedIntel.importance === "important" ? "Priority" : "Standard"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={onCloseIntel}
                            className="shrink-0 rounded border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#7298a8]"
                          >
                            Clear
                          </button>
                        </div>

                        <div className="mt-2 space-y-0.5 font-mono text-[9px] text-[#7fb4c5]">
                          {selectedIntel.quickFacts.slice(0, 3).map((fact) => (
                            <div key={`mobile-${fact.label}`}>{fact.label}: {fact.value}</div>
                          ))}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onFlyToEntity();
                              setMobileTab(null);
                            }}
                            className={actionButtonClass}
                          >
                            Fly To
                          </button>
                          {(selectedIntel.kind === "flight" || selectedIntel.kind === "military" || selectedIntel.kind === "satellite") ? (
                            <button
                              type="button"
                              onClick={() => onTrackEntity(trackedEntityId === selectedIntel.id ? null : selectedIntel.id)}
                              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                                trackedEntityId === selectedIntel.id
                                  ? "border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                                  : "border-[#504945] bg-[#282828] text-[#d5c4a1] hover:border-[#83a598]"
                              }`}
                            >
                              {trackedEntityId === selectedIntel.id ? "Tracking" : "Track"}
                            </button>
                          ) : (
                            <button type="button" onClick={() => setMobileTab("ops")} className={actionButtonClass}>Quick Ops</button>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5">
                      <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#a89984]">Quick Search</div>
                      <input
                        type="text"
                        placeholder="Find entity or callsign..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-[#504945] bg-[#282828] px-2.5 py-2 font-mono text-[11px] text-[#ebdbb2] placeholder-[#4e6a7a] focus:border-[#83a598] focus:outline-none"
                      />
                      {searchResults.length > 0 && (
                        <div className="mt-2 max-h-[180px] space-y-1 overflow-y-auto">
                          {searchResults.map((result) => {
                            const kindColors: Record<string, string> = {
                              flight: "text-[#d5c4a1]",
                              military: "text-[#fabd2f]",
                              satellite: "text-[#b8bb26]",
                              earthquake: "text-[#ff6b6b]",
                            };

                            return (
                              <button
                                key={result.id}
                                type="button"
                                onClick={() => {
                                  onFlyToEntityById(result.id);
                                  setSearchQuery("");
                                  setMobileTab(null);
                                }}
                                className="w-full rounded-lg border border-[#3c3836] bg-[#282828] px-2.5 py-2 text-left transition hover:border-[#83a598] hover:bg-[#3c3836]"
                              >
                                <div className="truncate font-mono text-[10px] text-[#ebdbb2]">{result.name}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em]">
                                  <span className={kindColors[result.kind] ?? "text-[#a89984]"}>{result.kind}</span>
                                  {result.lat !== null && result.lon !== null ? (
                                    <span className="text-[#4e6a7a]">{result.lat.toFixed(1)}N {result.lon.toFixed(1)}E</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {searchQuery.trim() && searchResults.length === 0 ? (
                        <div className="mt-2 rounded-lg border border-[#3c3836] bg-[#282828] px-2.5 py-2 font-mono text-[10px] text-[#928374]">
                          No entities found.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#a89984]">Priority Alerts</div>
                        {alertFilter ? (
                          <button
                            type="button"
                            onClick={() => setAlertFilter(null)}
                            className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#7298a8]"
                          >
                            Clear Filter
                          </button>
                        ) : null}
                      </div>

                      {mobileAlertPreview.length > 0 ? (
                        <div className="space-y-1.5">
                          {mobileAlertPreview.map((alert: IntelAlert) => (
                            <button
                              key={alert.id}
                              type="button"
                              onClick={() => {
                                if (alert.entityId) {
                                  onFlyToEntityById(alert.entityId);
                                } else if (alert.coordinates) {
                                  onFlyToCoordinates(alert.coordinates.lat, alert.coordinates.lon);
                                }
                                setMobileTab(null);
                              }}
                              className="w-full rounded-lg border border-[#3c3836] bg-[#282828] px-2.5 py-2 text-left transition hover:border-[#83a598] hover:bg-[#3c3836]"
                            >
                              <div className="flex items-start gap-2">
                                <span className={`mt-px text-[10px] ${severityColors[alert.severity]}`}>{severityIcons[alert.severity]}</span>
                                <div className="min-w-0 flex-1">
                                  <div className={`font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${severityColors[alert.severity]}`}>{alert.title}</div>
                                  <div className="mt-0.5 font-mono text-[9px] leading-relaxed text-[#a89984]">{alert.detail}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                          {mobileAlerts.length > mobileAlertPreview.length ? (
                            <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#7298a8]">
                              +{mobileAlerts.length - mobileAlertPreview.length} additional alerts queued
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-[#3c3836] bg-[#282828] px-2.5 py-2 font-mono text-[10px] text-[#928374]">
                          No active alerts in the current filter.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {mobileTab === "news" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#fabd2f]">Regional Digest</div>
                        <button
                          type="button"
                          onClick={() => setNewsSortMode((prev) => (prev === "score" ? "newest" : "score"))}
                          className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#d5c4a1]"
                        >
                          {newsSortMode === "score" ? "Intel" : "Newest"}
                        </button>
                      </div>

                      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                        {COMMAND_REGIONS.map((region) => (
                          <button
                            key={region}
                            type="button"
                            onClick={() => setNewsRegionFilter(region)}
                            className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] ${
                              newsRegionFilter === region
                                ? "border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                                : "border-[#504945] bg-[#282828] text-[#7298a8]"
                            }`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>

                      <div className="mt-2 rounded-lg border border-[#3c3836] bg-[#282828] px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#a89984]">{activeRegionDigest?.posture ?? "STABLE"}</span>
                          <span className="font-mono text-[8px] text-[#83a598]">{newsMeta ? `${newsMeta.dedupedCount} items` : "--"}</span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#7fb4c5]">
                          {activeRegionDigest?.summary ?? "Collecting source headlines for this region..."}
                        </p>
                      </div>

                      <input
                        type="text"
                        placeholder="Search headlines..."
                        value={newsSearch}
                        onChange={(e) => setNewsSearch(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-[#504945] bg-[#282828] px-2.5 py-2 font-mono text-[11px] text-[#ebdbb2] placeholder-[#4e6a7a] focus:border-[#83a598] focus:outline-none"
                      />
                    </div>

                    {newsError ? (
                      <div className="rounded-xl border border-[#712d2d] bg-[#2a1010] px-3 py-2.5 font-mono text-[10px] text-[#ff9191]">
                        {newsError}
                      </div>
                    ) : null}

                    {newsLoading && mobileHeadlinePreview.length === 0 ? (
                      <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5 font-mono text-[10px] text-[#7faec0]">
                        Pulling feeds...
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      {mobileHeadlinePreview.map((item) => (
                        <article key={item.id} className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-[#a89984]">{item.source}</span>
                            <span className="font-mono text-[8px] text-[#4e6a7a]">{new Date(item.publishedAt).toLocaleTimeString()}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              selectNewsIntel(item);
                              setMobileTab(null);
                            }}
                            className="mt-1 block w-full text-left font-mono text-[11px] leading-snug text-[#ebdbb2] hover:text-[#d5c4a1]"
                          >
                            {item.title}
                          </button>
                          <p className="mt-1 line-clamp-2 font-mono text-[9px] leading-relaxed text-[#7fb4c5]">{item.summary}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[8px] text-[#a89984]">{item.tags.join(" · ")}</span>
                            <span className="font-mono text-[8px] text-[#83a598]">{item.score.toFixed(1)}</span>
                          </div>
                        </article>
                      ))}

                      {!newsLoading && mobileHeadlinePreview.length === 0 ? (
                        <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-3 py-2.5 font-mono text-[10px] text-[#928374]">
                          No headlines matched the current filter.
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {mobileTab === "ops" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-2 py-2 text-center">
                        <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#a89984]">Platform</div>
                        <div className="mt-1 font-mono text-[11px] text-[#83a598]">{platformMode}</div>
                      </div>
                      <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-2 py-2 text-center">
                        <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#a89984]">View</div>
                        <div className="mt-1 font-mono text-[11px] text-[#ebdbb2]">{activeViewLabel}</div>
                      </div>
                      <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] px-2 py-2 text-center">
                        <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#a89984]">Feeds</div>
                        <div className="mt-1 font-mono text-[11px] text-[#fabd2f]">{activeFeedCount}/{feedTotal}</div>
                      </div>
                    </div>

                    <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
                      Location
                      <select
                        className={`${controlInputClass} mt-1`}
                        value={activePoiId ?? ""}
                        onChange={(event) => {
                          const nextPoi = event.target.value || null;
                          setActivePoiId(nextPoi);
                          if (nextPoi) {
                            onFlyToPoi(nextPoi);
                            setMobileTab(null);
                          }
                        }}
                      >
                        <option value="">Select location</option>
                        {CAMERA_PRESETS.map((poi) => (
                          <option key={poi.id} value={poi.id}>{poi.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
                        Platform
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

                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
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

                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
                        View
                        <select
                          className={`${controlInputClass} mt-1`}
                          value={sceneMode}
                          onChange={(event) => setSceneMode(event.target.value as SceneMode)}
                        >
                          {sceneModeDefs.map((mode) => (
                            <option key={mode.key} value={mode.key}>{mode.label}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#928374]">
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

                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { onResetCamera(); setMobileTab(null); }} className={actionButtonClass}>Reset View</button>
                      <button type="button" onClick={onToggleCollision} className={actionButtonClass}>Terrain {collisionEnabled ? "On" : "Off"}</button>
                    </div>

                    <CollapsibleSection title="Manual Camera" badge={sceneMode.toUpperCase()}>
                      <div className="flex flex-col items-center gap-1 pt-1">
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
                    </CollapsibleSection>

                    <CollapsibleSection title="Layers" badge={`${activeLayerCount}/${layerDefs.length}`}>
                      <div className="space-y-1.5">
                        {layerDefs.map((layer) => (
                          <button
                            key={layer.key}
                            type="button"
                            onClick={() => {
                              toggleLayer(layer.key);
                              if (layer.key === "anomalies") openChaosInfoPanel();
                            }}
                            className="flex w-full items-center justify-between rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5 text-left"
                          >
                            <span className="font-mono text-[10px] text-[#ebdbb2]">{layer.label}</span>
                            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                              layers[layer.key]
                                ? "border-[#83a598] bg-[#504945] text-[#d5c4a1]"
                                : "border-[#504945] bg-[#282828] text-[#a89984]"
                            }`}>
                              {layers[layer.key] ? "On" : "Off"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="System" badge={`${activeFeedCount}/${feedTotal}`}>
                      <div className="space-y-2 font-mono text-[10px] text-[#7fb4c5]">
                        <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5">
                          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Camera</div>
                          <div>ALT {camera.altMeters.toFixed(0)}m</div>
                          <div>{camera.lat.toFixed(4)}N {camera.lon.toFixed(4)}E</div>
                        </div>
                        <div className="rounded-lg border border-[#3c3836] bg-[#1d2021] px-2 py-1.5">
                          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a89984]">Feed Health</div>
                          <div>OpenSky: {feedHealth.opensky.status} @ {fmtDate(feedHealth.opensky.lastSuccessAt)}</div>
                          <div>ADS-B: {feedHealth.adsb.status} @ {fmtDate(feedHealth.adsb.lastSuccessAt)}</div>
                          <div>CelesTrak: {feedHealth.celestrak.status} @ {fmtDate(feedHealth.celestrak.lastSuccessAt)}</div>
                          <div>USGS: {feedHealth.usgs.status} @ {fmtDate(feedHealth.usgs.lastSuccessAt)}</div>
                          <div>CF Radar: {feedHealth.cfradar.status} @ {fmtDate(feedHealth.cfradar.lastSuccessAt)}</div>
                          <div>OTX: {feedHealth.otx.status} @ {fmtDate(feedHealth.otx.lastSuccessAt)}</div>
                          <div>FRED: {feedHealth.fred.status} @ {fmtDate(feedHealth.fred.lastSuccessAt)}</div>
                          <div>AISStream: {feedHealth.ais.status} @ {fmtDate(feedHealth.ais.lastSuccessAt)}</div>
                        </div>
                      </div>
                    </CollapsibleSection>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pointer-events-auto fixed bottom-[calc(var(--safe-bottom)+0.5rem)] left-1/2 z-50 w-[calc(100%-1rem)] max-w-[19.5rem] -translate-x-1/2 rounded-[1.25rem] border border-[#3c3836] bg-[#1d2021f2] p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <div className="flex items-center gap-1.5">
              {mobileTabDefs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMobileTab(mobileTab === tab.id ? null : tab.id)}
                  className={`flex h-10 flex-1 items-center justify-center gap-1 rounded-xl border px-2 font-mono text-[8px] uppercase tracking-[0.14em] transition ${
                    mobileTab === tab.id
                      ? "border-[#83a598] bg-[#2d3432] text-[#d5c4a1]"
                      : "border-[#3c3836] bg-[#1d2021] text-[#4e6a7a]"
                  }`}
                >
                  <span className="text-[13px]">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      </div>

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
        <div className="pointer-events-auto absolute bottom-[calc(var(--safe-bottom)+5rem)] left-1/2 flex w-[calc(100%-1rem)] max-w-sm -translate-x-1/2 items-center gap-2 rounded border border-cyan-800/50 bg-black/80 px-3 py-2 font-mono text-xs text-cyan-400 backdrop-blur-sm md:bottom-20 md:w-auto md:max-w-none md:gap-3 md:px-4">
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

          <div className="flex flex-col gap-1">
            <input
              type="range"
              min={playbackTimeRange.start}
              max={playbackTimeRange.end}
              value={playbackCurrentTime}
              onChange={(e) => onSeek?.(Number(e.target.value))}
              className="h-1.5 w-48 cursor-pointer appearance-none rounded-full bg-cyan-900/40 accent-cyan-400 outline-none"
              title="Time Track"
            />
            <input
              type="range"
              min={playbackTimeRange.start}
              max={playbackTimeRange.end}
              value={playbackCurrentTime}
              readOnly
              className="h-0.5 w-48 cursor-default appearance-none rounded-full bg-blue-900/40 accent-blue-500 outline-none opacity-80"
              title="Intelligence Density Track"
            />
          </div>

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

      {/* PNEUMA Full Panel — replaces Target Intel on the right side */}
      {showPneumaPanel && !selectedIntel ? (
        <section className="pointer-events-auto absolute right-8 top-[5.5rem] hidden w-[348px] rounded-2xl border border-[#3c3836] bg-[#1d2021d9] p-4 shadow-[0_0_40px_rgba(250,189,47,0.15)] backdrop-blur-md md:block">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[12px] font-black uppercase tracking-[0.3em] text-[#fabd2f]">PNEUMA</div>
            <button
              type="button"
              onClick={() => setShowPneumaPanel(false)}
              className="rounded-md border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#a89984] hover:border-[#fabd2f]"
            >
              Close
            </button>
          </div>

          <div className="mt-2 rounded-xl border border-[#5b4a1f] bg-[#2a2415] p-3 font-mono text-[10px] leading-relaxed text-[#f3d98b]">
            PNEUMA is the cognitive awareness subsystem powering Argus&apos;s autonomous intelligence loop. It monitors the system&apos;s own reasoning state in real-time.
          </div>

          <PneumaHud threatLevel={intelBriefing?.threatLevel ?? "GREEN"} inline />

          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[10px] text-[#7fb4c5]">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#fabd2f]">PHI — Consciousness Index</div>
              Integrated Information Theory metric (0.0–1.0). Measures the degree of unified awareness across all active intelligence feeds. Higher values indicate richer cross-feed pattern recognition.
            </div>
            <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[10px] text-[#7fb4c5]">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#fabd2f]">MOOD — Cognitive Regime</div>
              Current reasoning posture: EXPLORATORY (broad scanning), ANALYTICAL (focused correlation), EMPATHETIC (human-impact priority), or CREATIVE (novel pattern synthesis).
            </div>
            <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[10px] text-[#7fb4c5]">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[#fabd2f]">MEM / CYCLES / PIPELINE</div>
              MEM: active memory graph nodes. CYCLES: completed reasoning iterations. PIPELINE: end-to-end processing latency per intelligence cycle.
            </div>

            <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[10px] text-[#7fb4c5]">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#fabd2f]">COGNITIVE LENS</div>
              <div className="flex gap-2">
                {(["tactical", "strategic", "anomaly"] as const).map((lens) => (
                  <button
                    key={lens}
                    type="button"
                    onClick={() => setCognitiveLens(lens)}
                    className={`rounded px-2 py-1 text-[9px] uppercase tracking-[0.14em] transition ${
                      cognitiveLens === lens
                        ? "bg-[#fabd2f]/20 border border-[#fabd2f] text-[#fabd2f]"
                        : "bg-[#282828] border border-[#504945] text-[#a89984] hover:border-[#fabd2f]"
                    }`}
                  >
                    {lens}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#3c3836] bg-[#1d2021] p-3 font-mono text-[10px] text-[#7fb4c5]">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#fabd2f]">ACTIVE HYPOTHESES</div>
              <div className="space-y-2">
                {hypotheses.map(hyp => (
                  <div key={hyp.id} className="rounded border border-[#504945] bg-[#282828] p-2 flex flex-col gap-1">
                    <div className="text-[#ebdbb2] leading-relaxed">{hyp.text}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#a89984] text-[8px] uppercase tracking-[0.1em]">Score: {hyp.score}</span>
                      <div className="flex gap-1">
                        <button onClick={() => setHypotheses(hs => hs.map(h => h.id === hyp.id ? { ...h, score: h.score + 1 } : h))} className="hover:text-[#b8bb26] transition text-[#a89984]">▲</button>
                        <button onClick={() => setHypotheses(hs => hs.map(h => h.id === hyp.id ? { ...h, score: h.score - 1 } : h))} className="hover:text-[#fb4934] transition text-[#a89984]">▼</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
