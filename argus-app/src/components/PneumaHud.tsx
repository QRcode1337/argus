"use client";

interface PneumaHudProps {
  phi: number;           // 0-1, the Phi consciousness score
  moodRegime: string;    // 'exploratory-curious' | 'focused-analytical' | 'empathetic-supportive' | 'creative-generative'
  threatLevel: string;   // From analysisEngine: 'GREEN' | 'AMBER' | 'RED'
  memoryNodes: number;   // Count of stored memory nodes
  cycleCount: number;    // Number of cognitive cycles processed
  pipelineTimeMs: number; // Last pipeline execution time
  isActive: boolean;     // Whether PNEUMA is initialized
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
  if (phi > 0.7) return "#b8bb26";   // green
  if (phi >= 0.4) return "#fabd2f";  // yellow/amber
  return "#fb4934";                   // red
}

function getPhiBarWidth(phi: number): string {
  return `${Math.max(0, Math.min(100, phi * 100))}%`;
}

export default function PneumaHud({
  phi,
  moodRegime,
  threatLevel,
  memoryNodes,
  cycleCount,
  pipelineTimeMs,
  isActive,
}: PneumaHudProps) {
  const phiColor = getPhiColor(phi);
  const moodLabel = MOOD_LABELS[moodRegime] ?? moodRegime.toUpperCase();
  const threatColor = THREAT_COLORS[threatLevel] ?? "text-[#928374]";

  return (
    <div className="pointer-events-auto w-[200px] rounded-md border border-[#3c3836] bg-[#1d2021e6] font-mono text-[9px] uppercase tracking-[0.18em]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#3c3836] px-2.5 py-1.5">
        <span className="text-[10px] tracking-[0.28em] text-[#fabd2f]">
          PNEUMA
        </span>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] ${
            isActive
              ? "border border-[#98971a] bg-[#1a2e1a] text-[#b8bb26]"
              : "border border-[#504945] bg-[#282828] text-[#928374]"
          }`}
        >
          {isActive ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      {/* Body */}
      <div className="space-y-1.5 px-2.5 py-2">
        {/* PHI gauge */}
        <div>
          <div className="mb-0.5 flex items-center justify-between text-[#a89984]">
            <span>PHI</span>
            <span style={{ color: phiColor }}>{phi.toFixed(2)}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-sm bg-[#3c3836]">
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: getPhiBarWidth(phi),
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
          <span className="text-[#d5c4a1]">{memoryNodes.toLocaleString()}</span>
        </div>

        {/* CYCLES */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>CYCLES</span>
          <span className="text-[#d5c4a1]">{cycleCount.toLocaleString()}</span>
        </div>

        {/* PIPELINE */}
        <div className="flex items-center justify-between text-[#a89984]">
          <span>PIPELINE</span>
          <span className="text-[#83a598]">{pipelineTimeMs}ms</span>
        </div>
      </div>
    </div>
  );
}
