export type AthenaPacketPriority = "info" | "watch" | "elevated" | "high" | "critical";
export type AthenaPacketStatus = "proposed" | "simulated" | "approved" | "dismissed" | "expired";
export type AthenaSourceType = "gdelt" | "phantom" | "news" | "corroboration" | "manual";
export type AthenaActionPosture = "observe" | "monitor" | "elevate" | "contain" | "defer";
export type AthenaMachineActionName = "pin_region" | "enable_layers" | "set_watch_window" | "fly_to" | "raise_posture";

export interface AthenaRegionRef {
  label: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  bbox?: [number, number, number, number];
  geometry?: Record<string, unknown>;
}

export interface AthenaTrigger {
  source: AthenaSourceType;
  summary: string;
  observedAt: string;
  sourceIds: string[];
  metrics: Record<string, number | string | boolean | null>;
}

export interface AthenaProposedAction {
  label: string;
  description: string;
  posture: AthenaActionPosture;
}

export interface AthenaSafeAlternative {
  label: string;
  description: string;
  tradeoff: string;
}

export interface AthenaMachineAction {
  action: AthenaMachineActionName;
  params: Record<string, string | number | boolean | string[] | null>;
}

export interface AthenaDecision {
  status: Extract<AthenaPacketStatus, "approved" | "dismissed" | "simulated">;
  note: string;
  decidedAt: string;
}

export interface AthenaActionPacket {
  id: string;
  type: "argus.athena.action_packet";
  priority: AthenaPacketPriority;
  status: AthenaPacketStatus;
  region: AthenaRegionRef;
  trigger: AthenaTrigger;
  proposedAction: AthenaProposedAction;
  explanation: string[];
  safeAlternatives: AthenaSafeAlternative[];
  confidence: number;
  requiresApproval: boolean;
  machineActions: AthenaMachineAction[];
  decision?: AthenaDecision | null;
  createdAt: string;
  updatedAt: string;
}

export type AthenaDecisionStatus = AthenaDecision["status"];
