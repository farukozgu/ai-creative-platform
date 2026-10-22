import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getModelProfile } from "@/lib/models/model-profiles";
import { getCandidateReview } from "@/lib/models/candidate-review";
import { ModelDetail } from "@/features/models/model-detail";
type ModelDetailPageProps = { params: Promise<{ locale: string; modelId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function ModelDetailPage({ params }: ModelDetailPageProps) { const { locale, modelId } = await params; if (!isSupportedLocale(locale) || !uuidPattern.test(modelId)) notFound(); const userId = await getAuthenticatedUserId(); if (!userId) notFound(); setRequestLocale(locale); let profile; try { profile = await getModelProfile(userId, modelId); } catch { const t = await getTranslations({ locale, namespace: "Dashboard.modelReview" }); return <main className="dashboard-main"><div className="dashboard-main-inner dashboard-container"><p role="alert">{t("unavailable")}</p></div></main>; } if (!profile) notFound(); const review = await getCandidateReview(userId, modelId); return <ModelDetail locale={locale} profile={profile} review={review} />; }
