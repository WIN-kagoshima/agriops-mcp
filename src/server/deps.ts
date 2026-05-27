import type {
  EmaffAdapter,
  EstatAdapter,
  FamicAdapter,
  JmaAdapter,
  WeatherAdapter,
} from "../adapters/_interface.js";
import type { TokenStore } from "../auth/token-store.js";
import type { ElicitationStore } from "../elicitation/store.js";
import type { Config } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import type { TaskStore } from "../tasks/index.js";
import type { Metrics } from "./metrics.js";

/**
 * Dependency container injected into every tool/prompt.
 *
 * Adapters that are not yet implemented (e.g. `emaff` in Phase 0) may be
 * `null`. Tool registries gate registration on the presence of the adapters
 * they need.
 */
export interface Deps {
  config: Config;
  logger: Logger;
  weather: WeatherAdapter;
  jma: JmaAdapter | null;
  emaff: EmaffAdapter | null;
  famic: FamicAdapter | null;
  estat: EstatAdapter | null;
  tokenStore: TokenStore | null;
  elicitationStore: ElicitationStore | null;
  iotDb: import("better-sqlite3").Database | null;
  sensorService: import("../services/iot/sensor-service.js").SensorService | null;
  machineService: import("../services/iot/machine-service.js").MachineService | null;
  laborService: import("../services/iot/labor-service.js").LaborService | null;
  traceabilityService: import("../services/iot/traceability-service.js").TraceabilityService | null;
  /**
   * Prometheus metrics registry. When present, tool registrations are
   * automatically wrapped to increment `tool_calls_total` and observe
   * `tool_duration_ms`. Absent in tests that use mock adapters without
   * a transport.
   */
  metrics?: Metrics;
  /**
   * Task store for long-running async tool operations. Defaults to an
   * in-process `InMemoryTaskStore`; replace with a persistent backend
   * (Cloud Firestore, etc.) for multi-replica deployments.
   */
  taskStore?: TaskStore;
  /** ISO timestamp when the server was created — used in attribution lines and Server Card. */
  bootedAt: string;
  /** Server SemVer from package.json. */
  version: string;
}
