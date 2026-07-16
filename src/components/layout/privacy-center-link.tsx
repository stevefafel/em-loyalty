"use client";

declare global {
  interface Window {
    OneTrust?: { ToggleInfoDisplay: () => void };
  }
}

// OneTrust auto-binds clicks on `.ot-sdk-show-settings` at page load, but that
// binding misses elements mounted after client-side navigation — the explicit
// onClick covers both cases.
export function PrivacyCenterLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={`ot-sdk-show-settings ${className ?? ""}`}
      onClick={() => window.OneTrust?.ToggleInfoDisplay()}
    >
      Privacy center (Do not sell or share my personal information)
    </button>
  );
}
