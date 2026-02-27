"use client";

import { CAMERA_PRESETS } from "@/lib/config";
import { useArgusStore } from "@/store/useArgusStore";
import type { LayerKey, SelectedIntel, VisualMode } from "@/types/intel";

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
};

type SliderDef = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

const layerDefs: { key: LayerKey; label: string; feed: string }[] = [
  { key: "flights", label: "Live Flights", feed: "OpenSky" },
  { key: "military", label: "Military Flights", feed: "ADS-B" },
  { key: "seismic", label: "Earthquakes (24h)", feed: "USGS" },
  { key: "satellites", label: "Satellites", feed: "CelesTrak" },
  { key: "cctv", label: "CCTV Mesh", feed: "TFL JamCam" },
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

const controlInputClass =
  "w-full rounded-lg border border-[#284f63] bg-[#081322] px-3 py-2 font-mono text-[12px] text-[#d5f7ff] focus:border-[#2ad4ff] focus:outline-none";

const actionButtonClass =
  "rounded-lg border border-[#284f63] bg-[#081322] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#9ceaff] transition hover:border-[#2ad4ff]";

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
  } = useArgusStore();

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
  const recTimestamp = Math.max(
    feedHealth.opensky.lastSuccessAt ?? 0,
    feedHealth.adsb.lastSuccessAt ?? 0,
    feedHealth.celestrak.lastSuccessAt ?? 0,
    feedHealth.usgs.lastSuccessAt ?? 0,
    feedHealth.tfl.lastSuccessAt ?? 0,
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

  return (
    <div className="pointer-events-none absolute inset-0 z-20 text-[12px] text-[#99ffca]">
      <header className="absolute left-6 top-4 font-mono">
        <h1 className="text-[50px] font-semibold leading-none tracking-[0.34em] text-[#e8fcff]">
          WORLD<span className="text-[#2ad4ff]">VIEW</span>
        </h1>
        <p className="mt-1 text-[10px] uppercase tracking-[0.45em] text-[#4e9ca8]">No Place Left Behind</p>
      </header>

      <div className="absolute right-8 top-7 text-right font-mono uppercase tracking-[0.28em] text-[#4e9ca8]">
        <div className="text-[10px] text-[#6b8d97]">Active Style</div>
        <div className="text-[26px] text-[#2ad4ff]">{modeLabel}</div>
      </div>

      {selectedIntel ? (
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

          {selectedIntel.imageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedIntel.imageUrl}
                alt={selectedIntel.name}
                className="mt-2 h-32 w-full rounded border border-[#284f63] object-cover"
              />
            </>
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

      <div className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 font-mono text-[10px] uppercase tracking-[0.45em] text-[#2f5467]">
        BAND-PAN BITS: 11 LVL: 1A
      </div>

      <section className="pointer-events-auto absolute bottom-44 left-6 w-[370px] rounded-2xl border border-[#113446] bg-[#050b17d9] p-4 shadow-[0_0_40px_rgba(10,145,223,0.24)] backdrop-blur-md max-[1140px]:left-4">
        {platformMode === "analytics" ? (
          <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.33em] text-[#e3ad50]">Analytics // Raster Layers</div>
        ) : (
          <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.33em] text-[#e3ad50]">Top Secret // SI-TK // NOFORN</div>
        )}
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#6f8897]">11-4166 OPS-4117</div>

        {platformMode === "analytics" ? (
          <div className="space-y-2">
            {analyticsLayerDefs.map((layer) => (
              <button
                key={layer.key}
                type="button"
                onClick={() => layer.available && toggleAnalyticsLayer(layer.key)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                  !layer.available
                    ? "cursor-not-allowed border-[#1a2a35] bg-[#030a10] opacity-40"
                    : analyticsLayers[layer.key]
                      ? "border-[#e3ad50] bg-[#1a0f00] hover:border-[#e3ad50]"
                      : "border-[#123244] bg-[#040b17] hover:border-[#2eb8d4]"
                }`}
              >
                <div>
                  <div className="font-mono text-[20px] leading-none text-[#d5f7ff]">{layer.label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6c8ea2]">
                    {layer.source}
                    {!layer.available ? " · Phase 4" : ""}
                  </div>
                </div>
                <span
                  className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${
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
              <div className="rounded-lg border border-[#1f3f52] bg-[#071020] px-3 py-2 font-mono text-[10px] text-[#7fb4c5]">
                {analyticsStatus}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {layerDefs.map((layer) => {
              const value =
                layer.key === "flights"
                  ? counts.flights
                  : layer.key === "military"
                    ? counts.military
                    : layer.key === "satellites"
                      ? counts.satellites
                      : layer.key === "seismic"
                        ? counts.seismic
                        : counts.cctv;

              return (
                <button
                  key={layer.key}
                  type="button"
                  onClick={() => toggleLayer(layer.key)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#123244] bg-[#040b17] px-3 py-2 text-left transition hover:border-[#2eb8d4]"
                >
                  <div>
                    <div className="font-mono text-[20px] leading-none text-[#d5f7ff]">{layer.label}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6c8ea2]">{layer.feed}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-[16px] text-[#a5f0ff]">{compact(value)}</div>
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${
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
          </div>
        )}
      </section>

      <section className="pointer-events-auto absolute bottom-44 left-[26rem] w-[348px] rounded-2xl border border-[#113446] bg-[#050b17d9] p-4 shadow-[0_0_40px_rgba(10,145,223,0.24)] backdrop-blur-md max-[1140px]:hidden">
        <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.3em] text-[#e3ad50]">Signal Controls</div>

        <SliderControl
          label="Master Blend"
          value={visualIntensity}
          onChange={(value) => setVisualIntensity(value)}
        />

        <div className="mt-2 grid grid-cols-1 gap-1.5">
          {modeSliders.length > 0 ? (
            modeSliders.map((slider) => <SliderControl key={slider.label} {...slider} />)
          ) : (
            <div className="rounded-lg border border-[#17374c] bg-[#071020] px-2 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#66889b]">
              Normal mode has no active shader params.
            </div>
          )}
        </div>

        <div className="mt-2 rounded-xl border border-[#123244] bg-[#040b17] p-3 font-mono text-[11px] text-[#7fb4c5]">
          <div>OpenSky: {feedHealth.opensky.status} @ {fmtDate(feedHealth.opensky.lastSuccessAt)}</div>
          <div>ADS-B: {feedHealth.adsb.status} @ {fmtDate(feedHealth.adsb.lastSuccessAt)}</div>
          <div>CelesTrak: {feedHealth.celestrak.status} @ {fmtDate(feedHealth.celestrak.lastSuccessAt)}</div>
          <div>USGS: {feedHealth.usgs.status} @ {fmtDate(feedHealth.usgs.lastSuccessAt)}</div>
          <div>TFL: {feedHealth.tfl.status} @ {fmtDate(feedHealth.tfl.lastSuccessAt)}</div>
        </div>

        <div className="mt-2 rounded-xl border border-[#123244] bg-[#040b17] p-3 font-mono text-[11px] text-[#7fb4c5]">
          <div>REC 2026-02-12 {fmtDate(recTimestamp || null)}</div>
          <div>ALT {camera.altMeters.toFixed(0)}m</div>
          <div>{camera.lat.toFixed(4)}N {camera.lon.toFixed(4)}E</div>
        </div>
      </section>

      <section className="pointer-events-auto absolute bottom-4 left-1/2 w-[min(95vw,760px)] -translate-x-1/2 rounded-2xl border border-[#113446] bg-[#050b17d9] p-3 shadow-[0_0_30px_rgba(10,171,255,0.18)] backdrop-blur-md">
        <div className="grid gap-2 md:grid-cols-3">
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
            Platform
            <select
              className={`${controlInputClass} mt-1`}
              value={platformMode}
              onChange={(event) => setPlatformMode(event.target.value as "live" | "analytics")}
            >
              <option value="live">Live</option>
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
    </div>
  );
}
