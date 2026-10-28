import { validateProductAnalysisModelOutput } from "@/lib/product-understanding/product-analysis-model-output";
import type {
  VideoFidelityCause,
  VideoFidelityCategory,
  VideoFidelityCheck,
  VideoFidelityCheckStatus,
  VideoFidelityConfidence,
  VideoFidelityOverallStatus,
  VideoFidelityReport,
  VideoFidelitySourceDetails,
} from "./types";
import { videoFidelityCategories, VIDEO_FIDELITY_VERSION } from "./types";
import { sampleVideoFrameTimestamps } from "./sampling";

const statuses = new Set<VideoFidelityCheckStatus>(["preserved", "suspicious_change", "clear_distortion", "unverified"]);
const confidences = new Set<VideoFidelityConfidence>(["high", "medium", "low"]);
const causes = new Set<VideoFidelityCause>(["product_change", "camera_angle", "lighting", "partial_visibility", "motion_blur", "unclear"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedText(value: unknown, maximum = 400): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function optionalText(value: unknown, maximum: number): string | null {
  const text = boundedText(value, maximum);
  return text || null;
}

function normalizeSourceDetails(value: unknown): VideoFidelitySourceDetails | null {
  const details = record(value);
  if (!details) return null;
  const readableText = Array.isArray(details.readableText)
    ? details.readableText.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, 10)
    : [];
  const distinctiveDetails = Array.isArray(details.distinctiveDetails)
    ? details.distinctiveDetails.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 200)).filter(Boolean).slice(0, 20)
    : [];
  return {
    color: optionalText(details.color, 120),
    material: optionalText(details.material, 160),
    silhouette: optionalText(details.silhouette, 200),
    brandingVisible: typeof details.brandingVisible === "boolean" ? details.brandingVisible : null,
    brandingDescription: optionalText(details.brandingDescription, 300),
    readableText,
    distinctiveDetails,
  };
}

function hasSourceEvidence(
  category: VideoFidelityCategory,
  sourceProfile: VideoFidelityReport["sourceProfile"],
  sourceDetails: VideoFidelitySourceDetails | null,
): boolean {
  if (!sourceProfile) return false;
  const hasShape = Boolean(sourceDetails?.silhouette || sourceProfile.productShape !== "unknown");
  const hasConstruction = Boolean(sourceDetails?.distinctiveDetails.length || sourceProfile.sourceObservations?.length);
  switch (category) {
    case "branding_text": return sourceDetails?.brandingVisible === true && Boolean(sourceDetails.brandingDescription || sourceDetails.readableText.length);
    case "shape_proportions": return hasShape;
    case "color_material": return Boolean(
      (sourceDetails?.color || sourceProfile.dominantColors.length)
      && (sourceDetails?.material || sourceProfile.materials.length),
    );
    case "construction_details": return hasConstruction;
    case "motion_deformation": return hasShape || hasConstruction;
  }
}

function unverifiedChecks(reason: string): VideoFidelityCheck[] {
  return videoFidelityCategories.map((category) => ({
    category,
    status: "unverified",
    confidence: "low",
    likelyCause: "unclear",
    timestampsSeconds: [],
    reason,
  }));
}

function overallStatus(checks: readonly VideoFidelityCheck[]): VideoFidelityOverallStatus {
  if (checks.some((check) => check.status === "clear_distortion")) return "clear_distortion";
  if (checks.some((check) => check.status === "suspicious_change")) return "review_recommended";
  if (checks.every((check) => check.status === "preserved")) return "no_clear_change_detected";
  return "inconclusive";
}

