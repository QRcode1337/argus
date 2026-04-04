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
    <div className="absolute top-[5.5rem] left-8 w-96 bg-black/80 border border-red-900 rounded-lg p-4 font-mono text-xs text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)] z-50">
      <div className="flex items-center justify-between mb-4 border-b border-red-900/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-bold tracking-widest text-red-500">OP: EPIC FURY</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-500 font-bold animate-pulse">●</span>
          <span className="text-red-400 font-bold">LIVE</span>
        </div>
      </div>
      
      <div className="mb-4 text-red-300">
        <div className="flex justify-between border-b border-red-900/30 py-1">
          <span>THEATER:</span>
          <span className="text-white">STRAIT OF HORMUZ / ME</span>
        </div>
        <div className="flex justify-between border-b border-red-900/30 py-1">
          <span>DEFCON:</span>
          <span className="text-red-500 font-bold animate-pulse">2</span>
        </div>
        <div className="flex justify-between py-1">
          <span>ACTIVE TARGETS:</span>
          <span className="text-white">14</span>
        </div>
      </div>

      <h3 className="font-bold text-red-400 mb-2 mt-4 border-b border-red-900/50 pb-1">LIVE INCIDENT FEED</h3>
      
      <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2">
        {incidents.map((incident) => (
          <div 
            key={incident.id} 
            className="bg-red-950/30 border border-red-900/50 rounded p-3 cursor-pointer hover:bg-red-900/40 transition-colors"
            onClick={() => onFlyToCoordinates(incident.lat, incident.lon)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{incident.type === "SOCIAL_VIDEO" ? "📱" : "💥"}</span>
                <span className={`font-bold ${incident.severity === 'CRITICAL' ? 'text-red-500' : 'text-orange-400'}`}>
                  {incident.type}
                </span>
              </div>
              <span className="text-[10px] text-red-400/70">
                {formatTime(incident.timestamp)}
              </span>
            </div>
            
            <div className="text-white font-medium mb-1">{incident.location}</div>
            <div className="text-red-200/80 mb-2">{incident.description}</div>
            
            <div className="flex items-center justify-between text-[10px]">
              <span className="bg-red-900/50 px-2 py-0.5 rounded text-red-300">{incident.source}</span>
              <span className="text-red-400/50">{incident.lat.toFixed(2)}, {incident.lon.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
