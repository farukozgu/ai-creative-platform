import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { VideoLibrary } from "@/features/video/video-library";
import { isSupportedLocale } from "@/i18n/routing";
import { listVideoGenerationsAction } from "@/app/[locale]/dashboard/video/generation-actions";

export const maxDuration = 90;

type VideoLibraryPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: VideoLibraryPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Dashboard.videoLibrary" });
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function VideoLibraryPage({ params }: VideoLibraryPageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const result = await listVideoGenerationsAction();
  return <VideoLibrary records={result.records} locale={locale} />;
}
