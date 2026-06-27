"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PneumaChatProps {
  /** Live intel context passed to the agent for grounding (threat level, brief, hypotheses, …). */
  context?: Record<string, unknown>;
}

/**
 * ASK ARGUS AI — conversational analysis assistant rendered inside the PNEUMA
 * panel. Posts the running transcript + live context to /api/ai/assistant,
 * which routes to the DataAnalysis DigitalOcean agent.
 */
export default function PneumaChat({ context }: PneumaChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Error ${res.status}`);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply ?? "" }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="rounded-xl border border-[#5b4a1f] bg-[#1d2021] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#fabd2f]">
          Ask Argus AI
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#83a598]">
          deepseek · agent
        </span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[260px] space-y-2 overflow-y-auto pr-1"
      >
        {messages.length === 0 && !loading ? (
          <div className="font-mono text-[10px] leading-relaxed text-[#928374]">
            Ask anything about the live picture — events, anomalies, actors,
            second-order implications. Answers are grounded in the current intel
            brief.
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 font-mono text-[10px] leading-relaxed ${
                m.role === "user"
                  ? "bg-[#3c3836] text-[#ebdbb2]"
                  : "border border-[#504945] bg-[#282828] text-[#d5c4a1]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading ? (
          <div className="text-left">
            <div className="inline-block rounded-lg border border-[#504945] bg-[#282828] px-2.5 py-1.5 font-mono text-[10px] text-[#fabd2f]">
              <span className="animate-pulse">PNEUMA reasoning…</span>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-2 font-mono text-[9px] text-[#fb4934]">⚠ {error}</div>
      ) : null}

      <div className="mt-2 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask a question…"
          disabled={loading}
          className="flex-1 resize-none rounded-md border border-[#504945] bg-[#282828] px-2 py-1.5 font-mono text-[10px] text-[#ebdbb2] placeholder:text-[#665c54] focus:border-[#fabd2f] focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="rounded-md border border-[#fabd2f] bg-[#fabd2f]/15 px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[#fabd2f] transition hover:bg-[#fabd2f]/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
