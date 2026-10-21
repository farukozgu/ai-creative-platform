import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { VideoStudioWorkspace } from "@/features/video/video-studio-workspace";
import { isSupportedLocale } from "@/i18n/routing";
import { isVideoGenerationAvailable } from "@/lib/video-generation/capabilities";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { canUseVideoTier } from "@/lib/credit-economy/entitlements";
import { getActiveSubscription } from "@/lib/credit-economy/subscription-repository";

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
  const subscription = ownerId ? await getActiveSubscription(ownerId) : null;
  return <VideoStudioWorkspace incomingGenerationId={incomingGenerationId} generationAvailable={isVideoGenerationAvailable()} proVideoEntitled={canUseVideoTier(subscription, "pro")} />;
}
