/**
 * topojson-resources.ts — v1.10.0
 *
 * TopoJSON 境界データを MCP リソースとして公開する。
 * UI 側は bridge.fetchResource(uri) で必要なときだけ読み込む（遅延取得）。
 *
 * 提供リソース:
 *   resource://agriops/topojson/japan-prefectures   全国47都道府県
 *   resource://agriops/topojson/kyushu-municipalities   九州8県
 *   resource://agriops/topojson/shikoku-municipalities  四国4県
 *   resource://agriops/topojson/tokai-kinki-chugoku-municipalities  東海・近畿・中国
 *
 * ファイルが存在しない場合は `{ status: "not_built" }` + 構築手順を返す。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";

const ASSETS_DIR = join(fileURLToPath(import.meta.url), "../../../assets/topojson");

const TOPO_FILES = {
  "japan-prefectures": "japan-prefectures.topo.json",
  "kyushu-municipalities": "kyushu-municipalities.topo.json",
  "shikoku-municipalities": "shikoku-municipalities.topo.json",
  "tokai-kinki-chugoku-municipalities": "tokai-kinki-chugoku-municipalities.topo.json",
} as const;

type TopoKey = keyof typeof TOPO_FILES;

function readTopoFile(key: TopoKey): string {
  const filePath = join(ASSETS_DIR, TOPO_FILES[key]);
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return JSON.stringify({
      status: "not_built",
      message:
        `TopoJSON ファイルが見つかりません: ${TOPO_FILES[key]}\n` +
        "以下のコマンドで生成してください:\n  node scripts/build-topojson.mjs",
      uri: `resource://agriops/topojson/${key}`,
    });
  }
}

export function registerTopoJsonResources(server: McpServer, _deps: Deps): void {
  for (const key of Object.keys(TOPO_FILES) as TopoKey[]) {
    const uri = `resource://agriops/topojson/${key}`;
    const resourceKey = key;
    server.registerResource(
      `agriops-topojson-${key}`,
      uri,
      {
        title: `TopoJSON: ${key}`,
        description:
          key === "japan-prefectures"
            ? "全国47都道府県境界 TopoJSON (国土数値情報 N03 由来)"
            : `${key.replace("-municipalities", "")} 地域 市町村境界 TopoJSON`,
        mimeType: "application/json",
      },
      async () => {
        const content = readTopoFile(resourceKey);
        return {
          contents: [{ uri, mimeType: "application/json", text: content }],
        };
      },
    );
  }
}

/** registry に返す URI 一覧 */
export const TOPOJSON_RESOURCE_URIS = Object.keys(TOPO_FILES).map(
  (k) => `resource://agriops/topojson/${k}`,
);
