import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { VideoStudioWorkspace } from "@/features/video/video-studio-workspace";
import { isSupportedLocale } from "@/i18n/routing";
import { canAccessVideoBeta, getVideoStudioOptions } from "@/lib/video-generation/beta-policy";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";

export const maxDuration = 90;

type VideoStudioPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ source?: string | string[] }>;
};

export async function generateMetadata({ params }: VideoStudioPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const t = await getTranslations({ locale, namespace: "Dashboard.videoStudio" });
  return {
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  };
}

export default async function VideoStudioPage({ params, searchParams }: VideoStudioPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const query = await searchParams;
  const incomingGenerationId = typeof query.source === "string" && query.source.length <= 64
    ? query.source
    : null;
  setRequestLocale(locale);
  const ownerId = await getAuthenticatedUserId();
  const beta = ownerId ? canAccessVideoBeta(ownerId) : false;
  return <VideoStudioWorkspace incomingGenerationId={incomingGenerationId} generationAvailable={beta} recoveryScope={beta ? ownerId : null} studioOptions={getVideoStudioOptions()} />;
}
