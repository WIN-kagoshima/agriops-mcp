/**
 * MapZoomDrill.tsx — クリック/ピンチでドリルダウンするインタラクティブマップ
 *
 * 国 → 都道府県 → 市町村 のズームドリルを実装する。
 * ESC or breadcrumb クリックで上位階層に戻れる。
 *
 * viz_hint: { preferredView: "map_zoom", geoLevel, center?, zoom? }
 */

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { VizHintMapZoom } from "../../lib/viz-hint.js";

interface MapZoomDrillProps {
  hint: VizHintMapZoom;
  data: unknown;
  onDrillDown?: (info: { level: string; code: string; name: string }) => void;
}

// Default centers by geo level
const DEFAULT_CENTER: Record<string, [number, number]> = {
  prefecture: [32.8, 130.7],  // Kyushu centre
  city: [31.6, 130.6],        // Kagoshima centre
  field: [31.6, 130.6],
};
const DEFAULT_ZOOM: Record<string, number> = {
  nation: 4.5,
  region: 6,
  prefecture: 7,
  city: 10,
  field: 13,
};

export function MapZoomDrill({ hint, data, onDrillDown }: MapZoomDrillProps) {
  const { geoLevel, center, zoom, title } = hint;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);

  const initCenter = center
    ? ([center.lng, center.lat] as [number, number])
    : (DEFAULT_CENTER[geoLevel] ?? [131.0, 32.5] as [number, number]);
  const initZoom = zoom ?? DEFAULT_ZOOM[geoLevel] ?? 6;

  // Extract point features from data (municipalities array)
  const points = (() => {
    const items = Array.isArray(data)
      ? data
      : (() => {
          const sc = data as Record<string, unknown> | null;
          const m = sc?.municipalities;
          return Array.isArray(m) ? m : [];
        })();
    return (items as Record<string, unknown>[]).filter(
      (i) => typeof i.lat === "number" && typeof i.lng === "number",
    );
  })();

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
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: initCenter,
      zoom: initZoom,
      attributionControl: false,
    });
    mapInstance.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    map.on("load", () => {
      if (points.length === 0) return;

      const geoJson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: points.map((p, i) => ({
          type: "Feature",
          id: i,
          geometry: {
            type: "Point" as const,
            coordinates: [p.lng as number, p.lat as number],
          },
          properties: {
            label: String(p.cityName ?? p.name ?? ""),
            code: String(p.cityCode ?? p.prefCode ?? ""),
            score: typeof p.topSswScore === "number" ? p.topSswScore : 0,
            crop: String(p.topSswCrop ?? ""),
          },
        })),
      };

      map.addSource("drill-points", { type: "geojson", data: geoJson });

      map.addLayer({
        id: "drill-circles",
        type: "circle",
        source: "drill-points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 6, 12, 14],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "score"],
            60, "#3b82f6",
            75, "#f59e0b",
            90, "#34d399",
          ],
          "circle-opacity": 0.85,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: "drill-labels",
        type: "symbol",
        source: "drill-points",
        minzoom: 7,
        layout: {
          "text-field": ["get", "label"],
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

      map.on("click", "drill-circles", (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        const props = f.properties as { label: string; code: string; score: number; crop: string };
        new maplibregl.Popup({ closeOnClick: true, maxWidth: "220px" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:13px;color:#0f172a">
              <strong>${props.label}</strong><br/>
              SSWトップ: ${props.crop}<br/>
              SSWスコア: ${props.score}/100
            </div>`,
          )
          .addTo(map);
        onDrillDown?.({ level: geoLevel, code: props.code, name: props.label });
      });

      map.on("mouseenter", "drill-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "drill-circles", () => {
        map.getCanvas().style.cursor = "";
      });

      // Auto-fit bounds if multiple points
      const first = points[0];
      if (points.length > 1 && first) {
        const bounds = points.reduce(
          (b, p) => b.extend([p.lng as number, p.lat as number]),
          new maplibregl.LngLatBounds(
            [first.lng as number, first.lat as number],
            [first.lng as number, first.lat as number],
          ),
        );
        map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 800 });
      }
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [data, geoLevel, initCenter, initZoom, onDrillDown, points]);

  return (
    <div className="viz-panel viz-map-panel">
      {title && <div className="viz-title">{title}</div>}
      <div ref={mapRef} style={{ height: 400, borderRadius: 8, overflow: "hidden" }} />
      <div style={{ marginTop: 4, fontSize: 10, color: "#64748b" }}>
        © OpenStreetMap contributors · クリックで詳細表示
      </div>
    </div>
  );
}
