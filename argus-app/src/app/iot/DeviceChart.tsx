"use client";

import { useEffect, useMemo, useState } from "react";

type Reading = {
  time: string;
  metric: string;
  value: number;
  unit: string;
};

type DeviceChartProps = {
  deviceId: string;
};

const REFRESH_MS = 30_000;

function Sparkline({
  readings,
  unit,
}: {
  readings: Reading[];
  unit?: string | null;
}) {
  const width = 480;
  const height = 84;

  const points = useMemo(() => {
    if (readings.length === 0) return "";
    const values = readings.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = width / Math.max(readings.length - 1, 1);
    return readings
      .map((r, i) => {
        const x = i * step;
        const y = height - ((r.value - min) / span) * (height - 12) - 6;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [readings]);

  if (readings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#3c3836] bg-[#171c23] px-4 py-6 text-center font-mono text-[11px] text-[#928374]">
        no samples in window
      </div>
    );
  }

  const latest = readings[readings.length - 1];

  return (
    <div className="rounded-xl border border-[#3c3836] bg-[#171c23] p-3">
      <div className="flex items-baseline justify-between font-mono">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#928374]">
          {readings.length} samples
        </span>
        {latest && (
          <span className="text-[13px] text-[#f0c674]">
            {latest.value} {unit ?? ""}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-[84px] w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="#3c3836"
          strokeWidth="1"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#83a598"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function DeviceChart({ deviceId }: DeviceChartProps) {
  const [metrics, setMetrics] = useState<{ metric: string; unit: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMetrics() {
    try {
      const res = await fetch(`/api/iot/metrics?device=${encodeURIComponent(deviceId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMetrics(data.metrics ?? []);
      setActive((prev) => prev ?? data.metrics?.[0]?.metric ?? null);
      return data.metrics ?? [];
    } catch {
      return [];
    }
  }

  async function loadReadings(metric: string | null) {
    if (!metric) return;
    try {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ") + "+00";
      const res = await fetch(
        `/api/iot/readings?device=${encodeURIComponent(deviceId)}&metric=${encodeURIComponent(metric)}&from=${encodeURIComponent(from)}&limit=480`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReadings((data.readings ?? []).reverse());
    } catch {
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await loadMetrics();
      if (cancelled) return;
      await loadReadings(m?.[0]?.metric ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    if (!active) return;
    loadReadings(active);
    const interval = setInterval(() => loadReadings(active), REFRESH_MS);
    return () => clearInterval(interval);
  }, [active, deviceId]);

  if (metrics.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-[#3c3836] bg-[#171c23] px-4 py-5 text-center font-mono text-[11px] text-[#928374]">
        {loading ? "loading metrics…" : "no metrics ingested yet"}
      </div>
    );
  }

  const activeUnit = metrics.find((m) => m.metric === active)?.unit;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {metrics.map((m) => {
          const selected = m.metric === active;
          return (
            <button
              key={m.metric}
              type="button"
              onClick={() => setActive(m.metric)}
              className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                selected
                  ? "border-[#f0c674] bg-[#f0c674] text-[#11161d]"
                  : "border-[#3c3836] text-[#aeb7c0] hover:border-[#83a598]"
              }`}
            >
              {m.metric}
              {m.unit ? ` · ${m.unit}` : ""}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <Sparkline readings={readings} unit={activeUnit} />
      </div>
    </div>
  );
}