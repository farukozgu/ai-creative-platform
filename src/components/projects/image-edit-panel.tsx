"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GenerationProgressModal } from "@/components/projects/generation-progress-modal";
import type { CreateImageEditResult } from "@/app/[locale]/dashboard/projects/[projectId]/generation-actions";
import { resolveImageEditCompletion } from "@/components/projects/image-edit-completion";
import { GenerationStatusIndicator, type GenerationState } from "@/components/projects/generation-status-indicator";

export function ImageEditPanel({ available, hasOutput, selectedGenerationId, onEditSucceeded, action, messages }: { available: boolean; hasOutput: boolean; selectedGenerationId: string | null; onEditSucceeded: (generationId: string) => void; action: (baseGenerationId: string, instruction: string, submissionId: string) => Promise<CreateImageEditResult>; messages: { title: string; description: string; placeholder: string; helper: string; apply: string; unavailable: string; failed: string; progressTitle: string; progressDescription: string; progressStatuses: readonly [string, string, string, string]; closeProgress: string; activeStatus: string; successStatus: string; failedStatus: string } }) {
  const inputId = useId();
  const router = useRouter();
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressTitle, setProgressTitle] = useState(messages.progressTitle);
  const [modalOpen, setModalOpen] = useState(false);
  const [generationState, setGenerationState] = useState<GenerationState>("idle");
  function log(event: string, fields?: Record<string, boolean | string>) {
    if (process.env.NODE_ENV === "development") console.info(`[image-edit-ui] ${event}`, fields ?? {});
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const instruction = instructionRef.current?.value.trim() ?? "";
    if (!selectedGenerationId || !instruction || pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(null);
    setGenerationState("processing"); setModalOpen(true);
    setProgressTitle(messages.progressTitle);
    log("submit_started");
    try {
      const result = await action(selectedGenerationId, instruction, crypto.randomUUID());
      log("action_resolved", { ok: result.ok, generationIdPresent: result.ok });
      const completion = resolveImageEditCompletion(result);
      if (completion.error) { setError(!result.ok && result.code === "admissionUnavailable" ? messages.unavailable : messages.failed); setGenerationState("failed"); return; }
      if (completion.selectedGenerationId) { onEditSucceeded(completion.selectedGenerationId); setGenerationState("succeeded"); }
      if (completion.clearInstruction && instructionRef.current) instructionRef.current.value = "";
      if (completion.refresh) {
        setProgressTitle(messages.progressStatuses[3]); setModalOpen(false);
        window.setTimeout(() => setGenerationState((current) => current === "succeeded" ? "idle" : current), 7000);
        pendingRef.current = false;
        setPending(false);
        log("modal_closed", { success: true });
        log("refresh_started");
        router.refresh();
      }
    } catch {
      setError(messages.failed);
      setGenerationState("failed");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return <section id="project-image-edit" className="project-control-section project-image-edit" aria-labelledby={`${inputId}-title`}>
    <h3 id={`${inputId}-title`}>{messages.title}</h3><p>{messages.description}</p>
    {!available ? <p role="status">{messages.unavailable}</p> : null}
    <form onSubmit={(event) => void submit(event)}>
      <label className="sr-only" htmlFor={inputId}>{messages.title}</label>
      <textarea ref={instructionRef} id={inputId} className="project-direction-textarea" placeholder={messages.placeholder} disabled={!available || !hasOutput || pending} maxLength={1000} />
      <p>{messages.helper}</p>
      {error ? <p role="alert" className="project-generation-error">{error}</p> : null}
      <Button type="submit" variant="primary" size="md" className="project-generate-button" disabled={!available || !hasOutput || pending}>{pending ? messages.progressTitle : messages.apply}</Button>
    </form>
    <GenerationStatusIndicator status={generationState} label={generationState === "failed" ? messages.failedStatus : generationState === "succeeded" ? messages.successStatus : messages.activeStatus} onClick={() => { if (generationState === "succeeded") { router.refresh(); return; } setModalOpen(true); }} />
    <GenerationProgressModal open={modalOpen && generationState !== "idle"} onClose={() => setModalOpen(false)} closeLabel={messages.closeProgress} title={generationState === "failed" ? messages.failed : progressTitle} description={messages.progressDescription} statuses={messages.progressStatuses} />
  </section>;
}
