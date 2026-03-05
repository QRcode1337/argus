"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { useArgusStore } from "@/store/useArgusStore";
import { ARGUS_CONFIG } from "@/lib/config";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import type { GdeltEvent } from "@/types/gdelt";
import { QUAD_CLASS_COLORS } from "@/types/gdelt";

const WORLD_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;

export function FlatMapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [gdeltEvents, setGdeltEvents] = useState<GdeltEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const gdeltVisible = useArgusStore((s) => s.layers.gdelt);

  // zoom/pan state
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const applyTransform = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  }, []);

  // GDELT polling
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

  // D3 map rendering
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let cancelled = false;

    const render = async () => {
      try {
        const res = await fetch(WORLD_TOPO_URL, { cache: "force-cache" });
        if (!res.ok) throw new Error("Failed to load world topology");
        const topo = (await res.json()) as Topology;
        if (cancelled) return;

        const sel = d3.select(svg);
        const width = 1600;
        const height = 820;

        sel.attr("viewBox", `0 0 ${width} ${height}`);

        const projection = d3.geoEquirectangular()
          .fitSize([width, height], {
            type: "Sphere",
          } as d3.GeoPermissibleObjects);

        const path = d3.geoPath(projection);

        // background
        sel.append("rect")
          .attr("width", width)
          .attr("height", height)
          .attr("fill", "#1d2021");

        // graticule
        const graticule = d3.geoGraticule10();
        sel.append("path")
          .datum(graticule)
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", "#3c3836")
          .attr("stroke-width", 0.3)
          .attr("opacity", 0.5);

        // countries
        const countries = topojson.feature(
          topo,
          topo.objects.countries as GeometryCollection
        );

        sel.selectAll("path.country")
          .data(countries.features)
          .enter()
          .append("path")
          .attr("class", "country")
          .attr("d", path)
          .attr("fill", "#282828")
          .attr("stroke", "#504945")
          .attr("stroke-width", 0.6);

        // borders
        const mesh = topojson.mesh(
          topo,
          topo.objects.countries as GeometryCollection,
          (a, b) => a !== b
        );
        sel.append("path")
          .datum(mesh)
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", "#665c54")
          .attr("stroke-width", 0.4);

        // Store projection for GDELT markers
        (svg as unknown as { __projection: d3.GeoProjection }).__projection = projection;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Map error");
      }
    };

    void render();
    return () => { cancelled = true; };
  }, []);

  // Zoom via mouse wheel
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.3 : 0.3;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + delta));
      zoomRef.current = next;
      applyTransform();
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [applyTransform]);

  // Pan via mouse drag
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDown = (e: MouseEvent) => {
      draggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      panRef.current.x += dx;
      panRef.current.y += dy;
      applyTransform();
    };

    const onUp = () => {
      draggingRef.current = false;
    };

    container.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      container.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [applyTransform]);

  // Render GDELT markers as SVG circles
  const projection = svgRef.current
    ? (svgRef.current as unknown as { __projection?: d3.GeoProjection }).__projection
    : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#1d2021]"
      style={{ cursor: draggingRef.current ? "grabbing" : "grab" }}
    >
      <div
        ref={wrapperRef}
        className="h-full w-full origin-center"
        style={{ transformOrigin: "center center" }}
      >
        <svg
          ref={svgRef}
          className="h-full w-full"
          role="img"
          aria-label="Zoomable world map"
        >
          {gdeltVisible && projection && gdeltEvents.map((event) => {
            const coords = projection([event.longitude, event.latitude]);
            if (!coords) return null;
            const color = QUAD_CLASS_COLORS[event.quadClass as keyof typeof QUAD_CLASS_COLORS] ?? "#928374";
            return (
              <circle
                key={event.id}
                cx={coords[0]}
                cy={coords[1]}
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
      </div>

      {error ? (
        <div className="absolute inset-x-4 top-4 rounded border border-[#cc241d] bg-[#2e1a1a] px-3 py-2 font-mono text-[10px] text-[#fb4934]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
