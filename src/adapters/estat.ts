/**
 * e-Stat (政府統計の総合窓口) API v3.0 adapter.
 *
 * Provides access to Japanese government statistical data, primarily
 * agricultural census and crop statistics from 農林水産省 (MAFF).
 *
 * API spec: https://www.e-stat.go.jp/api/api-info/e-stat-manual3-0
 * Requires a free appId: https://www.e-stat.go.jp/mypage/login
 *
 * License: 利用規約 requires credit display — the attribution string
 * is embedded in every result.
 */

import { TtlCache } from "../lib/cache.js";
import { UpstreamError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import type {
  EstatClassObj,
  EstatDataResult,
  EstatDataValue,
  EstatStatsListResult,
  EstatTableInfo,
} from "../types/estat.js";
import type { EstatAdapter } from "./_interface.js";

const BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — stats data is annual
const ATTRIBUTION =
  "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。";

export interface EstatApiAdapterOptions {
  appId: string;
  cacheTtlMs?: number;
  logger?: Logger;
  /** Injected fetch — replace in tests with MSW or a fake. */
  fetchImpl?: typeof fetch;
}

// ── Raw JSON response shapes (only consumed fields) ───────────────────

interface RawResult {
  STATUS: number;
  ERROR_MSG: string;
  DATE: string;
}

interface RawTableInf {
  "@id": string;
  STAT_NAME: { "@code": string; $: string };
  GOV_ORG: { "@code": string; $: string };
  STATISTICS_NAME: string;
  TITLE: string | { "@no": string; $: string };
  SURVEY_DATE: string;
  OPEN_DATE: string;
  OVERALL_TOTAL_NUMBER: number;
}

interface RawStatsListResponse {
  GET_STATS_LIST: {
    RESULT: RawResult;
    DATALIST_INF?: {
      NUMBER: number;
      TABLE_INF: RawTableInf | RawTableInf[];
    };
  };
}

interface RawClassObj {
  "@id": string;
  "@name": string;
  CLASS: RawClass | RawClass[];
}

interface RawClass {
  "@code": string;
  "@name": string;
  "@level": string;
  "@unit"?: string;
}

interface RawDataValue {
  $: string;
  "@tab"?: string;
  "@cat01"?: string;
  "@cat02"?: string;
  "@cat03"?: string;
  "@area"?: string;
  "@time"?: string;
  "@unit"?: string;
}

interface RawStatsDataResponse {
  GET_STATS_DATA: {
    RESULT: RawResult;
    PARAMETER?: Record<string, unknown>;
    STATISTICAL_DATA?: {
      RESULT_INF: {
        TOTAL_NUMBER: number;
        FROM_NUMBER: number;
        TO_NUMBER: number;
      };
      TABLE_INF: RawTableInf;
      CLASS_INF: {
        CLASS_OBJ: RawClassObj | RawClassObj[];
      };
      DATA_INF?: {
        VALUE: RawDataValue | RawDataValue[];
        NOTE?: unknown;
      };
    };
  };
}

/**
 * Concrete adapter for the e-Stat API v3.0.
 * Follows the same patterns as `OpenMeteoWeatherAdapter`:
 * - Constructor injection of config + logger + fetchImpl
 * - TtlCache for response-level caching
 * - UpstreamError for API failures
 * - Attribution baked into every result
 */
export class EstatApiAdapter implements EstatAdapter {
  private readonly appId: string;
  private readonly cache: TtlCache<string, unknown>;
  private readonly logger: Logger | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: EstatApiAdapterOptions) {
    this.appId = options.appId;
    this.cache = new TtlCache<string, unknown>(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  // ── searchStats ──────────────────────────────────────────────────────

  async searchStats(input: {
    searchWord?: string;
    statsCode?: string;
    surveyYears?: string;
    statsField?: string;
    limit?: number;
  }): Promise<EstatStatsListResult> {
    const limit = Math.min(input.limit ?? 20, 100);
    const cacheKey = `list:${input.searchWord ?? ""}|${input.statsCode ?? ""}|${input.surveyYears ?? ""}|${input.statsField ?? ""}|${limit}`;

    const cached = this.cache.get(cacheKey) as EstatStatsListResult | undefined;
    if (cached) {
      this.logger?.debug("e-stat searchStats cache hit", { cacheKey });
      return cached;
    }

    const url = new URL(`${BASE_URL}/json/getStatsList`);
    url.searchParams.set("appId", this.appId);
    url.searchParams.set("lang", "J");
    url.searchParams.set("limit", String(limit));
    if (input.searchWord) url.searchParams.set("searchWord", input.searchWord);
    if (input.statsCode) url.searchParams.set("statsCode", input.statsCode);
    if (input.surveyYears) url.searchParams.set("surveyYears", input.surveyYears);
    if (input.statsField) url.searchParams.set("statsField", input.statsField);

    const raw = await this.request<RawStatsListResponse>(url);
    const root = raw.GET_STATS_LIST;
    this.checkResult(root.RESULT, "getStatsList");

    const datalist = root.DATALIST_INF;
    if (!datalist) {
      const result: EstatStatsListResult = { tables: [], totalCount: 0, attribution: ATTRIBUTION };
      this.cache.set(cacheKey, result);
      return result;
    }

    const rawTables = Array.isArray(datalist.TABLE_INF)
      ? datalist.TABLE_INF
      : datalist.TABLE_INF
        ? [datalist.TABLE_INF]
        : [];

    const tables: EstatTableInfo[] = rawTables.map((t) => ({
      id: t["@id"],
      statCode: t.STAT_NAME["@code"],
      statName: t.STAT_NAME.$,
      govOrg: t.GOV_ORG.$,
      title: typeof t.TITLE === "string" ? t.TITLE : t.TITLE.$,
      surveyDate: t.SURVEY_DATE,
      openDate: t.OPEN_DATE,
      overallTotalNumber: Number(t.OVERALL_TOTAL_NUMBER) || 0,
    }));

    const result: EstatStatsListResult = {
      tables,
      totalCount: Number(datalist.NUMBER) || tables.length,
      attribution: ATTRIBUTION,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  // ── getStatsData ─────────────────────────────────────────────────────

  async getStatsData(input: {
    statsDataId: string;
    cdArea?: string;
    cdCat01?: string;
    cdCat02?: string;
    cdTime?: string;
    limit?: number;
    startPosition?: number;
  }): Promise<EstatDataResult> {
    const limit = Math.min(input.limit ?? 100, 100000);
    const cacheKey = `data:${input.statsDataId}|${input.cdArea ?? ""}|${input.cdCat01 ?? ""}|${input.cdCat02 ?? ""}|${input.cdTime ?? ""}|${limit}|${input.startPosition ?? 1}`;

    const cached = this.cache.get(cacheKey) as EstatDataResult | undefined;
    if (cached) {
      this.logger?.debug("e-stat getStatsData cache hit", { cacheKey });
      return cached;
    }

    const url = new URL(`${BASE_URL}/json/getStatsData`);
    url.searchParams.set("appId", this.appId);
    url.searchParams.set("lang", "J");
    url.searchParams.set("statsDataId", input.statsDataId);
    url.searchParams.set("metaGetFlg", "Y");
    url.searchParams.set("limit", String(limit));
    if (input.startPosition) url.searchParams.set("startPosition", String(input.startPosition));
    if (input.cdArea) url.searchParams.set("cdArea", input.cdArea);
    if (input.cdCat01) url.searchParams.set("cdCat01", input.cdCat01);
    if (input.cdCat02) url.searchParams.set("cdCat02", input.cdCat02);
    if (input.cdTime) url.searchParams.set("cdTime", input.cdTime);

    const raw = await this.request<RawStatsDataResponse>(url);
    const root = raw.GET_STATS_DATA;
    this.checkResult(root.RESULT, "getStatsData");

    const stats = root.STATISTICAL_DATA;
    if (!stats) {
      return {
        statsDataId: input.statsDataId,
        title: "",
        surveyDate: "",
        classInfo: [],
        values: [],
        totalCount: 0,
        fromNumber: 0,
        toNumber: 0,
        attribution: ATTRIBUTION,
      };
    }

    const tableTitle =
      typeof stats.TABLE_INF.TITLE === "string" ? stats.TABLE_INF.TITLE : stats.TABLE_INF.TITLE.$;

    // Parse CLASS_INF
    const rawClassObjs = Array.isArray(stats.CLASS_INF.CLASS_OBJ)
      ? stats.CLASS_INF.CLASS_OBJ
      : [stats.CLASS_INF.CLASS_OBJ];

    const classInfo: EstatClassObj[] = rawClassObjs.map((obj) => {
      const rawClasses = Array.isArray(obj.CLASS) ? obj.CLASS : [obj.CLASS];
      return {
        id: obj["@id"],
        name: obj["@name"],
        classes: rawClasses.map((c) => ({
          code: c["@code"],
          name: c["@name"],
          level: c["@level"],
          ...(c["@unit"] ? { unit: c["@unit"] } : {}),
        })),
      };
    });

    // Parse DATA_INF
    const rawValues: RawDataValue[] = stats.DATA_INF
      ? Array.isArray(stats.DATA_INF.VALUE)
        ? stats.DATA_INF.VALUE
        : stats.DATA_INF.VALUE
          ? [stats.DATA_INF.VALUE]
          : []
      : [];

    const values: EstatDataValue[] = rawValues.map((v) => {
      const categories: Record<string, string> = {};
      if (v["@tab"]) categories.tab = v["@tab"];
      if (v["@cat01"]) categories.cat01 = v["@cat01"];
      if (v["@cat02"]) categories.cat02 = v["@cat02"];
      if (v["@cat03"]) categories.cat03 = v["@cat03"];
      if (v["@area"]) categories.area = v["@area"];
      if (v["@time"]) categories.time = v["@time"];
      return {
        value: v.$,
        categories,
        ...(v["@unit"] ? { annotation: v["@unit"] } : {}),
      };
    });

    const result: EstatDataResult = {
      statsDataId: input.statsDataId,
      title: tableTitle,
      surveyDate: stats.TABLE_INF.SURVEY_DATE,
      classInfo,
      values,
      totalCount: Number(stats.RESULT_INF.TOTAL_NUMBER) || 0,
      fromNumber: Number(stats.RESULT_INF.FROM_NUMBER) || 0,
      toNumber: Number(stats.RESULT_INF.TO_NUMBER) || 0,
      attribution: ATTRIBUTION,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async request<T>(url: URL): Promise<T> {
    this.logger?.debug("e-stat request", { url: url.toString().replace(this.appId, "***") });

    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
      });
    } catch (err) {
      throw new UpstreamError("e-stat", "network failure", {
        cause: ((err as Error).message ?? "").replace(this.appId, "***"),
      });
    }

    if (!response.ok) {
      throw new UpstreamError("e-stat", `unexpected status ${response.status}`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new UpstreamError("e-stat", "invalid JSON in upstream response");
    }
  }

  private checkResult(result: RawResult, api: string): void {
    if (result.STATUS !== 0) {
      // Mask appId in upstream error text (defense-in-depth).
      const safeMsg = result.ERROR_MSG?.replace(this.appId, "***") ?? "unknown error";
      throw new UpstreamError("e-stat", `${api} returned status ${result.STATUS}: ${safeMsg}`);
    }
  }
}
