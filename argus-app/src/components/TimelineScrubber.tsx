"use client";

import React from "react";

export const TimelineScrubber: React.FC = () => {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[800px] bg-[#0d1520]/90 border border-cyan-900/50 rounded-lg p-3 font-mono text-xs z-50 backdrop-blur-md flex flex-col gap-2 shadow-[0_0_20px_rgba(8,145,178,0.2)]">
      <div className="flex items-center justify-between text-cyan-500 mb-1">
        <div className="flex items-center gap-4">
          <button className="text-white bg-cyan-900/50 px-3 py-1 rounded border border-cyan-500/30 hover:bg-cyan-800">PAUSE</button>
          <div className="flex gap-2">
            <span className="text-cyan-700 cursor-pointer hover:text-cyan-400">10M/S</span>
            <span className="text-cyan-400 font-bold border-b border-cyan-400 pb-0.5">2H/S</span>
            <span className="text-cyan-700 cursor-pointer hover:text-cyan-400">6H/S</span>
            <span className="text-cyan-700 cursor-pointer hover:text-cyan-400">10/S</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="text-cyan-600">ACTIVE VESSELS: <span className="text-white font-bold">2,140</span></div>
          <div className="text-cyan-400 font-bold">2026-04-04 07:22:15 UTC</div>
        </div>
      </div>
      
      <div className="relative h-6 w-full mt-2">
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-cyan-950 rounded-full"></div>
        <div className="absolute top-1/2 -translate-y-1/2 w-3/4 h-1 bg-cyan-600 rounded-full"></div>
        <div className="absolute top-1/2 -translate-y-1/2 left-3/4 w-3 h-3 bg-white border-2 border-cyan-400 rounded-full -mt-1.5 cursor-pointer shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>
        
        {/* Intel Density aesthetic markers */}
        <div className="absolute top-0 left-1/4 w-px h-full bg-cyan-500/30"></div>
        <div className="absolute top-1 left-1/2 w-px h-4 bg-cyan-500/50"></div>
        <div className="absolute top-2 left-[60%] w-px h-2 bg-red-500/70"></div>
        <div className="absolute top-1 left-[70%] w-px h-4 bg-cyan-500/50"></div>
      </div>
    </div>
  );
};
