import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ModelLibrary } from "@/features/models/model-library";
import { isSupportedLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { listModelProfiles, ModelProfilesUnavailableError } from "@/lib/models/model-profiles";
type ModelsPageProps = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: ModelsPageProps): Promise<Metadata> { const { locale } = await params; if (!isSupportedLocale(locale)) notFound(); const t = await getTranslations({ locale, namespace: "Dashboard.modelStudio" }); return { title: t("metadataTitle"), description: t("metadataDescription") }; }
export default async function ModelsPage({ params }: ModelsPageProps) { const { locale } = await params; if (!isSupportedLocale(locale)) notFound(); const userId = await getAuthenticatedUserId(); if (!userId) notFound(); setRequestLocale(locale); let records; try { records = await listModelProfiles(userId); } catch (error) { if (!(error instanceof ModelProfilesUnavailableError)) throw error; const t = await getTranslations({ locale, namespace: "Dashboard.modelReview" }); return <main className="dashboard-main"><div className="dashboard-main-inner dashboard-container"><p role="alert">{t("unavailable")}</p></div></main>; } return <ModelLibrary records={records} locale={locale} />; }
