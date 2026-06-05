const pool = require("../../db");
const { ensureAthenaSchema } = require("./schema");

function rowToPacket(row) {
  return {
    id: row.id,
    type: "argus.athena.action_packet",
    priority: row.priority,
    status: row.status,
    region: row.region,
    trigger: row.trigger,
    proposedAction: row.proposed_action,
    explanation: row.explanation,
    safeAlternatives: row.safe_alternatives,
    confidence: Number(row.confidence),
    requiresApproval: row.requires_approval,
    machineActions: row.machine_actions,
    decision: row.decision,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function listPackets({ limit = 20, status } = {}) {
  await ensureAthenaSchema();

  const boundedLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 20));
  const params = [];
  let where = "";

  if (status) {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }

  params.push(boundedLimit);
  const result = await pool.query(
    `SELECT *
       FROM athena_action_packets
       ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return result.rows.map(rowToPacket);
}

async function insertPacket(packet) {
  await ensureAthenaSchema();

  await pool.query(
    `INSERT INTO athena_action_packets (
       id,
       priority,
       status,
       region_label,
       region,
       trigger,
       proposed_action,
       explanation,
       safe_alternatives,
       confidence,
       requires_approval,
       machine_actions,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       priority = EXCLUDED.priority,
       status = EXCLUDED.status,
       region_label = EXCLUDED.region_label,
       region = EXCLUDED.region,
       trigger = EXCLUDED.trigger,
       proposed_action = EXCLUDED.proposed_action,
       explanation = EXCLUDED.explanation,
       safe_alternatives = EXCLUDED.safe_alternatives,
       confidence = EXCLUDED.confidence,
       requires_approval = EXCLUDED.requires_approval,
       machine_actions = EXCLUDED.machine_actions,
       updated_at = EXCLUDED.updated_at`,
    [
      packet.id,
      packet.priority,
      packet.status,
      packet.region.label,
      JSON.stringify(packet.region),
      JSON.stringify(packet.trigger),
      JSON.stringify(packet.proposedAction),
      JSON.stringify(packet.explanation),
      JSON.stringify(packet.safeAlternatives),
      packet.confidence,
      packet.requiresApproval,
      JSON.stringify(packet.machineActions),
      packet.createdAt,
      packet.updatedAt,
    ],
  );

  return packet;
}

async function updatePacketDecision(id, decision) {
  await ensureAthenaSchema();

  const result = await pool.query(
    `UPDATE athena_action_packets
        SET status = $2,
            decision = $3::jsonb,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, decision.status, JSON.stringify(decision)],
  );

  if (!result.rows[0]) return null;
  return rowToPacket(result.rows[0]);
}

module.exports = {
  insertPacket,
  listPackets,
  rowToPacket,
  updatePacketDecision,
};
