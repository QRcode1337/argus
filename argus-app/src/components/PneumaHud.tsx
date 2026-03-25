"use client";

import { useEffect, useState } from "react";

interface PneumaState {
  phi: number;
  moodRegime: string;
  memoryNodes: number;
  cycleCount: number;
  pipelineTimeMs: number;
  isActive: boolean;
}

const MOOD_LABELS: Record<string, string> = {
  "exploratory-curious": "EXPLORATORY",
  "focused-analytical": "ANALYTICAL",
  "empathetic-supportive": "EMPATHETIC",
  "creative-generative": "CREATIVE",
};

const THREAT_COLORS: Record<string, string> = {
  GREEN: "text-[#b8bb26]",
  AMBER: "text-[#fabd2f]",
  RED: "text-[#fb4934]",
};

function getPhiColor(phi: number): string {
  if (phi > 0.7) return "#b8bb26";
  if (phi >= 0.4) return "#fabd2f";
  return "#fb4934";
}

function getPhiBarWidth(phi: number): string {
  return `${Math.max(0, Math.min(100, phi * 100))}%`;
}

export default function PneumaHud({ threatLevel = "GREEN", inline = false }: { threatLevel?: string; inline?: boolean }) {
  const [state, setState] = useState<PneumaState>({
    phi: 0,
    moodRegime: "unknown",
    memoryNodes: 0,
    cycleCount: 0,
    pipelineTimeMs: 0,
    isActive: false,
  });

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch("/api/pneuma/state");
        if (res.ok && mounted) {
          setState(await res.json());
        }
      } catch {
        // silently retry next interval
      }
    }

    poll();
    const interval = setInterval(poll, 5_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const phiColor = getPhiColor(state.phi);
  const moodLabel = MOOD_LABELS[state.moodRegime] ?? state.moodRegime.toUpperCase();
  const threatColor = THREAT_COLORS[threatLevel] ?? "text-[#928374]";

  return (
    <div className={`font-mono text-[9px] uppercase tracking-[0.18em] ${inline ? "mt-2 w-full rounded-xl border border-[#3c3836] bg-[#1d2021]" : "pointer-events-auto w-[200px] rounded-md border border-[#3c3836] bg-[#1d2021e6]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#3c3836] px-2.5 py-1.5">
        <span className="text-[10px] tracking-[0.28em] text-[#fabd2f]">
          PNEUMA
        </span>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] ${
            state.isActive
              ? "border border-[#98971a] bg-[#1a2e1a] text-[#b8bb26]"
              : "border border-[#504945] bg-[#282828] text-[#928374]"
          }`}
        >
          {state.isActive ? "ENABLED" : "OFFLINE"}
        </span>
      </div>

      {/* Body */}
      <div className="space-y-1.5 px-2.5 py-2">
        {/* PHI gauge */}
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[#a89984]">
            <span>PHI</span>
            <span style={{ color: phiColor }}>{state.phi.toFixed(2)}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-sm bg-[#3c3836]">
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: getPhiBarWidth(state.phi),
                backgroundColor: phiColor,
              }}
            />
          </div>
        </div>

        {/* MOOD */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>MOOD</span>
          <span className="text-[#d5c4a1]">{moodLabel}</span>
        </div>

        {/* THREAT */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>THREAT</span>
          <span className={threatColor}>{threatLevel}</span>
        </div>

        {/* MEM */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>MEM</span>
          <span className="text-[#d5c4a1]">{state.memoryNodes.toLocaleString()}</span>
        </div>

        {/* CYCLES */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>CYCLES</span>
          <span className="text-[#d5c4a1]">{state.cycleCount.toLocaleString()}</span>
        </div>

        {/* PIPELINE */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>PIPELINE</span>
          <span className="text-[#83a598]">{state.pipelineTimeMs}ms</span>
        </div>
      </div>
    </div>
  );
}
