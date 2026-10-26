import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { VideoDetail, type VideoDetailCopy } from "@/features/video/video-detail";
import type { VideoCameraMovement, VideoStatus } from "@/features/video/video-studio-types";
import { isSupportedLocale } from "@/i18n/routing";
import { readVideoGenerationAction } from "@/app/[locale]/dashboard/video/generation-actions";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getVideoFidelityAnalysisAvailability } from "@/lib/video-fidelity/availability";
import type { VideoFidelityCopy } from "@/features/video/video-fidelity-analysis";

type VideoDetailPageProps = {
  params: Promise<{ locale: string; videoId: string }>;
};

const statuses: VideoStatus[] = ["queued", "processing", "ready", "failed", "unavailable"];
const cameraMovements: VideoCameraMovement[] = ["auto", "dolly-in", "dolly-out", "orbit", "pan-left", "pan-right", "static"];
const qualities = ["standard", "pro", "auto", "best"] as const;

export async function generateMetadata({ params }: VideoDetailPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Dashboard.videoDetail" });
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function VideoDetailPage({ params }: VideoDetailPageProps) {
  const { locale, videoId } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const record = await readVideoGenerationAction(videoId);
  if (!record) notFound();
  const userId = await getAuthenticatedUserId();
  const fidelityAvailability = userId
    ? getVideoFidelityAnalysisAvailability(userId)
    : { enabled: false, maximumEstimatedCostUsd: null };

  setRequestLocale(locale);
  const [t, studioT] = await Promise.all([
    getTranslations({ locale, namespace: "Dashboard.videoDetail" }),
    getTranslations({ locale, namespace: "Dashboard.videoStudio" }),
  ]);
  const fidelityCopy: VideoFidelityCopy = {
    title: t("fidelityAnalysis.title"),
    description: t("fidelityAnalysis.description"),
    prepare: t("fidelityAnalysis.prepare"),
    preparing: t("fidelityAnalysis.preparing"),
    preparingSource: t("fidelityAnalysis.preparingSource"),
    extractingFrames: t("fidelityAnalysis.extractingFrames"),
    freeStep: t("fidelityAnalysis.freeStep"),
    sourceFrame: t("fidelityAnalysis.sourceFrame"),
    videoFrame: (number, timestamp) => t("fidelityAnalysis.videoFrame", { number, timestamp }),
    frameUnavailable: t("fidelityAnalysis.frameUnavailable"),
    analysisDisabled: t("fidelityAnalysis.analysisDisabled"),
    pricingUnavailable: t("fidelityAnalysis.pricingUnavailable"),
    priceEstimate: (amount) => t("fidelityAnalysis.priceEstimate", { amount }),
    consentLead: t("fidelityAnalysis.consentLead"),
    consentDetails: t("fidelityAnalysis.consentDetails"),
    consentLabel: (amount) => t("fidelityAnalysis.consentLabel", { amount }),
    analyze: (amount) => t("fidelityAnalysis.analyze", { amount }),
    analyzing: t("fidelityAnalysis.analyzing"),
    cancel: t("fidelityAnalysis.cancel"),
    profileTitle: t("fidelityAnalysis.profileTitle"),
    brandingText: t("fidelityAnalysis.categories.brandingText"),
    shapeProportions: t("fidelityAnalysis.categories.shapeProportions"),
    colorMaterial: t("fidelityAnalysis.categories.colorMaterial"),
    constructionDetails: t("fidelityAnalysis.categories.constructionDetails"),
    motionDeformation: t("fidelityAnalysis.categories.motionDeformation"),
    category: t("fidelityAnalysis.profile.category"),
    color: t("fidelityAnalysis.profile.color"),
    shape: t("fidelityAnalysis.profile.shape"),
    material: t("fidelityAnalysis.profile.material"),
    branding: t("fidelityAnalysis.profile.branding"),
    readableText: t("fidelityAnalysis.profile.readableText"),
    noVisibleBranding: t("fidelityAnalysis.profile.noVisibleBranding"),
    observations: t("fidelityAnalysis.profile.observations"),
    checksTitle: t("fidelityAnalysis.checksTitle"),
    overallTitle: t("fidelityAnalysis.overallTitle"),
    statuses: {
      preserved: t("fidelityAnalysis.statuses.preserved"),
      suspicious_change: t("fidelityAnalysis.statuses.suspicious_change"),
      clear_distortion: t("fidelityAnalysis.statuses.clear_distortion"),
      unverified: t("fidelityAnalysis.statuses.unverified"),
    },
    overallStatuses: {
      clear_distortion: t("fidelityAnalysis.overallStatuses.clear_distortion"),
      review_recommended: t("fidelityAnalysis.overallStatuses.review_recommended"),
      no_clear_change_detected: t("fidelityAnalysis.overallStatuses.no_clear_change_detected"),
      inconclusive: t("fidelityAnalysis.overallStatuses.inconclusive"),
    },
    confidence: {
      high: t("fidelityAnalysis.confidence.high"),
      medium: t("fidelityAnalysis.confidence.medium"),
      low: t("fidelityAnalysis.confidence.low"),
    },
    causes: {
      product_change: t("fidelityAnalysis.causes.product_change"),
      camera_angle: t("fidelityAnalysis.causes.camera_angle"),
      lighting: t("fidelityAnalysis.causes.lighting"),
      partial_visibility: t("fidelityAnalysis.causes.partial_visibility"),
      motion_blur: t("fidelityAnalysis.causes.motion_blur"),
      unclear: t("fidelityAnalysis.causes.unclear"),
    },
    timestamp: (value) => t("fidelityAnalysis.timestamp", { value }),
    noText: t("fidelityAnalysis.noText"),
    verticals: {
      apparel: t("fidelityAnalysis.verticals.apparel"),
      jewelry: t("fidelityAnalysis.verticals.jewelry"),
      watches: t("fidelityAnalysis.verticals.watches"),
      cosmetics: t("fidelityAnalysis.verticals.cosmetics"),
      footwear: t("fidelityAnalysis.verticals.footwear"),
      bags: t("fidelityAnalysis.verticals.bags"),
    },
    prepareError: t("fidelityAnalysis.prepareError"),
    unavailable: t("fidelityAnalysis.unavailable"),
    uncertain: t("fidelityAnalysis.uncertain"),
    failed: t("fidelityAnalysis.failed"),
  };

  const copy: VideoDetailCopy = {
    back: t("back"),
    download: t("download"),
    playerLabel: t("playerLabel"),
    thumbnailAlt: t("thumbnailAlt"),
    sourceAlt: t("sourceAlt"),
    unavailable: Object.fromEntries(statuses.map((status) => [status, {
      title: t(`unavailable.${status}.title`),
      description: t(`unavailable.${status}.description`),
    }])) as VideoDetailCopy["unavailable"],
    detailsTitle: t("detailsTitle"),
    labels: {
      mode: t("labels.mode"), prompt: t("labels.prompt"), camera: t("labels.camera"),
      quality: t("labels.quality"), aspectRatio: t("labels.aspectRatio"),
      duration: t("labels.duration"), createdAt: t("labels.createdAt"), source: t("labels.source"),
    },
    mode: { image: t("modes.image"), text: t("modes.text") },
    status: Object.fromEntries(statuses.map((status) => [status, t(`status.${status}`)])) as Record<VideoStatus, string>,
    camera: Object.fromEntries(cameraMovements.map((movement) => [movement, studioT(`camera.options.${movement}.label`)])) as Record<VideoCameraMovement, string>,
    quality: Object.fromEntries(qualities.map((quality) => [quality, studioT(`quality.options.${quality}.label`)])) as VideoDetailCopy["quality"],
    seconds: (value) => t("seconds", { value }),
    fidelity: fidelityCopy,
  };

  return <VideoDetail record={record} locale={locale} copy={copy} fidelityAvailability={fidelityAvailability} />;
}
