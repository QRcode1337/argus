"use client";

import React, { useMemo } from "react";
import {
  filterEpicFuryIncidents,
  useEpicFuryStore,
  type TimeWindow,
} from "@/store/useEpicFuryStore";

const TIME_WINDOWS: TimeWindow[] = ["1h", "6h", "24h", "7d", "all"];

const WINDOW_LABELS: Record<TimeWindow, string> = {
  "1h": "LAST 1 HOUR",
  "6h": "LAST 6 HOURS",
  "24h": "LAST 24 HOURS",
  "7d": "LAST 7 DAYS",
  all: "ALL TIME",
};

export const TimelineScrubber: React.FC = () => {
  const timeWindow = useEpicFuryStore((s) => s.timeWindow);
  const setTimeWindow = useEpicFuryStore((s) => s.setTimeWindow);
  const lockedRegion = useEpicFuryStore((s) => s.lockedRegion);
  const allIncidents = useEpicFuryStore((s) => s.incidents);
  const incidents = useMemo(
    () => filterEpicFuryIncidents(allIncidents, timeWindow, lockedRegion),
    [allIncidents, lockedRegion, timeWindow],
  );

  const newest = incidents.length > 0 ? incidents[0].timestamp : null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-3 font-mono text-xs z-50 backdrop-blur-md shadow-[0_0_20px_rgba(8,145,178,0.2)]">
      <div className="flex items-center gap-6">
        {/* Time Window Buttons */}
        <div className="flex gap-1">
          {TIME_WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-4 py-2 rounded font-bold text-[11px] uppercase transition-colors ${
                timeWindow === w
                  ? "bg-cyan-900/60 text-cyan-400 border border-cyan-500/50"
                  : "text-cyan-700 hover:text-cyan-400 border border-transparent"
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-cyan-900/50" />

        {/* Stats */}
        <div className="flex items-center gap-6 text-[10px]">
          <div className="text-cyan-600">
            WINDOW: <span className="text-white font-bold">{WINDOW_LABELS[timeWindow]}</span>
          </div>
          <div className="text-cyan-600">
            INCIDENTS: <span className="text-white font-bold">{incidents.length.toLocaleString()}</span>
          </div>
          {newest && (
            <div className="text-cyan-600">
              LATEST:{" "}
              <span className="text-cyan-400 font-bold">
                {new Date(newest).toISOString().replace("T", " ").slice(0, 19)} UTC
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
