import type { Metadata } from "next";

import { SpaceThreatDemo } from "@/components/space-threat/SpaceThreatDemo";

export const metadata: Metadata = {
  title: "Space Threat Fusion Demo | ARGUS",
  description: "Unclassified synthetic multi-source orbital threat synthesis demonstrator.",
};

export const dynamic = "force-dynamic";

export default function SpaceThreatDemoPage() {
  return <SpaceThreatDemo />;
}
