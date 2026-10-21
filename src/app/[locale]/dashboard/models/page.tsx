import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ModelLibrary } from "@/features/models/model-library";
import { isSupportedLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { listModelProfiles } from "@/lib/models/model-profiles";
type ModelsPageProps = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: ModelsPageProps): Promise<Metadata> { const { locale } = await params; if (!isSupportedLocale(locale)) notFound(); const t = await getTranslations({ locale, namespace: "Dashboard.modelStudio" }); return { title: t("metadataTitle"), description: t("metadataDescription") }; }
export default async function ModelsPage({ params }: ModelsPageProps) { const { locale } = await params; if (!isSupportedLocale(locale)) notFound(); const userId = await getAuthenticatedUserId(); if (!userId) notFound(); setRequestLocale(locale); return <ModelLibrary records={await listModelProfiles(userId)} />; }
