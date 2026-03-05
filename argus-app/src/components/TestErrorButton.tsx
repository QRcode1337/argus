"use client";

export function TestErrorButton() {
  return (
    <button
      type="button"
      onClick={() => {
        throw new Error("Argus App GlitchTip test error");
      }}
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 99999,
        background: "#7f1d1d",
        color: "#fff",
        border: "1px solid #ef4444",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      Test frontend error
    </button>
  );
}
