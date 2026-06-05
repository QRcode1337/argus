const { randomUUID } = require("node:crypto");

const PACKET_TYPE = "argus.athena.action_packet";
const ALLOWED_MACHINE_ACTIONS = new Set([
  "pin_region",
  "enable_layers",
  "set_watch_window",
  "fly_to",
  "raise_posture",
]);

function clampConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function validateMachineActions(actions) {
  if (!Array.isArray(actions)) {
    throw new Error("machineActions must be an array");
  }

  for (const action of actions) {
    if (!action || typeof action !== "object") {
      throw new Error("machine action must be an object");
    }
    if (!ALLOWED_MACHINE_ACTIONS.has(action.action)) {
      throw new Error(`Machine action '${action.action}' is not allowlisted`);
    }
    if (!action.params || typeof action.params !== "object" || Array.isArray(action.params)) {
      throw new Error(`Machine action '${action.action}' params must be an object`);
    }
  }

  return actions;
}

function nowIso() {
  return new Date().toISOString();
}

function asNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function priorityFromAnomaly(severity, chaosScore) {
  const normalizedSeverity = String(severity || "").toLowerCase();
  const score = asNumber(chaosScore, 0);
  if (normalizedSeverity === "critical" || score >= 0.9) return "critical";
  if (normalizedSeverity === "high" || score >= 0.75) return "high";
  if (normalizedSeverity === "medium" || score >= 0.55) return "elevated";
  return "watch";
}

function priorityFromGdelt(eventCount, minGoldstein, maxMentions) {
  if (minGoldstein <= -8 || maxMentions >= 20 || eventCount >= 8) return "high";
  if (minGoldstein <= -6 || maxMentions >= 8 || eventCount >= 3) return "elevated";
  return "watch";
}

function anomalyConfidence(severity, chaosScore) {
  const priority = priorityFromAnomaly(severity, chaosScore);
  const score = asNumber(chaosScore, 0);
  const severityBoost = priority === "critical" ? 0.12 : priority === "high" ? 0.08 : priority === "elevated" ? 0.04 : 0;
  return clampConfidence(score * 0.9 + severityBoost);
}

function gdeltConfidence(events, minGoldstein, maxMentions, maxSources) {
  const volume = Math.min(events.length, 10) / 10;
  const severity = Math.min(Math.abs(minGoldstein), 10) / 10;
  const mentions = Math.min(maxMentions, 30) / 30;
  const sources = Math.min(maxSources, 10) / 10;
  return clampConfidence(0.35 + severity * 0.25 + mentions * 0.18 + sources * 0.14 + volume * 0.08);
}

function commonSafeAlternatives(regionLabel) {
  return [
    {
      label: "Passive watch",
      description: `Keep ${regionLabel} at normal monitoring cadence without changing the live dashboard posture.`,
      tradeoff: "Lowest operational disruption, but slower escalation if the signal strengthens.",
    },
    {
      label: "Analyst review only",
      description: "Create a human review item and defer any live UI posture changes until corroborated.",
      tradeoff: "Improves tradecraft confidence, but delays immediate collection focus.",
    },
    {
      label: "Narrow scope",
      description: `Monitor only the immediate ${regionLabel} vicinity rather than the broader surrounding region.`,
      tradeoff: "Reduces false-positive spread, but may miss adjacent spillover.",
    },
  ];
}

function basePacket(fields) {
  const createdAt = fields.createdAt || nowIso();
  const packet = {
    id: fields.id || randomUUID(),
    type: PACKET_TYPE,
    priority: fields.priority,
    status: "proposed",
    region: fields.region,
    trigger: fields.trigger,
    proposedAction: fields.proposedAction,
    explanation: fields.explanation,
    safeAlternatives: fields.safeAlternatives,
    confidence: clampConfidence(fields.confidence),
    requiresApproval: true,
    machineActions: validateMachineActions(fields.machineActions),
    createdAt,
    updatedAt: fields.updatedAt || createdAt,
  };

  if (!Array.isArray(packet.explanation) || packet.explanation.length === 0) {
    throw new Error("ATHENA packet requires explanation lines");
  }
  if (!Array.isArray(packet.safeAlternatives) || packet.safeAlternatives.length < 3) {
    throw new Error("ATHENA packet requires at least three safe alternatives");
  }

  return packet;
}

