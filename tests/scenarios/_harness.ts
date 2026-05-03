/**
 * Shared test harness for eval scenario suites.
 *
 * Each scenario boots an in-memory MCP server with realistic Kagoshima
 * fixtures so the full Phase 0–5 tool surface is exercisable without
 * external network calls or snapshot files.
 *
 * The mock adapters return _deterministic_ data so scenario assertions are
 * reproducible across environments and CI runs.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  EmaffAdapter,
  FamicAdapter,
  JmaAdapter,
  WeatherAdapter,
} from "../../src/adapters/_interface.js";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import type { AreaSummary, Farmland, FarmlandSearchResult } from "../../src/types/farmland.js";
import type { PesticideQueryResult } from "../../src/types/pesticide.js";
import type { WeatherForecast } from "../../src/types/weather.js";

// ---------------------------------------------------------------------------
// Realistic Kagoshima fixtures
// ---------------------------------------------------------------------------

/** A rice paddy (稲) field in Satsumasendai, Kagoshima — fictional but shape-valid. */
export const FIELD_RICE: Farmland = {
  fieldId: "fude-eval-0001",
  polygonId: "poly-eval-0001",
  prefectureCode: "JP-46",
  cityCode: "46203",
  address: "鹿児島県薩摩川内市高城町",
  centroid: { lat: 31.8352, lng: 130.3107 },
  areaM2: 3200,
  registeredCrop: "稲",
  attribution: "農林水産省 農業経営基盤強化促進法 筆ポリゴン (eval fixture)",
};

/** A sweet-potato (さつまいも) field in Minamikyushu, Kagoshima. */
export const FIELD_SWEETPOTATO: Farmland = {
  fieldId: "fude-eval-0002",
  polygonId: "poly-eval-0002",
  prefectureCode: "JP-46",
  cityCode: "46219",
  address: "鹿児島県南九州市知覧町",
  centroid: { lat: 31.3685, lng: 130.4469 },
  areaM2: 8750,
  registeredCrop: "さつまいも",
  attribution: "農林水産省 農業経営基盤強化促進法 筆ポリゴン (eval fixture)",
};

const FAMIC_ATTRIBUTION = "農林水産省 農薬登録情報提供システム (eval fixture)";
const EMAFF_ATTRIBUTION = "農林水産省 農業経営基盤強化促進法 筆ポリゴン (eval fixture)";

const BASE_FORECAST: WeatherForecast = {
  source: "eval-open-meteo",
  attribution: "Weather forecast — Open-Meteo (eval fixture)",
  location: { lat: 31.8352, lng: 130.3107, timezone: "Asia/Tokyo" },
  generatedAt: "2026-05-01T06:00:00Z",
  hourly: [
    {
      time: "2026-05-01T09:00:00Z",
      temperatureC: 22,
      precipitationMm: 0,
      windSpeedMs: 3.2,
      relativeHumidity: 62,
    },
    {
      time: "2026-05-01T12:00:00Z",
      temperatureC: 27,
      precipitationMm: 0,
      windSpeedMs: 4.1,
      relativeHumidity: 55,
    },
    {
      time: "2026-05-01T15:00:00Z",
      temperatureC: 28,
      precipitationMm: 2.5,
      windSpeedMs: 5.8,
      relativeHumidity: 70,
    },
  ],
  alerts: [],
};

const RAINY_FORECAST: WeatherForecast = {
  ...BASE_FORECAST,
  hourly: BASE_FORECAST.hourly.map((h) => ({
    ...h,
    precipitationMm: h.precipitationMm + 18,
    windSpeedMs: h.windSpeedMs + 6,
  })),
};

// ---------------------------------------------------------------------------
// Mock adapter factories
// ---------------------------------------------------------------------------

export function buildEmaff(opts?: {
  /** Fields returned by `search()` and `nearby()`. Defaults to both fixtures. */
  fields?: Farmland[];
  /** Field returned by `get(id)`. Uses a lookup by fieldId if provided. */
  getResult?: Farmland | null;
  /** Result returned by `areaSummary()`. */
  areaSummary?: AreaSummary;
}): EmaffAdapter {
  const fields: Farmland[] = opts?.fields ?? [FIELD_RICE, FIELD_SWEETPOTATO];
  const defaultSummary: AreaSummary = opts?.areaSummary ?? {
    prefectureCode: "JP-46",
    cityCode: null,
    totalFields: 142_800,
    totalAreaHa: 47_200,
    topCrops: [
      { crop: "稲", count: 62_000 },
      { crop: "さつまいも", count: 28_500 },
      { crop: "茶", count: 12_300 },
      { crop: "菜の花", count: 8_900 },
      { crop: "肉用牛", count: 6_100 },
    ],
    attribution: EMAFF_ATTRIBUTION,
  };

  const lookup = new Map<string, Farmland>(fields.map((f) => [f.fieldId, f]));

  return {
    async search({ limit }): Promise<FarmlandSearchResult> {
      const result = fields.slice(0, limit);
      return {
        fields: result,
        nextCursor: null,
        total: result.length,
        attribution: EMAFF_ATTRIBUTION,
      };
    },
    async get(fieldId: string) {
      if (opts?.getResult !== undefined) return opts.getResult;
      return lookup.get(fieldId) ?? null;
    },
    async nearby(_center, _radius, limit): Promise<FarmlandSearchResult> {
      const result = fields.slice(0, limit);
      return {
        fields: result,
        nextCursor: null,
        total: result.length,
        attribution: EMAFF_ATTRIBUTION,
      };
    },
    async areaSummary() {
      return defaultSummary;
    },
  };
}

