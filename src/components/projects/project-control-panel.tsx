import { getTranslations } from "next-intl/server";
import { deleteProductAsset, registerProductAsset, registerReferenceAsset, reorderProductAssets, setPrimaryProductAsset } from "@/app/[locale]/dashboard/projects/[projectId]/actions";
import { createQueuedImageGeneration } from "@/app/[locale]/dashboard/projects/[projectId]/generation-actions";
import { ProductImageUpload, type ProductImageItem } from "@/components/projects/product-image-upload";
import { ReferenceAssetList } from "@/components/projects/reference-asset-list";
import type { AppLocale } from "@/i18n/routing";
import { GenerateImageForm } from "@/app/[locale]/dashboard/projects/[projectId]/generate-image-form";
import { CreativeDirectionForm } from "@/app/[locale]/dashboard/projects/[projectId]/creative-direction-form";

type ProjectControlPanelProps = {
  locale: AppLocale;
  projectId: string;
  initialGenerationId?: string | null;
  userId: string;
  creativeDirection: string | null;
  initialAssets: ProductImageItem[];
  referenceUrls: string[];
};

export async function ProjectControlPanel({ locale, projectId, initialGenerationId, userId, creativeDirection, initialAssets, referenceUrls }: ProjectControlPanelProps) {
  const t = await getTranslations("Dashboard.project");
  return <div className="project-settings-panel" aria-labelledby="project-controls-heading">
    <h2 id="project-controls-heading" className="project-controls-title">{t("controlsHeading")}</h2>
    <ProductImageUpload projectId={projectId} userId={userId} initialAssets={initialAssets} registerAsset={registerProductAsset.bind(null, locale)} deleteAsset={deleteProductAsset.bind(null, locale)} setPrimary={setPrimaryProductAsset.bind(null, locale)} reorderAssets={reorderProductAssets.bind(null, locale)} />
    <ReferenceAssetList projectId={projectId} userId={userId} initialUrls={referenceUrls} registerAsset={registerReferenceAsset.bind(null, locale)} />
    <CreativeDirectionForm creativeDirection={creativeDirection} projectId={projectId} locale={locale} messages={{
      label: t("creativeDirection.label"), description: t("creativeDirection.description"), placeholder: t("creativeDirection.placeholder"), save: t("creativeDirection.save"), saving: t("creativeDirection.saving"), validationError: t("creativeDirection.validationError"), saveError: t("creativeDirection.saveError"), saveSuccess: t("creativeDirection.saveSuccess"),
    }} />
    <GenerateImageForm action={createQueuedImageGeneration.bind(null, locale, projectId)} initialGenerationId={initialGenerationId} messages={{
      generate: t("generation.generate"), creating: t("generation.creating"), missingProductImage: t("generation.missingProductImage"), missingCreativeDirection: t("generation.missingCreativeDirection"), creationFailed: t("generation.creationFailed"), identityGenerationDisabled: t("generation.identityGenerationDisabled"), generationUnavailable: t("generation.generationUnavailable"), generationFailed: t("generation.generationFailed"),
      invalidAspectRatio: t("composer.invalidAspectRatio"), aspectRatio: { label: t("composer.aspectRatio.label"), helper: t("composer.aspectRatio.helper"), names: { widescreen: t("composer.aspectRatio.names.widescreen"), vertical: t("composer.aspectRatio.names.vertical"), square: t("composer.aspectRatio.names.square"), classic: t("composer.aspectRatio.names.classic"), tall: t("composer.aspectRatio.names.tall"), cinemascope: t("composer.aspectRatio.names.cinemascope") }, descriptions: { widescreenUse: t("composer.aspectRatio.descriptions.widescreenUse"), verticalUse: t("composer.aspectRatio.descriptions.verticalUse"), squareUse: t("composer.aspectRatio.descriptions.squareUse"), classicUse: t("composer.aspectRatio.descriptions.classicUse"), tallUse: t("composer.aspectRatio.descriptions.tallUse"), cinemascopeUse: t("composer.aspectRatio.descriptions.cinemascopeUse") } },
      progressTitle: t("generation.progressTitle"), progressDescription: t("generation.progressDescription"), progressStatuses: [t("generation.progressStatuses.preparing"), t("generation.progressStatuses.scene"), t("generation.progressStatuses.generating"), t("generation.progressStatuses.finalizing")], closeProgress: t("generation.closeProgress"), activeStatus: t("generation.activeStatus"), successStatus: t("generation.successStatus"), failedStatus: t("generation.failedStatus"),
    }} />
  </div>;
}
