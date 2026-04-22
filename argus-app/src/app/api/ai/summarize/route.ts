import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { logPneumaLatency } from "@/lib/telemetry/pneumaLatencyLogger";

const DEFAULT_SYSTEM_PROMPT = `You are a senior all-source intelligence analyst briefing a time-constrained principal. In 3-4 dense sentences, distill: (1) the core fact, (2) the strategic significance and which actors or interests are materially affected, (3) the most consequential second-order implication, and (4) what to watch next. Prioritize signal over narration. Anchor claims to the specific item. Distinguish observation from assessment. No hedging beyond what the evidence warrants; no filler.`;

const GDELT_SYSTEM_PROMPT = `You are a senior geopolitical analyst writing a Palantir-grade single-event assessment (6-9 sentences of tight prose, no bullets). Cover, in order: (1) WHO — name each actor, their type (state, proxy, non-state, alliance bloc), and their strategic posture entering this event; (2) WHAT & WHY — the concrete action, what it signals about the actor's intent, and how it fits or diverges from their recent pattern; (3) WHERE — the theater's geopolitical weight, adjacent flashpoints, and who has equities at stake; (4) MOTIVATION — the domestic, economic, alliance, or deterrence pressures most plausibly driving this move; (5) GOLDSTEIN CALIBRATION — translate the numeric score into behavioral meaning (coercion, posturing, cooperation, de-escalation) and note if tone/mention counts suggest the story is being amplified or under-reported; (6) CASCADING IMPLICATIONS — 2-3 plausible second-order effects (alliance reactions, market/energy pressure, escalation risk, precedent); (7) INDICATORS TO WATCH — the specific next events that would confirm or disconfirm the assessment. Use "observed" vs "assessed" to distinguish fact from inference. Be authoritative, specific, and restrained.`;

const ANOMALY_SYSTEM_PROMPT = `You are a senior all-source analyst fusing SIGINT, GEOINT, and OSINT for an operational client. In 6-9 sentences of flowing prose (no bullets), deliver a rigorous single-anomaly assessment: (1) characterize the anomaly type and what the severity level implies about confidence and urgency; (2) enumerate the competing physical, electronic, or human-causal hypotheses that could produce this signature, and weight them against one another; (3) ground the assessment in the geographic context — nearby infrastructure, known military or intelligence installations, boundary effects, historical activity baselines; (4) consider adversary-tradecraft explanations (masking, spoofing, exercise activity, deliberate signaling) alongside natural or civilian ones; (5) identify the cascading operational implications if the leading hypothesis holds — collection priorities affected, allied equities, escalation potential; (6) prescribe specific follow-up collection (sensors, platforms, sources) and observable indicators that would confirm or discount the leading hypothesis. Distinguish "observed" from "assessed". Be technically precise, strategically literate, and honest about ambiguity.`;

function getSystemPrompt(context: string | undefined): string {
  if (context === "gdelt") return GDELT_SYSTEM_PROMPT;
  if (context === "anomaly") return ANOMALY_SYSTEM_PROMPT;
  return DEFAULT_SYSTEM_PROMPT;
}

export async function POST(req: Request) {
  const start = performance.now();
  const { text, context } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const systemPrompt = getSystemPrompt(context);
  const prompt = context
    ? `Context: ${context}\n\nItem to analyze:\n${text}`
    : `Item to analyze:\n${text}`;

  const result = await queryLlm(prompt, systemPrompt);
  const latency_ms = Math.round(performance.now() - start);

  if (result.error) {
    logPneumaLatency({
      route: "/api/ai/summarize",
      context: context ?? null,
      latency_ms,
      status_code: 502,
    }).catch(console.error);
    return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
  }

  logPneumaLatency({
    route: "/api/ai/summarize",
    context: context ?? null,
    latency_ms,
    status_code: 200,
  }).catch(console.error);

  return NextResponse.json({ summary: result.text });
}
