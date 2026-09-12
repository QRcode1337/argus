"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  SPACE_THREAT_SCENARIO,
  effectiveEvidenceWeight,
  formatPercent,
  fuseSpaceThreatScenario,
  type ConfidenceContribution,
  type SpaceThreatAssessment,
  type SpaceThreatObservation,
} from "@/lib/spaceThreat/demoScenario";
import type { SpaceThreatGlobeFrame } from "./SpaceThreatGlobe";

const SpaceThreatGlobe = dynamic(
  () => import("./SpaceThreatGlobe").then((module) => module.SpaceThreatGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-2xl border border-[#3c3836] bg-[#080d12] font-mono text-[10px] uppercase tracking-[0.22em] text-[#83a598]">
        Initializing orbital scene…
      </div>
    ),
  },
);

type RunStatus = "idle" | "running" | "paused" | "complete" | "error";

type EvaluationResponse = {
  runId: string;
  receivedAt: string;
  completedAt: string;
  serverTiming: { fusionMs: number };
  scenarioId: string;
  observation: SpaceThreatObservation;
  visibleObservations: SpaceThreatObservation[];
  assessment: SpaceThreatAssessment;
};

type RenderedStep = {
  runId: string;
  observation: SpaceThreatObservation;
  assessment: SpaceThreatAssessment;
  ingressStartedAt: number;
  fusionMs: number;
  domLatencyMs: number | null;
  globeLatencyMs: number | null;
};

const INITIAL_ASSESSMENT = fuseSpaceThreatScenario(0);
const DIU_SOLICITATION_URL = "https://www.diu.mil/work-with-us/submit-solution/PROJ00716";
const LATENCY_THRESHOLD_MS = 5_000;
const DEVELOPMENT_BUILD = process.env.NODE_ENV !== "production";

