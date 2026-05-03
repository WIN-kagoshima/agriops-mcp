# Observability

This document describes the metrics, health, and logging surface of AgriOps MCP for production operators.

## Health endpoints

All endpoints are served on the same port as the MCP endpoint (default `8080`).

| Path | Auth | Description |
|---|---|---|
| `GET /livez` | None | Liveness probe. Returns `200 {"status":"ok","version":"…","name":"agriops-mcp"}` when the process is alive. Returns `503` while graceful-shutdown drain is active. |
| `GET /readyz` | None | Readiness probe. Instantiates the full adapter stack and reports per-adapter status. Use this for Cloud Run startup probes — Cloud Run will not route traffic until it returns `200`. |
| `GET /metrics` | Optional Bearer | Prometheus text exposition (format `0.0.4`). See [Metrics](#metrics) below. |

### `/readyz` response shape

```json
{
  "status": "ready",
  "checks": [
    { "name": "weather",  "ok": true },
    { "name": "jma",      "ok": true },
    { "name": "emaff",    "ok": true },
    { "name": "famic",    "ok": true }
  ],
  "inflight": 0
}
```

`emaff` and `famic` show `"ok": false, "reason": "snapshot missing (Phase 0 mode)"` when the SQLite snapshot files are absent. The service still starts and handles tools that don't depend on those adapters (weather, JMA).

## Metrics

The `/metrics` endpoint exposes Prometheus-compatible text format. No external library is used; the exporter is a small zero-dependency implementation in `src/server/metrics.ts`.

### Securing `/metrics`

Set `AGRIOPS_METRICS_BEARER` to a secret token. The endpoint then requires `Authorization: Bearer <token>`. If the variable is unset the endpoint is open (appropriate for Cloud Run private services where the network itself is the ACL).

```bash
# Cloud Run secret injection
gcloud run services update agriops-mcp \
  --update-secrets=AGRIOPS_METRICS_BEARER=agriops-metrics-bearer:latest \
  --region=asia-northeast1
```

### Metrics catalogue

All series carry the constant labels `service="agriops-mcp"` and `version="<semver>"`.

| Metric | Type | Labels | Description |
|---|---|---|---|
| `mcp_requests_total` | counter | — | Total `/mcp` requests received after host-header check. |
| `rate_limited_total` | counter | — | Requests rejected by the per-IP token-bucket rate limiter. |
| `tool_calls_total` | counter | `tool`, `outcome` | Tool invocations. `outcome` is `ok` or `error`. |
| `tool_duration_ms` | histogram | `tool` | Tool call wall time in milliseconds. Buckets: 5, 10, 25, 50, 100, 250, 500, 1 000, 2 500, 5 000, 10 000. |
| `http_request_duration_ms` | histogram | `route`, `status` | HTTP request wall time. `route` is `/mcp` or `/metrics` etc.; `status` is the HTTP status code string. |

### Example scrape config (Prometheus)

```yaml
scrape_configs:
  - job_name: agriops-mcp
    scheme: https
    static_configs:
      - targets: ["mcp.agriops.dev"]
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/agriops-metrics-token
    # Cloud Run sends gzip — Prometheus handles it automatically.
    tls_config:
      insecure_skip_verify: false
```

### Google Managed Prometheus (Cloud Run)

Cloud Run + Google Managed Prometheus auto-discovers Prometheus metrics via the `run.googleapis.com/startup-cpu-boost: "true"` annotation and a `PodMonitoring` resource:

```yaml
# k8s-style PodMonitoring (GMP)
apiVersion: monitoring.googleapis.com/v1
kind: PodMonitoring
metadata:
  name: agriops-mcp
spec:
  selector:
    matchLabels:
      run.googleapis.com/service-name: agriops-mcp
  endpoints:
    - port: 8080
      path: /metrics
      interval: 60s
      # Use httpHeaders for the Bearer token if AGRIOPS_METRICS_BEARER is set.
      # httpHeaders:
      #   - name: Authorization
      #     value: Bearer <token>
```

For simpler setups, use the [Cloud Run metrics sidecar pattern](https://cloud.google.com/run/docs/tutorials/custom-metrics-opentelemetry) with the OpenTelemetry Collector running as a Cloud Run sidecar.

## Log format

All logs are emitted to `stdout` as newline-delimited JSON (NDJSON). The Google Cloud Logging agent parses the `time`, `level`, and `msg` fields automatically.

### Required fields

| Field | Type | Example | Description |
|---|---|---|---|
| `time` | ISO 8601 string | `"2026-05-01T09:00:00.000Z"` | UTC timestamp. |
| `level` | string | `"info"` | One of `debug`, `info`, `warn`, `error`. |
| `msg` | string | `"tool call"` | Human-readable message. |

### Common optional fields

| Field | Type | Description |
|---|---|---|
| `requestId` | string | Unique per-request ID (set by `X-Request-ID` or generated). |
| `agentId` | string | Agent Gateway identity (from `X-Agent-ID` header, if trusted). |
| `agentOwner` | string | Agent owner label (from `X-Agent-Owner` header, if trusted). |
| `tool` | string | MCP tool name for tool-call log entries. |
| `durationMs` | number | Wall time for the operation. |
| `error` | string | Error message (non-stack; never contains secrets). |

### Log level control

Set `LOG_LEVEL` environment variable to `debug`, `info`, `warn`, or `error`. Default is `info` in production.

```bash
gcloud run services update agriops-mcp \
  --update-env-vars=LOG_LEVEL=debug \
  --region=asia-northeast1
```

### Cloud Logging: structured log example

```json
{
  "time": "2026-05-01T09:12:34.567Z",
  "level": "info",
  "msg": "tool call",
  "requestId": "req-abc123",
  "agentId": "claude-agent-prod-42",
  "agentOwner": "farm-dispatch-team",
  "tool": "search_farmland",
  "durationMs": 12
}
```

Google Cloud Logging maps `level` → `severity` automatically when using the [structured logging format](https://cloud.google.com/logging/docs/structured-logging).

## Tracing

AgriOps MCP does not bundle an OpenTelemetry SDK to keep the npm tarball small. Trace context propagation is done at the reverse-proxy / Agent Gateway layer.

Recommended approach for Cloud Run:

1. Deploy the [OpenTelemetry Collector sidecar](https://cloud.google.com/trace/docs/setup/java-ot) alongside the main container.
2. Configure the collector to export to **Cloud Trace** (OTLP gRPC).
3. Set the `X-Cloud-Trace-Context` header at the Cloud Load Balancer or Agent Gateway; the `requestId` field in every log entry correlates logs to traces.

## Rate limiting

The MCP endpoint uses a per-IP token-bucket rate limiter.

| Parameter | Default | Override |
|---|---|---|
| Refill rate | 10 req/s | `AGRIOPS_RATE_RPS` |
| Burst capacity | 30 requests | `AGRIOPS_RATE_BURST` |

Clients exceeding the limit receive `HTTP 429 Too Many Requests` with a `Retry-After` header. The `rate_limited_total` counter tracks rejections.

An Agent Gateway in front of the service can apply coarser per-agent-identity limits before traffic reaches AgriOps MCP's per-IP limiter. See [`docs/agent-gateway-deployment.md`](./agent-gateway-deployment.md) for placement guidance.

## Snapshot freshness monitoring

Run `npm run snapshots:audit` to verify SQLite snapshot age and integrity:

```bash
npm run snapshots:audit
# or with a stricter freshness requirement:
npm run snapshots:audit -- --max-age-days=30
```

The script exits `1` if any snapshot is missing, its manifest is stale beyond the threshold, or the SHA-256 hash does not match the manifest. Wire this into CI/CD or a cron job to detect silently outdated data.

See `scripts/snapshots-audit.ts` for implementation details.

## Alerting recommendations

| Signal | Condition | Severity |
|---|---|---|
| `/readyz` `emaff.ok = false` | eMAFF snapshot missing | Warning |
| `/readyz` `famic.ok = false` | FAMIC snapshot missing | Warning |
| `rate_limited_total` rate > 100/min | Possible abuse or misconfigured client | Warning |
| `tool_duration_ms_p99` > 5 000 ms | Slow tool response (upstream latency) | Warning |
| `mcp_requests_total` drops to 0 for 5 min | Service unresponsive | Critical |
| 5xx rate > 1% | Error budget burn | Critical |
