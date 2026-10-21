import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { VideoDetail, type VideoDetailCopy } from "@/features/video/video-detail";
import type { VideoCameraMovement, VideoStatus } from "@/features/video/video-studio-types";
import { isSupportedLocale } from "@/i18n/routing";
import { readVideoGenerationAction } from "@/app/[locale]/dashboard/video/generation-actions";

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

  setRequestLocale(locale);
  const [t, studioT] = await Promise.all([
    getTranslations({ locale, namespace: "Dashboard.videoDetail" }),
    getTranslations({ locale, namespace: "Dashboard.videoStudio" }),
  ]);
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
  };

  return <VideoDetail record={record} locale={locale} copy={copy} />;
}
