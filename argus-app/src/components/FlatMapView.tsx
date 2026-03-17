"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { useArgusStore } from "@/store/useArgusStore";
import { ARGUS_CONFIG } from "@/lib/config";
import { fetchGdeltEvents } from "@/lib/ingest/gdelt";
import type { GdeltEvent } from "@/types/gdelt";
import { QUAD_CLASS_COLORS, QUAD_CLASS_LABELS } from "@/types/gdelt";
import type { ClickedCoordinates, SelectedIntel } from "@/types/intel";

const WORLD_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;

interface FlatMapViewProps {
  onSelectIntel?: (intel: SelectedIntel | null) => void;
  onSelectCoordinates?: (coords: ClickedCoordinates) => void;
}

export function FlatMapView({ onSelectIntel, onSelectCoordinates }: FlatMapViewProps) {
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
          .attr("stroke-width", 0.6)
          .style("cursor", "pointer")
          .on("mouseenter", function () {
            d3.select(this).attr("fill", "#3c3836").attr("stroke", "#83a598").attr("stroke-width", 1);
          })
          .on("mouseleave", function () {
            d3.select(this).attr("fill", "#282828").attr("stroke", "#504945").attr("stroke-width", 0.6);
          })
          .on("click", function (_event, d) {
            const name = (d.properties as { name?: string })?.name ?? "Unknown";
            onSelectIntel?.({
              id: `country-${d.id ?? name}`,
              name,
              kind: "country",
              importance: "normal",
              quickFacts: [
                { label: "Type", value: "Country / Territory" },
                { label: "Region", value: name },
              ],
              fullFacts: [],
              analysisSummary: `${name} is a manually selected political boundary on the flat map. Use this as a geographic anchor for nearby incidents, flights, and intelligence layers.`,
            });
          });

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

        // country labels at centroids
        const labelGroup = sel.append("g").attr("class", "country-labels");
        countries.features.forEach((feature) => {
          const centroid = path.centroid(feature);
          if (!centroid || isNaN(centroid[0]) || isNaN(centroid[1])) return;
          const name = (feature.properties as { name?: string })?.name;
          if (!name) return;
          // compute rough area to skip tiny countries
          const area = path.area(feature);
          if (area < 400) return;
          labelGroup.append("text")
            .attr("x", centroid[0])
            .attr("y", centroid[1])
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", "#a89984")
            .attr("font-family", "'JetBrains Mono', monospace")
            .attr("font-size", area > 8000 ? "7px" : area > 2000 ? "5px" : "4px")
            .attr("letter-spacing", "0.08em")
            .attr("opacity", area > 8000 ? 0.7 : 0.5)
            .attr("pointer-events", "none")
            .text(name.length > 14 ? name.slice(0, 12) + "…" : name);
        });

        // Store projection for GDELT markers
        (svg as unknown as { __projection: d3.GeoProjection }).__projection = projection;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Map error");
      }
    };

    void render();
    return () => { cancelled = true; };
  }, [onSelectIntel]);

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

  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  const handleEventClick = useCallback((event: GdeltEvent) => {
    const quadLabel = QUAD_CLASS_LABELS[event.quadClass] ?? "Unknown";
    onSelectIntel?.({
      id: `gdelt-${event.id}`,
      name: event.actionGeoName || "GDELT Event",
      kind: "gdelt",
      importance: event.quadClass >= 3 ? "important" : "normal",
      quickFacts: [
        { label: "Classification", value: quadLabel },
        { label: "Actors", value: `${event.actor1Name || event.actor1Country || "?"} → ${event.actor2Name || event.actor2Country || "?"}` },
        { label: "Mentions", value: String(event.numMentions) },
        { label: "Sources", value: String(event.numSources) },
        { label: "Goldstein Scale", value: event.goldsteinScale.toFixed(1) },
        { label: "Avg Tone", value: event.avgTone.toFixed(2) },
      ],
      fullFacts: [
        { label: "Event Code", value: event.eventCode },
        { label: "Location", value: `${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}` },
        { label: "Country", value: event.actionGeoCountry },
        { label: "Date", value: event.dateAdded },
        ...(event.sourceUrl ? [{ label: "Source", value: event.sourceUrl }] : []),
      ],
      externalUrl: event.sourceUrl || undefined,
      externalLabel: event.sourceUrl ? "Source Link" : undefined,
      analysisSummary: [
        `${event.actionGeoName || "This location"} registered a ${quadLabel.toLowerCase()} event.`,
        `Actor flow: ${event.actor1Name || event.actor1Country || "Unknown"} → ${event.actor2Name || event.actor2Country || "Unknown"}.`,
        `Coverage volume is ${event.numMentions} mentions across ${event.numSources} sources.`,
        `Goldstein ${event.goldsteinScale.toFixed(1)}, tone ${event.avgTone.toFixed(2)}.`,
      ].join(" "),
      coordinates: {
        lat: event.latitude,
        lon: event.longitude,
      },
    });
  }, [onSelectIntel]);

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
          onClick={(event) => {
            const projectionInstance = (svgRef.current as unknown as { __projection?: d3.GeoProjection }).__projection;
            if (!projectionInstance) return;

            const bounds = svgRef.current?.getBoundingClientRect();
            if (!bounds) return;

            const viewBox = svgRef.current?.viewBox.baseVal;
            const scaleX = viewBox && bounds.width ? viewBox.width / bounds.width : 1;
            const scaleY = viewBox && bounds.height ? viewBox.height / bounds.height : 1;
            const svgX = (event.clientX - bounds.left) * scaleX;
            const svgY = (event.clientY - bounds.top) * scaleY;
            const lonLat = projectionInstance.invert?.([svgX, svgY]);
            if (!lonLat) return;

            onSelectCoordinates?.({
              lat: lonLat[1],
              lon: lonLat[0],
            });
          }}
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
                r={hoveredEvent === event.id ? Math.min(6, 2.5 + event.numMentions * 0.15) : Math.min(4, 1.5 + event.numMentions * 0.15)}
                fill={color}
                fillOpacity={hoveredEvent === event.id ? 1 : 0.7}
                stroke={hoveredEvent === event.id ? "#ebdbb2" : color}
                strokeWidth={hoveredEvent === event.id ? 1 : 0.3}
                strokeOpacity={0.9}
                style={{ cursor: "pointer", transition: "r 0.15s, fill-opacity 0.15s, stroke-width 0.15s" }}
                onMouseEnter={() => setHoveredEvent(event.id)}
                onMouseLeave={() => setHoveredEvent(null)}
                onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}
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
