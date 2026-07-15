import type { Deps } from "../../server/deps.js";

export interface LaborForecast {
  farmId: string;
  farmAddress: string;
  farmAreaHa: number;
  cropType: string;
  daysAhead: number;
  baseWorkersNeeded: number;
  weatherFactor: number;
  adjustedWorkersNeeded: number;
  workPriority: "Low" | "Medium" | "High" | "Critical";
  weatherAlerts: string[];
  suguvisaRecommendation: string;
}

export class LaborService {
  constructor(private readonly deps: () => Deps) {}

  async predictLaborDemand(
    farmId: string,
    cropType: string,
    daysAhead = 7,
  ): Promise<LaborForecast> {
    const depsInstance = this.deps();
    let areaM2 = 25000; // default 2.5 ha
    let address = "Unknown Farmland, Kagoshima";
    let lat = 31.596;
    let lng = 130.558;

    // 1. Fetch farmland data from eMAFF
    if (depsInstance.emaff) {
      try {
        const field = await depsInstance.emaff.get(farmId);
        if (field) {
          areaM2 = field.areaM2;
          address = field.address || "Kagoshima Farmland";
          if (field.centroid) {
            lat = field.centroid.lat;
            lng = field.centroid.lng;
          }
        }
      } catch (err) {
        depsInstance.logger.warn("failed to fetch eMAFF details for labor prediction", {
          farmId,
          error: (err as Error).message,
        });
      }
    }

    const farmAreaHa = areaM2 / 10000;

    // 2. Compute crop factor (base workers per hectare)
    let workersPerHa = 2.0; // fallback
    const normCrop = cropType.toLowerCase();
    if (normCrop.includes("tea") || normCrop.includes("茶")) {
      workersPerHa = 3.5;
    } else if (normCrop.includes("potato") || normCrop.includes("芋")) {
      workersPerHa = 4.2;
    } else if (normCrop.includes("rice") || normCrop.includes("米")) {
      workersPerHa = 1.2; // highly mechanized
    } else if (
      normCrop.includes("fruit") ||
      normCrop.includes("果物") ||
      normCrop.includes("grape") ||
      normCrop.includes("citrus")
    ) {
      workersPerHa = 5.0; // hand-picking
    } else if (normCrop.includes("vegetable") || normCrop.includes("野菜")) {
      workersPerHa = 4.8;
    }

    const baseWorkersNeeded = Math.ceil(farmAreaHa * workersPerHa);

    // 3. Analyze weather forecast to detect work speedups or delay risks
    let weatherFactor = 1.0;
    const weatherAlerts: string[] = [];
    let heavyRainDays = 0;
    let extremeHeatDays = 0;

    try {
      const hoursToQuery = Math.min(168, daysAhead * 24);
      const forecast = await depsInstance.weather.getForecast({
        lat,
        lng,
        hours: hoursToQuery,
        timezone: "Asia/Tokyo",
      });

      if (forecast.hourly && forecast.hourly.length > 0) {
        // Count heavy rain hours (precipitation > 3mm)
        const rainHours = forecast.hourly.filter((h) => (h.precipitationMm || 0) > 3).length;
        if (rainHours > 6) {
          heavyRainDays = Math.ceil(rainHours / 8);
        }

        // Count hot hours (temp > 33C)
        const hotHours = forecast.hourly.filter((h) => (h.temperatureC || 0) >= 33).length;
        if (hotHours > 4) {
          extremeHeatDays = Math.ceil(hotHours / 6);
        }
      }
    } catch (err) {
      depsInstance.logger.warn("failed to include weather coefficient in labor calculation", {
        error: (err as Error).message,
      });
    }

    // Adapt formula based on weather threats
    if (heavyRainDays > 0) {
      // Work needs to be rushed BEFORE the rain, increasing labor demand
      weatherFactor += 0.3 * heavyRainDays;
      weatherAlerts.push(
        `Heavy rain forecast (${heavyRainDays} day(s) impacted). Recommend harvesting crew speedup before soil oversaturates.`,
      );
    }

    if (extremeHeatDays > 0) {
      // Extreme heat slows down manual labor, requiring extra shifts to hit targets
      weatherFactor += 0.2 * extremeHeatDays;
      weatherAlerts.push(
        `Extreme heat threshold exceeded (${extremeHeatDays} day(s) impacted). Additional hydration shifts required.`,
      );
    }

    const adjustedWorkersNeeded = Math.max(1, Math.ceil(baseWorkersNeeded * weatherFactor));

    // 4. Compute urgency priority
    let workPriority: "Low" | "Medium" | "High" | "Critical" = "Medium";
    if (weatherFactor > 1.4) {
      workPriority = "Critical";
    } else if (weatherFactor > 1.1) {
      workPriority = "High";
    } else if (baseWorkersNeeded < 3) {
      workPriority = "Low";
    }

    // 5. Build SuguVisa specific routing recommendations
    let suguvisaRecommendation = "";
    if (workPriority === "Critical" || workPriority === "High") {
      suguvisaRecommendation = `URGENT SUGUVISA DISPATCH: File immediate mobilization for ${adjustedWorkersNeeded} Specified Skilled Workers (特定技能). Prioritize experienced tea/potato harvesters currently active in Kyushu (JP-46 / JP-40) with completed health screening logs.`;
    } else {
      suguvisaRecommendation = `Standard SuguVisa Dispatch: Allocate ${adjustedWorkersNeeded} general agricultural SSWs. Eligible candidates include recent entry-level trainees awaiting regional farming assignment.`;
    }

    return {
      farmId,
      farmAddress: address,
      farmAreaHa: Number.parseFloat(farmAreaHa.toFixed(2)),
      cropType,
      daysAhead,
      baseWorkersNeeded,
      weatherFactor: Number.parseFloat(weatherFactor.toFixed(2)),
      adjustedWorkersNeeded,
      workPriority,
      weatherAlerts,
      suguvisaRecommendation,
    };
  }
}
