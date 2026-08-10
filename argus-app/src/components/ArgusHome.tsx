"use client";

import dynamic from "next/dynamic";
import { startTransition, useEffect, useState } from "react";
import { useArgusStore } from "@/store/useArgusStore";

const CesiumGlobe = dynamic(
  () => import("./CesiumGlobe").then((mod) => mod.CesiumGlobe),
  {
    ssr: false,
    loading: () => <ArgusLaunchScreen launching />,
  },
);

type HomeMode = "detecting" | "mobile-lite" | "full";
type GlobeStartupVariant = "default" | "mobile-lite";

const MOBILE_QUERY = "(max-width: 767px)";

function applyMobileGlobePreset() {
  const { setLayer, setSceneMode, setPlatformMode } = useArgusStore.getState();

  setPlatformMode("live");
  setSceneMode("globe_sat");
  setLayer("flights", false);
  setLayer("adsblol", false);
  setLayer("military", false);
  setLayer("satellites", false);
  setLayer("satelliteLinks", false);
  setLayer("seismic", false);
  setLayer("outages", false);
  setLayer("threats", false);
  setLayer("gdelt", false);
  setLayer("anomalies", false);
  setLayer("vessels", false);
  setLayer("firms", false);
  setLayer("instability", false);
  setLayer("weather", false);
  setLayer("bases", false);
}

function ArgusLaunchScreen({ launching = false, onLaunch }: { launching?: boolean; onLaunch?: () => void }) {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b1118] text-[#e7dcc0]">
      <div className="argus-noise pointer-events-none absolute inset-0 z-0" />
      <div className="argus-grid pointer-events-none absolute inset-0 z-0 opacity-60" />

      <div className="relative z-10 flex h-full items-center justify-center px-5">
        <div className="w-full max-w-sm rounded-[28px] border border-[#3c3836] bg-[#11161dcc] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="mb-6 inline-flex rounded-full border border-[#5b4a1f] bg-[#231f16] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f0c674]">
            Mobile Fast Path
          </div>

          <h1 className="font-mono text-[24px] uppercase tracking-[0.16em] text-[#fbf1c7]">
            ARGUS
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-[#c8bea7]">
            The 3D globe is now held back on phones so the site can paint fast instead of stalling under Cesium startup.
          </p>

          <div className="mt-6 rounded-2xl border border-[#3c3836] bg-[#171c23] p-4 text-[13px] leading-6 text-[#aeb7c0]">
            Open the full live globe only when you actually want the heavy view.
          </div>

          <button
            type="button"
            onClick={onLaunch}
            disabled={launching || !onLaunch}
            className="mt-6 w-full rounded-2xl border border-[#f0c674] bg-[#f0c674] px-4 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-[#11161d] transition hover:bg-[#f4d68a] disabled:cursor-wait disabled:opacity-80"
          >
            {launching ? "Launching Live Globe..." : "Launch Live Globe"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ArgusHome() {
  const [mode, setMode] = useState<HomeMode>("detecting");
  const [startupVariant, setStartupVariant] = useState<GlobeStartupVariant>("default");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const mediaQuery = window.matchMedia(MOBILE_QUERY);
      setMode(mediaQuery.matches ? "mobile-lite" : "full");
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  if (mode === "full") {
    return <CesiumGlobe startupVariant={startupVariant} />;
  }

  return (
    <ArgusLaunchScreen
      launching={mode === "detecting"}
      onLaunch={
        mode === "mobile-lite"
          ? () => {
              applyMobileGlobePreset();
              setStartupVariant("mobile-lite");
              startTransition(() => {
                setMode("full");
              });
            }
          : undefined
      }
    />
  );
}
