import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";

const DEFAULT_SYSTEM_PROMPT = `You are an intelligence analyst. Provide a concise 2-3 sentence summary and analysis of the following item. Focus on strategic significance, potential implications, and key facts. Be direct and factual.`;

const GDELT_SYSTEM_PROMPT = `You are a senior geopolitical intelligence analyst. Write a detailed paragraph (5-8 sentences) analyzing this GDELT event. Explain WHO the actors are and their geopolitical roles, WHAT happened and why it matters, WHERE it occurred and the regional significance, the Goldstein scale implications (negative = conflict, positive = cooperation), media attention level based on mention/source counts, and what this event could signal for near-term developments. Be specific, factual, and authoritative. Do not use bullet points — write flowing prose.`;

const ANOMALY_SYSTEM_PROMPT = `You are a signals intelligence analyst specializing in anomaly detection. Write a detailed paragraph (5-8 sentences) analyzing this chaos anomaly. Explain what the anomaly type means, why the severity level matters, what physical or electronic phenomena could cause this pattern, the geographic significance of the detection location, and what follow-up monitoring would be recommended. Be specific and technical but accessible. Write flowing prose, no bullet points.`;

function getSystemPrompt(context: string | undefined): string {
  if (context === "gdelt") return GDELT_SYSTEM_PROMPT;
  if (context === "anomaly") return ANOMALY_SYSTEM_PROMPT;
  return DEFAULT_SYSTEM_PROMPT;
}

export async function POST(req: Request) {
  const { text, context } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const systemPrompt = getSystemPrompt(context);
  const prompt = context
    ? `Context: ${context}\n\nItem to analyze:\n${text}`
    : `Item to analyze:\n${text}`;

  const result = await queryLlm(prompt, systemPrompt);
  if (result.error) {
    return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ summary: result.text });
}
