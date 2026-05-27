import type { Database as Db } from "better-sqlite3";

export interface MachineStatus {
  machineId: string;
  model: string;
  activity: string;
  location: {
    lat: number;
    lng: number;
  };
  battery: number;
  fuel: number;
  lastSeen: string;
  diagnostics: string;
}

interface MachineRow {
  machine_id: string;
  model: string;
  activity: string;
  location_lat: number;
  location_lng: number;
  battery: number;
  fuel: number;
  last_seen: string;
}

export class MachineService {
  constructor(private readonly db: Db) {}

  async getMachineIoTStatus(machineId: string): Promise<MachineStatus | null> {
    let row = this.db
      .prepare(`
      SELECT machine_id, model, activity, location_lat, location_lng, battery, fuel, last_seen
      FROM machine_telemetry
      WHERE machine_id = ?
    `)
      .get(machineId) as MachineRow | undefined;

    // If machine doesn't exist, create a dynamic auto-registered machine (e.g. for testing)
    if (!row) {
      const models = ["Kubota M7-172", "Yanmar YT5113", "DJI Agras T50", "Iseki TJV985"];
      const activities = ["idle", "tilling", "seeding", "spraying", "harvesting"];
      const randomModel = models[Math.floor(Math.random() * models.length)]!;
      const randomActivity = activities[Math.floor(Math.random() * activities.length)]!;
      const now = new Date().toISOString();

      this.db
        .prepare(`
        INSERT INTO machine_telemetry (machine_id, model, activity, location_lat, location_lng, battery, fuel, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          machineId,
          randomModel,
          randomActivity,
          31.596 + (Math.random() - 0.5) * 0.01,
          130.558 + (Math.random() - 0.5) * 0.01,
          95,
          80,
          now,
        );

      row = this.db
        .prepare(`
        SELECT machine_id, model, activity, location_lat, location_lng, battery, fuel, last_seen
        FROM machine_telemetry
        WHERE machine_id = ?
      `)
        .get(machineId) as MachineRow;
    }

    if (!row) return null;

    // Generate diagnostics review
    let diagnostics = "All systems functioning normally.";
    if (row.battery < 20) {
      diagnostics = "Warning: Battery critical. Immediate recharge required.";
    } else if (row.fuel < 15) {
      diagnostics = "Warning: Fuel low. Please refuel before next field run.";
    } else if (row.activity === "spraying" && row.fuel < 35) {
      diagnostics = "Notice: Recommend topping up sprayer tanks before completing the patch.";
    }

    return {
      machineId: row.machine_id,
      model: row.model,
      activity: row.activity,
      location: {
        lat: row.location_lat,
        lng: row.location_lng,
      },
      battery: row.battery,
      fuel: row.fuel,
      lastSeen: row.last_seen,
      diagnostics,
    };
  }
}
