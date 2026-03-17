import { NextResponse } from "next/server";
import { queryLlm } from "@/lib/ai/llmClient";

const SYSTEM_PROMPT = `You are an intelligence analyst. Provide a concise 2-3 sentence summary and analysis of the following item. Focus on strategic significance, potential implications, and key facts. Be direct and factual.`;

export async function POST(req: Request) {
  const { text, context } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const prompt = context
    ? `Context: ${context}\n\nItem to analyze:\n${text}`
    : `Item to analyze:\n${text}`;

  const result = await queryLlm(prompt, SYSTEM_PROMPT);
  if (result.error) {
    return NextResponse.json({ summary: null, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ summary: result.text });
}
