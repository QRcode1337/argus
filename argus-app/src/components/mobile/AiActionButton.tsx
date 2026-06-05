"use client";

import type { ReactNode } from "react";

type AiActionButtonProps = {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  errorMessage?: string | null;
  icon?: ReactNode;
};

/**
 * Shared mobile primary action whose copy can shift per active tab.
 */
export function AiActionButton({
  label,
  onClick,
  loading = false,
  disabled = false,
  errorMessage = null,
  icon,
}: AiActionButtonProps) {
  const inactive = disabled || loading;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={inactive}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition ${
          inactive
            ? "border-[#3c3836] bg-[#1d2021] text-[#7c6f64]"
            : "border-[#83a598] bg-[#1d2021] text-[#83a598] hover:bg-[#282828]"
        }`}
      >
        {icon ? <span aria-hidden>{icon}</span> : <span aria-hidden>✶</span>}
        <span>{loading ? "Working…" : label}</span>
      </button>
      {errorMessage ? (
        <p className="px-1 font-mono text-[10px] text-[#fb4934]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
