import { getPool } from "./db";

export interface FtleSpikeEvent {
  event: string;
  field: string;
  ftle_value: number;
  gradient_magnitude: number;
  gradient_direction: number;
  delta: number;
  window_size: number;
  regime_label?: string;
  timestamp: string;
  node: string;
}

export async function ingestFtleEvent(evt: FtleSpikeEvent): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(
    `INSERT INTO ftle_events
     (event_type, field, ftle_value, gradient_mag, gradient_dir, delta, window_size, regime_label, node, emitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      evt.event,
      evt.field,
      evt.ftle_value,
      evt.gradient_magnitude,
      evt.gradient_direction,
      evt.delta,
      evt.window_size,
      evt.regime_label ?? null,
      evt.node,
      evt.timestamp,
    ]
  );
}
