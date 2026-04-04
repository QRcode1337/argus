"use client";

import React from "react";
import { useEpicFuryStore, type TimeWindow } from "@/store/useEpicFuryStore";

const TIME_WINDOWS: TimeWindow[] = ["1h", "6h", "24h", "7d", "all"];

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-400",
  medium: "border-l-cyan-500",
  low: "border-l-cyan-900",
};

const TYPE_ICON: Record<string, string> = {
  gdelt: "🌐",
  military: "✈️",
  vessel: "🚢",
  seismic: "🔴",
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export const EpicFuryHud: React.FC<{
  onFlyToCoordinates: (lat: number, lon: number) => void;
}> = ({ onFlyToCoordinates }) => {
  const timeWindow = useEpicFuryStore((s) => s.timeWindow);
  const setTimeWindow = useEpicFuryStore((s) => s.setTimeWindow);
  const lockedRegion = useEpicFuryStore((s) => s.lockedRegion);
  const incidents = useEpicFuryStore((s) => s.filteredIncidents());

  return (
    <div className="absolute top-[5.5rem] left-8 w-[400px] bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-cyan-900/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">👁️</span>
          <h2 className="text-lg font-bold tracking-widest text-cyan-500">
            {lockedRegion ? `EPIC FURY — ${lockedRegion.label}` : "EPIC FURY — GLOBAL OPS"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-500 font-bold animate-pulse">●</span>
          <span className="text-cyan-400 font-bold">LIVE</span>
        </div>
      </div>

      {/* Time Window Buttons */}
      <div className="flex gap-2 mb-4 border-b border-cyan-900/50 pb-2">
        {TIME_WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setTimeWindow(w)}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
              timeWindow === w
                ? "bg-cyan-900/60 text-cyan-400 border border-cyan-500/50"
                : "text-cyan-700 hover:text-cyan-400"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Incident Count */}
      <div className="text-[10px] text-cyan-600 mb-2">
        {incidents.length} INCIDENT{incidents.length !== 1 ? "S" : ""} IN WINDOW
      </div>

      {/* Incident Feed */}
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
        {incidents.length === 0 ? (
          <div className="text-cyan-700 text-center py-8">No incidents in current window</div>
        ) : (
          incidents.map((incident) => (
            <div
              key={incident.id}
              className={`bg-cyan-950/20 border border-cyan-900/50 border-l-2 ${SEVERITY_BORDER[incident.severity]} rounded p-3 cursor-pointer hover:bg-cyan-900/40 transition-colors`}
              onClick={() => onFlyToCoordinates(incident.lat, incident.lon)}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{TYPE_ICON[incident.type]}</span>
                  <span className="font-bold text-white">{incident.title}</span>
                </div>
                <span className="text-[10px] text-cyan-600 whitespace-nowrap ml-2">
                  {relativeTime(incident.timestamp)}
                </span>
              </div>
              <div className="text-cyan-200/80 mb-2">{incident.detail}</div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="bg-cyan-900/50 px-2 py-0.5 rounded text-cyan-300">{incident.source}</span>
                <span className="text-cyan-600">
                  {incident.lat.toFixed(2)}, {incident.lon.toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
