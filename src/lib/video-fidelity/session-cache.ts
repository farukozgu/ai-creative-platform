import type { VideoFidelityReport } from "./types";
import { videoFidelityCategories } from "./types";

const checkStatuses = new Set(["preserved", "suspicious_change", "clear_distortion", "unverified"]);
const overallStatuses = new Set(["clear_distortion", "review_recommended", "no_clear_change_detected", "inconclusive"]);
const confidences = new Set(["high", "medium", "low"]);
const causes = new Set(["product_change", "camera_angle", "lighting", "partial_visibility", "motion_blur", "unclear"]);
const verticals = new Set(["apparel", "jewelry", "watches", "cosmetics", "footwear", "bags"]);

export type VideoFidelitySessionCache =
  | { status: "pending" }
  | { status: "complete"; report: VideoFidelityReport };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isReport(value: unknown): value is VideoFidelityReport {
  if (!isRecord(value) || !["video-product-fidelity-v2", "video-product-fidelity-v3"].includes(String(value.evaluatorVersion)) || typeof value.model !== "string"
    || typeof value.analyzedAt !== "string" || typeof value.summary !== "string"
    || !overallStatuses.has(String(value.overallStatus)) || !Array.isArray(value.checks)
    || value.checks.length !== videoFidelityCategories.length) return false;

  const foundCategories = new Set<string>();
  for (const check of value.checks) {
    if (!isRecord(check) || typeof check.category !== "string" || !videoFidelityCategories.includes(check.category as (typeof videoFidelityCategories)[number])
      || foundCategories.has(check.category) || !checkStatuses.has(String(check.status))
      || !confidences.has(String(check.confidence)) || !causes.has(String(check.likelyCause))
      || typeof check.reason !== "string" || !Array.isArray(check.timestampsSeconds)
      || !check.timestampsSeconds.every((timestamp) => typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= 15)) return false;
    foundCategories.add(check.category);
  }
  if (foundCategories.size !== videoFidelityCategories.length) return false;

  if (value.sourceDetails !== null) {
    const details = value.sourceDetails;
    if (!isRecord(details) || !(details.color === null || typeof details.color === "string")
      || !(details.material === null || typeof details.material === "string")
      || !(details.silhouette === null || typeof details.silhouette === "string")
      || !(details.brandingVisible === null || typeof details.brandingVisible === "boolean")
      || !(details.brandingDescription === null || typeof details.brandingDescription === "string")
      || !isStringArray(details.readableText) || !isStringArray(details.distinctiveDetails)) return false;
  }

  if (value.sourceProfile === null) return true;
  const profile = value.sourceProfile;
  return isRecord(profile) && typeof profile.productShape === "string"
    && typeof profile.vertical === "string" && verticals.has(profile.vertical)
    && (profile.subcategory === null || typeof profile.subcategory === "string")
    && isStringArray(profile.dominantColors) && isStringArray(profile.materials)
    && (profile.identitySummary === undefined || isStringArray(profile.identitySummary))
    && (profile.sourceObservations === undefined || isStringArray(profile.sourceObservations));
}

export function parseVideoFidelitySessionCache(value: string | null): VideoFidelitySessionCache | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed) && parsed.status === "pending") return { status: "pending" };
    if (isRecord(parsed) && parsed.status === "complete" && isReport(parsed.report)) {
      return { status: "complete", report: parsed.report };
    }
  } catch {
    return null;
  }
  return null;
}
