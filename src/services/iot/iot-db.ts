import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database, { type Database as Db } from "better-sqlite3";
import type { Logger } from "../../lib/logger.js";

export function initIotDb(dbPath: string, logger?: Logger): Db {
  // Ensure snapshots folder exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  logger?.info("connected to IoT unified database", { path: dbPath });

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farm_id TEXT NOT NULL,
      sensor_type TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_telemetry (
      machine_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      activity TEXT NOT NULL,
      location_lat REAL NOT NULL,
      location_lng REAL NOT NULL,
      battery INTEGER NOT NULL,
      fuel INTEGER NOT NULL,
      last_seen TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traceability_batches (
      batch_id TEXT PRIMARY KEY,
      farm_id TEXT NOT NULL,
      crop TEXT NOT NULL,
      planted_at TEXT NOT NULL,
      harvested_at TEXT,
      shipped_at TEXT,
      pesticides_applied TEXT NOT NULL -- JSON array of objects
    );
  `);

  // Check if we need to seed mock data
  const sensorCount = db.prepare("SELECT COUNT(*) as count FROM sensor_logs").get() as {
    count: number;
  };
  if (sensorCount.count === 0) {
    logger?.info("seeding initial mock IoT data...");

    // Seed Sensors
    const insertSensor = db.prepare(`
      INSERT INTO sensor_logs (farm_id, sensor_type, value, unit, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const farms = ["farm_kagoshima_01", "farm_kagoshima_02", "farm_kagoshima_03"];

    for (const farm of farms) {
      insertSensor.run(farm, "soil_moisture", 0.32, "m³/m³", now);
      insertSensor.run(farm, "soil_temp", 19.5, "°C", now);
      insertSensor.run(farm, "ambient_temp", 22.1, "°C", now);
      insertSensor.run(farm, "humidity", 62.4, "%", now);
      insertSensor.run(farm, "npk", 120.0, "mg/kg", now);
    }

    // Seed Machines
    const insertMachine = db.prepare(`
      INSERT INTO machine_telemetry (machine_id, model, activity, location_lat, location_lng, battery, fuel, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMachine.run("mach_tractor_001", "Kubota M7-172", "tilling", 31.596, 130.558, 98, 72, now);
    insertMachine.run("mach_drone_002", "DJI Agras T40", "idle", 31.597, 130.559, 85, 100, now);
    insertMachine.run("mach_sprayer_003", "Yanmar YV20S", "spraying", 31.595, 130.557, 92, 45, now);

    // Seed Traceability Batches
    const insertBatch = db.prepare(`
      INSERT INTO traceability_batches (batch_id, farm_id, crop, planted_at, harvested_at, shipped_at, pesticides_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const pesticides = JSON.stringify([
      { name: "PesticideA", appliedAt: "2026-04-10T08:00:00Z", amountG: 120 },
      { name: "PesticideB", appliedAt: "2026-05-02T09:30:00Z", amountG: 80 },
    ]);

    insertBatch.run(
      "batch_tea_2026_01",
      "farm_kagoshima_01",
      "Green Tea",
      "2026-03-01T08:00:00Z",
      "2026-05-20T17:00:00Z",
      "2026-05-25T10:00:00Z",
      pesticides,
    );

    insertBatch.run(
      "batch_sweet_potato_2026_02",
      "farm_kagoshima_02",
      "Sweet Potato",
      "2026-04-15T09:00:00Z",
      null,
      null,
      JSON.stringify([]),
    );
  }

  return db;
}
