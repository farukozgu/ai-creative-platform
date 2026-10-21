import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ModelCreate } from "@/features/models/model-create";
import { isSupportedLocale } from "@/i18n/routing";
type CreateModelPageProps = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: CreateModelPageProps): Promise<Metadata> { const { locale } = await params; if (!isSupportedLocale(locale)) notFound(); const t = await getTranslations({ locale, namespace: "Dashboard.modelStudio" }); return { title: t("metadataTitle"), description: t("metadataDescription") }; }
export default async function CreateModelPage({ params }: CreateModelPageProps) { const { locale } = await params; if (!isSupportedLocale(locale)) notFound(); setRequestLocale(locale); return <ModelCreate locale={locale} />; }