export function normalizeVideoFidelityReport(input: {
  value: unknown;
  sourceAssetId: string;
  model: string;
  durationSeconds: number;
  sampleTimestampsSeconds?: readonly number[];
  analyzedAt: string;
}): VideoFidelityReport {
  const raw = record(input.value);
  const profileValidation = validateProductAnalysisModelOutput(raw?.sourceProfile, {
    assetId: input.sourceAssetId,
    model: input.model,
    analyzedAt: input.analyzedAt,
  });
  const sourceProfile = profileValidation.output && !("status" in profileValidation.output)
    ? profileValidation.output
    : null;
  const sourceDetails = normalizeSourceDetails(raw?.sourceDetails);

  const rawChecks = Array.isArray(raw?.checks) ? raw.checks : [];
  const checksByCategory = new Map<VideoFidelityCategory, VideoFidelityCheck>();
  const sampleTimes = input.sampleTimestampsSeconds ?? sampleVideoFrameTimestamps(input.durationSeconds);
  for (const item of rawChecks) {
    const candidate = record(item);
    if (!candidate || typeof candidate.category !== "string" || !videoFidelityCategories.includes(candidate.category as VideoFidelityCategory)) continue;
    const category = candidate.category as VideoFidelityCategory;
    if (checksByCategory.has(category)) continue;

    const rawStatus = candidate.status as VideoFidelityCheckStatus;
    const confidence = candidate.confidence as VideoFidelityConfidence;
    const likelyCause = candidate.likelyCause as VideoFidelityCause;
    const timestamps = Array.isArray(candidate.timestampsSeconds)
      ? [...new Set(candidate.timestampsSeconds.flatMap((value) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return [];
        const matched = sampleTimes.find((sampleTime) => Math.abs(sampleTime - value) <= 0.05);
        return matched === undefined ? [] : [matched];
      }))].slice(0, 5)
      : [];
    let status: VideoFidelityCheckStatus = statuses.has(rawStatus) ? rawStatus : "unverified";
    if (!confidences.has(confidence) || !causes.has(likelyCause)) status = "unverified";
    if (!sourceProfile || !boundedText(candidate.reason)) status = "unverified";
    if (!hasSourceEvidence(category, sourceProfile, sourceDetails)) status = "unverified";
    if ((status === "clear_distortion" || status === "suspicious_change" || status === "preserved") && timestamps.length === 0) status = "unverified";
    if (status === "preserved" && confidence !== "high") status = "unverified";
    if (["partial_visibility", "motion_blur"].includes(likelyCause)) status = "unverified";
    if (status === "clear_distortion" && confidence !== "high") status = confidence === "medium" ? "suspicious_change" : "unverified";
    if (status === "clear_distortion" && ["camera_angle", "lighting", "partial_visibility", "motion_blur", "unclear"].includes(likelyCause)) status = "suspicious_change";

    checksByCategory.set(category, {
      category,
      status,
      confidence: confidences.has(confidence) ? confidence : "low",
      likelyCause: causes.has(likelyCause) ? likelyCause : "unclear",
      timestampsSeconds: timestamps,
      reason: boundedText(candidate.reason) || "This detail could not be compared reliably.",
    });
  }

  const allChecksPresent = videoFidelityCategories.every((category) => checksByCategory.has(category));
  const checks = sourceProfile && allChecksPresent
    ? videoFidelityCategories.map((category) => checksByCategory.get(category)!)
    : unverifiedChecks(sourceProfile ? "The analysis did not return a complete set of checks." : "The source image could not be profiled reliably.");
  const status = overallStatus(checks);
  const suppliedSummary = boundedText(raw?.summary);
  const summary = status === "clear_distortion"
    ? suppliedSummary || "A clear product change was found in at least one visible frame."
    : status === "review_recommended"
      ? suppliedSummary || "At least one detail needs a closer look; camera or lighting changes may explain it."
      : status === "no_clear_change_detected"
        ? suppliedSummary || "No material change was detected in the details that could be verified."
        : "Some product details could not be verified from the available frames.";

  return {
    evaluatorVersion: VIDEO_FIDELITY_VERSION,
    model: input.model,
    analyzedAt: input.analyzedAt,
    sourceProfile,
    sourceDetails,
    checks,
    overallStatus: status,
    summary,
  };
}
