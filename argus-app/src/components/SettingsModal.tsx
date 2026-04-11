"use client";

import { useState, useEffect } from "react";

type SettingsTab = "overview" | "feeds" | "ai" | "keys" | "about";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  // LLM config props
  llmProvider: string;
  setLlmProvider: (v: "ollama" | "openai_compatible") => void;
  llmEndpoint: string;
  setLlmEndpoint: (v: string) => void;
  llmModel: string;
  setLlmModel: (v: string) => void;
  llmApiKey: string;
  setLlmApiKey: (v: string) => void;
  saveSettings: () => void;
  settingsSaved: boolean;
}

const TAB_DEFS: { id: SettingsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "feeds", label: "Data Feeds" },
  { id: "ai", label: "AI / LLM" },
  { id: "keys", label: "API Keys" },
  { id: "about", label: "About" },
];

const inputClass =
  "w-full rounded-lg border border-[#504945] bg-[#282828] px-2.5 py-1.5 font-mono text-[11px] text-[#ebdbb2] placeholder-[#4e6a7a] focus:border-[#83a598] focus:outline-none";

export function SettingsModal({
  open,
  onClose,
  llmProvider,
  setLlmProvider,
  llmEndpoint,
  setLlmEndpoint,
  llmModel,
  setLlmModel,
  llmApiKey,
  setLlmApiKey,
  saveSettings,
  settingsSaved,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>("overview");

  useEffect(() => {
    if (open) setTab("overview");
  }, [open]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="relative flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#3c3836] bg-[#1d2021ee] shadow-[0_0_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3c3836] px-5 py-3">
          <div className="font-mono text-[12px] uppercase tracking-[0.3em] text-[#fabd2f]">
            Argus Configuration
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#504945] bg-[#282828] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#a89984] transition hover:border-[#83a598]"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#3c3836] px-5 py-2">
          {TAB_DEFS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                tab === t.id
                  ? "bg-[#504945] text-[#ebdbb2]"
                  : "text-[#a89984] hover:bg-[#282828] hover:text-[#d5c4a1]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "overview" && (
            <div className="space-y-4 font-mono text-[12px] leading-relaxed text-[#d5c4a1]">
              <h2 className="text-[14px] font-bold text-[#fabd2f]">Welcome to Argus</h2>
              <p>
                Argus is a real-time global intelligence dashboard that fuses multiple open-source data feeds
                onto a 3D globe. It provides situational awareness across military, maritime, geopolitical,
                seismic, cyber, and economic domains.
              </p>

              <h3 className="text-[13px] font-bold text-[#83a598]">Platform Modes</h3>
              <div className="space-y-2">
                <div className="rounded-lg border border-[#3c3836] bg-[#282828] p-3">
                  <div className="font-bold text-[#ebdbb2]">Live</div>
                  <div className="text-[11px] text-[#a89984]">Real-time monitoring of all feeds. Aircraft, vessels, satellites, and events update continuously.</div>
                </div>
                <div className="rounded-lg border border-[#3c3836] bg-[#282828] p-3">
                  <div className="font-bold text-[#ebdbb2]">Op Epic Fury</div>
                  <div className="text-[11px] text-[#a89984]">Focused CENTCOM AOR intelligence. Filters all feeds to Iran/Israel/GCC theater with regional OSINT, social SIGINT, and threat correlation.</div>
                </div>
                <div className="rounded-lg border border-[#3c3836] bg-[#282828] p-3">
                  <div className="font-bold text-[#ebdbb2]">Analytics</div>
                  <div className="text-[11px] text-[#a89984]">GFS weather overlays and satellite imagery analysis layers.</div>
                </div>
              </div>

              <h3 className="text-[13px] font-bold text-[#83a598]">Workspace Tabs</h3>
              <p className="text-[11px] text-[#a89984]">
                <strong className="text-[#ebdbb2]">Intel</strong> — Threat briefs, alerts, entity search.{" "}
                <strong className="text-[#ebdbb2]">News</strong> — Regional RSS with AI summaries.{" "}
                <strong className="text-[#ebdbb2]">Feeds</strong> — Live feed status and health.{" "}
                <strong className="text-[#ebdbb2]">GDELT</strong> — Global event database with strategic digest.{" "}
                <strong className="text-[#ebdbb2]">Anomalies</strong> — 67 Google Earth anomaly sites.{" "}
                <strong className="text-[#ebdbb2]">Signal</strong> — PNEUMA cognitive signals.{" "}
                <strong className="text-[#ebdbb2]">Status</strong> — System diagnostics.
              </p>
            </div>
          )}

          {tab === "feeds" && (
            <div className="space-y-3 font-mono text-[11px] text-[#d5c4a1]">
              <h2 className="text-[14px] font-bold text-[#fabd2f]">Active Data Feeds</h2>
              {[
                { name: "ADS-B Military", source: "adsb.lol", interval: "10s", desc: "Real-time military aircraft positions via ADS-B transponders", key: false },
                { name: "OpenSky", source: "OpenSky Network", interval: "10s", desc: "Civil aviation positions and callsigns", key: true },
                { name: "AIS Vessels", source: "AISStream.io", interval: "60s", desc: "Maritime vessel tracking — MMSI, speed, heading, nav status", key: true },
                { name: "GDELT", source: "GDELT Project", interval: "15m", desc: "Global geopolitical events — actors, conflict/cooperation, Goldstein scores", key: false },
                { name: "USGS Seismic", source: "USGS", interval: "5m", desc: "Earthquake activity worldwide — magnitude, depth, location", key: false },
                { name: "CelesTrak", source: "CelesTrak", interval: "5s", desc: "Satellite tracking via TLE orbital elements", key: false },
                { name: "OTX Threats", source: "AlienVault OTX", interval: "10m", desc: "Cyber threat intelligence — malware, adversary attribution, IOCs", key: true },
                { name: "Cloudflare Radar", source: "Cloudflare", interval: "10m", desc: "Internet infrastructure outages and anomalies", key: true },
                { name: "News RSS", source: "Multiple", interval: "5m", desc: "BBC, Al Jazeera, Guardian, DW, NPR + regional sources", key: false },
                { name: "FRED", source: "Federal Reserve", interval: "15m", desc: "Economic indicators — oil prices, bond yields, market data", key: true },
                { name: "Weather Radar", source: "RainViewer", interval: "5m", desc: "Global precipitation radar overlay", key: false },
              ].map((feed) => (
                <div key={feed.name} className="rounded-lg border border-[#3c3836] bg-[#282828] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#ebdbb2]">{feed.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-[#504945] px-1.5 py-0.5 text-[9px] text-[#928374]">{feed.interval}</span>
                      {feed.key && <span className="rounded border border-[#fabd2f]/30 px-1.5 py-0.5 text-[9px] text-[#fabd2f]">KEY</span>}
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-[#a89984]">{feed.desc}</div>
                  <div className="mt-1 text-[10px] text-[#928374]">Source: {feed.source}</div>
                </div>
              ))}
            </div>
          )}

          {tab === "ai" && (
            <div className="space-y-4 font-mono text-[11px] text-[#d5c4a1]">
              <h2 className="text-[14px] font-bold text-[#fabd2f]">AI & Intelligence Engines</h2>

              <div className="rounded-lg border border-[#3c3836] bg-[#282828] p-4">
                <h3 className="text-[13px] font-bold text-[#83a598]">PNEUMA</h3>
                <p className="mt-1 text-[#a89984]">
                  Cognitive processing layer inspired by Freudian psychoanalysis. Routes intelligence through
                  three candidate generators (Id, Ego, Superego) and selects responses via a Strange Loop
                  gating mechanism. Provides nuanced analysis that balances aggressive threat detection with
                  measured strategic assessment.
                </p>
              </div>

              <div className="rounded-lg border border-[#3c3836] bg-[#282828] p-4">
                <h3 className="text-[13px] font-bold text-[#fe8019]">Phantom Chaos Engine</h3>
                <p className="mt-1 text-[#a89984]">
                  Rust-powered anomaly detection sidecar using chaos mathematics. Computes Lyapunov exponents
                  and Finite-Time Lyapunov Exponents (FTLE) on incoming data streams to detect phase transitions
                  and emergent anomalies that traditional threshold-based systems miss. Runs as a separate
                  high-performance process.
                </p>
              </div>

              <div className="rounded-lg border border-[#504945] bg-[#1d2021] p-4">
                <h3 className="mb-3 text-[13px] font-bold text-[#fabd2f]">LLM Configuration</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#a89984]">Provider</span>
                    <select
                      className={`${inputClass} mt-1`}
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value as "ollama" | "openai_compatible")}
                    >
                      <option value="ollama">Ollama (Local)</option>
                      <option value="openai_compatible">OpenAI-Compatible API</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#a89984]">Endpoint URL</span>
                    <input type="text" className={`${inputClass} mt-1`} value={llmEndpoint} onChange={(e) => setLlmEndpoint(e.target.value)} placeholder="http://localhost:11434" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#a89984]">Model</span>
                    <input type="text" className={`${inputClass} mt-1`} value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="llama3" />
                  </label>
                  {llmProvider === "openai_compatible" && (
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-[#a89984]">API Key</span>
                      <input type="password" className={`${inputClass} mt-1`} value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder="sk-..." />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={saveSettings}
                    className="rounded-lg border border-[#83a598] bg-[#504945] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#ebdbb2] transition hover:bg-[#665c54]"
                  >
                    {settingsSaved ? "Saved!" : "Save LLM Settings"}
                  </button>
                  <p className="text-[10px] text-[#928374]">
                    Powers GDELT Strategic Digests, event summaries, and AI analysis. Your keys stay on your server.
                    Supports Ollama, LM Studio, vLLM, OpenRouter, Groq, or any OpenAI-compatible endpoint.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "keys" && (
            <div className="space-y-4 font-mono text-[11px] text-[#d5c4a1]">
              <h2 className="text-[14px] font-bold text-[#fabd2f]">API Keys</h2>
              <p className="text-[#a89984]">
                Some feeds require API keys for access. Keys are set as environment variables on the server.
                Free feeds work without any keys.
              </p>
              {[
                { name: "AISSTREAM_API_KEY", feed: "AIS Vessels", url: "https://aisstream.io", status: "configured" },
                { name: "OTX_API_KEY", feed: "AlienVault OTX", url: "https://otx.alienvault.com", status: "configured" },
                { name: "FRED_API_KEY", feed: "FRED Economic", url: "https://fred.stlouisfed.org", status: "configured" },
                { name: "CLOUDFLARE_RADAR_TOKEN", feed: "Cloudflare Radar", url: "https://dash.cloudflare.com", status: "configured" },
                { name: "OPENSKY_USERNAME / PASSWORD", feed: "OpenSky Network", url: "https://opensky-network.org", status: "optional" },
                { name: "GRADIENT_BASE_URL", feed: "Gradient AI", url: "https://cloud.digitalocean.com", status: "configured" },
              ].map((key) => (
                <div key={key.name} className="rounded-lg border border-[#3c3836] bg-[#282828] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#ebdbb2]">{key.name}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] ${
                      key.status === "configured" ? "border-[#b8bb26]/30 text-[#b8bb26]" : "border-[#928374]/30 text-[#928374]"
                    }`}>{key.status}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[#a89984]">Used by: {key.feed}</div>
                </div>
              ))}
              <div className="rounded-lg border border-[#504945] bg-[#1d2021] px-3 py-2 text-[10px] text-[#928374]">
                To add or change API keys, set them in your server's <code className="text-[#83a598]">.env</code> file
                and restart the Docker containers. Keys never leave your server.
              </div>
            </div>
          )}

          {tab === "about" && (
            <div className="space-y-4 font-mono text-[12px] leading-relaxed text-[#d5c4a1]">
              <h2 className="text-[14px] font-bold text-[#fabd2f]">About Argus</h2>
              <p>
                Named after Argus Panoptes, the hundred-eyed giant of Greek mythology who served as an
                ever-vigilant watchman. This platform embodies that same principle — constant, multi-domain
                situational awareness.
              </p>
              <div className="space-y-1 text-[11px] text-[#a89984]">
                <div>Stack: Next.js 14 + React + Cesium.js + D3.js + Zustand</div>
                <div>AI: PNEUMA (Freudian cognitive layer) + Phantom (Rust chaos math)</div>
                <div>Deployment: Docker on DigitalOcean + Cloudflare Tunnel</div>
                <div>Data: 11+ live feeds from public and keyed OSINT sources</div>
              </div>
              <p className="text-[11px] text-[#928374]">
                All data sourced from publicly available open-source intelligence (OSINT) feeds.
                No classified or proprietary intelligence sources are used.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
