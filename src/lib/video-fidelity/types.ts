import type { ProductProfile } from "@/lib/product-understanding/product-profile";

export const VIDEO_FIDELITY_VERSION = "video-product-fidelity-v2";

export const videoFidelityCategories = [
  "branding_text",
  "shape_proportions",
  "color_material",
  "construction_details",
  "motion_deformation",
] as const;

export type VideoFidelityCategory = (typeof videoFidelityCategories)[number];
export type VideoFidelityCheckStatus = "preserved" | "suspicious_change" | "clear_distortion" | "unverified";
export type VideoFidelityConfidence = "high" | "medium" | "low";
export type VideoFidelityCause = "product_change" | "camera_angle" | "lighting" | "partial_visibility" | "motion_blur" | "unclear";

export type VideoFidelityCheck = {
  category: VideoFidelityCategory;
  status: VideoFidelityCheckStatus;
  confidence: VideoFidelityConfidence;
  likelyCause: VideoFidelityCause;
  timestampsSeconds: number[];
  reason: string;
};

export type VideoFidelityOverallStatus = "clear_distortion" | "review_recommended" | "no_clear_change_detected" | "inconclusive";

export type VideoFidelitySourceDetails = {
  color: string | null;
  material: string | null;
  silhouette: string | null;
  brandingVisible: boolean | null;
  brandingDescription: string | null;
  readableText: string[];
  distinctiveDetails: string[];
};

export type VideoFidelityReport = {
  evaluatorVersion: string;
  model: string;
  analyzedAt: string;
  sourceProfile: ProductProfile | null;
  sourceDetails: VideoFidelitySourceDetails | null;
  checks: VideoFidelityCheck[];
  overallStatus: VideoFidelityOverallStatus;
  summary: string;
};

export type VideoFidelityFrameInput = {
  timestampSeconds: number;
  data: Buffer;
};

export type VideoFidelityAnalysisAvailability = {
  enabled: boolean;
  maximumEstimatedCostUsd: number | null;
};
