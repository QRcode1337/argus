"use client";

import { useEffect, useMemo, useState } from "react";
import { useArgusStore } from "@/store/useArgusStore";
import { ARGUS_CONFIG } from "@/lib/config";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import type { GdeltEvent } from "@/types/gdelt";
import { QUAD_CLASS_COLORS } from "@/types/gdelt";

type Position = [number, number];

type Geometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

type GeoFeature = {
  geometry: Geometry | null;
};

type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

const WORLD_GEOJSON_URL =
  "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const US_STATES_GEOJSON_URL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

const VIEWBOX_WIDTH = 1600;
const VIEWBOX_HEIGHT = 820;

const project = ([lon, lat]: Position): [number, number] => {
  const x = ((lon + 180) / 360) * VIEWBOX_WIDTH;
  const y = ((90 - lat) / 180) * VIEWBOX_HEIGHT;
  return [x, y];
};

const ringToPath = (ring: Position[]): string => {
  if (!Array.isArray(ring) || ring.length === 0) return "";
  const [first, ...rest] = ring;
  const [x0, y0] = project(first);
  const commands = [`M${x0.toFixed(2)},${y0.toFixed(2)}`];
  for (const coord of rest) {
    const [x, y] = project(coord);
    commands.push(`L${x.toFixed(2)},${y.toFixed(2)}`);
  }
  commands.push("Z");
  return commands.join("");
};

const geometryToPath = (geometry: Geometry | null): string => {
  if (!geometry) return "";

  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ringToPath(ring)).join(" ");
  }

  return geometry.coordinates
    .map((polygon) => polygon.map((ring) => ringToPath(ring)).join(" "))
    .join(" ");
};

export function FlatMapView() {
  const [world, setWorld] = useState<GeoFeature[]>([]);
  const [states, setStates] = useState<GeoFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gdeltEvents, setGdeltEvents] = useState<GdeltEvent[]>([]);
  const gdeltVisible = useArgusStore((s) => s.layers.gdelt);

  useEffect(() => {
    if (!gdeltVisible) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const events = await fetchGdeltEvents(ARGUS_CONFIG.endpoints.gdelt);
        if (!cancelled) setGdeltEvents(events);
      } catch {
        // silent — CesiumGlobe handles feed health
      }
    };

    void poll();
    const id = setInterval(poll, ARGUS_CONFIG.pollMs.gdelt);
    return () => { cancelled = true; clearInterval(id); };
  }, [gdeltVisible]);

  useEffect(() => {
    let cancelled = false;

    const loadOutlines = async () => {
      try {
        const [worldRes, statesRes] = await Promise.all([
          fetch(WORLD_GEOJSON_URL, { cache: "force-cache" }),
          fetch(US_STATES_GEOJSON_URL, { cache: "force-cache" }),
        ]);

        if (!worldRes.ok || !statesRes.ok) {
          throw new Error("Failed to load outline map datasets");
        }

        const worldData = (await worldRes.json()) as GeoCollection;
        const statesData = (await statesRes.json()) as GeoCollection;
        if (cancelled) return;

        setWorld(worldData.features ?? []);
        setStates(statesData.features ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Map dataset error");
      }
    };

    void loadOutlines();
    return () => {
      cancelled = true;
    };
  }, []);

  const worldPaths = useMemo(
    () =>
      world
        .map((feature) => geometryToPath(feature.geometry))
        .filter(Boolean),
    [world],
  );

  const statePaths = useMemo(
    () =>
      states
        .map((feature) => geometryToPath(feature.geometry))
        .filter(Boolean),
    [states],
  );

  return (
    <div className="relative h-full w-full bg-[#02070d]">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="Flat outline map"
      >
        <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#070d14" />
        {worldPaths.map((path, idx) => (
          <path
            key={`world-${idx}`}
            d={path}
            fill="#04080f"
            stroke="#2d3d4d"
            strokeWidth={0.85}
          />
        ))}
        {statePaths.map((path, idx) => (
          <path
            key={`state-${idx}`}
            d={path}
            fill="none"
            stroke="#32475d"
            strokeWidth={0.6}
            opacity={0.85}
          />
        ))}
        {gdeltVisible && gdeltEvents.map((event) => {
          const [x, y] = project([event.longitude, event.latitude]);
          const color = QUAD_CLASS_COLORS[event.quadClass as keyof typeof QUAD_CLASS_COLORS] ?? "#888";
          return (
            <circle
              key={event.id}
              cx={x}
              cy={y}
              r={Math.min(4, 1.5 + event.numMentions * 0.15)}
              fill={color}
              fillOpacity={0.7}
              stroke={color}
              strokeWidth={0.3}
              strokeOpacity={0.9}
            >
              <title>{`${event.actionGeoName} — ${event.actor1Name || event.actor1Country} → ${event.actor2Name || event.actor2Country} (${event.numMentions} mentions)`}</title>
            </circle>
          );
        })}
      </svg>

      {error ? (
        <div className="absolute inset-x-4 top-4 rounded border border-[#7a2c2c] bg-[#2c1111] px-3 py-2 font-mono text-[10px] text-[#ffb1b1]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
