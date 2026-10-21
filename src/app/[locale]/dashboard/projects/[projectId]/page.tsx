import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProjectGenerationWorkspace } from "@/components/projects/project-generation-workspace";
import type { GenerationGalleryItem } from "@/components/projects/generation-gallery";
import { ProjectControlPanel } from "@/components/projects/project-control-panel";
import { createImageEdit } from "@/app/[locale]/dashboard/projects/[projectId]/generation-actions";
import { toggleGenerationFavorite } from "@/app/[locale]/dashboard/favorite-actions";
import { ProjectHeader } from "@/components/projects/project-header";
import { isSupportedLocale } from "@/i18n/routing";
import { getProjectProductAssets } from "@/lib/assets/product-assets";
import { getProjectReferenceAssets } from "@/lib/assets/reference-assets";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getProjectGenerations } from "@/lib/generations/get-project-generations";
import { getProject } from "@/lib/projects/get-project";
import { createClient } from "@/lib/supabase/server";
import { getAnimateSourceId } from "@/lib/generations/video-source-handoff";

type ProjectPageProps = { params: Promise<{ locale: string; projectId: string }>; searchParams: Promise<{ generation?: string | string[] }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Dashboard.project" });
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { locale, projectId } = await params;
  if (!isSupportedLocale(locale) || !uuidPattern.test(projectId)) notFound();
  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Unable to load project.");

  const [project, t, query] = await Promise.all([getProject(userId, projectId), getTranslations({ locale, namespace: "Dashboard.project" }), searchParams]);
  if (!project) notFound();
  const [productAssets, referenceAssets, generations] = await Promise.all([
    getProjectProductAssets(userId, projectId), getProjectReferenceAssets(userId, projectId), getProjectGenerations(userId, projectId),
  ]);
  const supabase = await createClient();
  const initialAssets = await Promise.all(productAssets.map(async (asset) => {
    const { data, error } = await supabase.storage.from("product-assets").createSignedUrl(asset.object_path, 3600);
    if (error || !data?.signedUrl) throw new Error("Unable to load product asset preview.");
    return { id: asset.id, objectPath: asset.object_path, signedUrl: data.signedUrl, role: asset.product_role, sortOrder: asset.sort_order };
  }));
  const referenceUrls = (await Promise.all(referenceAssets.map(async (reference) => {
    const { data } = await supabase.storage.from("product-assets").createSignedUrl(reference.object_path, 3600);
    return data?.signedUrl ?? null;
  }))).filter((url): url is string => Boolean(url));

  setRequestLocale(locale);
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const costFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" });
  const items: GenerationGalleryItem[] = generations.map((generation, index) => ({
    id: generation.id,
    previewUrl: generation.preview_url ?? null,
    alt: `${t("outputs.previewAlt")} ${index + 1}`,
    typeLabel: t(`outputs.types.${generation.generation_type}`),
    status: generation.status,
    statusLabel: t(`outputs.status.${generation.status}`),
    createdAt: dateFormatter.format(new Date(generation.created_at)),
    createdDateTime: generation.created_at,
    provider: generation.provider,
    model: generation.model,
    aspectRatio: generation.aspect_ratio,
    cost: generation.cost_usd === null ? null : costFormatter.format(generation.cost_usd),
    direction: generation.creative_direction_snapshot,
    isFavorite: generation.is_favorite,
    validationUnverified: Boolean(generation.provider_metadata?.fidelity_validation && typeof generation.provider_metadata.fidelity_validation === "object" && "status" in generation.provider_metadata.fidelity_validation && generation.provider_metadata.fidelity_validation.status === "validation_unavailable"),
    animateSourceId: getAnimateSourceId({ id: generation.id, generationType: generation.generation_type, status: generation.status, previewUrl: generation.preview_url }),
  }));
  const runActions: { id: string; node: React.ReactNode }[] = [];

  return <main className="dashboard-main"><div className="dashboard-main-inner dashboard-container project-page-shell">
    <ProjectHeader project={project} locale={locale} />
    <ProjectGenerationWorkspace items={items} initialSelectedGenerationId={typeof query.generation === "string" ? query.generation : null} runActions={runActions} controls={<ProjectControlPanel locale={locale} projectId={project.id} userId={userId} creativeDirection={project.creative_direction} initialAssets={initialAssets} referenceUrls={referenceUrls} />} editAction={createImageEdit.bind(null, locale, project.id)} favoriteAction={toggleGenerationFavorite.bind(null, locale)} hasOutput={items.some((item) => item.previewUrl !== null)} editMessages={{ title: t("imageEdit.title"), description: t("imageEdit.description"), placeholder: t("imageEdit.placeholder"), helper: t("imageEdit.helper"), apply: t("imageEdit.apply"), unavailable: t("imageEdit.unavailable"), failed: t("imageEdit.failed"), progressTitle: t("imageEdit.progressTitle"), progressDescription: t("imageEdit.progressDescription"), progressStatuses: [t("imageEdit.progressStatuses.applying"), t("imageEdit.progressStatuses.preserving"), t("imageEdit.progressStatuses.checking"), t("imageEdit.progressStatuses.finalizing")], closeProgress: t("closeProgress"), activeStatus: t("imageEdit.activeStatus"), successStatus: t("imageEdit.successStatus"), failedStatus: t("imageEdit.failedStatus") }} messages={{
      openFullscreen: t("outputs.openFullscreen"), edit: t("imageEdit.title"), closeFullscreen: t("outputs.closeFullscreen"), zoomImage: t("outputs.zoomImage"), zoomOutImage: t("outputs.zoomOutImage"), resetImageZoom: t("outputs.resetImageZoom"), galleryLabel: t("outputs.galleryLabel"), selectOutput: t("outputs.selectOutput"), details: t("outputs.details"), status: t("outputs.statusLabel"), validationUnverified: t("outputs.validationUnverified"), format: t("outputs.format"), type: t("outputs.type"), advancedDetails: t("outputs.advancedDetails"), direction: t("outputs.direction"), provider: t("outputs.provider"), model: t("outputs.model"), created: t("outputs.created"), cost: t("outputs.cost"), emptyHeading: t("outputs.emptyHeading"), emptyDescription: t("outputs.emptyDescription"), noPreview: t("outputs.noPreview"), noPreviewDescription: t("outputs.noPreviewDescription"), goToControls: t("outputs.goToControls"), failedHeading: t("outputs.failedHeading"), failedDescription: t("outputs.failedDescription"), processingHeading: t("outputs.processingHeading"), processingDescription: t("outputs.processingDescription"), queuedHeading: t("outputs.queuedHeading"), queuedDescription: t("outputs.queuedDescription"), historyHeading: t("outputs.historyHeading"), favoriteAdd: t("outputs.favoriteAdd"), favoriteRemove: t("outputs.favoriteRemove"), favoriteError: t("outputs.favoriteError"), animate: t("outputs.animate"), filterAll: t("outputs.filterAll"), filterFavorites: t("outputs.filterFavorites"), favoritesEmptyHeading: t("outputs.favoritesEmptyHeading"), favoritesEmptyDescription: t("outputs.favoritesEmptyDescription"),
    }} />
  </div></main>;
}
