"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { loadVideoSourceLibrary, resolveIncomingVideoSource } from "@/app/[locale]/dashboard/video/actions";
import { VideoCanvas } from "@/features/video/video-canvas";
import { VideoGenerationInspector } from "@/features/video/video-generation-inspector";
import type { IncomingVideoSourceStatus, VideoLibraryStatus } from "@/features/video/video-source-selector";
import {
  appendPromptSuggestion,
  initialVideoStudioDraft,
  isCurrentVideoSourceRequest,
  isVideoStudioDraftReady,
  validateVideoSourceFile,
  validateVideoStudioDraft,
  videoStudioReducer,
} from "@/features/video/video-studio-state";
import type {
  VideoAspectRatio,
  VideoCameraMovement,
  VideoDuration,
  VideoLibraryAsset,
  VideoQuality,
} from "@/features/video/video-studio-types";
import { createClient } from "@/lib/supabase/client";
import { createVideoSourceUploadAction, finalizeVideoSourceUploadAction, quoteVideoGenerationAction, submitVideoGenerationAction } from "@/app/[locale]/dashboard/video/generation-actions";
import { VideoJobProgress } from "./video-job-progress";
import styles from "@/features/video/video-studio-workspace.module.css";

type WorkspaceView = "controls" | "preview";

async function createLocalPreview(file: File) {
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = previewUrl;
    await image.decode();
    return previewUrl;
  } catch {
    URL.revokeObjectURL(previewUrl);
    return null;
  }
}

