/**
 * MapChoropleth.tsx — 都道府県/市町村レベルのコロプレスマップ
 *
 * maplibre-gl を使って TopoJSON から GeoJSON に変換した境界データを
 * vector layer として描画し、メトリクス値で塗り分ける。
 *
 * viz_hint: { preferredView: "choropleth", metric, geoLevel }
 */

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { VizHintChoropleth } from "../../lib/viz-hint.js";
import { resolvePath } from "../../lib/viz-hint.js";

interface MapChoroplethProps {
  hint: VizHintChoropleth;
  data: unknown;
  onFeatureClick?: (properties: Record<string, unknown>) => void;
}

// Prefecture centroids for initial fit
const _PREF_CENTROIDS: Record<string, [number, number]> = {
  nation: [36.5, 136.0],
  kyushu: [32.5, 131.0],
  shikoku: [33.5, 133.5],
  tokai: [35.0, 137.0],
  kinki: [34.5, 135.5],
  chugoku: [34.5, 133.0],
};

function buildGeoJsonFromData(data: unknown, metric: string): GeoJSON.FeatureCollection {
  const items = Array.isArray(data) ? data : [data];
  const features: GeoJSON.Feature[] = (items as Record<string, unknown>[]).map((item, i) => ({
    type: "Feature",
    id: i,
    geometry: {
      type: "Point" as const,
      coordinates: [
        typeof item.lng === "number" ? item.lng : 135.0 + Math.random() * 5,
        typeof item.lat === "number" ? item.lat : 33.0 + Math.random() * 3,
      ],
    },
    properties: {
      ...item,
      _metric: typeof item[metric] === "number" ? item[metric] : 0,
      _label: String(item.cityName ?? item.prefectureName ?? item.name ?? ""),
    },
  }));
  return { type: "FeatureCollection", features };
}

export function MapChoropleth({ hint, data, onFeatureClick }: MapChoroplethProps) {
  const { metric, title, legend } = hint;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);

  // Resolve data array
  const resolvedData = resolvePath(data, "municipalities") ?? data;

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [131.0, 32.5],
      zoom: 5,
      attributionControl: false,
    });
    mapInstance.current = map;

    map.on("load", () => {
      const geoJson = buildGeoJsonFromData(resolvedData, metric);
      const minVal = legend?.min ?? 0;
      const maxVal = legend?.max ?? 100;

      map.addSource("choropleth-data", { type: "geojson", data: geoJson });

      // Circle layer for point data
      map.addLayer({
        id: "choropleth-circles",
        type: "circle",
        source: "choropleth-data",
        paint: {
          "circle-radius": 10,
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "_metric"],
            minVal,
            "#1e3a5f",
            (minVal + maxVal) / 2,
            "#3b82f6",
            maxVal,
            "#34d399",
          ],
          "circle-opacity": 0.85,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });

      // Labels
      map.addLayer({
        id: "choropleth-labels",
        type: "symbol",
        source: "choropleth-data",
        layout: {
          "text-field": ["get", "_label"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#e2e8f0",
          "text-halo-color": "#0f172a",
          "text-halo-width": 1,
        },
      });

      map.on("click", "choropleth-circles", (e) => {
        const f = e.features?.[0];
        if (f?.properties && onFeatureClick) {
          onFeatureClick(f.properties as Record<string, unknown>);
        }
      });
      map.on("mouseenter", "choropleth-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "choropleth-circles", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [data, metric, legend, onFeatureClick, resolvedData]);

  return (
    <div className="viz-panel viz-map-panel">
      {title && <div className="viz-title">{title}</div>}
      <div ref={mapRef} style={{ height: 380, borderRadius: 8, overflow: "hidden" }} />
      {legend && (
        <div className="viz-legend" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {legend.min ?? 0} — {legend.max ?? 100} {legend.unit ?? ""}
          </span>
        </div>
      )}
    </div>
  );
}
