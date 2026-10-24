import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UgcStudioWorkspace } from "@/features/ugc/ugc-studio-workspace";
import { isSupportedLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getUgcStudioInitialState, listUgcProjectResults, UgcSchemaUnavailableError } from "@/lib/ugc/ugc-projects";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Dashboard.ugcStudio" });
  return { title: t("metadataTitle"), description: t("description") };
}

export default async function UgcStudioPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId) notFound();
  let initialDraft = null;
  let initialResults: Awaited<ReturnType<typeof listUgcProjectResults>> = [];
  let schemaAvailable = true;
  try {
    initialDraft = await getUgcStudioInitialState(ownerId);
    initialResults = initialDraft ? await listUgcProjectResults(ownerId, initialDraft.id) : [];
  } catch (error) {
    if (!(error instanceof UgcSchemaUnavailableError)) throw error;
    schemaAvailable = false;
  }
  return <main className="dashboard-main"><UgcStudioWorkspace initialDraft={initialDraft} initialResults={initialResults ?? []} schemaAvailable={schemaAvailable} /></main>;
}
