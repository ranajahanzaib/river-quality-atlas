"use client";

import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Station = {
  wqms_id: string;
  wqms_lon: number;
  wqms_lat: number;
  country_name: string | null;
  gauge_id: string | null;
};

type Props = { onSelect?: (station: Station) => void; compact?: boolean };

export function AtlasMap({ onSelect, compact = false }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("maplibre-gl").Map | null>(null);
  const overlay = useRef<{ setProps: (props: object) => void } | null>(null);
  const select = useRef(onSelect);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [points, setPoints] = useState(0);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let alive = true;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    let requestController: AbortController | null = null;
    void (async () => {
      const maplibre = await import("maplibre-gl");
      const { MapboxOverlay } = await import("@deck.gl/mapbox");
      const { ScatterplotLayer } = await import("@deck.gl/layers");
      if (!alive || !container.current) return;
      // Serve MapLibre's self-contained ESM worker from /public. Webpack's
      // generated module URL is not a valid browser worker URL in Next.js.
      maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
      const instance = new maplibre.Map({
        container: container.current,
        center: [5, 18],
        zoom: compact ? 0.7 : 1.15,
        minZoom: 0,
        maxZoom: 12,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [
            {
              id: "basemap",
              type: "raster",
              source: "osm",
              paint: { "raster-opacity": 0.78 },
            },
          ],
        },
      });
      map.current = instance;
      const deck = new MapboxOverlay({
        interleaved: false,
        layers: [],
        getTooltip: ({ object }: { object?: Station }) =>
          object
            ? {
                text: `${object.wqms_id}\n${object.country_name ?? "Country not reported"}\n${object.gauge_id ? "Linked flow gauge" : "No linked flow gauge"}`,
              }
            : null,
      });
      overlay.current = deck;
      instance.addControl(deck);
      instance.addControl(
        new maplibre.AttributionControl({ compact: true }),
        "bottom-right",
      );

      const refresh = async () => {
        requestController?.abort();
        const controller = new AbortController();
        requestController = controller;
        const bounds = instance.getBounds();
        const params = new URLSearchParams({
          west: String(bounds.getWest()),
          south: String(bounds.getSouth()),
          east: String(bounds.getEast()),
          north: String(bounds.getNorth()),
          limit: "8000",
        });
        try {
          const timeout = AbortSignal.timeout(15000);
          const signal = AbortSignal.any([controller.signal, timeout]);
          const response = await fetch(
            `${API}/api/v1/atlas/stations?${params}`,
            { signal },
          );
          if (!response.ok)
            throw new Error(
              "Station locations are unavailable until Caravan-Qual metadata is imported.",
            );
          const payload: { items: Station[]; truncated: boolean } =
            await response.json();
          if (!alive || controller.signal.aborted) return;
          setPoints(payload.items.length);
          deck.setProps({
            layers: [
              new ScatterplotLayer<Station>({
                id: "water-quality-stations",
                data: payload.items,
                getPosition: (d) => [d.wqms_lon, d.wqms_lat],
                getRadius: 4,
                radiusUnits: "pixels",
                radiusMinPixels: 2.5,
                radiusMaxPixels: 7,
                getFillColor: [54, 214, 194, 210],
                getLineColor: [8, 25, 31, 230],
                lineWidthMinPixels: 0.8,
                stroked: true,
                pickable: true,
                onClick: (info) => {
                  if (info.object) select.current?.(info.object);
                },
                autoHighlight: true,
                highlightColor: [255, 255, 255, 180],
              }),
            ],
          });
          setError(
            payload.truncated
              ? "Showing a bounded sample in this view. Zoom in for more station detail."
              : "",
          );
        } catch (cause) {
          if (!alive || controller.signal.aborted) return;
          setPoints(0);
          setError(
            cause instanceof Error
              ? cause.message
              : "Station layer could not be loaded.",
          );
        }
      };
      instance.on("load", () => {
        if (alive) {
          setLoaded(true);
          void refresh();
        }
      });
      instance.on("moveend", () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => void refresh(), 180);
      });
    })().catch((cause: unknown) => {
      if (alive)
        setError(
          cause instanceof Error
            ? cause.message
            : "Map could not be initialized.",
        );
    });
    return () => {
      alive = false;
      clearTimeout(moveTimer);
      requestController?.abort();
      if (overlay.current && map.current) {
        try {
          map.current.removeControl(
            overlay.current as unknown as import("maplibre-gl").IControl,
          );
        } catch {
          // ignore unmount race
        }
      }
      try {
        map.current?.remove();
      } catch {
        // ignore unmount race
      }
      map.current = null;
      overlay.current = null;
    };
  }, [compact]);

  return (
    <div className={`map-frame ${compact ? "map-frame--compact" : ""}`}>
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive map of Caravan-Qual water quality monitoring stations"
      />
      <div className="map-controls" aria-label="Map controls">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={15} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={15} />
        </button>
        <button
          aria-label="Reset map view"
          onClick={() =>
            map.current?.easeTo({ center: [5, 18], zoom: compact ? 0.7 : 1.15 })
          }
        >
          <RotateCcw size={14} />
        </button>
        <button
          aria-label="Toggle fullscreen map"
          onClick={() => {
            const el = container.current?.parentElement;
            if (el?.requestFullscreen) void el.requestFullscreen();
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
      {(!loaded || error) && (
        <div className="map-notice" role="status">
          <span className="map-notice__icon">{error ? "i" : "·"}</span>
          <span>{error || "Loading geographic layer…"}</span>
        </div>
      )}
      <div className="map-status">
        <span className="live-dot" /> {points.toLocaleString()} stations in view
      </div>
      {!compact && (
        <div className="map-coordinate">GEOGRAPHIC VIEW · WGS 84</div>
      )}
    </div>
  );
}
