import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";
import { logPneumaLatency } from "@/lib/telemetry/pneumaLatencyLogger";

export const dynamic = "force-dynamic";

// ARGUS AI — conversational analysis assistant. Routes through the DataAnalysis
// DigitalOcean agent (deepseek-4-flash behind *.agents.do-ai.run), grounded in
// the live intel picture. Kept separate from /api/ai/gdelt-digest and
// /api/ai/summarize so the agent's latency never touches the fast digest path.

const ASSISTANT_SYSTEM_PROMPT = `You are ARGUS AI — the analytical mind of the Argus all-source intelligence dashboard, speaking through its PNEUMA cognitive layer. You answer the operator's questions about the live intelligence picture with the rigor of a senior all-source analyst: precise, strategically literate, and honest about uncertainty. Ground every answer in the LIVE CONTEXT below when it is relevant; when the context is insufficient, reason from first principles and state what additional collection would resolve the gap. Distinguish "observed" from "assessed". Favor dense, high-signal prose over filler. When useful, close with the single most important indicator to watch next.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildContextBlock(context: unknown): string {
  if (!context || typeof context !== "object") return "";
  const c = context as Record<string, unknown>;
  const lines: string[] = [];

  if (c.threatLevel) lines.push(`Threat level: ${String(c.threatLevel)}`);
  if (typeof c.summary === "string" && c.summary.trim()) {
    lines.push(`Current intel brief: ${c.summary.trim()}`);
  }
  if (
    typeof c.criticalCount === "number" ||
    typeof c.warningCount === "number" ||
    typeof c.infoCount === "number"
  ) {
    lines.push(
      `Alert counts — critical: ${c.criticalCount ?? 0}, warning: ${c.warningCount ?? 0}, info: ${c.infoCount ?? 0}`,
    );
  }
  if (Array.isArray(c.alerts) && c.alerts.length) {
    const top = c.alerts
      .slice(0, 8)
      .map((a, i) => {
        const label =
          typeof a === "string"
            ? a
            : (a?.title ?? a?.text ?? a?.headline ?? JSON.stringify(a));
        return `  ${i + 1}. ${label}`;
      })
      .join("\n");
    lines.push(`Active alerts:\n${top}`);
  }
  if (Array.isArray(c.hypotheses) && c.hypotheses.length) {
    const hyp = c.hypotheses
      .map((h) => `  - (score ${h?.score ?? 0}) ${h?.text ?? h}`)
      .join("\n");
    lines.push(`Active hypotheses (operator-scored):\n${hyp}`);
  }
  if (c.cognitiveLens) lines.push(`Cognitive lens: ${String(c.cognitiveLens)}`);
  if (c.selectedIntel) {
    const sel =
      typeof c.selectedIntel === "string"
        ? c.selectedIntel
        : JSON.stringify(c.selectedIntel).slice(0, 1200);
    lines.push(`Currently selected item: ${sel}`);
  }

  return lines.length
    ? `=== LIVE CONTEXT ===\n${lines.join("\n")}\n=== END CONTEXT ===`
    : "";
}

function buildPrompt(messages: ChatMessage[]): string {
  const valid = messages.filter(
    (m) => m && typeof m.content === "string" && m.content.trim(),
  );
  const last = valid[valid.length - 1];
  const history = valid.slice(0, -1);

  let prompt = "";
  if (history.length) {
    prompt +=
      "Conversation so far:\n" +
      history
        .map(
          (m) =>
            `${m.role === "assistant" ? "ARGUS AI" : "Operator"}: ${m.content.trim()}`,
        )
        .join("\n") +
      "\n\n";
  }
  prompt += `Operator's question: ${last?.content.trim() ?? ""}`;
  return prompt;
}

export async function POST(req: Request) {
  const start = performance.now();

  let body: { messages?: ChatMessage[]; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const contextBlock = buildContextBlock(body?.context);
  const systemPrompt = contextBlock
    ? `${ASSISTANT_SYSTEM_PROMPT}\n\n${contextBlock}`
    : ASSISTANT_SYSTEM_PROMPT;
  const prompt = buildPrompt(messages);

  const endpoint =
    process.env.ARGUS_AI_AGENT_ENDPOINT ||
    "https://uwziiweo6bvm7fyvapqsmdxp.agents.do-ai.run/api/v1";

  const result = await queryLlm(prompt, systemPrompt, {
    timeoutMs: 90_000,
    maxTokens: 1800,
    llmOverride: {
      provider: "openai_compatible",
      endpoint,
      model: process.env.ARGUS_AI_AGENT_MODEL || "deepseek-4-flash",
      apiKey: process.env.ARGUS_AI_AGENT_KEY,
    },
  });

  const latency_ms = Math.round(performance.now() - start);
  logPneumaLatency({
    route: "/api/ai/assistant",
    context: null,
    latency_ms,
    status_code: result.error ? 502 : 200,
  }).catch(console.error);

  if (result.error) {
    return NextResponse.json({ reply: null, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ reply: result.text, latencyMs: latency_ms });
}
