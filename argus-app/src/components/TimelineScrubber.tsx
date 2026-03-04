"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useArgusStore } from "@/store/useArgusStore";

const SPEEDS = [1, 5, 15, 60];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TimelineScrubber() {
  const playbackMode = useArgusStore((s) => s.playbackMode);
  const playbackTime = useArgusStore((s) => s.playbackTime);
  const playbackSpeed = useArgusStore((s) => s.playbackSpeed);
  const isPlaying = useArgusStore((s) => s.isPlaying);
  const playbackRange = useArgusStore((s) => s.playbackRange);
  const setPlaybackTime = useArgusStore((s) => s.setPlaybackTime);
  const setPlaybackSpeed = useArgusStore((s) => s.setPlaybackSpeed);
  const setIsPlaying = useArgusStore((s) => s.setIsPlaying);
  const goLive = useArgusStore((s) => s.goLive);
  const enterPlayback = useArgusStore((s) => s.enterPlayback);

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);

  // Fetch available range on mount and periodically
  useEffect(() => {
    async function fetchRange() {
      try {
        const res = await fetch("/api/playback/range");
        const data = await res.json();
        if (data.earliest && data.latest) {
          const r = {
            start: new Date(data.earliest),
            end: new Date(data.latest),
          };
          setRange(r);
          useArgusStore.setState({ playbackRange: r });
        }
      } catch {
        // no data yet
      }
    }
    fetchRange();
    const interval = setInterval(fetchRange, 30_000);
    return () => clearInterval(interval);
  }, []);

  const effectiveRange = playbackRange || range;

  const scrubToPosition = useCallback(
    (clientX: number) => {
      if (!trackRef.current || !effectiveRange) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      const ms =
        effectiveRange.start.getTime() +
        pct * (effectiveRange.end.getTime() - effectiveRange.start.getTime());
      const newTime = new Date(ms);
      setPlaybackTime(newTime);
      if (playbackMode === "live") {
        enterPlayback(newTime);
      }
    },
    [effectiveRange, playbackMode, setPlaybackTime, enterPlayback],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      scrubToPosition(e.clientX);
    },
    [scrubToPosition],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => scrubToPosition(e.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, scrubToPosition]);

  const progress =
    effectiveRange && playbackTime
      ? (playbackTime.getTime() - effectiveRange.start.getTime()) /
        (effectiveRange.end.getTime() - effectiveRange.start.getTime())
      : 0;

  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(playbackSpeed);
    setPlaybackSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  }, [playbackSpeed, setPlaybackSpeed]);

  const stepBack = useCallback(() => {
    if (!playbackTime) return;
    setPlaybackTime(new Date(playbackTime.getTime() - 60_000));
  }, [playbackTime, setPlaybackTime]);

  const stepForward = useCallback(() => {
    if (!playbackTime) return;
    setPlaybackTime(new Date(playbackTime.getTime() + 60_000));
  }, [playbackTime, setPlaybackTime]);

  const noData = !effectiveRange;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-2 bg-black/80 border-t border-green-900/50 px-4 py-2 font-mono text-xs text-green-400 backdrop-blur-sm">
      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={stepBack}
          disabled={noData || playbackMode === "live"}
          className="px-1.5 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30"
          title="Step back 1 min"
        >
          {"<<"}
        </button>
        <button
          onClick={() => {
            if (playbackMode === "live" && effectiveRange) {
              enterPlayback(effectiveRange.end);
              setIsPlaying(true);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
          disabled={noData}
          className="px-2 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30 min-w-[28px]"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying && playbackMode === "playback" ? "||" : "\u25B6"}
        </button>
        <button
          onClick={stepForward}
          disabled={noData || playbackMode === "live"}
          className="px-1.5 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30"
          title="Step forward 1 min"
        >
          {">>"}
        </button>
      </div>

      {/* Scrubber track */}
      <div
        ref={trackRef}
        className="flex-1 h-3 bg-green-950/50 border border-green-900/30 cursor-pointer relative"
        onMouseDown={handleMouseDown}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 bg-green-700/40"
          style={{
            width: `${Math.max(0, Math.min(100, progress * 100))}%`,
          }}
        />
        {/* Scrub head */}
        {playbackMode === "playback" && (
          <div
            className="absolute top-[-2px] w-2 h-[calc(100%+4px)] bg-green-400"
            style={{
              left: `${Math.max(0, Math.min(100, progress * 100))}%`,
              transform: "translateX(-50%)",
            }}
          />
        )}
      </div>

      {/* Time display */}
      <div className="text-right min-w-[120px]">
        {playbackMode === "playback" && playbackTime ? (
          <span>
            {formatDate(playbackTime)} {formatTime(playbackTime)}
          </span>
        ) : (
          <span className="text-green-600">--:--:--</span>
        )}
      </div>

      {/* Speed control */}
      <button
        onClick={cycleSpeed}
        disabled={noData}
        className="px-2 py-0.5 border border-green-900/50 hover:bg-green-900/30 disabled:opacity-30 min-w-[36px]"
        title="Playback speed"
      >
        {playbackSpeed}x
      </button>

      {/* Live button */}
      <button
        onClick={goLive}
        className={`px-2 py-0.5 border font-bold ${
          playbackMode === "live"
            ? "border-red-500 text-red-400 bg-red-950/30"
            : "border-green-900/50 text-green-600 hover:bg-green-900/30"
        }`}
        title="Return to live"
      >
        LIVE
      </button>
    </div>
  );
}
