"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { VideoPreservationControls } from "./video-preservation-controls";
import { mapRegionToFrame } from "@/lib/video-generation/preservation";
import { Button } from "@/components/ui/button";

import { loadVideoSourceLibrary, resolveIncomingVideoSource } from "@/app/[locale]/dashboard/video/actions";
import { VideoCanvas } from "@/features/video/video-canvas";
import { VideoGenerationInspector } from "@/features/video/video-generation-inspector";
import type { IncomingVideoSourceStatus, VideoLibraryStatus } from "@/features/video/video-source-selector";
import {
  appendPromptSuggestion,
  initialVideoStudioDraft,
  isCurrentVideoSourceRequest,
  isVideoStudioDraftReady,
  validateVideoSourceDimensions,
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
import { createVideoSourceUploadAction, prepareVideoSourceAction, quoteVideoGenerationAction, restoreApprovedVideoGenerationAction, restoreSourceMotionAction, submitVideoGenerationAction } from "@/app/[locale]/dashboard/video/generation-actions";
import type { VideoPreparationSource } from "@/lib/video-generation/types";
import { VideoJobProgress } from "./video-job-progress";
import styles from "@/features/video/video-studio-workspace.module.css";

type WorkspaceView = "controls" | "preview";

async function createLocalPreview(file: File) {
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = previewUrl;
    await image.decode();
    return { previewUrl, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    URL.revokeObjectURL(previewUrl);
    return null;
  }
}

export function VideoStudioWorkspace({ incomingGenerationId = null, generationAvailable = false, proVideoEntitled = false, approvedSubmissionId = null }: { incomingGenerationId?: string | null; generationAvailable?: boolean; proVideoEntitled?: boolean; approvedSubmissionId?: string | null }) {
  const t = useTranslations("Dashboard.videoStudio");
  const locale = useLocale();
  const [draft, dispatch] = useReducer(videoStudioReducer, initialVideoStudioDraft);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteVideoGenerationAction>>>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submissionId, setSubmissionId] = useState(approvedSubmissionId ?? "");
  const [localSubmissionId, setLocalSubmissionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [restoringJob, setRestoringJob] = useState(false);
  const [restoreUnavailable, setRestoreUnavailable] = useState(false);
  const [submissionUsed, setSubmissionUsed] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!generationAvailable || draft.method !== "source-motion") return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let id = crypto.randomUUID() as string;
      try { id = sessionStorage.getItem("klay-source-motion-submission") ?? id; sessionStorage.setItem("klay-source-motion-submission", id); } catch { /* In-memory idempotency remains. */ }
      setLocalSubmissionId(id);
      void restoreSourceMotionAction(id).then(job => { if (active && job) setJobId(job.id); }).catch(() => { if (active) setRestoreUnavailable(true); });
    });
    return () => { active = false; };
  }, [generationAvailable, draft.method]);
  useEffect(() => { if (!approvedSubmissionId) queueMicrotask(() => setSubmissionId(crypto.randomUUID())); }, [approvedSubmissionId]);
  useEffect(() => {
    if (!generationAvailable) return;
    let active = true;
    queueMicrotask(() => { if (active) setQuoteLoading(true); });
    void quoteVideoGenerationAction(draft.quality, draft.duration, { method: draft.method, hasRegion: Boolean(draft.criticalRegion) }).then(value => {
      if (!active) return;
      setQuote(value);
      if (!value?.analysis.enabled) dispatch({ type: "set-analysis", enabled: false });
    }).catch(() => { if (active) setQuote(null); }).finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [draft.quality, draft.duration, draft.method, draft.criticalRegion, generationAvailable]);
  useEffect(() => {
    if (!generationAvailable || !approvedSubmissionId || draft.method !== "kling") return;
    let active = true;
    queueMicrotask(() => { if (active) setRestoringJob(true); });
    void restoreApprovedVideoGenerationAction().then(result => {
      if (!active) return;
      if (result.status === "success") { setJobId(result.job.id); setRestoringJob(false); }
      else if (result.status === "none") setRestoringJob(false);
      else if (result.status === "used") { setSubmissionUsed(true); setRestoringJob(false); }
      else setRestoreUnavailable(true);
    }).catch(() => { if (active) setRestoreUnavailable(true); });
    return () => { active = false; };
  }, [generationAvailable, approvedSubmissionId, draft.method]);
  const currentQuote = quote?.quality === draft.quality && quote.duration === draft.duration && quote.method === draft.method && quote.hasRegion === Boolean(draft.criticalRegion) ? quote : null;
  const sourceMotion = draft.method === "source-motion";
  const analysisAvailable = currentQuote?.analysis ?? { enabled: false, maximumEstimatedCostUsd: null };
  const [view, setView] = useState<WorkspaceView>("controls");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<VideoLibraryStatus>("idle");
  const [libraryAssets, setLibraryAssets] = useState<VideoLibraryAsset[]>([]);
  const [incomingSourceStatus, setIncomingSourceStatus] = useState<IncomingVideoSourceStatus>(
    () => incomingGenerationId ? "loading" : "idle",
  );
  const localPreviewUrl = useRef<string | null>(null);
  const sourceRequest = useRef(0);
  const originalUpload = useRef<{ key: string; promise: Promise<VideoPreparationSource> } | null>(null);
  const [prepared, setPrepared] = useState<{
    key: string; aspectRatio: VideoAspectRatio; status: "preparing" | "error" | "ready";
    frame?: Extract<Awaited<ReturnType<typeof prepareVideoSourceAction>>, { status: "success" }>;
  } | null>(null);

  useEffect(() => {
    const source = draft.source;
    const aspectRatio = draft.aspectRatio;
    if (!source || !generationAvailable) return;
    let active = true;
    queueMicrotask(() => { if (active) { setPrepared({ key: source.id, aspectRatio, status: "preparing" }); setGenerationError(null); } });
    async function prepare() {
      let origin: VideoPreparationSource;
      if (source!.kind === "local") {
        if (originalUpload.current?.key !== source!.id) {
          const local = source!;
          const promise = (async (): Promise<VideoPreparationSource> => {
            const ticket = await createVideoSourceUploadAction(local.name);
            if (ticket.status !== "success") throw new Error("Source upload unavailable.");
            const upload = await createClient().storage.from("video-source-images").uploadToSignedUrl(ticket.objectPath, ticket.token, local.file, { contentType: local.mimeType });
            if (upload.error) throw new Error("Source upload failed.");
            return { kind: "upload", sourceAssetId: ticket.sourceAssetId, objectPath: ticket.objectPath };
          })();
          originalUpload.current = { key: local.id, promise };
          void promise.catch(() => { if (originalUpload.current?.promise === promise) originalUpload.current = null; });
        }
        origin = await originalUpload.current!.promise;
      } else origin = { kind: "generated-image", generationId: source!.generationId };
      const result = await prepareVideoSourceAction(origin, aspectRatio);
      if (active) setPrepared({ key: source!.id, aspectRatio, status: result.status === "success" ? "ready" : "error", frame: result.status === "success" ? result : undefined });
    }
    void prepare().catch(() => { if (active) setPrepared({ key: source.id, aspectRatio, status: "error" }); });
    return () => { active = false; };
  }, [draft.source, draft.aspectRatio, generationAvailable]);
  const currentPreparation = prepared?.key === draft.source?.id && prepared?.aspectRatio === draft.aspectRatio ? prepared : null;
  const preparedFrame = currentPreparation?.status === "ready" ? currentPreparation.frame : null;
  const preparationFailed = currentPreparation?.status === "error";
  const previewSource = draft.source && preparedFrame ? { ...draft.source, previewUrl: preparedFrame.previewUrl } : null;

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
    const preview = await createLocalPreview(file);
    if (!preview) {
      if (isCurrentVideoSourceRequest(request, sourceRequest.current)) {
        dispatch({ type: "set-feedback", feedback: "source-unreadable" });
      }
      return;
    }
    if (!isCurrentVideoSourceRequest(request, sourceRequest.current)) {
      URL.revokeObjectURL(preview.previewUrl);
      return;
    }
    const dimensionError = validateVideoSourceDimensions(preview.width, preview.height);
    if (dimensionError) {
      URL.revokeObjectURL(preview.previewUrl);
      dispatch({ type: "set-feedback", feedback: dimensionError });
      return;
    }

    releaseLocalPreview();
    localPreviewUrl.current = preview.previewUrl;
    dispatch({
      type: "set-source",
      source: {
        kind: "local",
        id: crypto.randomUUID(),
        name: file.name,
        previewUrl: preview.previewUrl,
        mimeType: file.type,
        size: file.size,
        width: preview.width,
        height: preview.height,
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
    if (submitting.current || !currentQuote || !preparedFrame || (draft.analyzeAfterGeneration && !analysisAvailable.enabled)) return;
    submitting.current = true; setBusy(true); setGenerationError(null);
    try {
      const result = await submitVideoGenerationAction({ clientSubmissionId: sourceMotion ? localSubmissionId : submissionId, method: draft.method, criticalRegion: draft.criticalRegion,
        analysisConsent: !sourceMotion && draft.analyzeAfterGeneration && currentQuote.analysis.maximumEstimatedCostUsd !== null ? { model: currentQuote.analysis.model, maximumCostUsd: currentQuote.analysis.maximumEstimatedCostUsd, pricingVersion: currentQuote.analysis.pricingVersion, locale } : null,
        mode: "image", source: preparedFrame.source, prompt: draft.prompt, quality: sourceMotion ? "standard" : draft.quality, aspectRatio: draft.aspectRatio, durationSeconds: draft.duration, cameraMovement: draft.cameraMovement }, currentQuote.estimatedMaxCostUsd);
      if (result.ok) { setJobId(result.jobId); setView("preview"); }
      else {
        const error = result.code === "unsafe_motion" ? "unsafeMotion" : result.code === "approval_required" ? "approval" : result.code === "provider_submission_ambiguous" ? "ambiguous" : "failed";
        setGenerationError(error);
        if (error !== "approval") setView("preview");
      }
    } catch { setGenerationError("ambiguous"); setView("preview"); }
    finally { setBusy(false); submitting.current = false; }
  }

  const promptSuggestions = [
    t("suggestions.image.dolly"),
  ];
  const cameraValues: VideoCameraMovement[] = sourceMotion ? ["static", "dolly-in", "pan-left", "pan-right"] : ["auto", "dolly-in", "dolly-out", "pan-left", "pan-right", "static"];
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
          isSourceMotion={sourceMotion}
          preservationControls={<VideoPreservationControls method={draft.method} region={draft.criticalRegion} sourceUrl={draft.source?.previewUrl ?? null}
            regionResolutionLabel={draft.criticalRegion && preparedFrame ? t("preservation.regionResolution", {
              width: Math.round(draft.criticalRegion.width * preparedFrame.geometry.contentRect.width * preparedFrame.width),
              height: Math.round(draft.criticalRegion.height * preparedFrame.geometry.contentRect.height * preparedFrame.height),
            }) : null}
            analysis={analysisAvailable} analyze={draft.analyzeAfterGeneration}
            onMethod={method => { setJobId(null); setGenerationError(null); setRestoreUnavailable(false); setRestoringJob(false); dispatch({ type: "set-method", method }); }}
            onRegion={region => dispatch({ type: "set-critical-region", region })} onAnalyze={enabled => dispatch({ type: "set-analysis", enabled })} />}
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
            preparationOnly: t(sourceMotion ? "preservation.encodingNotice" : "preparationOnly"),
            libraryLink: t("beta.libraryLink"),
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
          quoteSummary={quoteLoading ? t("preservation.quoteLoading") : sourceMotion ? t(currentQuote ? "preservation.localCost" : "preservation.localDisabled") : currentQuote ? t("preservation.combinedQuote", { generation: currentQuote.estimatedMaxCostUsd.toFixed(6), analysis: draft.analyzeAfterGeneration ? (currentQuote.analysis.maximumEstimatedCostUsd ?? 0).toFixed(6) : "0.000000", total: ((Math.round(currentQuote.estimatedMaxCostUsd * 1e6) + (draft.analyzeAfterGeneration ? Math.round((currentQuote.analysis.maximumEstimatedCostUsd ?? 0) * 1e6) : 0)) / 1e6).toFixed(6) }) : t("beta.quoteUnavailable")}
          submissionId={generationAvailable && (sourceMotion ? localSubmissionId : submissionId) ? t("beta.requestId", { id: sourceMotion ? localSubmissionId : submissionId }) : undefined}
          feedbackMessage={generationError ? t(`beta.${generationError}`) : !sourceMotion && submissionUsed ? t("beta.submissionUsed") : restoreUnavailable && !sourceMotion ? t("beta.restoreUnavailable") : feedbackMessage ?? (draft.source ? t(preparationFailed ? "preparation.failed" : preparedFrame ? "preparation.ready" : "preparation.preparing") : null)}
          feedbackIsError={Boolean(generationError) || preparationFailed || (draft.feedback !== null && draft.feedback !== "not-connected")}
          isReady={isVideoStudioDraftReady(draft)}
          isSubmitting={busy}
          showLibraryLink={!sourceMotion && submissionUsed}
          generationAvailable={generationAvailable && Boolean(currentQuote) && Boolean(preparedFrame) && isVideoStudioDraftReady(draft) && !busy && (sourceMotion || (!restoringJob && !restoreUnavailable && !submissionUsed)) && !jobId && generationError !== "ambiguous" && generationError !== "failed"}
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
        <VideoCanvas
          sourceMotion={sourceMotion}
          criticalRegion={draft.criticalRegion && preparedFrame ? mapRegionToFrame(draft.criticalRegion, preparedFrame.geometry) : null}
          source={previewSource}
          aspectRatio={draft.aspectRatio}
          previewLabel={t("canvas.previewLabel")}
          draftLabel={t("canvas.draftLabel")}
          libraryLabel={t("canvas.libraryLink")}
          sourceAlt={t("canvas.sourceAlt")}
          imageEmptyTitle={t(draft.source ? preparationFailed ? "preparation.failed" : "preparation.preparing" : "canvas.imageEmptyTitle")}
          imageEmptyDescription={t(draft.source ? "preparation.description" : "canvas.imageEmptyDescription")}
          generationsTitle={t("generations.title")}
          generationsEmptyTitle={t("generations.emptyTitle")}
          generationsEmptyDescription={t("generations.emptyDescription")}
        />
        <VideoJobProgress jobId={jobId} generationMethod={draft.method} submitting={busy} restoreUnavailable={!sourceMotion && restoreUnavailable} submissionError={generationError === "ambiguous" || generationError === "failed" ? generationError : null} />
        {sourceMotion && (jobId || generationError) ? <Button variant="secondary" onClick={() => { const id = crypto.randomUUID(); setLocalSubmissionId(id); try { sessionStorage.setItem("klay-source-motion-submission", id); } catch { /* Optional cache. */ } setJobId(null); setGenerationError(null); }}>{t("preservation.newLocalRequest")}</Button> : null}
      </div>
    </main>
  );
}