function buildPacketFromAnomaly(event) {
  if (!event || typeof event !== "object") {
    throw new Error("anomaly event is required");
  }

  const lat = asNumber(event.lat, null);
  const lon = asNumber(event.lon, null);
  const chaosScore = asNumber(event.chaosScore, 0);
  const anomalyType = String(event.type || "unknown");
  const severity = String(event.severity || "unknown");
  const observedAt = event.timestamp || nowIso();
  const priority = priorityFromAnomaly(severity, chaosScore);
  const regionLabel = event.regionLabel || `${anomalyType.toUpperCase()} anomaly ${lat !== null && lon !== null ? `near ${lat.toFixed(2)}, ${lon.toFixed(2)}` : "region"}`;

  return basePacket({
    priority,
    region: {
      label: regionLabel,
      ...(lat !== null ? { lat } : {}),
      ...(lon !== null ? { lon } : {}),
      radiusKm: priority === "critical" ? 250 : 150,
    },
    trigger: {
      source: "phantom",
      summary: `Phantom reported ${severity} ${anomalyType} anomaly with chaos score ${chaosScore.toFixed(2)}.`,
      observedAt,
      sourceIds: [event.id || `${anomalyType}:${observedAt}`],
      metrics: {
        chaosScore,
        severity,
        lat,
        lon,
      },
    },
    proposedAction: {
      label: priority === "critical" ? "Elevate anomaly monitoring" : "Open focused anomaly watch",
      description: `Increase focus on ${regionLabel}, enable anomaly context, and watch for corroborating seismic, flight, or infrastructure signals.`,
      posture: priority === "critical" || priority === "high" ? "elevate" : "monitor",
    },
    explanation: [
      `OBSERVED Phantom severity ${severity.toUpperCase()} with chaos score ${chaosScore.toFixed(2)}.`,
      `ASSESSED the signal warrants ${priority === "critical" ? "immediate" : "focused"} monitoring because it exceeds baseline anomaly thresholds.`,
      lat !== null && lon !== null
        ? `OBSERVED geospatial fix at ${lat.toFixed(3)}, ${lon.toFixed(3)} supports map-grounded follow-up.`
        : "OBSERVED no precise geospatial fix; keep follow-up scope conservative.",
    ],
    safeAlternatives: commonSafeAlternatives(regionLabel),
    confidence: anomalyConfidence(severity, chaosScore),
    machineActions: [
      { action: "enable_layers", params: { layers: ["anomalies"] } },
      { action: "set_watch_window", params: { durationMinutes: priority === "critical" ? 360 : 120 } },
      ...(lat !== null && lon !== null ? [{ action: "fly_to", params: { lat, lon, heightMeters: 250000 } }] : []),
      { action: "raise_posture", params: { posture: priority } },
    ],
  });
}

function buildPacketFromGdeltEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("at least one GDELT event is required");
  }

  const sorted = [...events].sort((a, b) => Math.abs(asNumber(b.goldsteinScale)) - Math.abs(asNumber(a.goldsteinScale)));
  const lead = sorted[0];
  const minGoldstein = Math.min(...events.map((event) => asNumber(event.goldsteinScale, 0)));
  const maxMentions = Math.max(...events.map((event) => asNumber(event.numMentions, 0)));
  const maxSources = Math.max(...events.map((event) => asNumber(event.numSources, 0)));
  const avgTone = events.reduce((sum, event) => sum + asNumber(event.avgTone, 0), 0) / events.length;
  const materialConflictCount = events.filter((event) => asNumber(event.quadClass, 0) === 4).length;
  const priority = priorityFromGdelt(events.length, minGoldstein, maxMentions);
  const lat = asNumber(lead.latitude, null);
  const lon = asNumber(lead.longitude, null);
  const regionLabel = lead.actionGeoName || lead.actionGeoCountry || "GDELT hotspot";
  const sourceIds = events.map((event) => event.id || event.sourceUrl).filter(Boolean).slice(0, 20);

  return basePacket({
    priority,
    region: {
      label: regionLabel,
      ...(lat !== null ? { lat } : {}),
      ...(lon !== null ? { lon } : {}),
      radiusKm: priority === "high" ? 500 : 250,
    },
    trigger: {
      source: "gdelt",
      summary: `GDELT cluster in ${regionLabel}: ${events.length} high-signal event(s), ${materialConflictCount} material-conflict coded.`,
      observedAt: lead.dateAdded || nowIso(),
      sourceIds,
      metrics: {
        eventCount: events.length,
        materialConflictCount,
        minGoldstein,
        maxMentions,
        maxSources,
        avgTone: Number(avgTone.toFixed(2)),
      },
    },
    proposedAction: {
      label: "Elevate regional monitoring posture",
      description: `Pin ${regionLabel}, enable GDELT context, and watch for corroborating anomalies or news acceleration over the next watch window.`,
      posture: priority === "high" ? "elevate" : "monitor",
    },
    explanation: [
      `OBSERVED ${events.length} GDELT high-signal event(s) centered on ${regionLabel}.`,
      `OBSERVED Goldstein minimum ${minGoldstein.toFixed(1)}, indicating ${minGoldstein <= -7 ? "severe conflict/coercion" : minGoldstein < 0 ? "conflict pressure" : "cooperation or stabilization"}.`,
      `ASSESSED attention is ${maxMentions >= 8 ? "amplifying" : "still thin"}: max mentions ${maxMentions}, max sources ${maxSources}, average tone ${avgTone.toFixed(1)}.`,
    ],
    safeAlternatives: commonSafeAlternatives(regionLabel),
    confidence: gdeltConfidence(events, minGoldstein, maxMentions, maxSources),
    machineActions: [
      { action: "pin_region", params: { label: regionLabel, lat, lon } },
      { action: "enable_layers", params: { layers: ["gdelt"] } },
      { action: "set_watch_window", params: { durationMinutes: priority === "high" ? 360 : 180 } },
      ...(lat !== null && lon !== null ? [{ action: "fly_to", params: { lat, lon, heightMeters: 500000 } }] : []),
      { action: "raise_posture", params: { posture: priority } },
    ],
  });
}

module.exports = {
  ALLOWED_MACHINE_ACTIONS,
  PACKET_TYPE,
  buildPacketFromAnomaly,
  buildPacketFromGdeltEvents,
  clampConfidence,
  priorityFromAnomaly,
  priorityFromGdelt,
  validateMachineActions,
};
