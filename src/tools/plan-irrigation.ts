import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "plan_irrigation",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 12,
};

export const inputSchema = z
  .object({
    farmId: z.string().describe("Target farmland ID (eMAFF polygon reference)."),
  })
  .strict();

export function registerPlanIrrigation(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Plan Farmland Irrigation",
      description:
        "Formulates an optimized irrigation schedule and watering amount. " +
        "Applies a soil water balance formula incorporating real-time soil moisture sensors, " +
        "forecasted precipitation, and reference evapotranspiration (ET₀) evapotranspiration.",
      inputSchema: inputSchema.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            },
          ],
        };
      }

      const { farmId } = parsed.data;

      try {
        if (!deps.sensorService) {
          return {
            isError: true,
            content: [{ type: "text", text: "Sensor service is not available on this server." }],
          };
        }

        // 1. Fetch current soil moisture
        const sensorData = await deps.sensorService.getRealTimeSensorData(farmId, "soil_moisture");
        const currentMoisture = sensorData.value;

        // 2. Resolve farm centroid for weather forecast
        let lat = 31.596;
        let lng = 130.558;
        if (deps.emaff) {
          const field = await deps.emaff.get(farmId);
          if (field?.centroid) {
            lat = field.centroid.lat;
            lng = field.centroid.lng;
          }
        }

        // 3. Fetch ET0 and precipitation for next 24 hours
        let totalEt0 = 0.0;
        let totalRain = 0.0;
        try {
          const weather = await deps.weather.getForecast({
            lat,
            lng,
            hours: 24,
            timezone: "Asia/Tokyo",
          });
          if (weather.hourly) {
            totalEt0 = weather.hourly.reduce((acc, h) => acc + (h.et0EvapotranspirationMm || 0), 0);
            totalRain = weather.hourly.reduce((acc, h) => acc + (h.precipitationMm || 0), 0);
          }
        } catch (err) {
          deps.logger.warn("failed to query ET0 values, using baseline estimate", {
            error: (err as Error).message,
          });
          totalEt0 = 3.5; // baseline summer day ET0 (mm/day)
        }

        // 4. FAO-56 water balance equation
        // Target moisture: 0.35 m3/m3. Soil root depth constant ~ 300mm.
        // Moisture deficit: (0.35 - currentMoisture) * 300 mm + ET0 - Rain
        const targetMoisture = 0.35;
        const rootZoneDepthMm = 300;
        const moistureDeficitMm =
          (targetMoisture - currentMoisture) * rootZoneDepthMm + totalEt0 - totalRain;

        let irrigationNeeded = false;
        let waterAmountMm = 0.0;
        let scheduleAdvice = "Irrigation is not required today.";

        if (currentMoisture < 0.22) {
          irrigationNeeded = true;
          waterAmountMm = Math.max(5.0, Number.parseFloat(moistureDeficitMm.toFixed(1)));
          scheduleAdvice = `CRITICAL: Soil moisture is low (${currentMoisture.toFixed(3)} m³/m³). Apply ${waterAmountMm} mm of water immediately.`;
        } else if (moistureDeficitMm > 8.0 && totalRain < 1.0) {
          irrigationNeeded = true;
          waterAmountMm = Number.parseFloat(Math.min(25.0, moistureDeficitMm).toFixed(1));
          scheduleAdvice = `Recommend moderate watering: Apply ${waterAmountMm} mm in early morning shifts to offset reference ET₀ loss (${totalEt0.toFixed(1)} mm).`;
        } else if (totalRain > 10.0) {
          scheduleAdvice = `Rainfall predicted (${totalRain.toFixed(1)} mm next 24h). Keep valves shut to prevent root oversaturation.`;
        } else {
          scheduleAdvice = `Soil moisture is at a healthy state (${currentMoisture.toFixed(3)} m³/m³). Evapotranspiration is balanced. No immediate action needed.`;
        }

        const report = {
          farmId,
          centroid: { lat, lng },
          currentSoilMoisture: currentMoisture,
          predictedPrecipitationMm: Number.parseFloat(totalRain.toFixed(1)),
          evapotranspirationEt0Mm: Number.parseFloat(totalEt0.toFixed(1)),
          irrigationNeeded,
          recommendedWaterMm: waterAmountMm,
          scheduleAdvice,
          attribution: "Calculated via FAO-56 Penman-Monteith & live Open-Meteo sensors",
        };

        return {
          content: [
            { type: "text", text: `Irrigation advice for farm [${farmId}]:` },
            { type: "text", text: scheduleAdvice },
            {
              type: "text",
              text: `Telemetry Summary: Soil Moisture = ${currentMoisture.toFixed(3)} m³/m³, 24h Evapotranspiration = ${totalEt0.toFixed(1)} mm, 24h Rain = ${totalRain.toFixed(1)} mm.`,
            },
          ],
          structuredContent: report as unknown as Record<string, unknown>,
        };
      } catch (err) {
        deps.logger.error("plan_irrigation failed", {
          error: (err as Error).message,
          farmId,
        });
        return {
          isError: true,
          content: [{ type: "text", text: `Execution error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
