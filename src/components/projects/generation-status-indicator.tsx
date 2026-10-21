"use client";

import { GenerationLoadingIndicator } from "@/components/projects/generation-loading-indicator";

export type GenerationOperation = "generation" | "edit";
export type GenerationState = "idle" | "queued" | "processing" | "validating" | "repairing" | "succeeded" | "failed" | "reconciliation_required";

export function GenerationStatusIndicator({ status, label, onClick }: { status: GenerationState; label: string; onClick: () => void }) {
  if (status === "idle") return null;
  const needsAttention = status === "failed" || status === "reconciliation_required";
  return <button type="button" className="generation-status-indicator" data-status={status} onClick={onClick} aria-label={label} aria-live={status === "succeeded" || needsAttention ? "polite" : undefined}>
    {status === "succeeded" ? <span className="generation-status-icon" aria-hidden="true">✓</span> : needsAttention ? <span className="generation-status-icon" aria-hidden="true">!</span> : <GenerationLoadingIndicator />}
    <span>{label}</span>
  </button>;
}
