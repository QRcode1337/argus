import type { AthenaActionPacket, AthenaMachineAction, AthenaMachineActionName, AthenaPacketPriority } from "@/types/athena";
import type { LayerKey } from "@/types/intel";

const ALLOWED_ACTIONS: ReadonlySet<AthenaMachineActionName> = new Set([
  "pin_region",
  "enable_layers",
  "set_watch_window",
  "fly_to",
  "raise_posture",
]);

const ALLOWED_LAYERS: ReadonlySet<LayerKey> = new Set([
  "flights",
  "military",
  "satellites",
  "satelliteLinks",
  "seismic",
  "bases",
  "outages",
  "threats",
  "gdelt",
  "anomalies",
  "weather",
  "vessels",
  "instability",
  "adsblol",
  "firms",
]);

type ExecuteAthenaMachineActionsContext = {
  setLayer: (layer: LayerKey, enabled: boolean) => void;
  onFlyToCoordinates?: (lat: number, lon: number) => void;
  onPinRegion?: (label: string | null) => void;
  onSetWatchUntil?: (timestamp: number | null) => void;
  onSetPosture?: (posture: AthenaPacketPriority | null) => void;
};

function numberParam(action: AthenaMachineAction, key: string): number | null {
  const value = action.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringParam(action: AthenaMachineAction, key: string): string | null {
  const value = action.params[key];
  return typeof value === "string" ? value : null;
}

export function assertAthenaMachineActionAllowed(action: AthenaMachineAction): void {
  if (!ALLOWED_ACTIONS.has(action.action)) {
    throw new Error(`ATHENA machine action '${action.action}' is not allowlisted`);
  }
}

export function executeAthenaMachineActions(
  packet: AthenaActionPacket,
  context: ExecuteAthenaMachineActionsContext,
): void {
  for (const action of packet.machineActions) {
    assertAthenaMachineActionAllowed(action);

    if (action.action === "enable_layers") {
      const layers = action.params.layers;
      if (Array.isArray(layers)) {
        for (const layer of layers) {
          if (typeof layer === "string" && ALLOWED_LAYERS.has(layer as LayerKey)) {
            context.setLayer(layer as LayerKey, true);
          }
        }
      }
      continue;
    }

    if (action.action === "fly_to") {
      const lat = numberParam(action, "lat");
      const lon = numberParam(action, "lon");
      if (lat !== null && lon !== null) {
        context.onFlyToCoordinates?.(lat, lon);
      }
      continue;
    }

    if (action.action === "pin_region") {
      context.onPinRegion?.(stringParam(action, "label") ?? packet.region.label);
      continue;
    }

    if (action.action === "set_watch_window") {
      const durationMinutes = numberParam(action, "durationMinutes") ?? 120;
      context.onSetWatchUntil?.(Date.now() + durationMinutes * 60_000);
      continue;
    }

    if (action.action === "raise_posture") {
      const posture = stringParam(action, "posture");
      context.onSetPosture?.((posture as AthenaPacketPriority | null) ?? packet.priority);
    }
  }
}
