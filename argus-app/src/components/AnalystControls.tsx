"use client";

import React from "react";

export const AnalystControls: React.FC = () => {
  return (
    <div className="absolute top-[5.5rem] right-8 w-80 bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-4 font-mono text-xs text-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.2)] z-50 backdrop-blur-md">
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">FILTERED</div>
          <div className="text-xl font-bold text-white">9,444</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">ACTIVE</div>
          <div className="text-xl font-bold text-cyan-400">4,360</div>
        </div>
        <div className="bg-[#111c2a] p-2 border border-cyan-900/30 rounded text-center">
          <div className="text-[10px] text-cyan-600 mb-1">LOADED TRIPS</div>
          <div className="text-xl font-bold text-white">16,912</div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-cyan-900/30 pb-4">
        <button className="bg-cyan-900/40 text-white px-3 py-1 rounded text-[10px] border border-cyan-500/50">FULL PERIOD</button>
        <button className="text-cyan-600 hover:text-cyan-400 px-3 py-1 text-[10px]">BEFORE CHOKEPOINT</button>
        <button className="text-cyan-600 hover:text-cyan-400 px-3 py-1 text-[10px]">AFTER CHOKEPOINT</button>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] text-cyan-700 font-bold mb-3">LAYERS</div>
        {[
          { label: "TRIPS", active: true },
          { label: "HEADS", active: false },
          { label: "DENSITY", active: true },
          { label: "PIPELINES", active: true },
          { label: "STRIKES", active: true, color: "text-red-500" },
          { label: "INFRASTRUCTURE", active: false },
          { label: "DESAL", active: false },
          { label: "GATES", active: false },
          { label: "DARK-GAP", active: true, color: "text-purple-400" },
        ].map(layer => (
          <div key={layer.label} className="flex items-center justify-between hover:bg-cyan-900/20 p-1 rounded cursor-pointer transition-colors">
            <span className={layer.color || (layer.active ? "text-cyan-100" : "text-cyan-700")}>{layer.label}</span>
            <div className={`w-8 h-4 rounded-full border ${layer.active ? "bg-cyan-900 border-cyan-500" : "border-cyan-900/50"} relative`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${layer.active ? "bg-cyan-400 right-0.5" : "bg-cyan-900/50 left-0.5"}`}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
