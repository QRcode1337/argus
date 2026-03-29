import { getPool } from "./db";

export interface PneumaLatencyEntry {
  route: string;
  context: string | null;
  latency_ms: number;
  status_code: number;
  model_used?: string;
  provider?: string;
}

export async function logPneumaLatency(entry: PneumaLatencyEntry): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `INSERT INTO pneuma_latency
     (route, context, latency_ms, status_code, model_used, provider, responded_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      entry.route,
      entry.context,
      entry.latency_ms,
      entry.status_code,
      entry.model_used ?? null,
      entry.provider ?? null,
    ]
  );
}
