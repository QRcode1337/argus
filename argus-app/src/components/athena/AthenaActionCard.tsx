import type { AthenaActionPacket } from "@/types/athena";

type AthenaActionCardProps = {
  packet: AthenaActionPacket;
  compact?: boolean;
  onSimulate?: (packet: AthenaActionPacket) => void;
  onApprove?: (packet: AthenaActionPacket) => void;
  onDismiss?: (packet: AthenaActionPacket) => void;
  onExportJson?: (packet: AthenaActionPacket) => void;
};

const priorityClass: Record<AthenaActionPacket["priority"], string> = {
  info: "border-[#83a598] text-[#83a598]",
  watch: "border-[#8ec07c] text-[#8ec07c]",
  elevated: "border-[#fabd2f] text-[#fabd2f]",
  high: "border-[#fe8019] text-[#fe8019]",
  critical: "border-[#fb4934] text-[#fb4934]",
};

export function AthenaActionCard({
  packet,
  compact = false,
  onSimulate,
  onApprove,
  onDismiss,
  onExportJson,
}: AthenaActionCardProps) {
  const explanation = compact ? packet.explanation.slice(0, 3) : packet.explanation;
  const alternatives = packet.safeAlternatives.slice(0, compact ? 3 : packet.safeAlternatives.length);
  const confidence = Math.round(packet.confidence * 100);
  const disabled = packet.status === "approved" || packet.status === "dismissed";

  return (
    <article className="rounded-xl border border-[#5b4a1f] bg-[#1d2021e6] px-3 py-2.5 shadow-[0_0_24px_rgba(250,189,47,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#fabd2f]">
            ATHENA RECOMMENDS
          </div>
          <h3 className="mt-1 font-mono text-[12px] font-semibold leading-snug text-[#ebdbb2]">
            {packet.proposedAction.label}
          </h3>
          <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.14em] text-[#83a598]">
            {packet.region.label}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${priorityClass[packet.priority]}`}>
            {packet.priority}
          </span>
          <span className="font-mono text-[8px] text-[#a89984]">{confidence}%</span>
        </div>
      </div>

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-[#d5c4a1]">
        {packet.proposedAction.description}
      </p>

      <div className="mt-2 rounded-lg border border-[#3c3836] bg-[#14181b] px-2 py-1.5">
        <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#a89984]">Why</div>
        <ul className="mt-1 space-y-1">
          {explanation.map((line) => (
            <li key={line} className="font-mono text-[9px] leading-relaxed text-[#7fb4c5]">
              - {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-2 rounded-lg border border-[#3c3836] bg-[#14181b] px-2 py-1.5">
        <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#a89984]">Safe alternatives</div>
        <div className="mt-1 space-y-1">
          {alternatives.map((alternative) => (
            <div key={alternative.label} className="font-mono text-[9px] leading-relaxed text-[#a89984]">
              <span className="text-[#d5c4a1]">{alternative.label}:</span> {alternative.description}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSimulate?.(packet)}
          disabled={disabled}
          className="rounded-md border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#83a598] transition hover:border-[#83a598] disabled:opacity-40"
        >
          Simulate
        </button>
        <button
          type="button"
          onClick={() => onApprove?.(packet)}
          disabled={disabled || !packet.requiresApproval}
          className="rounded-md border border-[#8ec07c] bg-[#1f2a20] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#8ec07c] transition hover:bg-[#263321] disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDismiss?.(packet)}
          disabled={disabled}
          className="rounded-md border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#a89984] transition hover:border-[#fb4934] disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => onExportJson?.(packet)}
          className="ml-auto rounded-md border border-[#504945] bg-[#282828] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#7298a8] transition hover:border-[#83a598]"
        >
          JSON
        </button>
      </div>
    </article>
  );
}
