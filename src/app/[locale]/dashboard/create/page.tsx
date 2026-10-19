import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CreativeComposer } from "@/components/dashboard/creative-composer";
import { resolveCreationEntry } from "@/features/generation/creation-entry";
import { isSupportedLocale } from "@/i18n/routing";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ preset?: string | string[]; presentation?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Dashboard.creationWorkspace" });
  return { title: t("title") };
}

export default async function CreatePage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);
  const [userId, query] = await Promise.all([getAuthenticatedUserId(), searchParams]);
  const entry = resolveCreationEntry(query.preset, query.presentation);
  return (
    <CreativeComposer locale={locale} userId={userId} initialEntry={entry} />
  );
}
