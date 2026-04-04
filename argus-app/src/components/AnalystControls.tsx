"use client";

import React, { useMemo } from "react";
import {
  computeEpicFuryRegionStats,
  EPIC_FURY_THEATER,
  useEpicFuryStore,
} from "@/store/useEpicFuryStore";
import { useArgusStore } from "@/store/useArgusStore";
import type { LayerKey } from "@/types/intel";

const CONFLICT_LAYERS: { key: LayerKey; label: string }[] = [
  { key: "military", label: "MILITARY" },
  { key: "vessels", label: "VESSELS" },
  { key: "seismic", label: "SEISMIC" },
  { key: "gdelt", label: "GDELT" },
  { key: "flights", label: "FLIGHTS" },
];

export const AnalystControls: React.FC<{ embedded?: boolean; className?: string }> = ({
  embedded = false,
  className = "",
}) => {
  const layers = useArgusStore((s) => s.layers);
  const toggleLayer = useArgusStore((s) => s.toggleLayer);
  const lockedRegion = useEpicFuryStore((s) => s.lockedRegion);
  const unlockRegion = useEpicFuryStore((s) => s.unlockRegion);
  const incidents = useEpicFuryStore((s) => s.incidents);
  const theaterLabel = lockedRegion?.label ?? EPIC_FURY_THEATER.label;
  const stats = useMemo(
    () => computeEpicFuryRegionStats(incidents, lockedRegion),
    [incidents, lockedRegion],
  );
  const theaterCounts = useMemo(
    () => ({
      military: incidents.filter((incident) => incident.type === "military").length,
      vessels: incidents.filter((incident) => incident.type === "vessel").length,
      seismic: incidents.filter((incident) => incident.type === "seismic").length,
      gdelt: incidents.filter((incident) => incident.type === "gdelt").length,
    }),
    [incidents],
  );

  return (
    <div
      className={[
        embedded
          ? "w-full bg-[#0d1520]/90 border border-cyan-900/50 rounded-xl p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.12)] backdrop-blur-md"
          : "absolute top-[5.5rem] right-8 w-80 bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md",
        className,
      ].join(" ").trim()}
    >
      {/* Theater Stats */}
      <div className="text-[10px] text-cyan-700 font-bold mb-2">{EPIC_FURY_THEATER.label} COUNTS</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">MILITARY</div>
          <div className="text-lg font-bold text-white">{theaterCounts.military.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">VESSELS</div>
          <div className="text-lg font-bold text-white">{theaterCounts.vessels.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">GDELT</div>
          <div className="text-lg font-bold text-white">{theaterCounts.gdelt.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">SEISMIC</div>
          <div className="text-lg font-bold text-white">{theaterCounts.seismic.toLocaleString()}</div>
        </div>
      </div>

      <div className="mb-4 border-t border-cyan-900/50 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-cyan-400 font-bold">{theaterLabel} SUMMARY</div>
          {lockedRegion ? (
            <button
              onClick={unlockRegion}
              className="text-[10px] text-red-400 hover:text-red-300 font-bold border border-red-900/50 px-2 py-0.5 rounded"
            >
              RESET TO THEATER
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
            <div className="text-[10px] text-cyan-600 mb-1">MILITARY TRACKS</div>
            <div className="text-lg font-bold text-cyan-400">{stats.militaryInRegion.toLocaleString()}</div>
          </div>
          <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
            <div className="text-[10px] text-cyan-600 mb-1">VESSEL TRACKS</div>
            <div className="text-lg font-bold text-cyan-400">{stats.vesselsInRegion.toLocaleString()}</div>
          </div>
          <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
            <div className="text-[10px] text-cyan-600 mb-1">INCIDENTS (1H)</div>
            <div className="text-lg font-bold text-cyan-400">{stats.incidentsLastHour.toLocaleString()}</div>
          </div>
          <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
            <div className="text-[10px] text-cyan-600 mb-1">SEISMIC EVENTS</div>
            <div className="text-lg font-bold text-cyan-400">{stats.seismicInRegion.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="border-t border-cyan-900/50 pt-3">
        <div className="text-[10px] text-cyan-700 font-bold mb-3">LAYERS</div>
        <div className="space-y-2">
          {CONFLICT_LAYERS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between hover:bg-cyan-900/20 p-1 rounded cursor-pointer transition-colors"
              onClick={() => toggleLayer(key)}
            >
              <span className={layers[key] ? "text-cyan-100" : "text-cyan-700"}>{label}</span>
              <div
                className={`w-8 h-4 rounded-full border ${
                  layers[key] ? "bg-cyan-900 border-cyan-500" : "border-cyan-900/50"
                } relative`}
              >
                <div
                  className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                    layers[key] ? "bg-cyan-400 right-0.5" : "bg-cyan-900/50 left-0.5"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
