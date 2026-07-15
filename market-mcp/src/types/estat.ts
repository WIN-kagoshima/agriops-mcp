/**
 * Type definitions for e-Stat (政府統計の総合窓口) API v3.0 responses.
 *
 * Only the fields actually consumed by the adapter are typed.
 * Full spec: https://www.e-stat.go.jp/api/api-info/e-stat-manual3-0
 */

// ----- getStatsList -----

export interface EstatTableInfo {
  /** 統計表ID (e.g. "0003408858") */
  id: string;
  /** 統計調査コード (e.g. "00500209") */
  statCode: string;
  /** 統計調査名 (e.g. "農林業センサス") */
  statName: string;
  /** 政府機関名 (e.g. "農林水産省") */
  govOrg: string;
  /** 統計表タイトル */
  title: string;
  /** 調査年月 */
  surveyDate: string;
  /** 公開日 */
  openDate: string;
  /** 総件数 */
  overallTotalNumber: number;
}

export interface EstatStatsListResult {
  tables: EstatTableInfo[];
  totalCount: number;
  attribution: string;
}

// ----- getStatsData -----

export interface EstatClassObj {
  /** 分類ID (e.g. "tab", "cat01", "area", "time") */
  id: string;
  /** 分類名 (e.g. "表章項目", "地域") */
  name: string;
  /** 分類コードと名前のペア */
  classes: { code: string; name: string; level: string; unit?: string }[];
}

export interface EstatDataValue {
  /** 統計値 */
  value: string;
  /** 分類コードのマッピング ("tab" → code, "cat01" → code, "area" → code, "time" → code) */
  categories: Record<string, string>;
  /** 注記 */
  annotation?: string;
}

export interface EstatDataResult {
  /** 統計表ID */
  statsDataId: string;
  /** 統計表タイトル */
  title: string;
  /** 調査年月 */
  surveyDate: string;
  /** 分類情報 */
  classInfo: EstatClassObj[];
  /** データ値 */
  values: EstatDataValue[];
  /** 総件数 */
  totalCount: number;
  /** 返却開始位置 */
  fromNumber: number;
  /** 返却終了位置 */
  toNumber: number;
  /** 帰属表示 */
  attribution: string;
}
