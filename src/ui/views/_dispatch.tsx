/**
 * _dispatch.tsx — viz_hint.preferredView でビューコンポーネントを振り分けるディスパッチャ
 *
 * 新ツールは viz_hint を出すだけで自動的に正しいビューにルーティングされる。
 * 未知の preferredView は DataTable にフォールバック。
 */

import type { VizHint } from "../../lib/viz-hint.js";
import { BarCompare } from "./BarCompare.js";
import { CalendarHeatmap } from "./CalendarHeatmap.js";
import { DataTable } from "./DataTable.js";
import { MapChoropleth } from "./MapChoropleth.js";
import { MapZoomDrill } from "./MapZoomDrill.js";
import { Radar } from "./Radar.js";
import { Sankey } from "./Sankey.js";
import { TimeSeries } from "./TimeSeries.js";

interface ViewDispatcherProps {
  hint: VizHint | null;
  data: unknown;
  onDrillDown?: (info: { level: string; code: string; name: string }) => void;
}

export function ViewDispatcher({ hint, data, onDrillDown }: ViewDispatcherProps) {
  if (!hint) {
    return <DataTable hint={{ preferredView: "table" }} data={data} />;
  }

  switch (hint.preferredView) {
    case "radar":
      return <Radar hint={hint} data={data} />;

    case "bar_compare":
      return <BarCompare hint={hint} data={data} />;

    case "timeseries":
      return <TimeSeries hint={hint} data={data} />;

    case "sankey":
      return <Sankey hint={hint} data={data} />;

    case "calendar_heatmap":
      return <CalendarHeatmap hint={hint} data={data} />;

    case "choropleth":
      return (
        <MapChoropleth
          hint={hint}
          data={data}
          onFeatureClick={(props) =>
            onDrillDown?.({
              level: hint.geoLevel ?? "city",
              code: String(props.cityCode ?? props.N03_001 ?? ""),
              name: String(props.cityName ?? props.name ?? props._label ?? ""),
            })
          }
        />
      );

    case "map_zoom":
      return <MapZoomDrill hint={hint} data={data} onDrillDown={onDrillDown} />;

    case "table":
      return <DataTable hint={hint} data={data} />;

    default: {
      // TypeScript exhaustive safety — unknown views fall back to table
      const _exhaustive: never = hint;
      return <DataTable hint={{ preferredView: "table" }} data={_exhaustive as unknown} />;
    }
  }
}
