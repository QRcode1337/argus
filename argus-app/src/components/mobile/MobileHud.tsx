"use client";

import { useMemo } from "react";

import type { MobileHudProps, MobileTabId } from "./MobileHudProps";

type TabDef = {
  id: MobileTabId;
  label: string;
  glyph: string;
};

const TABS: TabDef[] = [
  { id: "brief", label: "Brief", glyph: "◆" },
  { id: "intel", label: "Intel", glyph: "◎" },
  { id: "news", label: "News", glyph: "◫" },
  { id: "ops", label: "Ops", glyph: "⚙" },
  { id: "athena", label: "ATHENA", glyph: "⚡" },
];

function tabTitle(activeTab: MobileTabId | null): string {
  switch (activeTab) {
    case "brief":
      return "Mission Brief";
    case "intel":
      return "Target Intel";
    case "news":
      return "News Feed";
    case "ops":
      return "Operations";
    case "athena":
      return "ATHENA Actions";
    default:
      return "Mobile HUD";
  }
}

/**
 * Mobile HUD shell: animated sheet container + bottom tab bar.
 * Tab body content is provided by the parent via `renderTabContent`.
 */
export function MobileHud({
  activeTab,
  onTabChange,
  renderTabContent,
  selectedIntel,
  athenaPackets,
}: MobileHudProps) {
  const criticalAthenaCount = useMemo(
    () =>
      athenaPackets.filter(
        (packet) =>
          packet.status === "proposed" &&
          (packet.priority === "critical" || packet.priority === "high"),
      ).length,
    [athenaPackets],
  );

  return (
    <div className="md:hidden">
      {/* Backdrop overlay — tap to dismiss */}
      {activeTab ? (
        <div
          className="fixed inset-0 z-40 animate-[fadeIn_200ms_ease-out] bg-black/40"
          onClick={() => onTabChange(null)}
        />
      ) : null}

      {/* Sheet container */}
      {activeTab ? (
        <div className="pointer-events-auto fixed bottom-[calc(var(--safe-bottom)+4.15rem)] left-1/2 z-50 max-h-[56vh] w-[calc(100%-1rem)] max-w-md -translate-x-1/2 animate-[sheetUp_250ms_ease-out] overflow-y-auto rounded-[1.35rem] border border-[#3c3836] bg-[#1d2021f2] shadow-[0_-18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#3c3836] bg-[#1d2021f2] px-4 py-2.5 backdrop-blur-xl">
            <span className="font-mono text-[10px] uppercase tracking-[0.33em] text-[#fabd2f]">
              {tabTitle(activeTab)}
            </span>
            <button
              type="button"
              onClick={() => onTabChange(null)}
              className="rounded border border-[#504945] bg-[#282828] px-2 py-0.5 font-mono text-[9px] text-[#7298a8]"
            >
              Close
            </button>
          </div>

          <div className="p-3">{renderTabContent(activeTab)}</div>
        </div>
      ) : null}

      {/* Bottom tab bar */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-[calc(var(--safe-bottom)+0.35rem)] z-50 flex justify-center px-2">
        <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-[1.35rem] border border-[#3c3836] bg-[#1d2021f2] px-3 py-2 shadow-[0_-18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const showAthenaBadge = tab.id === "athena" && criticalAthenaCount > 0 && !isActive;
            const showIntelBadge = tab.id === "intel" && !!selectedIntel && !isActive;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(isActive ? null : tab.id)}
                className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                  isActive
                    ? "border-[#83a598] bg-[#282828] text-[#ebdbb2]"
                    : "border-[#3c3836] bg-transparent text-[#a89984]"
                }`}
              >
                <span className="text-[14px]" aria-hidden>
                  {tab.glyph}
                </span>
                <span>{tab.label}</span>
                {showAthenaBadge ? (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#fb4934]" />
                ) : null}
                {showIntelBadge ? (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#83a598]" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
