"use client";

import React, { useState } from "react";

type Incident = {
  id: string;
  type: "BOMBING" | "AIRSTRIKE" | "SOCIAL_VIDEO" | "NAVAL_INCIDENT";
  location: string;
  lat: number;
  lon: number;
  description: string;
  timestamp: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  source: string;
};

const MOCK_INCIDENTS: Incident[] = [
  {
    id: "inc-001",
    type: "BOMBING",
    location: "Bandar Abbas Port Facility",
    lat: 27.14,
    lon: 56.05,
    description: "Multiple detonations reported at northern dock. Secondary explosions observed.",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    severity: "CRITICAL",
    source: "SIGINT / SATCOM"
  },
  {
    id: "inc-002",
    type: "SOCIAL_VIDEO",
    location: "Qeshm Island Coast",
    lat: 26.73,
    lon: 55.62,
    description: "Social media video shows coastal defense battery engaging unknown target. High confidence.",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    severity: "HIGH",
    source: "OSINT / X (Twitter)"
  },
  {
    id: "inc-003",
    type: "AIRSTRIKE",
    location: "Strait of Hormuz - Sector 4",
    lat: 26.56,
    lon: 56.25,
    description: "Fast attack craft neutralized by drone strike. Confirming BDA.",
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    severity: "CRITICAL",
    source: "ISR Feed"
  },
  {
    id: "inc-004",
    type: "SOCIAL_VIDEO",
    location: "Hormozgan Province",
    lat: 27.30,
    lon: 56.40,
    description: "Telegram footage: Large smoke plume visible over military exclusion zone.",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    severity: "MEDIUM",
    source: "OSINT / Telegram"
  }
];

export const EpicFuryHud: React.FC<{
  onFlyToCoordinates: (lat: number, lon: number) => void;
}> = ({ onFlyToCoordinates }) => {
  const [incidents] = useState<Incident[]>(MOCK_INCIDENTS);
  
  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toTimeString().split(" ")[0];
  };
  
  return (
    <div className="absolute top-[5.5rem] left-8 w-[400px] bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4 border-b border-cyan-900/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">👁️</span>
          <h2 className="text-lg font-bold tracking-widest text-cyan-500">STRAIT OF HORMUZ GOD'S EYE VIEW</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-cyan-500 font-bold animate-pulse">●</span>
          <span className="text-cyan-400 font-bold">LIVE</span>
        </div>
      </div>
      
      <div className="flex gap-2 mb-4 border-b border-cyan-900/50 pb-2 overflow-x-auto text-[10px]">
        <button className="text-cyan-400 font-bold border-b border-cyan-400 pb-1 whitespace-nowrap">OPERATIONAL EVENTS</button>
        <button className="text-cyan-700 hover:text-cyan-400 pb-1 whitespace-nowrap">UNIQUE VESSELS</button>
        <button className="text-cyan-700 hover:text-cyan-400 pb-1 whitespace-nowrap">COMMERCIAL OBSERVED</button>
      </div>

      <div className="mb-4 bg-[#111c2a] p-3 rounded border border-cyan-900/30">
        <h3 className="text-[10px] text-cyan-600 font-bold mb-2">OIL RISK MATRIX</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[9px] text-cyan-700">GLOBAL BRENT</div>
            <div className="text-white font-bold">$70.85</div>
          </div>
          <div className="border-l border-r border-cyan-900/50">
            <div className="text-[9px] text-cyan-700">U.S. WTI</div>
            <div className="text-white font-bold">$65.42</div>
          </div>
          <div>
            <div className="text-[9px] text-cyan-700">SPREAD</div>
            <div className="text-red-400 font-bold">$5.43</div>
          </div>
        </div>
      </div>

      <div className="mb-4 bg-[#111c2a] p-3 rounded border border-cyan-900/30 h-24 relative flex items-end justify-between px-2">
        <div className="absolute top-2 left-2 text-[10px] text-cyan-600 font-bold">FULL PERIOD OPERATIONAL EVENTS</div>
        {/* Mock line chart bars */}
        {[10, 15, 8, 25, 40, 35, 60, 45, 30, 20, 15, 12, 8].map((h, i) => (
          <div key={i} className="w-4 bg-cyan-900/50 hover:bg-cyan-500/80 transition-colors rounded-t" style={{ height: `${h}%` }}></div>
        ))}
      </div>

      <h3 className="font-bold text-cyan-400 mb-2 mt-2 border-b border-cyan-900/50 pb-1">LIVE INCIDENT FEED</h3>
      
      <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2">
        {incidents.map((incident) => (
          <div 
            key={incident.id} 
            className="bg-cyan-950/20 border border-cyan-900/50 rounded p-3 cursor-pointer hover:bg-cyan-900/40 transition-colors"
            onClick={() => onFlyToCoordinates(incident.lat, incident.lon)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{incident.type === "SOCIAL_VIDEO" ? "📱" : "💥"}</span>
                <span className={`font-bold ${incident.severity === 'CRITICAL' ? 'text-red-500' : 'text-orange-400'}`}>
                  {incident.type}
                </span>
              </div>
              <span className="text-[10px] text-cyan-600">
                {formatTime(incident.timestamp)}
              </span>
            </div>
            
            <div className="text-white font-medium mb-1">{incident.location}</div>
            <div className="text-cyan-200/80 mb-2">{incident.description}</div>
            
            <div className="flex items-center justify-between text-[10px]">
              <span className="bg-cyan-900/50 px-2 py-0.5 rounded text-cyan-300">{incident.source}</span>
              <span className="text-cyan-600">{incident.lat.toFixed(2)}, {incident.lon.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
