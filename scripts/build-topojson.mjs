#!/usr/bin/env node
/**
 * build-topojson.mjs — ビルド時のみ実行する 国土数値情報 TopoJSON 生成スクリプト
 *
 * 使用方法:
 *   node scripts/build-topojson.mjs
 *
 * 前提条件:
 *   npm install -g mapshaper
 *   (または: npx mapshaper)
 *
 * データソース:
 *   国土交通省 国土数値情報「行政区域データ」N03
 *   https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html
 *   ライセンス: 国土数値情報利用規約（CC BY 4.0 互換）
 *
 * 出力先:
 *   assets/topojson/japan-prefectures.topo.json       (~50KB)
 *   assets/topojson/kyushu-municipalities.topo.json   (~700KB)
 *   assets/topojson/shikoku-municipalities.topo.json  (~400KB)
 *   assets/topojson/tokai-kinki-chugoku-municipalities.topo.json (~1MB)
 *
 * 生成されたファイルはリポジトリにコミットし、MCP リソースとして配信する。
 * ユーザーがこのスクリプトを再実行する必要があるのはデータ更新時のみ。
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "assets", "topojson");

if (!existsSync(OUT)) {
  mkdirSync(OUT, { recursive: true });
}

// ── Prefecture level (全国) ──────────────────────────────────────────────
// N03_2024.geojson を事前にダウンロードして data/raw/ に置いてください。
// ダウンロード手順:
//   1. https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html
//   2. 最新年度の「全国」をダウンロード
//   3. ZIP を展開して GeoJSON に変換: ogr2ogr -f GeoJSON N03_2024.geojson N03_2024.shp
//   4. data/raw/N03_2024.geojson として保存
const rawFile = join(ROOT, "data", "raw", "N03_2024.geojson");

if (!existsSync(rawFile)) {
  console.error(`
ERROR: ${rawFile} が見つかりません。
以下の手順でダウンロードしてください:
  1. https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_1.html
  2. 最新年度の「全国」をダウンロードして ZIP を展開
  3. ogr2ogr -f GeoJSON data/raw/N03_2024.geojson <shpファイル>
`);
  process.exit(1);
}

console.log("Building prefecture-level TopoJSON...");
execSync(
  `npx mapshaper "${rawFile}" \
    -dissolve N03_001 \
    -simplify 0.01 \
    -o format=topojson "${join(OUT, "japan-prefectures.topo.json")}"`,
  { stdio: "inherit" },
);

const REGIONS = {
  kyushu: ["40", "41", "42", "43", "44", "45", "46", "47"],
  shikoku: ["36", "37", "38", "39"],
  "tokai-kinki-chugoku": ["21", "23", "24", "29", "30", "33", "34"],
};

for (const [region, prefCodes] of Object.entries(REGIONS)) {
  const filter = prefCodes.map((c) => `N03_001 == "${c}"`).join(" || ");
  console.log(`Building ${region} municipality TopoJSON...`);
  execSync(
    `npx mapshaper "${rawFile}" \
      -filter "${filter}" \
      -simplify 0.05 \
      -o format=topojson "${join(OUT, `${region}-municipalities.topo.json`)}"`,
    { stdio: "inherit" },
  );
}

console.log("Done. Files written to assets/topojson/");