const panelClass = "rounded-2xl border border-[#3c3836] bg-[#171c23e8] shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur";

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (delayMs <= 0) return Promise.resolve(!signal.aborted);

  return new Promise((resolve) => {
    const onAbort = () => {
      window.clearTimeout(timerId);
      resolve(false);
    };
    const timerId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function formatLatency(value: number | null): string {
  if (value === null) return "—";
  if (value < 10) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

function stanceClasses(stance: SpaceThreatObservation["stance"]): string {
  if (stance === "supports") return "border-[#7c631b] bg-[#2a2312] text-[#fabd2f]";
  if (stance === "contradicts") return "border-[#496c45] bg-[#152416] text-[#8ec07c]";
  return "border-[#504945] bg-[#282828] text-[#a89984]";
}

function bandClasses(band: SpaceThreatAssessment["confidenceBand"]): string {
  if (band === "high") return "border-[#9d3329] bg-[#2f1717] text-[#fb4934]";
  if (band === "elevated") return "border-[#7c631b] bg-[#2a2312] text-[#fabd2f]";
  if (band === "contested") return "border-[#3d6571] bg-[#13242b] text-[#83c5d8]";
  return "border-[#504945] bg-[#242424] text-[#a89984]";
}

function ConfidenceTimeline({ steps }: { steps: RenderedStep[] }) {
  const values = [SPACE_THREAT_SCENARIO.priorProbability, ...steps.map((step) => step.assessment.confidence)];
  const pointString = values
    .map((value, index) => {
      const x = values.length === 1 ? 12 : 12 + (index / (values.length - 1)) * 276;
      const y = 82 - value * 68;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={`${panelClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#83a598]">Confidence history</div>
          <p className="mt-1 text-[10px] leading-4 text-[#928374]">Claim support, not probability of hostile intent.</p>
        </div>
        <div className="rounded border border-[#504945] bg-[#1d2021] px-2 py-1 font-mono text-[9px] text-[#d5c4a1]">
          Prior {formatPercent(SPACE_THREAT_SCENARIO.priorProbability)}
        </div>
      </div>

      <svg viewBox="0 0 300 96" className="mt-3 h-24 w-full" role="img" aria-label="Confidence evolution chart">
        {[0.2, 0.4, 0.6, 0.8].map((tick) => {
          const y = 82 - tick * 68;
          return (
            <g key={tick}>
              <line x1="12" x2="288" y1={y} y2={y} stroke="#3c3836" strokeWidth="1" strokeDasharray="3 4" />
              <text x="2" y={y + 3} fill="#665c54" fontSize="7">{Math.round(tick * 100)}</text>
            </g>
          );
        })}
        <polyline points={pointString} fill="none" stroke="#fabd2f" strokeWidth="2.5" strokeLinejoin="round" />
        {values.map((value, index) => {
          const x = values.length === 1 ? 12 : 12 + (index / (values.length - 1)) * 276;
          const y = 82 - value * 68;
          const stance = index === 0 ? null : steps[index - 1]?.observation.stance;
          const fill = stance === "contradicts" ? "#8ec07c" : index === 0 ? "#83a598" : "#fabd2f";
          return (
            <g key={`${index}-${value}`}>
              <circle cx={x} cy={y} r="4" fill={fill} stroke="#11161d" strokeWidth="2" />
              <text x={x} y="94" textAnchor="middle" fill="#928374" fontSize="7">{index === 0 ? "P" : index}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "good" | "warn" }) {
  const valueClass = tone === "good" ? "text-[#8ec07c]" : tone === "warn" ? "text-[#fabd2f]" : "text-[#ebdbb2]";
  return (
    <div className="rounded-xl border border-[#3c3836] bg-[#1d2021cc] px-3 py-2.5">
      <div className="font-mono text-[8px] uppercase tracking-[0.19em] text-[#928374]">{label}</div>
      <div className={`mt-1 font-mono text-[17px] tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1 text-[9px] leading-4 text-[#7c7469]">{detail}</div>
    </div>
  );
}

function EvidenceMath({ contribution }: { contribution: ConfidenceContribution }) {
  const sign = contribution.logOddsDelta >= 0 ? "+" : "";
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#3c3836] bg-[#11161d] p-2 font-mono text-[9px]">
      <div>
        <div className="uppercase tracking-[0.13em] text-[#665c54]">Weight</div>
        <div className="mt-1 text-[#d5c4a1]">{contribution.effectiveWeight.toFixed(3)}</div>
      </div>
      <div>
        <div className="uppercase tracking-[0.13em] text-[#665c54]">Δ log-odds</div>
        <div className={`mt-1 ${contribution.logOddsDelta < 0 ? "text-[#8ec07c]" : "text-[#fabd2f]"}`}>
          {sign}{contribution.logOddsDelta.toFixed(3)}
        </div>
      </div>
      <div>
        <div className="uppercase tracking-[0.13em] text-[#665c54]">Confidence</div>
        <div className="mt-1 text-[#d5c4a1]">
          {formatPercent(contribution.priorConfidence)} → {formatPercent(contribution.posteriorConfidence)}
        </div>
      </div>
    </div>
  );
}

export function SpaceThreatDemo() {
  const [steps, setSteps] = useState<RenderedStep[]>([]);
  const stepsRef = useRef<RenderedStep[]>([]);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const updateSteps = useCallback((updater: (current: RenderedStep[]) => RenderedStep[]) => {
    const next = updater(stepsRef.current);
    if (next === stepsRef.current) return;
    stepsRef.current = next;
    setSteps(next);
  }, []);

  const beginFreshRun = useCallback((): string => {
    activeControllerRef.current?.abort();
    const runId = globalThis.crypto?.randomUUID?.() ?? `space-demo-${Date.now()}`;
    runIdRef.current = runId;
    stepsRef.current = [];
    setSteps([]);
    setSelectedObservationId(null);
    setError(null);
    return runId;
  }, []);

  const ingestObservation = useCallback(async (sequence: number, runId: string, signal: AbortSignal): Promise<boolean> => {
    const ingressStartedAt = performance.now();
    const response = await fetch("/api/feeds/space-threat-demo", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: SPACE_THREAT_SCENARIO.id,
        throughSequence: sequence,
        runId,
      }),
      signal,
    });

    const payload = (await response.json()) as EvaluationResponse | { error?: string };
    if (!response.ok || !("observation" in payload)) {
      throw new Error(("error" in payload && payload.error) || `Evaluation returned ${response.status}`);
    }
    if (signal.aborted || runIdRef.current !== runId) return false;

    const nextStep: RenderedStep = {
      runId,
      observation: payload.observation,
      assessment: payload.assessment,
      ingressStartedAt,
      fusionMs: payload.serverTiming.fusionMs,
      domLatencyMs: null,
      globeLatencyMs: null,
    };

    updateSteps((current) => [
      ...current.filter((step) => step.observation.id !== nextStep.observation.id),
      nextStep,
    ].sort((left, right) => left.observation.sequence - right.observation.sequence));
    setSelectedObservationId(payload.observation.id);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (runIdRef.current !== runId) return;
        const domLatencyMs = performance.now() - ingressStartedAt;
        updateSteps((current) => current.map((step) =>
          step.runId === runId && step.observation.id === payload.observation.id
            ? { ...step, domLatencyMs }
            : step,
        ));
      });
    });

    return true;
  }, [updateSteps]);

  const resetDemo = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    runIdRef.current = null;
    stepsRef.current = [];
    setSteps([]);
    setSelectedObservationId(null);
    setError(null);
    setStatus("idle");
  }, []);

  const pauseDemo = useCallback(() => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setStatus(stepsRef.current.length === SPACE_THREAT_SCENARIO.observations.length ? "complete" : "paused");
  }, []);

  const playDemo = useCallback(async () => {
    activeControllerRef.current?.abort();

    let startIndex = stepsRef.current.length;
    let runId = runIdRef.current;
    if (!runId || startIndex >= SPACE_THREAT_SCENARIO.observations.length) {
      runId = beginFreshRun();
      startIndex = 0;
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    setError(null);
    setStatus("running");

    const firstOffset = SPACE_THREAT_SCENARIO.observations[startIndex].arrivalOffsetMs;
    const playbackStartedAt = performance.now();

    try {
      for (let index = startIndex; index < SPACE_THREAT_SCENARIO.observations.length; index += 1) {
        const observation = SPACE_THREAT_SCENARIO.observations[index];
        const scheduledOffset = observation.arrivalOffsetMs - firstOffset;
        const shouldContinue = await abortableDelay(
          Math.max(0, scheduledOffset - (performance.now() - playbackStartedAt)),
          controller.signal,
        );
        if (!shouldContinue || controller.signal.aborted) return;

        const ingested = await ingestObservation(observation.sequence, runId, controller.signal);
        if (!ingested || controller.signal.aborted) return;
      }

      activeControllerRef.current = null;
      setStatus("complete");
    } catch (caught) {
      if (controller.signal.aborted) return;
      activeControllerRef.current = null;
      setError(caught instanceof Error ? caught.message : "Synthetic evaluation failed");
      setStatus("error");
    }
  }, [beginFreshRun, ingestObservation]);

  const stepDemo = useCallback(async () => {
    activeControllerRef.current?.abort();
    let sequence = stepsRef.current.length + 1;
    let runId = runIdRef.current;
    if (!runId || sequence > SPACE_THREAT_SCENARIO.observations.length) {
      runId = beginFreshRun();
      sequence = 1;
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    setError(null);
    setStatus("running");

    try {
      const ingested = await ingestObservation(sequence, runId, controller.signal);
      if (!ingested || controller.signal.aborted) return;
      activeControllerRef.current = null;
      setStatus(sequence === SPACE_THREAT_SCENARIO.observations.length ? "complete" : "paused");
    } catch (caught) {
      if (controller.signal.aborted) return;
      activeControllerRef.current = null;
      setError(caught instanceof Error ? caught.message : "Synthetic evaluation failed");
      setStatus("error");
    }
  }, [beginFreshRun, ingestObservation]);

  const handleGlobeFrameRendered = useCallback((runId: string, observationId: string, latencyMs: number) => {
    if (runIdRef.current !== runId) return;
    updateSteps((current) => {
      const matchingStep = current.find(
        (step) => step.runId === runId && step.observation.id === observationId,
      );
      if (!matchingStep || matchingStep.globeLatencyMs !== null) return current;
      return current.map((step) =>
        step === matchingStep ? { ...step, globeLatencyMs: latencyMs } : step,
      );
    });
  }, [updateSteps]);

  useEffect(() => () => activeControllerRef.current?.abort(), []);

  const currentAssessment = steps.at(-1)?.assessment ?? INITIAL_ASSESSMENT;
  const latestStep = steps.at(-1) ?? null;
  const globeFrame = useMemo<SpaceThreatGlobeFrame | null>(() => latestStep
    ? {
        runId: latestStep.runId,
        observation: latestStep.observation,
        assessment: latestStep.assessment,
        ingressStartedAt: latestStep.ingressStartedAt,
      }
    : null, [latestStep]);
  const displayLatencies = steps
    .map((step) => step.globeLatencyMs ?? step.domLatencyMs)
    .filter((value): value is number => value !== null);
  const maxLatency = displayLatencies.length > 0 ? Math.max(...displayLatencies) : null;
  const p95Latency = percentile95(displayLatencies);
  const latencyPassing = displayLatencies.length > 0 && displayLatencies.every((value) => value <= LATENCY_THRESHOLD_MS);
  const progress = steps.length / SPACE_THREAT_SCENARIO.observations.length;

  const statusLabel = useMemo(() => {
    if (status === "running") return "Fusion running";
    if (status === "paused") return "Playback paused";
    if (status === "complete") return "Scenario complete";
    if (status === "error") return "Evaluation error";
    return "Ready for operator";
  }, [status]);

  return (
    <main className="relative h-screen overflow-y-auto bg-[#0b1118] text-[#ebdbb2]">
      <div className="argus-noise pointer-events-none fixed inset-0 opacity-50" />
      <div className="argus-grid pointer-events-none fixed inset-0 opacity-40" />

      <div className="relative z-10 mx-auto flex min-h-full max-w-[1800px] flex-col px-3 py-3 sm:px-5 lg:px-7">
        <header className={`${panelClass} flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5`}>
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="shrink-0 font-mono text-[17px] uppercase tracking-[0.28em] text-[#f3e7c2]">
              ARG<span className="text-[#83a598]">US</span>
            </Link>
            <div className="hidden h-8 w-px bg-[#3c3836] sm:block" />
            <div className="min-w-0">
              <div className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-[#fabd2f]">Space threat synthesis demonstrator</div>
              <div className="mt-1 truncate text-[10px] text-[#928374]">DIU PROJ00716 · operator-facing evidence fusion</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#496c45] bg-[#152416] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#8ec07c]">
              {SPACE_THREAT_SCENARIO.marking}
            </span>
            <a
              href={DIU_SOLICITATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-[#504945] bg-[#282828] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[#83a598] transition hover:border-[#83a598] hover:text-[#ebdbb2]"
            >
              Requirement basis ↗
            </a>
          </div>
        </header>

        <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
          <MetricCard
            label="Fused confidence"
            value={formatPercent(currentAssessment.confidence)}
            detail={`${currentAssessment.confidenceBand.toUpperCase()} claim support`}
            tone={currentAssessment.confidence >= 0.6 ? "warn" : "neutral"}
          />
          <MetricCard
            label="Evidence conflict"
            value={formatPercent(currentAssessment.conflictRatio)}
            detail="Disagreement remains explicit"
            tone={currentAssessment.conflictRatio > 0.4 ? "warn" : "neutral"}
          />
          <MetricCard
            label="E2E display p95"
            value={formatLatency(p95Latency)}
            detail="HTTP ingress → Cesium post-render"
            tone={latencyPassing ? "good" : "neutral"}
          />
          <MetricCard
            label="5-second threshold"
            value={maxLatency === null ? "NOT RUN" : latencyPassing ? "PASS" : "FAIL"}
            detail={maxLatency === null
              ? DEVELOPMENT_BUILD ? "Dev compiler overhead will be included" : "Run the scenario to measure"
              : `Max ${formatLatency(maxLatency)} / 5,000 ms${DEVELOPMENT_BUILD ? " · dev build" : ""}`}
            tone={maxLatency === null ? "neutral" : latencyPassing ? "good" : "warn"}
          />
        </section>

        <section className="mt-3 grid min-h-[680px] flex-1 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
          <div className="grid min-h-0 gap-3 xl:grid-rows-[minmax(460px,1fr)_210px]">
            <SpaceThreatGlobe frame={globeFrame} onFrameRendered={handleGlobeFrameRendered} />
            <ConfidenceTimeline steps={steps} />
          </div>

          <aside className={`${panelClass} flex min-h-[680px] flex-col overflow-hidden`}>
            <div className="border-b border-[#3c3836] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#83a598]">Scenario control</div>
                  <div className="mt-1 text-[13px] text-[#f3e7c2]">{SPACE_THREAT_SCENARIO.name}</div>
                </div>
                <span className={`rounded-full border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] ${bandClasses(currentAssessment.confidenceBand)}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="mt-3 text-[10px] leading-5 text-[#a89984]">{SPACE_THREAT_SCENARIO.hypothesis}</p>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#282828]">
                <div className="h-full bg-[#83a598] transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-[0.13em] text-[#665c54]">
                <span>{steps.length} / {SPACE_THREAT_SCENARIO.observations.length} observations</span>
                <span>TCA {new Date(SPACE_THREAT_SCENARIO.tca).toISOString().slice(11, 19)}Z</span>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={status === "running" ? pauseDemo : () => { void playDemo(); }}
                  className="rounded-lg border border-[#7c631b] bg-[#2a2312] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#fabd2f] transition hover:bg-[#3a3015]"
                >
                  {status === "running" ? "Pause" : status === "complete" ? "Replay" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => { void stepDemo(); }}
                  disabled={status === "running"}
                  className="rounded-lg border border-[#504945] bg-[#282828] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#d5c4a1] transition hover:border-[#83a598] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Step
                </button>
                <button
                  type="button"
                  onClick={resetDemo}
                  className="rounded-lg border border-[#504945] bg-[#282828] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#a89984] transition hover:border-[#83a598]"
                >
                  Reset
                </button>
                <Link
                  href="/"
                  className="flex items-center justify-center rounded-lg border border-[#504945] bg-[#282828] px-2 py-2 font-mono text-[9px] uppercase tracking-[0.13em] text-[#83a598] transition hover:border-[#83a598]"
                >
                  Live
                </Link>
              </div>
              {error ? (
                <div className="mt-3 rounded-lg border border-[#9d3329] bg-[#2f1717] px-3 py-2 text-[10px] text-[#fb4934]">{error}</div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#83a598]">Evidence lineage</div>
                <div className="font-mono text-[8px] uppercase tracking-[0.13em] text-[#665c54]">Click any observation</div>
              </div>

              <div className="mt-3 space-y-2">
                {SPACE_THREAT_SCENARIO.observations.map((observation) => {
                  const step = steps.find((item) => item.observation.id === observation.id);
                  const contribution = step?.assessment.contributions.at(-1);
                  const isSelected = selectedObservationId === observation.id;
                  const pending = !step;

                  return (
                    <article
                      key={observation.id}
                      className={`overflow-hidden rounded-xl border transition ${isSelected ? "border-[#83a598] bg-[#202729]" : "border-[#3c3836] bg-[#1d2021]"} ${pending ? "opacity-55" : "opacity-100"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedObservationId(isSelected ? null : observation.id)}
                        aria-expanded={isSelected}
                        className="w-full px-3 py-2.5 text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${pending ? "border-[#504945] text-[#665c54]" : stanceClasses(observation.stance)}`}>
                            {pending ? observation.sequence : "✓"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate font-mono text-[10px] text-[#ebdbb2]">{observation.sourceName}</div>
                              <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.12em] ${stanceClasses(observation.stance)}`}>
                                {observation.stance}
                              </span>
                            </div>
                            <p className="mt-1 text-[9px] leading-4 text-[#a89984]">{observation.summary}</p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[8px] text-[#665c54]">
                              <span>{observation.modality}</span>
                              <span>{observation.predictedMissDistanceKm.toFixed(1)} ± {observation.uncertaintyKm.toFixed(1)} km</span>
                              <span>{step ? formatLatency(step.globeLatencyMs ?? step.domLatencyMs) : "queued"}</span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {isSelected ? (
                        <div className="space-y-3 border-t border-[#3c3836] px-3 py-3">
                          {contribution ? <EvidenceMath contribution={contribution} /> : (
                            <div className="rounded-lg border border-[#3c3836] bg-[#11161d] p-2 font-mono text-[9px] text-[#928374]">
                              This source has not entered the fusion window yet.
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 font-mono text-[8px]">
                            {[
                              ["Reliability", observation.reliability],
                              ["Quality", observation.quality],
                              ["Relevance", observation.relevance],
                              ["Independence", observation.independence],
                            ].map(([label, value]) => (
                              <div key={String(label)} className="rounded border border-[#3c3836] bg-[#11161d] px-2 py-1.5">
                                <span className="uppercase tracking-[0.11em] text-[#665c54]">{label}</span>
                                <span className="float-right tabular-nums text-[#d5c4a1]">{Number(value).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="rounded-lg border border-[#3c3836] bg-[#11161d] p-2.5 font-mono text-[8px] leading-4">
                            <div className="uppercase tracking-[0.15em] text-[#83a598]">Provenance chain</div>
                            <dl className="mt-2 grid grid-cols-[86px_1fr] gap-x-2 gap-y-1">
                              <dt className="text-[#665c54]">Artifact</dt>
                              <dd className="break-all text-[#d5c4a1]">{observation.lineage.artifactId}</dd>
                              <dt className="text-[#665c54]">Source</dt>
                              <dd className="break-all text-[#d5c4a1]">{observation.lineage.sourceId}</dd>
                              <dt className="text-[#665c54]">Publisher</dt>
                              <dd className="text-[#d5c4a1]">{observation.lineage.publisher}</dd>
                              <dt className="text-[#665c54]">Method</dt>
                              <dd className="text-[#d5c4a1]">{observation.lineage.collectionMethod}</dd>
                              <dt className="text-[#665c54]">SHA-256</dt>
                              <dd className="break-all text-[#928374]">{observation.lineage.sha256}</dd>
                            </dl>
                            <div className="mt-2 border-t border-[#3c3836] pt-2 text-[#928374]">
                              {observation.lineage.transforms.map((transform, index) => (
                                <div key={`${transform.step}-${index}`}>{index + 1}. {transform.step} · {transform.implementation}</div>
                              ))}
                              <div>{observation.lineage.transforms.length + 1}. weighted log-odds fusion · effective weight {effectiveEvidenceWeight(observation).toFixed(3)}</div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a
                                href={observation.lineage.artifactUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded border border-[#496c45] bg-[#152416] px-2 py-1 uppercase tracking-[0.12em] text-[#8ec07c] hover:border-[#8ec07c]"
                              >
                                Open raw artifact ↗
                              </a>
                              {observation.lineage.referenceUrl ? (
                                <a
                                  href={observation.lineage.referenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded border border-[#504945] bg-[#282828] px-2 py-1 uppercase tracking-[0.12em] text-[#83a598] hover:border-[#83a598]"
                                >
                                  Format reference ↗
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-[#3c3836] bg-[#11161d] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-[8px] uppercase tracking-[0.17em] text-[#83a598]">Transparent reasoning</div>
                  <span className="font-mono text-[8px] text-[#665c54]">w = r × q × relevance × independence</span>
                </div>
                <div className="mt-2 space-y-1 font-mono text-[8px] leading-4 text-[#928374]">
                  {currentAssessment.reasoning.map((line) => <div key={line}>{line}</div>)}
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className={`${panelClass} mt-3 grid gap-3 p-4 md:grid-cols-3`}>
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#83a598]">Demonstrated now</div>
            <p className="mt-2 text-[9px] leading-4 text-[#a89984]">Conflicting multi-source fusion, deterministic reasoning, confidence history, raw-artifact lineage, and measured ingress-to-render latency.</p>
          </div>
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#fabd2f]">Not yet claimed</div>
            <p className="mt-2 text-[9px] leading-4 text-[#a89984]">The fixture does not prove 5 GB/min burst stability, classified connectivity, attribution accuracy, or a production security authorization.</p>
          </div>
          <div>
            <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#8ec07c]">Teaming boundary</div>
            <p className="mt-2 text-[9px] leading-4 text-[#a89984]">ARGUS: operator workspace · Epsilon: provenance/assurance/policy · cleared space-data partner: sensors, domain models, and classified integration.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
