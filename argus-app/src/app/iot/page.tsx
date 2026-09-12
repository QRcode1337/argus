import { DeviceChart } from "./DeviceChart";

export const dynamic = "force-dynamic";

const API_BASE = process.env.ARGUS_API_INTERNAL_URL ?? "http://argus-api:3001/api/iot";

async function fetchDevices() {
  try {
    const res = await fetch(`${API_BASE}/devices`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.devices ?? [];
  } catch {
    return null;
  }
}

type DeviceLocation = { type: "Point"; coordinates: [number, number] } | null;

type Device = {
  device_id: string;
  name: string | null;
  description: string | null;
  location: DeviceLocation;
  meta: Record<string, string>;
  last_seen: string;
  created_at: string;
  last_reading: { metric: string; value: number; unit: string | null; time: string } | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtCoord(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(4);
}

function lastSeenTone(lastSeen: string | null) {
  if (!lastSeen) return "text-[#928374]";
  const ageMin = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (ageMin < 10) return "text-[#8ec07c]";
  if (ageMin < 60) return "text-[#f0c674]";
  return "text-[#fb4934]";
}

function DeviceCard({ device }: { device: Device }) {
  const coord =
    device.location?.type === "Point" ? device.location.coordinates : null;

  return (
    <section className="rounded-2xl border border-[#3c3836] bg-[#11161dcc] p-5 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-[15px] uppercase tracking-[0.14em] text-[#fbf1c7]">
            {device.name ?? device.device_id}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-[#928374]">
            {device.device_id}
            {device.description ? ` · ${device.description}` : ""}
          </p>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${lastSeenTone(device.last_seen)}`}
        >
          {device.last_reading ? "LIVE" : "IDLE"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-[11px] text-[#aeb7c0] sm:grid-cols-4">
        <div className="rounded-xl border border-[#3c3836] bg-[#171c23] p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-[#928374]">Lat</div>
          <div className="mt-1 text-[#e7dcc0]">{fmtCoord(coord?.[1])}</div>
        </div>
        <div className="rounded-xl border border-[#3c3836] bg-[#171c23] p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-[#928374]">Lon</div>
          <div className="mt-1 text-[#e7dcc0]">{fmtCoord(coord?.[0])}</div>
        </div>
        <div className="rounded-xl border border-[#3c3836] bg-[#171c23] p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-[#928374]">Firmware</div>
          <div className="mt-1 text-[#e7dcc0]">
            {device.meta?.firmware ?? "—"}
          </div>
        </div>
        <div className="rounded-xl border border-[#3c3836] bg-[#171c23] p-3">
          <div className="text-[9px] uppercase tracking-[0.16em] text-[#928374]">Last Seen</div>
          <div className={`mt-1 ${lastSeenTone(device.last_seen)}`}>
            {fmtTime(device.last_seen)}
          </div>
        </div>
      </div>

      <DeviceChart deviceId={device.device_id} />
    </section>
  );
}

export default async function IotPage() {
  const devices = await fetchDevices();

  if (devices === null) {
    return (
      <main className="min-h-screen bg-[#0b1118] px-6 py-10 text-[#e7dcc0]">
        <h1 className="font-mono text-[22px] uppercase tracking-[0.2em] text-[#f0c674]">
          Sensor Network
        </h1>
        <p className="mt-4 text-[14px] text-[#aeb7c0]">
          IoT API unreachable — is the argus-api + iot stack up?
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1118] px-6 py-10">
      <header className="mx-auto max-w-6xl">
        <div className="flex items-baseline justify-between">
          <h1 className="font-mono text-[22px] uppercase tracking-[0.2em] text-[#f0c674]">
            Sensor Network
          </h1>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#928374]">
            {devices.length} device{devices.length === 1 ? "" : "s"} · MQTT → Timescale
          </span>
        </div>
        <div className="mt-2 h-px w-full bg-[#3c3836]" />
      </header>

      {devices.length === 0 ? (
        <p className="mx-auto mt-16 max-w-6xl font-mono text-[13px] text-[#928374]">
          No devices registered yet. Have a device publish to{" "}
          <span className="text-[#f0c674]">iot/&lt;device_id&gt;/register</span>
        </p>
      ) : (
        <div className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2">
          {devices.map((d: Device) => (
            <DeviceCard key={d.device_id} device={d} />
          ))}
        </div>
      )}
    </main>
  );
}