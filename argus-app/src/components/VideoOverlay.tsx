"use client";

import { useCallback, useEffect } from "react";

interface VideoOverlayProps {
  src: string;
  title: string;
  onClose: () => void;
}

export function VideoOverlay({ src, title, onClose }: VideoOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Outer close zone */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="Close overlay"
      />

      {/* Video container */}
      <div className="relative z-10 w-[90vw] max-w-[960px]">
        {/* Header bar */}
        <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-[#3c3836] bg-[#1d2021] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#fabd2f]">
              Live Feed
            </span>
          </div>
          <span className="font-mono text-[12px] text-[#ebdbb2]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a89984] transition hover:border-[#83a598] hover:text-[#d5c4a1]"
          >
            ESC
          </button>
        </div>

        {/* Video iframe */}
        <div className="relative aspect-video w-full overflow-hidden rounded-b-xl border border-[#3c3836]">
          <iframe
            src={src}
            title={title}
            className="absolute inset-0 h-full w-full bg-black"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          />
        </div>

        {/* Footer info */}
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#928374]">
            Stream source — external provider
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#928374]">
            Press ESC to close
          </span>
        </div>
      </div>
    </div>
  );
}
