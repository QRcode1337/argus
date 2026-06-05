import type { ReactNode } from "react";

import type { AthenaActionPacket } from "@/types/athena";
import type { SelectedIntel } from "@/types/intel";

export type MobileTabId = "brief" | "intel" | "news" | "ops" | "athena";

export interface MobileHudProps {
  activeTab: MobileTabId | null;
  onTabChange: (tab: MobileTabId | null) => void;

  /** Render callback providing the body for whichever tab is active. */
  renderTabContent: (tab: MobileTabId) => ReactNode;

  selectedIntel: SelectedIntel | null;
  athenaPackets: AthenaActionPacket[];
}