export function VideoStudioWorkspace({ incomingGenerationId = null, generationAvailable = false, proVideoEntitled = false, approvedSubmissionId = null }: { incomingGenerationId?: string | null; generationAvailable?: boolean; proVideoEntitled?: boolean; approvedSubmissionId?: string | null }) {
  const t = useTranslations("Dashboard.videoStudio");
  const [draft, dispatch] = useReducer(videoStudioReducer, initialVideoStudioDraft);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteVideoGenerationAction>>>(null);
  const [submissionId, setSubmissionId] = useState(approvedSubmissionId ?? "");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => { if (!approvedSubmissionId) queueMicrotask(() => setSubmissionId(crypto.randomUUID())); }, [approvedSubmissionId]);
  useEffect(() => {
    if (!generationAvailable) return;
    let active = true;
    void quoteVideoGenerationAction(draft.quality, draft.duration).then(value => { if (active) setQuote(value); });
    return () => { active = false; };
  }, [draft.quality, draft.duration, generationAvailable]);
  const currentQuote = quote?.quality === draft.quality && quote.duration === draft.duration ? quote : null;
  const [view, setView] = useState<WorkspaceView>("controls");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<VideoLibraryStatus>("idle");
  const [libraryAssets, setLibraryAssets] = useState<VideoLibraryAsset[]>([]);
  const [incomingSourceStatus, setIncomingSourceStatus] = useState<IncomingVideoSourceStatus>(
    () => incomingGenerationId ? "loading" : "idle",
  );
  const localPreviewUrl = useRef<string | null>(null);
  const sourceRequest = useRef(0);

  useEffect(
    () => () => {
      sourceRequest.current += 1;
      if (localPreviewUrl.current) URL.revokeObjectURL(localPreviewUrl.current);
    },
    [],
  );

  useEffect(() => {
    if (!incomingGenerationId) return;
    const request = ++sourceRequest.current;
    queueMicrotask(() => {
      if (isCurrentVideoSourceRequest(request, sourceRequest.current)) setIncomingSourceStatus("loading");
    });

    void resolveIncomingVideoSource(incomingGenerationId).then((result) => {
      if (!isCurrentVideoSourceRequest(request, sourceRequest.current)) return;
      if (result.status !== "success") {
        setIncomingSourceStatus("error");
        return;
      }
      if (localPreviewUrl.current) {
        URL.revokeObjectURL(localPreviewUrl.current);
        localPreviewUrl.current = null;
      }
      dispatch({
        type: "set-source",
        source: {
          kind: "library",
          ...result.asset,
          name: result.asset.name?.trim() || t("source.incomingName"),
        },
      });
      setIncomingSourceStatus("success");
    }).catch(() => {
      if (isCurrentVideoSourceRequest(request, sourceRequest.current)) setIncomingSourceStatus("error");
    });

    return () => {
      if (isCurrentVideoSourceRequest(request, sourceRequest.current)) sourceRequest.current += 1;
    };
  }, [incomingGenerationId, t]);

  function releaseLocalPreview() {
    if (!localPreviewUrl.current) return;
    URL.revokeObjectURL(localPreviewUrl.current);
    localPreviewUrl.current = null;
  }

  async function handleLocalFile(file: File) {
    setIncomingSourceStatus("idle");
    const fileError = validateVideoSourceFile(file);
    if (fileError) {
      dispatch({ type: "set-feedback", feedback: fileError });
      return;
    }

    const request = ++sourceRequest.current;
    const previewUrl = await createLocalPreview(file);
    if (!previewUrl) {
      if (isCurrentVideoSourceRequest(request, sourceRequest.current)) {
        dispatch({ type: "set-feedback", feedback: "source-unreadable" });
      }
      return;
    }
    if (!isCurrentVideoSourceRequest(request, sourceRequest.current)) {
      URL.revokeObjectURL(previewUrl);
      return;
    }

    releaseLocalPreview();
    localPreviewUrl.current = previewUrl;
    dispatch({
      type: "set-source",
      source: {
        kind: "local",
        id: crypto.randomUUID(),
        name: file.name,
        previewUrl,
        mimeType: file.type,
        size: file.size,
        file,
      },
    });
  }

  function removeSource() {
    sourceRequest.current += 1;
    setIncomingSourceStatus("idle");
    releaseLocalPreview();
    dispatch({ type: "remove-source" });
  }

  function selectLibraryAsset(asset: VideoLibraryAsset) {
    sourceRequest.current += 1;
    setIncomingSourceStatus("idle");
    releaseLocalPreview();
    dispatch({ type: "set-source", source: { kind: "library", ...asset } });
    setLibraryOpen(false);
  }

  async function loadLibrary() {
    setLibraryStatus("loading");
    const result = await loadVideoSourceLibrary();
    if (result.status !== "success") {
      setLibraryAssets([]);
      setLibraryStatus("error");
      return;
    }
    setLibraryAssets(result.assets);
    setLibraryStatus("success");
  }

  function toggleLibrary() {
    const nextOpen = !libraryOpen;
    setLibraryOpen(nextOpen);
    if (nextOpen && libraryStatus === "idle") void loadLibrary();
  }

  function setPrompt(prompt: string) {
    dispatch({ type: "set-prompt", prompt });
  }

  function useSuggestion(suggestion: string) {
    setPrompt(appendPromptSuggestion(draft.prompt, suggestion));
  }

  async function handleGenerate() {
    const validationError = validateVideoStudioDraft(draft);
    if (validationError) { dispatch({ type: "set-feedback", feedback: validationError }); return; }
    if (submitting.current || !currentQuote || !draft.source) return;
    submitting.current = true; setBusy(true); setGenerationError(null);
    try {
      let source: { kind: "generated-image"; generationId: string } | { kind: "uploaded-image"; sourceAssetId: string };
      if (draft.source.kind === "local") {
        const ticket = await createVideoSourceUploadAction(draft.source.name);
        if (ticket.status !== "success") throw new Error("source_unavailable");
        const upload = await createClient().storage.from("video-source-images").uploadToSignedUrl(ticket.objectPath, ticket.token, draft.source.file, { contentType: draft.source.mimeType });
        if (upload.error) throw new Error("source_unavailable");
        const finalized = await finalizeVideoSourceUploadAction(ticket.sourceAssetId, ticket.objectPath);
        if (finalized.status !== "success") throw new Error("source_unavailable");
        source = finalized.source;
      } else source = { kind: "generated-image", generationId: draft.source.generationId };
      const result = await submitVideoGenerationAction({ clientSubmissionId: submissionId, mode: "image", source,
        prompt: draft.prompt, quality: draft.quality, aspectRatio: draft.aspectRatio, durationSeconds: draft.duration, cameraMovement: draft.cameraMovement }, currentQuote.estimatedMaxCostUsd);
      if (result.ok) setJobId(result.jobId);
      else setGenerationError(result.code === "approval_required" ? "approval" : result.code === "provider_submission_ambiguous" ? "ambiguous" : "failed");
    } catch { setGenerationError("failed"); }
    finally { setBusy(false); submitting.current = false; }
  }

  const promptSuggestions = [
    t("suggestions.image.dolly"),
    t("suggestions.image.orbit"),
    t("suggestions.image.fabric"),
    t("suggestions.image.lighting"),
  ];
  const cameraValues: VideoCameraMovement[] = [
    "auto",
    "dolly-in",
    "dolly-out",
    "orbit",
    "pan-left",
    "pan-right",
    "static",
  ];
  const qualityValues: VideoQuality[] = ["standard", "pro"];
  const aspectRatioValues: VideoAspectRatio[] = ["16:9", "9:16", "1:1"];
  const durationValues: VideoDuration[] = [5, 10];
  const feedbackMessage = draft.feedback
    ? t(`validation.${draft.feedback}`)
    : null;

  return (
    <main className={styles.workspace} data-view={view} aria-label={t("title")}>
      <div className={styles.viewSwitch} role="group" aria-label={t("mobile.viewLabel")}>
        <button
          type="button"
          aria-pressed={view === "controls"}
          aria-controls="video-studio-inspector"
          onClick={() => setView("controls")}
        >
          {t("mobile.controls")}
        </button>
        <button
          type="button"
          aria-pressed={view === "preview"}
          aria-controls="video-studio-canvas"
          onClick={() => setView("preview")}
        >
          {t("mobile.preview")}
        </button>
      </div>

      <div id="video-studio-inspector" className={styles.inspectorRegion}>
        <VideoGenerationInspector
          copy={{
            title: t("title"),
            description: t("description"),
            source: {
              heading: t("source.heading"),
              description: t("source.description"),
              upload: t("source.upload"),
              replace: t("source.replace"),
              remove: t("source.remove"),
              chooseLibrary: t("source.chooseLibrary"),
              closeLibrary: t("source.closeLibrary"),
              dropLabel: t("source.dropLabel"),
              selectedAlt: t("source.selectedAlt"),
              localLabel: t("source.localLabel"),
              libraryLabel: t("source.libraryLabel"),
              fileMeta: (format, kilobytes) => t("source.fileMeta", { format, kilobytes }),
              libraryLoading: t("source.libraryLoading"),
              libraryEmpty: t("source.libraryEmpty"),
              libraryError: t("source.libraryError"),
              retry: t("source.retry"),
              selectAsset: t("source.selectAsset"),
              incomingLoading: t("source.incomingLoading"),
              incomingError: t("source.incomingError"),
            },
            promptHeading: t("prompt.image.heading"),
            promptDescription: t("prompt.image.description"),
            promptPlaceholder: t("prompt.image.placeholder"),
            inspirationLabel: t("prompt.inspirationLabel"),
            cameraHeading: t("camera.heading"),
            cameraDescription: t("camera.description"),
            qualityHeading: t("quality.heading"),
            outputHeading: t("output.heading"),
            aspectRatioLabel: t("output.aspectRatio"),
            durationLabel: t("output.duration"),
            secondsLabel: (seconds) => t("output.seconds", { seconds }),
            generate: busy ? t("beta.submitting") : t("generate"),
            preparationOnly: t("preparationOnly"),
          }}
          source={draft.source}
          prompt={draft.prompt}
          promptSuggestions={promptSuggestions}
          cameraMovement={draft.cameraMovement}
          cameraOptions={cameraValues.map((value) => ({
            value,
            label: t(`camera.options.${value}.label`),
            description: t(`camera.options.${value}.description`),
          }))}
          quality={draft.quality}
          qualityOptions={qualityValues.map((value) => ({
            value,
            label: t(`quality.options.${value}.label`),
            description: value === "pro" && !proVideoEntitled ? t("quality.proLocked") : t(`quality.options.${value}.description`),
            disabled: value === "pro" && !proVideoEntitled,
          }))}
          aspectRatio={draft.aspectRatio}
          aspectRatioOptions={aspectRatioValues.map((value) => ({ value, label: value }))}
          duration={draft.duration}
          durationOptions={durationValues}
          quoteSummary={currentQuote ? t("beta.quote", { model: t(`quality.options.${draft.quality}.label`), seconds: draft.duration, cost: currentQuote.estimatedMaxCostUsd.toFixed(2) }) : t("beta.quoteUnavailable")}
          submissionId={generationAvailable && submissionId ? t("beta.requestId", { id: submissionId }) : undefined}
          feedbackMessage={generationError ? t(`beta.${generationError}`) : feedbackMessage}
          feedbackIsError={Boolean(generationError) || (draft.feedback !== null && draft.feedback !== "not-connected")}
          isReady={isVideoStudioDraftReady(draft)}
          generationAvailable={generationAvailable && Boolean(currentQuote) && !busy && !jobId}
          libraryAssets={libraryAssets}
          libraryOpen={libraryOpen}
          libraryStatus={libraryStatus}
          incomingSourceStatus={incomingSourceStatus}
          onFile={(file) => void handleLocalFile(file)}
          onRemoveSource={removeSource}
          onToggleLibrary={toggleLibrary}
          onRetryLibrary={() => void loadLibrary()}
          onSelectLibrary={selectLibraryAsset}
          onPromptChange={setPrompt}
          onSuggestion={useSuggestion}
          onCameraChange={(cameraMovement) => dispatch({ type: "set-camera", cameraMovement })}
          onQualityChange={(quality) => dispatch({ type: "set-quality", quality })}
          onAspectRatioChange={(aspectRatio) => dispatch({ type: "set-aspect-ratio", aspectRatio })}
          onDurationChange={(duration) => dispatch({ type: "set-duration", duration })}
          onGenerate={handleGenerate}
        />
      </div>

      <div id="video-studio-canvas" className={styles.canvasRegion}>
        {jobId ? <VideoJobProgress jobId={jobId} /> : null}
        <VideoCanvas
          source={draft.source}
          aspectRatio={draft.aspectRatio}
          previewLabel={t("canvas.previewLabel")}
          draftLabel={t("canvas.draftLabel")}
          libraryLabel={t("canvas.libraryLink")}
          sourceAlt={t("canvas.sourceAlt")}
          imageEmptyTitle={t("canvas.imageEmptyTitle")}
          imageEmptyDescription={t("canvas.imageEmptyDescription")}
          generationsTitle={t("generations.title")}
          generationsEmptyTitle={t("generations.emptyTitle")}
          generationsEmptyDescription={t("generations.emptyDescription")}
        />
      </div>
    </main>
  );
}
