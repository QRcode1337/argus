"use client";

import React from "react";
import { useEpicFuryStore } from "@/store/useEpicFuryStore";
import { useArgusStore } from "@/store/useArgusStore";
import type { LayerKey } from "@/types/intel";

const CONFLICT_LAYERS: { key: LayerKey; label: string }[] = [
  { key: "military", label: "MILITARY" },
  { key: "vessels", label: "VESSELS" },
  { key: "seismic", label: "SEISMIC" },
  { key: "gdelt", label: "GDELT" },
  { key: "flights", label: "FLIGHTS" },
];

export const AnalystControls: React.FC = () => {
  const counts = useArgusStore((s) => s.counts);
  const layers = useArgusStore((s) => s.layers);
  const toggleLayer = useArgusStore((s) => s.toggleLayer);
  const lockedRegion = useEpicFuryStore((s) => s.lockedRegion);
  const unlockRegion = useEpicFuryStore((s) => s.unlockRegion);
  const stats = useEpicFuryStore((s) => s.regionStats());

  return (
    <div className="absolute top-[5.5rem] right-8 w-80 bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md">
      {/* Global Stats */}
      <div className="text-[10px] text-cyan-700 font-bold mb-2">GLOBAL COUNTS</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">MILITARY</div>
          <div className="text-lg font-bold text-white">{counts.military.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">VESSELS</div>
          <div className="text-lg font-bold text-white">{counts.vessels.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">SATELLITES</div>
          <div className="text-lg font-bold text-white">{counts.satellites.toLocaleString()}</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">SEISMIC</div>
          <div className="text-lg font-bold text-white">{counts.seismic.toLocaleString()}</div>
        </div>
      </div>

      {/* Region Stats (only when locked) */}
      {lockedRegion && (
        <div className="mb-4 border-t border-cyan-900/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-cyan-400 font-bold">{lockedRegion.label} REGION</div>
            <button
              onClick={unlockRegion}
              className="text-[10px] text-red-400 hover:text-red-300 font-bold border border-red-900/50 px-2 py-0.5 rounded"
            >
              UNLOCK
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">MIL. IN REGION</div>
              <div className="text-lg font-bold text-cyan-400">{stats.militaryInRegion.toLocaleString()}</div>
            </div>
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">VESSELS IN REGION</div>
              <div className="text-lg font-bold text-cyan-400">{stats.vesselsInRegion.toLocaleString()}</div>
            </div>
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">INCIDENTS (1H)</div>
              <div className="text-lg font-bold text-cyan-400">{stats.incidentsLastHour.toLocaleString()}</div>
            </div>
            <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
              <div className="text-[10px] text-cyan-600 mb-1">SEISMIC IN REGION</div>
              <div className="text-lg font-bold text-cyan-400">{stats.seismicInRegion.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

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
