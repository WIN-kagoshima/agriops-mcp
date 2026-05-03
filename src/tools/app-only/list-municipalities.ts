import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ATTRIBUTION,
  COVERED_PREF_CODES,
  getMunicipalitiesByPref,
} from "../../data/municipality-db.js";
import type { Deps } from "../../server/deps.js";
import { registerAppOnlyTool } from "./_helpers.js";

const inputSchema = z
  .object({
    prefectureCode: z.string().regex(/^JP-\d{2}$/),
  })
  .strict();

export function registerListMunicipalities(server: McpServer, deps: Deps): void {
  if (!deps.emaff) return;
  registerAppOnlyTool(
    server,
    "list_municipalities",
    {
      title: "List municipalities (city-level data) for a prefecture",
      description:
        "Returns (cityCode, cityName, lat, lng, topSswCrop) for municipalities that have " +
        "agricultural data in the internal DB. Used by the dashboard map to populate the " +
        "city-level choropleth layer. Read-only.",
      inputSchema,
      deps,
    },
    async (args) => {
      const records = getMunicipalitiesByPref(args.prefectureCode);
      const isCovered = (COVERED_PREF_CODES as readonly string[]).includes(args.prefectureCode);

      const municipalities = records.map((r) => ({
        cityCode: r.cityCode,
        cityName: r.cityName,
        lat: r.lat,
        lng: r.lng,
        topSswCrop: r.topSswCrop,
        topSswScore: r.topSswScore,
        mainCrops: r.mainCrops,
      }));

      return {
        content: [
          {
            type: "text",
            text:
              municipalities.length > 0
                ? `${args.prefectureCode}: ${municipalities.length} 市町村のデータあり`
                : `${args.prefectureCode} は現在データ準備中です (カバー対象: ${(COVERED_PREF_CODES as readonly string[]).join(", ")}）`,
          },
        ],
        structuredContent: {
          prefectureCode: args.prefectureCode,
          municipalities,
          count: municipalities.length,
          isCovered,
          coveredPrefectures: COVERED_PREF_CODES,
          attribution: ATTRIBUTION,
        },
      };
    },
  );
}
