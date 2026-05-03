import type {
  EmaffAdapter,
  FamicAdapter,
  JmaAdapter,
  WeatherAdapter,
} from "../adapters/_interface.js";
import type { TokenStore } from "../auth/token-store.js";
import type { ElicitationStore } from "../elicitation/store.js";
import type { Config } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
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
  tokenStore: TokenStore | null;
  elicitationStore: ElicitationStore | null;
  /**
   * Prometheus metrics registry. When present, tool registrations are
   * automatically wrapped to increment `tool_calls_total` and observe
   * `tool_duration_ms`. Absent in tests that use mock adapters without
   * a transport.
   */
  metrics?: Metrics;
  /** ISO timestamp when the server was created — used in attribution lines and Server Card. */
  bootedAt: string;
  /** Server SemVer from package.json. */
  version: string;
}
