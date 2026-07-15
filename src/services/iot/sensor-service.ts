import type { Database as Db } from "better-sqlite3";
import type { Deps } from "../../server/deps.js";

export interface SensorData {
  farmId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: string;
  evaluation: string;
}

export class SensorService {
  constructor(
    private readonly db: Db,
    private readonly deps: () => Deps,
  ) {}

  async getRealTimeSensorData(farmId: string, sensorType: string): Promise<SensorData> {
    const depsInstance = this.deps();
    let lat = 31.596;
    let lng = 130.558;

    // 1. Try to fetch farmland centroid using eMAFF adapter
    if (depsInstance.emaff) {
      try {
        const field = await depsInstance.emaff.get(farmId);
        if (field?.centroid) {
          lat = field.centroid.lat;
          lng = field.centroid.lng;
        }
      } catch (err) {
        depsInstance.logger.warn(
          "failed to fetch farmland centroid for sensor service, using fallback",
          {
            farmId,
            error: (err as Error).message,
          },
        );
      }
    }

    // 2. Fetch current weather indicators to compute realistic sensor metrics
    let weatherSoilMoisture: number | undefined;
    let weatherSoilTemp: number | undefined;
    let weatherTemp: number | undefined;
    let weatherHumidity: number | undefined;

    try {
      const forecast = await depsInstance.weather.getForecast({
        lat,
        lng,
        hours: 1,
        timezone: "Asia/Tokyo",
      });
      const firstHour = forecast.hourly?.[0];
      if (firstHour) {
        weatherSoilMoisture = firstHour.soilMoisture;
        weatherSoilTemp = firstHour.soilTemperatureC;
        weatherTemp = firstHour.temperatureC;
        weatherHumidity = firstHour.relativeHumidity;
      }
    } catch (err) {
      depsInstance.logger.warn(
        "failed to fetch weather indicators for sensor simulation, using static formula",
        {
          farmId,
          error: (err as Error).message,
        },
      );
    }

    // 3. Compute metric value based on sensorType with realistic variation
    let value = 0;
    let unit = "";
    let evaluation = "Optimal";

    const variance = (Math.random() - 0.5) * 0.1; // small random noise

    switch (sensorType) {
      case "soil_moisture":
        value =
          weatherSoilMoisture !== undefined ? weatherSoilMoisture + variance : 0.35 + variance;
        value = Math.max(0.1, Math.min(0.6, value)); // clamp
        unit = "m³/m³";
        if (value < 0.2) {
          evaluation = "Dry - Irrigation recommended";
        } else if (value > 0.45) {
          evaluation = "Wet - Drainage needed";
        } else {
          evaluation = "Adequate moisture level";
        }
        break;

      case "soil_temp":
        value =
          weatherSoilTemp !== undefined ? weatherSoilTemp + variance * 5 : 20.0 + variance * 6;
        unit = "°C";
        if (value < 10) {
          evaluation = "Cold - Delayed germination risk";
        } else if (value > 30) {
          evaluation = "Hot - Heat stress risk";
        } else {
          evaluation = "Favorable for root growth";
        }
        break;

      case "ambient_temp":
        value = weatherTemp !== undefined ? weatherTemp + variance * 4 : 22.0 + variance * 8;
        unit = "°C";
        if (value < 15) {
          evaluation = "Cool";
        } else if (value > 32) {
          evaluation = "Hot - Monitor leaf transpiration";
        } else {
          evaluation = "Pleasant grow climate";
        }
        break;

      case "humidity":
        value =
          weatherHumidity !== undefined ? weatherHumidity + variance * 10 : 65.0 + variance * 20;
        value = Math.max(10, Math.min(100, value));
        unit = "%";
        if (value < 40) {
          evaluation = "Dry - Potential spider mite threat";
        } else if (value > 85) {
          evaluation = "Humid - Elevated fungal disease risk";
        } else {
          evaluation = "Safe humidity range";
        }
        break;

      case "npk":
        // Soil nutrients usually don't change hourly, keep a stable profile
        value = 135.0 + variance * 15;
        unit = "mg/kg";
        if (value < 100) {
          evaluation = "Low - Fertilizer booster advised";
        } else if (value > 180) {
          evaluation = "High - Avoid over-fertilization";
        } else {
          evaluation = "Excellent nutrient richness";
        }
        break;

      default:
        throw new Error(`Unsupported sensor type: ${sensorType}`);
    }

    const timestamp = new Date().toISOString();

    // 4. Log telemetry into dynamic database
    this.db
      .prepare(`
      INSERT INTO sensor_logs (farm_id, sensor_type, value, unit, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `)
      .run(farmId, sensorType, value, unit, timestamp);

    return {
      farmId,
      sensorType,
      value: Number.parseFloat(value.toFixed(3)),
      unit,
      timestamp,
      evaluation,
    };
  }
}