export function buildFamic(opts?: {
  /** Rules returned by `search()`. Defaults to a rice-blast fungicide and a sweet-potato weevil insecticide. */
  rules?: PesticideQueryResult["rules"];
}): FamicAdapter {
  const rules = opts?.rules ?? [
    {
      registrationId: "EVAL-0001",
      productName: "評価テスト殺菌剤A",
      activeIngredients: ["チウラム", "イプロジオン"],
      targetCrops: ["稲"],
      targetPestsOrDiseases: ["いもち病", "紋枯病"],
      applicationMethod: "茎葉散布",
      preHarvestIntervalDays: 14,
      maxApplicationsPerSeason: 3,
      registrationDate: "2021-04-01",
      expiresAt: "2027-03-31",
      attribution: FAMIC_ATTRIBUTION,
    },
    {
      registrationId: "EVAL-0002",
      productName: "評価テスト殺虫剤B",
      activeIngredients: ["クロルピリホスメチル"],
      targetCrops: ["さつまいも"],
      targetPestsOrDiseases: ["アリモドキゾウムシ", "イモゾウムシ"],
      applicationMethod: "植付前種いも浸漬",
      preHarvestIntervalDays: null,
      maxApplicationsPerSeason: 1,
      registrationDate: "2019-06-01",
      expiresAt: "2028-05-31",
      attribution: FAMIC_ATTRIBUTION,
    },
  ];

  return {
    async search({ limit }): Promise<PesticideQueryResult> {
      return {
        rules: rules.slice(0, limit),
        nextCursor: null,
        attribution: FAMIC_ATTRIBUTION,
      };
    },
    async get(registrationId: string) {
      return rules.find((r) => r.registrationId === registrationId) ?? null;
    },
  };
}

export function buildWeather(opts?: {
  rainy?: boolean;
}): WeatherAdapter {
  const forecast = opts?.rainy ? RAINY_FORECAST : BASE_FORECAST;
  return {
    async getForecast({ lat, lng }) {
      return { ...forecast, location: { ...forecast.location, lat, lng } };
    },
  };
}

export function buildJma(): JmaAdapter {
  return {
    async getActiveWarnings() {
      return {
        warnings: [],
        fetchedAt: new Date().toISOString(),
        attribution: "気象庁防災情報XML (eval fixture)",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Boot helpers
// ---------------------------------------------------------------------------

export interface EvalClient {
  client: Client;
  close: () => Promise<void>;
}

export async function bootClient(opts?: {
  rainyWeather?: boolean;
  emaffFields?: Farmland[];
  famicRules?: PesticideQueryResult["rules"];
}): Promise<EvalClient> {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({
    config,
    logger,
    version: "1.0.0-eval",
    overrides: {
      weather: buildWeather({ rainy: opts?.rainyWeather }),
      jma: buildJma(),
      emaff: buildEmaff({ fields: opts?.emaffFields }),
      famic: buildFamic({ rules: opts?.famicRules }),
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "eval-runner", version: "0.0.1" }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

export function isStringContent(c: unknown): c is { type: string; text: string } {
  return (
    typeof c === "object" &&
    c !== null &&
    typeof (c as { type?: unknown }).type === "string" &&
    typeof (c as { text?: unknown }).text === "string"
  );
}

export function allText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const content = (result as { content?: unknown }).content;
  const list = (Array.isArray(content) ? content : []) as unknown[];
  return list
    .filter(isStringContent)
    .map((c) => c.text)
    .join("\n");
}

export function isErrorResult(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  return (result as { isError?: unknown }).isError === true;
}

export function structuredFields(result: unknown): unknown[] {
  if (typeof result !== "object" || result === null) return [];
  const sc = (result as { structuredContent?: unknown }).structuredContent;
  if (typeof sc !== "object" || sc === null) return [];
  const fields = (sc as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields : [];
}

export function structuredRules(result: unknown): unknown[] {
  if (typeof result !== "object" || result === null) return [];
  const sc = (result as { structuredContent?: unknown }).structuredContent;
  if (typeof sc !== "object" || sc === null) return [];
  const rules = (sc as { rules?: unknown }).rules;
  return Array.isArray(rules) ? rules : [];
}
