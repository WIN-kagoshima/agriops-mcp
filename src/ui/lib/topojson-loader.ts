/**
 * topojson-loader.ts — TopoJSON をMCPリソースから取得してキャッシュする。
 *
 * UI 側は window.mcpApps (HostBridge) に直接 readResource が無い場合、
 * callTool("fetch_topojson_resource", { uri }) という App-only ツール経由で
 * リソースをフェッチする。ホストが bridge を提供しない場合は null を返す。
 */

type TopoJson = Record<string, unknown>;

const CACHE = new Map<string, TopoJson>();

export const TOPO_URI = {
  prefectures: "resource://agriops/topojson/japan-prefectures",
  kyushu: "resource://agriops/topojson/kyushu-municipalities",
  shikoku: "resource://agriops/topojson/shikoku-municipalities",
  tokai: "resource://agriops/topojson/tokai-kinki-chugoku-municipalities",
} as const;

export type TopoRegion = keyof typeof TOPO_URI;

/** Bridge interface used only for resource fetching */
interface FetchBridge {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Load a TopoJSON from the MCP resource layer. Results are cached in memory.
 *
 * @param uri  A `resource://agriops/topojson/*` URI
 * @param bridge  The app bridge (window.mcpApps or equivalent)
 */
export async function loadTopoJson(
  uri: string,
  bridge: FetchBridge,
): Promise<TopoJson | null> {
  if (CACHE.has(uri)) return CACHE.get(uri) ?? null;

  try {
    const result = await bridge.callTool("fetch_topojson_resource", { uri });
    if (!result || typeof result !== "object") return null;
    const sc = (result as Record<string, unknown>).structuredContent;
    if (sc && typeof sc === "object" && (sc as Record<string, unknown>).topojson) {
      const topo = (sc as Record<string, unknown>).topojson as TopoJson;
      CACHE.set(uri, topo);
      return topo;
    }
    // Fallback: direct content text
    const contents = (result as Record<string, unknown>).content;
    if (Array.isArray(contents)) {
      for (const c of contents) {
        const text = (c as Record<string, unknown>).text;
        if (typeof text === "string") {
          try {
            const parsed = JSON.parse(text) as TopoJson;
            CACHE.set(uri, parsed);
            return parsed;
          } catch { /* continue */ }
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[topojson-loader] fetch failed for", uri, err);
  }
  return null;
}

/**
 * Determine which TopoJSON region covers a given prefecture code.
 */
export function regionForPrefCode(prefCode: string): TopoRegion | null {
  const n = Number.parseInt(prefCode.replace("JP-", ""), 10);
  if (n === 40 || n === 41 || n === 42 || n === 43 || n === 44 || n === 45 || n === 46 || n === 47) return "kyushu";
  if (n === 36 || n === 37 || n === 38 || n === 39) return "shikoku";
  if (n === 21 || n === 23 || n === 24 || n === 29 || n === 30 || n === 33 || n === 34 || n === 35) return "tokai";
  return null;
}

export function clearCache() {
  CACHE.clear();
}
