#!/usr/bin/env tsx
/**
 * Captures 5 PNG screenshots of the MCP Apps dashboard (`dist/ui/dashboard.html`)
 * for the Anthropic Connectors Directory submission (§6/§8.3 of
 * docs/anthropic-directory-submission.md). Run after `npm run build:ui`:
 *
 *   npx tsx scripts/capture-directory-screenshots.ts
 *
 * A mock `window.mcpApps` bridge is injected before the bundle boots (same
 * technique already documented in §8.3), returning realistic
 * structuredContent shaped exactly like the real dashboard-helper tools
 * (get_municipality_stats / get_ssw_crop_compatibility /
 * get_livestock_regional_stats / get_market_price) so each `viz_hint`-driven
 * view (choropleth / radar / bar_compare / timeseries) renders for real.
 * Screenshots are written to assets/directory-screenshots/ and are NOT a
 * substitute for the final live-host capture noted in §6 — they exist so
 * the submission portal upload step never blocks on "we don't have any
 * screenshots yet".
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..");
const dashboardPath = resolve(repoRoot, "dist/ui/dashboard.html");
const outDir = resolve(repoRoot, "assets/directory-screenshots");

if (!existsSync(dashboardPath)) {
  console.error(`Missing ${dashboardPath} — run "npm run build:ui" first.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// ── Mock tool responses, one per dashboard-helper tool ─────────────────────
// Shapes mirror the real `withVizHint(...)` payloads in src/tools/*.ts.

const MUNICIPALITY_CHOROPLETH = {
  prefectureCode: "JP-46",
  municipalities: [
    {
      cityCode: "46203",
      cityName: "鹿屋市",
      lat: 31.379,
      lng: 130.845,
      topSswScore: 88,
      mainCrops: ["さつまいも", "茶"],
    },
    {
      cityCode: "46201",
      cityName: "鹿児島市",
      lat: 31.596,
      lng: 130.558,
      topSswScore: 72,
      mainCrops: ["茶"],
    },
    {
      cityCode: "46218",
      cityName: "指宿市",
      lat: 31.244,
      lng: 130.657,
      topSswScore: 81,
      mainCrops: ["そら豆"],
    },
    {
      cityCode: "46210",
      cityName: "枕崎市",
      lat: 31.27,
      lng: 130.298,
      topSswScore: 76,
      mainCrops: ["かつお節", "さつまいも"],
    },
    {
      cityCode: "46213",
      cityName: "南さつま市",
      lat: 31.33,
      lng: 130.35,
      topSswScore: 84,
      mainCrops: ["らっきょう"],
    },
  ],
  attribution: "出典: 農林業センサス2020（農林水産省）",
  viz_hint: {
    preferredView: "choropleth",
    metric: "topSswScore",
    geoLevel: "city",
    title: "鹿児島県 市町村別 SSW適性スコア",
    legend: { unit: "点", min: 60, max: 100, tone: "success" },
  },
};

const SSW_RADAR = {
  results: [
    {
      crop: "みかん",
      scores: {
        automationResistance: 18,
        valueDensity: 16,
        seasonalConcentration: 19,
        skillAcquisitionSpeed: 14,
        laborShortageLevel: 17,
      },
      totalScore: 92,
      bestPrefectures: ["和歌山", "愛媛", "静岡"],
      caveat: "収穫期（10月〜1月）に労働需要が集中する。",
    },
  ],
  methodology:
    "自動化困難度・価値密度・季節集中度・技能習得速度・労働力不足度の5軸を100点満点で加重平均。",
  attribution: "出典: 農林水産省 統計データ + スグクル独自スコアリング",
  viz_hint: {
    preferredView: "radar",
    axes: ["自動化困難度", "価値密度", "季節集中度", "技能習得速度", "労働力不足度"],
    scoresPath: "results.0.scores",
    axisMax: 20,
    title: "みかん — SSW 適性レーダー",
  },
};

const LIVESTOCK_BAR_COMPARE = {
  results: [
    { cityName: "鹿屋市", broilerFarms: 42, sswFitScore: 78 },
    { cityName: "曽於市", broilerFarms: 35, sswFitScore: 81 },
    { cityName: "都城市", broilerFarms: 51, sswFitScore: 74 },
    { cityName: "南九州市", broilerFarms: 28, sswFitScore: 69 },
  ],
  attribution: "出典: 畜産統計調査（農林水産省）",
  viz_hint: {
    preferredView: "bar_compare",
    labelKey: "cityName",
    valueKeys: ["sswFitScore"],
    dataPath: "results",
    threshold: 75,
    title: "鹿児島県 畜産地域 SSW適性スコア比較",
    legend: { unit: "点", tone: "success" },
  },
};

const MARKET_PRICE_TIMESERIES = {
  rows: [
    { month: "10月", price: 410, avgPrice: 380 },
    { month: "11月", price: 360, avgPrice: 365 },
    { month: "12月", price: 340, avgPrice: 355 },
    { month: "1月", price: 320, avgPrice: 330 },
    { month: "2月", price: 345, avgPrice: 320 },
  ],
  attribution: "出典: 農林水産省 青果物卸売市場調査",
  viz_hint: {
    preferredView: "timeseries",
    timeKey: "month",
    valueKeys: ["price", "avgPrice"],
    dataPath: "rows",
    title: "みかん 市場価格推移（円/kg）",
  },
};

const RESPONSES: Record<string, { structuredContent: unknown; text: string }> = {
  get_municipality_stats: {
    structuredContent: MUNICIPALITY_CHOROPLETH,
    text: "鹿児島県の市町村別 SSW 適性スコアを表示しました。",
  },
  get_ssw_crop_compatibility: {
    structuredContent: SSW_RADAR,
    text: "みかんの SSW 派遣適性レーダーを表示しました（総合スコア 92点）。",
  },
  get_livestock_regional_stats: {
    structuredContent: LIVESTOCK_BAR_COMPARE,
    text: "鹿児島県の畜産地域別 SSW 適性スコアを比較表示しました。",
  },
  get_market_price: {
    structuredContent: MARKET_PRICE_TIMESERIES,
    text: "みかんの市場価格推移（過去5ヶ月）を表示しました。",
  },
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // A raw JS string (not a Playwright-serialised function) sidesteps a
  // tsx/esbuild `__name` helper mismatch that otherwise throws a
  // ReferenceError inside the injected init script.
  await page.addInitScript(`
    (function () {
      const responses = ${JSON.stringify(RESPONSES)};
      window.mcpApps = {
        callTool: async function (name) {
          const mock = responses[name];
          if (!mock) return { content: [{ type: "text", text: "" }], structuredContent: null };
          return {
            content: [{ type: "text", text: mock.text }],
            structuredContent: mock.structuredContent,
          };
        },
        setView: function () {},
        onStateChange: function () { return function () {}; },
      };
    })();
  `);

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(pathToFileURL(dashboardPath).toString());
  await page.waitForSelector("#root .dashboard-header", { timeout: 10_000 });

  // 1. Initial load — municipality choropleth map.
  await page.waitForSelector(".viz-map-panel", { timeout: 10_000 });
  await page.waitForTimeout(1500); // let maplibre finish its first paint
  await page.screenshot({ path: resolve(outDir, "1-choropleth-municipality-map.png") });

  // 2. SSW crop-compatibility radar.
  await page.getByRole("button", { name: "SSW適性スコア" }).click();
  await page.waitForSelector(".viz-panel svg", { timeout: 10_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, "2-radar-ssw-crop-compatibility.png") });

  // 3. Livestock regional bar comparison.
  await page.getByRole("button", { name: "畜産マップ" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, "3-bar-compare-livestock.png") });

  // 4. Market-price time series.
  await page.getByRole("button", { name: "市場価格" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, "4-timeseries-market-price.png") });

  // 5. CSV export ("take this artifact home") fallback panel — the new
  //    portability feature added for this Directory submission round.
  await page.getByRole("button", { name: "CSV ダウンロード" }).click();
  await page.waitForSelector(".csv-fallback-panel", { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, "5-csv-export-artifact.png") });

  await browser.close();

  if (pageErrors.length > 0) {
    console.warn(`Captured with ${pageErrors.length} uncaught page error(s):`);
    for (const msg of pageErrors) console.warn(`  - ${msg}`);
  }
  console.log(`Wrote 5 screenshots to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
