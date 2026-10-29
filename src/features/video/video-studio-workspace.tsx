"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { VideoProductReferences } from "./video-product-references";
import { VideoPreservationControls } from "./video-preservation-controls";
import { Button } from "@/components/ui/button";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { Link } from "@/i18n/navigation";
import { VideoDirectorPanel, VideoDirectorPresetSelector, type VideoProductAnalysisDisplayStatus } from "./video-director-panel";
import type { VideoDirectorSelection } from "@/lib/video-director/core";
import type { VideoPresetId, VideoShotMode } from "@/lib/video-director/presets";
import type { summarizeVideoPayload } from "@/lib/video-generation/payload-summary";
import { mapRegionToFrame } from "@/lib/video-generation/preservation";

import { loadVideoSourceLibrary, resolveIncomingVideoSource } from "@/app/[locale]/dashboard/video/actions";
import { VideoCanvas } from "@/features/video/video-canvas";
import { VideoGenerationInspector } from "@/features/video/video-generation-inspector";
import type { IncomingVideoSourceStatus, VideoLibraryStatus } from "@/features/video/video-source-selector";
import {
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
import { createVideoSourceUploadAction, prepareVideoSourceAction, quoteVideoGenerationAction, quoteVideoSubmissionAction, restoreLatestVideoGenerationAction, restoreVideoGenerationBySubmissionAction, submitVideoGenerationAction } from "@/app/[locale]/dashboard/video/generation-actions";
import type { VideoGenerationDraft, VideoPreparationSource } from "@/lib/video-generation/types";
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

export function VideoStudioWorkspace({ incomingGenerationId = null, generationAvailable = false, recoveryScope = null, studioOptions = { tiers: ["standard", "pro"], durations: [5, 10] } }: { incomingGenerationId?: string | null; generationAvailable?: boolean; recoveryScope?: string | null; studioOptions?: { tiers: string[]; durations: number[] } }) {
  const t = useTranslations("Dashboard.videoStudio");
  const locale = useLocale();
  const [draft, dispatch] = useReducer(videoStudioReducer, initialVideoStudioDraft);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteVideoGenerationAction>>>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [restoringJob, setRestoringJob] = useState(generationAvailable);
  const [restoreUnavailable, setRestoreUnavailable] = useState(false);
  const [submissionUsed, setSubmissionUsed] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [shotMode, setShotMode] = useState<VideoShotMode>("single");
  const [presetId, setPresetId] = useState<VideoPresetId>("minimal-studio");
  const [referenceState, setReferenceState] = useState<{ key: string; refs: NonNullable<VideoGenerationDraft["productReferences"]> }>({ key: "", refs: [] });
  const [director, setDirector] = useState<{ key: string; selection: VideoDirectorSelection } | null>(null);
  const [submissionQuote, setSubmissionQuote] = useState<{ key: string; cost: number; receipt: string; expiresAt: number; preview: ReturnType<typeof summarizeVideoPayload>["preview"] } | null>(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState<string | null>(null);
  const [preparingQuote, setPreparingQuote] = useState(false);
  const submitting = useRef(false);
  const recoveryKey = recoveryScope ? `video-studio-submission-v1:${recoveryScope}` : null;
  useEffect(() => {
    if (!generationAvailable) return;
    let active = true;
    void quoteVideoGenerationAction(draft.quality, draft.duration, { hasRegion: Boolean(draft.criticalRegion) }).then(value => {
      if (!active) return;
      setQuote(value);
      if (!value?.analysis.enabled) dispatch({ type: "set-analysis", enabled: false });
    }).catch(() => { if (active) setQuote(null); });
    return () => { active = false; };
  }, [draft.quality, draft.duration, draft.criticalRegion, generationAvailable]);
  useEffect(() => {
    if (!generationAvailable || !recoveryKey) return;
    let active = true;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(recoveryKey); } catch { /* Submission checks storage again before any paid request. */ }
    if (!saved) {
      void restoreLatestVideoGenerationAction().then(result => {
        if (!active) return;
        if (result.status === "success") {
          setSubmissionId(result.submissionId); setJobId(result.job.id);
          try { sessionStorage.setItem(recoveryKey, result.submissionId); } catch { /* No new paid request was made. */ }
        } else if (result.status === "none") {
          const nextId = crypto.randomUUID(); setSubmissionId(nextId);
          try { sessionStorage.setItem(recoveryKey, `draft:${nextId}`); } catch { /* Checked before submission. */ }
        } else setRestoreUnavailable(true);
        setRestoringJob(false);
      }).catch(() => { if (active) { setRestoreUnavailable(true); setRestoringJob(false); } });
      return () => { active = false; };
    }
    if (saved.startsWith("draft:")) {
      const draftId = saved.slice("draft:".length);
      queueMicrotask(() => { if (active) { setSubmissionId(draftId); setRestoringJob(false); } });
      return () => { active = false; };
    }
    const recoveredId = saved;
    queueMicrotask(() => { if (active) { setSubmissionId(recoveredId); setRestoringJob(true); } });
    void restoreVideoGenerationBySubmissionAction(recoveredId).then(result => {
      if (!active) return;
      if (result.status === "success") {
        if (result.job.status === "ready" || (result.job.status === "failed" && result.job.progressPhase !== "ambiguous")) {
          const nextId = crypto.randomUUID(); setSubmissionId(nextId);
          try { sessionStorage.setItem(recoveryKey, `draft:${nextId}`); } catch { /* Submission still requires durable session storage. */ }
        } else setJobId(result.job.id);
        setRestoringJob(false);
      }
      else { setRestoreUnavailable(true); setRestoringJob(false); }
    }).catch(() => { if (active) { setRestoreUnavailable(true); setRestoringJob(false); } });
    return () => { active = false; };
  }, [generationAvailable, recoveryKey]);
  useEffect(() => {
    if (!submissionQuote) return;
    const timer = setTimeout(() => { setSubmissionQuote(null); setConfirmedReceipt(null); }, Math.max(0, submissionQuote.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [submissionQuote]);
  const currentQuote = quote?.quality === draft.quality && quote.duration === draft.duration && quote.hasRegion === Boolean(draft.criticalRegion) ? quote : null;
  const analysisAvailable = currentQuote?.analysis ?? { enabled: false, maximumEstimatedCostUsd: null };
  const [view, setView] = useState<WorkspaceView>("controls");
  useEffect(() => {
    if (view !== "preview") return;
    document.getElementById("video-studio-canvas")?.scrollIntoView({ block: "start" });
    document.getElementById("video-studio-canvas")?.focus({ preventScroll: true });
  }, [view]);
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
  const [productAnalysisState, setProductAnalysisState] = useState<{ sourceAssetId: string; status: VideoProductAnalysisDisplayStatus } | null>(null);

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
  const productAnalysisStatus: VideoProductAnalysisDisplayStatus = preparedFrame
    ? productAnalysisState?.sourceAssetId === preparedFrame.source.sourceAssetId ? productAnalysisState.status
      : preparedFrame.presetContext.category === "unknown" ? "not_analyzed" : "verified"
    : "not_analyzed";
  const preparationFailed = currentPreparation?.status === "error";
  const previewSource = draft.source && preparedFrame ? { ...draft.source, previewUrl: preparedFrame.previewUrl } : null;
  const referenceKey = JSON.stringify([draft.source?.id, draft.aspectRatio]);
  const generationDraft: VideoGenerationDraft = { productReferences: referenceState.key === referenceKey ? referenceState.refs : [], clientSubmissionId: submissionId, criticalRegion: draft.criticalRegion,
    analysisConsent: draft.analyzeAfterGeneration && currentQuote?.analysis.maximumEstimatedCostUsd != null
      && currentQuote.analysis.model && currentQuote.analysis.pricingVersion
      ? { model: currentQuote.analysis.model, maximumCostUsd: currentQuote.analysis.maximumEstimatedCostUsd,
        pricingVersion: currentQuote.analysis.pricingVersion, locale: locale === "en" ? "en" : "tr" } : null,
    mode: "image", shotMode, source: preparedFrame?.source ?? null, prompt: draft.prompt, quality: draft.quality,
    aspectRatio: draft.aspectRatio, durationSeconds: draft.duration, cameraMovement: draft.cameraMovement };
  const directorDraftKey = JSON.stringify({ ...generationDraft, clientSubmissionId: "" });
  const directorPanelKey = JSON.stringify({ ...generationDraft, clientSubmissionId: "", shotMode: undefined });
  const currentDirector = director?.key === directorDraftKey ? director.selection : null;
  useEffect(() => {
    // Discard an old plan even if a later edit restores the previous field values.
    queueMicrotask(() => setDirector(current => current && current.key !== directorDraftKey ? null : current));
  }, [directorDraftKey]);
  const directorReady = Boolean(currentDirector);
  const approvedDraft = { ...generationDraft, ...(currentDirector ? { director: currentDirector } : {}) };
  const approvalKey = JSON.stringify(approvedDraft);
  const activeSubmissionQuote = submissionQuote?.key === approvalKey ? submissionQuote : null;
  const quoteConfirmed = Boolean(activeSubmissionQuote && confirmedReceipt === activeSubmissionQuote.receipt);
  const approvalGeneration = useRef({ key: approvalKey, value: 0 });
  useEffect(() => {
    if (approvalGeneration.current.key === approvalKey) return;
    approvalGeneration.current = { key: approvalKey, value: approvalGeneration.current.value + 1 };
    queueMicrotask(() => { setSubmissionQuote(null); setConfirmedReceipt(null); });
  }, [approvalKey]);
  const directorPlanDisabledReason = busy || restoringJob || restoreUnavailable || submissionUsed || Boolean(jobId)
    ? "planLocked"
    : !draft.source ? "planNeedsSource"
      : !preparedFrame ? "planNeedsPreparedSource"
        : !isVideoStudioDraftReady(draft) ? "planNeedsReadyDraft" : null;

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

  function newSubmission() {
    if (busy || preparingQuote) return;
    const nextId = crypto.randomUUID();
    try { if (recoveryKey) sessionStorage.setItem(recoveryKey, `draft:${nextId}`); } catch { /* Saving before submission must still succeed. */ }
    setSubmissionId(nextId); setJobId(null); setRestoreUnavailable(false); setRestoringJob(false);
    dispatch({ type: "set-analysis", enabled: false });
    setSubmissionUsed(false); setGenerationError(null); setSubmissionQuote(null); setConfirmedReceipt(null); setView("controls");
  }

  async function prepareSubmissionQuote() {
    if (preparingQuote || busy || !preparedFrame || !submissionId || !isVideoStudioDraftReady(draft)
      || !directorReady || restoringJob || restoreUnavailable || submissionUsed || jobId) return;
    setPreparingQuote(true); setSubmissionQuote(null); setConfirmedReceipt(null); setGenerationError(null);
    const requestedApprovalGeneration = approvalGeneration.current.value;
    try {
      const result = await quoteVideoSubmissionAction(approvedDraft);
      if (approvalGeneration.current.value !== requestedApprovalGeneration) return;
      if (result.status === "success") setSubmissionQuote({ key: approvalKey, cost: result.cost, receipt: result.receipt, expiresAt: result.expiresAt, preview: result.preview });
      else if (result.status === "used") { setSubmissionUsed(true); setGenerationError("submissionUsed"); }
      else setGenerationError(`quote_${result.reasonCode}`);
    } catch { setGenerationError("quote_repository_unavailable"); }
    finally { setPreparingQuote(false); }
  }

  async function handleGenerate() {
    const validationError = validateVideoStudioDraft(draft);
    if (validationError) { dispatch({ type: "set-feedback", feedback: validationError }); return; }
    if (submitting.current || !activeSubmissionQuote || !quoteConfirmed || !preparedFrame || (draft.analyzeAfterGeneration && !analysisAvailable.enabled)) return;
    if (!directorReady) return;
    try {
      if (!recoveryKey) throw new Error("Recovery unavailable.");
      sessionStorage.setItem(recoveryKey, submissionId);
    } catch { setGenerationError("recoveryStorage"); return; }
    submitting.current = true; setBusy(true); setGenerationError(null);
    try {
      const result = await submitVideoGenerationAction(approvedDraft, activeSubmissionQuote.cost, activeSubmissionQuote.receipt, quoteConfirmed);
      if (result.ok) { setJobId(result.jobId); setView("preview"); }
      else {
        const error = result.code === "unsafe_motion" ? "unsafeMotion" : result.code === "approval_required" ? "approval" : result.code === "provider_submission_ambiguous" ? "ambiguous" : result.code === "provider_failure" ? "providerRejected" : result.code === "budget_limit_reached" ? "budgetLimit" : result.code === "billing_unavailable" ? "billingUnavailable" : result.code === "source_unavailable" ? "sourceUnavailable" : result.code === "invalid_input" ? "invalidPrompt" : "failed";
        if (error === "approval" || error === "unsafeMotion") {
          try { sessionStorage.setItem(recoveryKey!, `draft:${submissionId}`); } catch { /* A later reload remains safely blocked. */ }
          setSubmissionQuote(null); setConfirmedReceipt(null);
        }
        if (error === "providerRejected") {
          setSubmissionUsed(true); setSubmissionQuote(null); setConfirmedReceipt(null);
        }
        setGenerationError(error);
      }
    } catch { setGenerationError("ambiguous"); }
    finally { setBusy(false); submitting.current = false; }
  }

  const cameraValues: VideoCameraMovement[] = ["auto", "dolly-in", "dolly-out", "pan-left", "pan-right", "static"];
  const qualityValues: VideoQuality[] = ["standard", "pro"];
  const aspectRatioValues: VideoAspectRatio[] = ["16:9", "9:16", "1:1"];
  const durationValues: VideoDuration[] = [5, 10];
  const nextSubmissionStep = generationError || submissionUsed || restoreUnavailable ? null
    : restoringJob ? "checkingPrevious"
      : jobId ? "newSubmissionFirst"
        : !generationAvailable ? "videoUnavailable"
          : !submissionId ? "preparingSubmission"
            : !draft.source ? "selectSourceFirst"
              : !preparedFrame ? preparationFailed ? "sourcePrepareFailed" : "preparingSource"
                : !isVideoStudioDraftReady(draft) ? "completeSettingsFirst"
                  : !directorReady ? "prepareDirectorFirst"
                    : preparingQuote ? null
                      : !activeSubmissionQuote ? "verifyCostFirst"
                        : !quoteConfirmed ? "confirmCostFirst" : null;
  const feedbackMessage = draft.feedback
    ? t(`validation.${draft.feedback}`)
    : null;

  return (
    <main className={styles.workspace} data-view={view} aria-label={t("title")}>
      <header className={styles.workspaceHeader}>
        <div>
          <span className={styles.eyebrow}><DashboardIcon name="video" />{t("layout.eyebrow")}</span>
          <h1 id="video-studio-title">{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
        <Link className={styles.headerLibraryLink} href="/dashboard/videos"><DashboardIcon name="projects" />{t("beta.libraryLink")}<DashboardIcon name="arrow" /></Link>
      </header>
      <div className={styles.viewSwitch} role="group" aria-label={t("mobile.viewLabel")}>
        <button
          type="button"
          aria-pressed={view === "controls"}
          aria-controls="video-studio-inspector"
          onClick={() => { setView("controls"); document.getElementById("video-studio-inspector")?.scrollIntoView({ block: "start" }); document.getElementById("video-source-heading")?.focus({ preventScroll: true }); }}
        >
          {t("mobile.controls")}
        </button>
        <button
          type="button"
          aria-pressed={view === "preview"}
          aria-controls="video-studio-canvas"
          onClick={() => { setView("preview"); document.getElementById("video-studio-canvas")?.scrollIntoView({ block: "start" }); document.getElementById("video-studio-canvas")?.focus({ preventScroll: true }); }}
        >
          {t("mobile.preview")}
        </button>
      </div>

      <div id="video-studio-inspector" className={styles.inspectorRegion}>
        <VideoGenerationInspector
          costSummary={<div className={styles.costSummary} aria-live="polite">
            <div><span>{t(activeSubmissionQuote ? "layout.verifiedCost" : "layout.estimatedCost")}</span>
              <strong>{activeSubmissionQuote ? t("layout.usd", { cost: activeSubmissionQuote.cost.toFixed(6) }) : currentQuote ? t("layout.usd", { cost: currentQuote.estimatedMaxCostUsd.toFixed(6) }) : "—"}</strong>
            </div>
            <p>{t(activeSubmissionQuote ? "layout.costApprovalHint" : "layout.costEstimateHint")}</p>
          </div>}
          approvalControls={<>
            <Button variant="secondary" className={styles.quoteButton} onClick={() => void prepareSubmissionQuote()}
              disabled={!generationAvailable || !submissionId || !preparedFrame || !isVideoStudioDraftReady(draft) || !directorReady
                || busy || preparingQuote || restoringJob || restoreUnavailable || submissionUsed || Boolean(jobId)}>
              {t(preparingQuote ? "beta.preparingQuote" : "beta.prepareQuote")}
            </Button>
            {activeSubmissionQuote ? <details className={styles.payloadDetails}>
              <summary>{t("beta.payloadPreview")}</summary>
              <div className={styles.directorPlan}>
              {activeSubmissionQuote.preview.referenceReviews.map(review => <p key={review.index}>{review.index + 1}: {t(`references.${review.status}`)} — <span lang="en">{review.reason}</span></p>)}
              <p>{t(activeSubmissionQuote.preview.mode === "multi" ? "director.multi" : "director.single")} · {t("beta.shotCount", { count: activeSubmissionQuote.preview.shots.length })}</p>
              <ol>{activeSubmissionQuote.preview.shots.map((shot, index) => <li key={index}>
                <h4>{t("director.shot", { number: index + 1, seconds: shot.duration })}</h4>
                <p lang="en">{shot.camera}</p><p lang="en">{shot.prompt}</p>
              </li>)}</ol>
              </div>
            </details> : null}
            {activeSubmissionQuote ? <label className={styles.directorConsent}>
              <input type="checkbox" checked={quoteConfirmed} disabled={busy} onChange={event => setConfirmedReceipt(event.target.checked ? activeSubmissionQuote.receipt : null)} />
              <span>{t("beta.confirmCost", { cost: activeSubmissionQuote.cost.toFixed(6) })}</span>
            </label> : null}
            {(jobId || submissionUsed || restoreUnavailable || generationError === "failed" || generationError === "ambiguous") && !busy
              ? <Button variant="ghost" size="sm" onClick={newSubmission}>{t("beta.newSubmission")}</Button> : null}
          </>}
          referenceControls={preparedFrame ? <VideoProductReferences key={referenceKey} sourceKey={referenceKey}
            product={preparedFrame.presetContext} presetId={presetId} aspectRatio={draft.aspectRatio} disabled={busy || preparingQuote}
            onChange={refs => { setReferenceState({ key: referenceKey, refs }); setDirector(null); setSubmissionQuote(null); setConfirmedReceipt(null); }} /> : null}
          presetControls={<VideoDirectorPresetSelector presetId={presetId}
            disabled={busy}
            product={preparedFrame?.presetContext}
            analysisStatus={productAnalysisStatus}
            onChange={nextPresetId => {
              setPresetId(nextPresetId); setDirector(null); setSubmissionQuote(null); setConfirmedReceipt(null);
            }} />}
          directorControls={
            <VideoDirectorPanel key={directorPanelKey} draft={generationDraft} draftKey={directorDraftKey}
              presetId={presetId} shotMode={shotMode}
              planDisabled={Boolean(directorPlanDisabledReason)} disabledReason={directorPlanDisabledReason}
              onPrepared={(selection, productContext, analysisStatus) => {
                setDirector(selection ? { key: directorDraftKey, selection } : null);
                setSubmissionQuote(null);
                setConfirmedReceipt(null);
                if (preparedFrame && productContext && analysisStatus) {
                  setPrepared(current => current?.frame ? { ...current, frame: { ...current.frame, presetContext: productContext } } : current);
                  setProductAnalysisState({ sourceAssetId: preparedFrame.source.sourceAssetId, status: analysisStatus });
                }
              }} />}
          advancedSettings={<details className={styles.advancedSettings}>
            <summary>{t("advancedSettings")}</summary>
            <VideoPreservationControls region={draft.criticalRegion} sourceUrl={draft.source?.previewUrl ?? null}
            regionResolutionLabel={draft.criticalRegion && preparedFrame ? t("preservation.regionResolution", {
              width: Math.round(draft.criticalRegion.width * preparedFrame.geometry.contentRect.width * preparedFrame.width),
              height: Math.round(draft.criticalRegion.height * preparedFrame.geometry.contentRect.height * preparedFrame.height),
            }) : null}
            analysis={analysisAvailable} analyze={draft.analyzeAfterGeneration}
            onRegion={region => dispatch({ type: "set-critical-region", region })} onAnalyze={enabled => dispatch({ type: "set-analysis", enabled })} />
            <fieldset className={styles.directorFields}>
              <legend>{t("camera.heading")}</legend>
              <p className={styles.fieldDescription}>{t("singleImageNotice")}</p>
              <div className={styles.compactOptions}>{cameraValues.map(value => <label key={value}>
                <input type="radio" name="video-camera" value={value} checked={draft.cameraMovement === value}
                  onChange={() => dispatch({ type: "set-camera", cameraMovement: value })} />
                <span>{t(`camera.options.${value}.label`)}</span>
              </label>)}</div>
            </fieldset>
            <fieldset className={styles.directorFields}>
              <legend>{t("director.shotMode")}</legend>
              <div className={styles.compactOptions}>{(["single", "multi"] as const).map(mode => <label key={mode}>
                <input type="radio" name="video-director-mode" checked={shotMode === mode}
                  disabled={busy}
                  onChange={() => {
                    setDirector(null); setSubmissionQuote(null); setConfirmedReceipt(null); setShotMode(mode);
                  }} />
                <span>{t(`director.${mode}`)}</span>
              </label>)}</div>
            </fieldset>
          </details>}
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
            qualityHeading: t("quality.heading"),
            outputHeading: t("output.heading"),
            aspectRatioLabel: t("output.aspectRatio"),
            durationLabel: t("output.duration"),
            secondsLabel: (seconds) => t("output.seconds", { seconds }),
            generate: busy ? t("beta.submitting") : t("generate"),
            libraryLink: t("beta.libraryLink"),
            approvalHeading: t("layout.approvalHeading"),
          }}
          source={draft.source}
          prompt={draft.prompt}
          quality={draft.quality}
          qualityOptions={qualityValues.map((value) => ({ value, label: t(`quality.options.${value}.label`), disabled: !studioOptions.tiers.includes(value), description: studioOptions.tiers.includes(value) ? t(`quality.options.${value}.description`) : t("configurationUnavailable") }))}
          aspectRatio={draft.aspectRatio}
          aspectRatioOptions={aspectRatioValues.map((value) => ({ value, label: value }))}
          duration={draft.duration}
          durationOptions={durationValues.map(value => ({ value, label: t("output.seconds", { seconds: value }), disabled: !studioOptions.durations.includes(value), description: t("configurationUnavailable") }))}
          feedbackMessage={generationError ? t(`beta.${generationError}`) : submissionUsed ? t("beta.submissionUsed") : restoreUnavailable ? t("beta.restoreUnavailable") : nextSubmissionStep ? t(`beta.${nextSubmissionStep}`) : feedbackMessage ?? (draft.source ? t(preparationFailed ? "preparation.failed" : preparedFrame ? "preparation.ready" : "preparation.preparing") : null)}
          feedbackIsError={Boolean(generationError) || preparationFailed || (draft.feedback !== null && draft.feedback !== "not-connected")}
          isReady={isVideoStudioDraftReady(draft)}
          isSubmitting={busy}
          showLibraryLink={submissionUsed}
          generationAvailable={generationAvailable && Boolean(currentQuote) && Boolean(preparedFrame) && quoteConfirmed && directorReady && isVideoStudioDraftReady(draft) && !busy && !restoringJob && !restoreUnavailable && !submissionUsed && !jobId && generationError !== "ambiguous" && generationError !== "failed"}
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
          onQualityChange={(quality) => dispatch({ type: "set-quality", quality })}
          onAspectRatioChange={(aspectRatio) => dispatch({ type: "set-aspect-ratio", aspectRatio })}
          onDurationChange={(duration) => dispatch({ type: "set-duration", duration })}
          onGenerate={handleGenerate}
        />
      </div>

      <div id="video-studio-canvas" className={styles.canvasRegion} tabIndex={-1}>
        <VideoJobProgress key={jobId ?? "new"} jobId={jobId} submitting={busy} showPlayer restoreUnavailable={restoreUnavailable} submissionError={generationError === "ambiguous" || generationError === "failed" ? generationError : null} />
        {!jobId && !busy ? <>
        <VideoCanvas
          showExample={!draft.source}
          onUpload={() => document.getElementById("video-source-upload")?.click()}
          onChooseLibrary={() => { if (!libraryOpen) toggleLibrary(); document.getElementById("video-studio-inspector")?.scrollIntoView({ block: "start" }); document.getElementById("video-source-library-toggle")?.focus({ preventScroll: true }); }}
          emptyCopy={{ upload: t("source.upload"), library: t("source.chooseLibrary"), example: t("layout.styleExample"), exampleAlt: t("layout.exampleAlt"), steps: [t("layout.guideSource"), t("layout.guideStyle"), t("layout.guideCreate")] }}
          criticalRegion={draft.criticalRegion && preparedFrame ? mapRegionToFrame(draft.criticalRegion, preparedFrame.geometry) : null}
          source={previewSource}
          aspectRatio={draft.aspectRatio}
          previewLabel={t("canvas.previewLabel")}
          draftLabel={t("canvas.draftLabel")}
          libraryLabel={t("canvas.libraryLink")}
          sourceAlt={t("canvas.sourceAlt")}
          imageEmptyTitle={t(draft.source ? preparationFailed ? "preparation.failed" : "preparation.preparing" : "canvas.imageEmptyTitle")}
          imageEmptyDescription={t(draft.source ? "preparation.description" : "canvas.imageEmptyDescription")}
        />
        <div className={styles.previewNote}><DashboardIcon name="image" /><p>{t("layout.previewHint")}</p></div>
        </> : null}
      </div>
    </main>
  );
}
