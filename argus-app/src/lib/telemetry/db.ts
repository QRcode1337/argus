import { Pool } from "pg";

let pool: Pool | null = null;
let checked = false;

export function getPool(): Pool | null {
  if (checked) return pool;
  checked = true;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 5 });
  return pool;
}

export function isDbAvailable(): boolean {
  return getPool() !== null;
}
