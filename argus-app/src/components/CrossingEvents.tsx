"use client";

import React from "react";

export const CrossingEvents: React.FC = () => {
  return (
    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0d1520]/80 border border-cyan-900/40 rounded-lg p-3 font-mono text-xs shadow-[0_0_20px_rgba(8,145,178,0.15)] z-40 backdrop-blur-sm pointer-events-none">
      <div className="text-cyan-500 font-bold mb-2 text-center text-[10px] tracking-wider">CROSSING EVENTS</div>
      <div className="flex gap-6 justify-center">
        <div className="text-center">
          <div className="text-cyan-700 text-[10px] mb-1">IN</div>
          <div className="text-white font-bold text-lg">1,204</div>
        </div>
        <div className="w-px bg-cyan-900/50"></div>
        <div className="text-center">
          <div className="text-cyan-700 text-[10px] mb-1">OUT</div>
          <div className="text-cyan-400 font-bold text-lg">1,156</div>
        </div>
      </div>
    </div>
  );
};
