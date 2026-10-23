"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GenerationProgressModal } from "@/components/projects/generation-progress-modal";
import { GenerationStatusIndicator, type GenerationState } from "@/components/projects/generation-status-indicator";
import { AspectRatioPicker, type AspectRatioPickerMessages } from "@/components/projects/aspect-ratio-picker";
import { DEFAULT_GENERATION_ASPECT_RATIO } from "@/lib/generation/aspect-ratios";
import type { GenerationAspectRatio } from "@/lib/generation/types";
import { type CreateQueuedImageGenerationResult } from "./generation-actions";
import { getActiveGenerationStatuses } from "@/app/[locale]/dashboard/generation-status-actions";

type GenerateImageFormProps = {
  action: (state: CreateQueuedImageGenerationResult | null, formData: FormData) => Promise<CreateQueuedImageGenerationResult>;
  initialGenerationId?: string | null;
  messages: {
    generate: string;
    creating: string;
    missingProductImage: string;
    missingCreativeDirection: string;
    creationFailed: string;
    identityGenerationDisabled: string;
    generationUnavailable: string;
    generationFailed: string;
    invalidAspectRatio: string;
    aspectRatio: AspectRatioPickerMessages;
    progressTitle: string;
    progressDescription: string;
    progressStatuses: readonly [string, string, string, string];
    closeProgress: string; activeStatus: string; successStatus: string; failedStatus: string;
  };
};

export function GenerateImageForm({ action, initialGenerationId, messages }: GenerateImageFormProps) {
  const router = useRouter();
  const [generationState, setGenerationState] = useState<GenerationState>(initialGenerationId ? "queued" : "idle");
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(initialGenerationId ?? null);
  const [modalOpen, setModalOpen] = useState(Boolean(initialGenerationId));
  const pending = generationState !== "idle" && generationState !== "succeeded" && generationState !== "failed";
  const [message, setMessage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<GenerationAspectRatio>(DEFAULT_GENERATION_ASPECT_RATIO);
  const pendingRef = useRef(false);
  const submissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeGenerationId || (generationState !== "queued" && generationState !== "processing")) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      const [generation] = await getActiveGenerationStatuses([activeGenerationId]);
      if (cancelled || !generation) return;
      setGenerationState(generation.status);
      if (generation.status === "succeeded" || generation.status === "failed" || generation.status === "reconciliation_required") {
        pendingRef.current = false;
        submissionIdRef.current = null;
        setActiveGenerationId(null);
        setModalOpen(false);
        router.refresh();
      }
    };
    const interval = window.setInterval(() => void poll(), 2500);
    void poll();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeGenerationId, generationState, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    const formData = new FormData(event.currentTarget);
    // Keep this identifier through a transport retry; a new click gets a new job.
    submissionIdRef.current ??= crypto.randomUUID();
    formData.set("client_submission_id", submissionIdRef.current);
    setMessage(null);
    setGenerationState("queued");
    setModalOpen(true);
    try {
      const queued = await action(null, formData);
      if (!queued.ok) { setGenerationState("failed"); setMessage(messages[queued.message]); pendingRef.current = false; submissionIdRef.current = null; return; }
      setGenerationState("queued");
      setActiveGenerationId(queued.generationId);
      router.replace(`?generation=${encodeURIComponent(queued.generationId)}`);
      router.refresh();
    } catch { setGenerationState("failed"); setMessage(messages.generationFailed); pendingRef.current = false; }
  }

  return <>
    <form onSubmit={(event) => void handleSubmit(event)} className="project-control-section project-generate-form">
      {message ? <p role="alert" aria-live="assertive" className="project-generation-error">{message}</p> : null}
      <input type="hidden" name="enhance_with_ai" value="on" />
      <AspectRatioPicker value={aspectRatio} onChange={setAspectRatio} disabled={pending} messages={messages.aspectRatio} />
      <input type="hidden" name="aspect_ratio" value={aspectRatio} />
      <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending} className="project-generate-button">{pending ? messages.creating : messages.generate}</Button>
    </form>
    <GenerationStatusIndicator status={generationState} label={pending ? messages.activeStatus : generationState === "succeeded" ? messages.successStatus : messages.failedStatus} onClick={() => { if (generationState === "succeeded") { router.refresh(); return; } setModalOpen(true); }} />
      <GenerationProgressModal open={modalOpen && generationState !== "idle"} onClose={() => setModalOpen(false)} closeLabel={messages.closeProgress} title={generationState === "failed" ? messages.generationFailed : messages.progressTitle} description={messages.progressDescription} statuses={messages.progressStatuses} />
  </>;
}
