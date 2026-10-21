import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getModelProfile } from "@/lib/models/model-profiles";
import { ModelDetail } from "@/features/models/model-detail";
type ModelDetailPageProps = { params: Promise<{ locale: string; modelId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function ModelDetailPage({ params }: ModelDetailPageProps) { const { locale, modelId } = await params; if (!isSupportedLocale(locale) || !uuidPattern.test(modelId)) notFound(); const userId = await getAuthenticatedUserId(); if (!userId) notFound(); const profile = await getModelProfile(userId, modelId); if (!profile) notFound(); setRequestLocale(locale); return <ModelDetail locale={locale} profile={profile} />; }
