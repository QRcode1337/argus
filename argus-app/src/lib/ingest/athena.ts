import type { AthenaActionPacket, AthenaDecisionStatus } from "@/types/athena";

type AthenaListResponse = {
  packets: AthenaActionPacket[];
};

type AthenaPacketResponse = {
  packet: AthenaActionPacket;
};

export async function fetchAthenaPackets(endpoint: string): Promise<AthenaActionPacket[]> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`ATHENA HTTP ${response.status}`);
  const json = (await response.json()) as AthenaListResponse;
  return json.packets;
}

export async function decideAthenaPacket(
  endpoint: string,
  id: string,
  status: AthenaDecisionStatus,
  note = "",
): Promise<AthenaActionPacket> {
  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });

  if (!response.ok) throw new Error(`ATHENA decision HTTP ${response.status}`);
  const json = (await response.json()) as AthenaPacketResponse;
  return json.packet;
}
