"use client";
/* eslint-disable @next/next/no-img-element -- local object URLs are preview-only and cannot use the image optimizer. */

import Image from "next/image";
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { createWorkspaceProject } from "@/app/[locale]/dashboard/actions";
import {
  registerProductAsset,
  registerReferenceAsset,
  updateCreativeDirection,
} from "@/app/[locale]/dashboard/projects/[projectId]/actions";
import { createQueuedImageGeneration } from "@/app/[locale]/dashboard/projects/[projectId]/generation-actions";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import {
  DASHBOARD_PRESET_EVENT,
  type DashboardPresetSelection,
} from "@/components/dashboard/creative-preset-rail";
import { AspectRatioPreview } from "@/components/projects/aspect-ratio-preview";
import {
  isSupportedProductImageType,
  MAX_PRODUCT_IMAGE_FILE_SIZE,
  productImageExtensions,
} from "@/components/projects/product-image-upload";
import { Button } from "@/components/ui/button";
import { MAX_PROJECT_PRODUCT_IMAGES } from "@/lib/assets/product-asset-constraints";
import { MAX_PROJECT_REFERENCE_IMAGES } from "@/lib/assets/reference-asset-constraints";
import {
  getCreativePreset,
  getPresetFamily,
  getPresetPresentationModes,
  getRecommendedFamilyPresets,
} from "@/lib/creative-presets/creative-presets";
import {
  DEFAULT_GENERATION_ASPECT_RATIO,
  GENERATION_ASPECT_RATIOS,
} from "@/lib/generation/aspect-ratios";
import type { GenerationAspectRatio } from "@/lib/generation/types";
import { createClient } from "@/lib/supabase/client";
import {
  supportedVerticals,
  type SupportedVertical,
} from "@/lib/verticals/supported-verticals";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { CreationEntry } from "@/features/generation/creation-entry";

type FilePreview = { file: File; previewUrl: string };
type FlowStep =
  | "type"
  | "name"
  | "product"
  | "format"
  | "direction"
  | "reference"
  | "details"
  | "review"
  | "generating"
  | "failed";

const steps: readonly FlowStep[] = [
  "type",
  "name",
  "product",
  "format",
  "direction",
  "reference",
  "details",
  "review",
];

function ComposerStepHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="creation-step-header">
      <p className="creation-step-eyebrow">{eyebrow}</p>
      <h1 id="creation-flow-title">{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

export function CreativeComposer({
  locale,
  userId,
  initialEntry,
}: {
  locale: AppLocale;
  userId: string | null;
  initialEntry?: CreationEntry;
}) {
  const t = useTranslations("Dashboard.composer");
  const presetT = useTranslations("Dashboard.presets");
  const timelineT = useTranslations("GenerationTimeline");
  const router = useRouter();
  const productInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const productPreviews = useRef<FilePreview[]>([]);
  const referencePreviews = useRef<FilePreview[]>([]);
  const locked = useRef(false);
  const [step, setStep] = useState<FlowStep>(initialEntry?.presetId ? "name" : "type");
  const [projectName, setProjectName] = useState("");
  const [products, setProducts] = useState<FilePreview[]>([]);
  const [references, setReferences] = useState<FilePreview[]>([]);
  const [aspectRatio, setAspectRatio] =
    useState<GenerationAspectRatio>(DEFAULT_GENERATION_ASPECT_RATIO);
  const [creationMode, setCreationMode] = useState<"preset" | "custom">(
    "preset",
  );
  const [presetId, setPresetId] = useState<string | null>(initialEntry?.presetId ?? null);
  const [presetVertical, setPresetVertical] =
    useState<SupportedVertical | null>(getCreativePreset(initialEntry?.presetId)?.vertical ?? null);
  const [presentationMode, setPresentationMode] = useState<string | null>(
    initialEntry?.presentationMode ?? null,
  );
  const [direction, setDirection] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [generationSucceeded, setGenerationSucceeded] = useState(false);

  const selectedPreset = getCreativePreset(presetId);
  const presets = useMemo(
    () => getRecommendedFamilyPresets({ vertical: presetVertical }),
    [presetVertical],
  );

  useEffect(
    () => () => {
      productPreviews.current.forEach(({ previewUrl }) =>
        URL.revokeObjectURL(previewUrl),
      );
      referencePreviews.current.forEach(({ previewUrl }) =>
        URL.revokeObjectURL(previewUrl),
      );
    },
    [],
  );

  useEffect(() => {
    function handlePresetSelection(event: Event) {
      const {
        presetId: nextPresetId,
        presentationMode: nextPresentationMode,
      } = (event as CustomEvent<DashboardPresetSelection>).detail;
      const preset = getCreativePreset(nextPresetId);

      if (!preset) {
        setPresetId(null);
        setPresentationMode(null);
        return;
      }

      setPresetId(preset.id);
      setPresetVertical(preset.vertical);
      setPresentationMode(nextPresentationMode);
      setCreationMode("preset");
      setStep((current) => (current === "type" ? "name" : current));
      window.requestAnimationFrame(() =>
        document.getElementById("composer")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        }),
      );
    }

    window.addEventListener(DASHBOARD_PRESET_EVENT, handlePresetSelection);
    return () =>
      window.removeEventListener(DASHBOARD_PRESET_EVENT, handlePresetSelection);
  }, []);

  function addProducts(files: File[]) {
    if (files.length + products.length > MAX_PROJECT_PRODUCT_IMAGES) {
      setError(t("productLimit"));
      return;
    }
    if (files.some((file) => !isSupportedProductImageType(file.type))) {
      setError(t("invalidProductType"));
      return;
    }
    if (files.some((file) => file.size > MAX_PRODUCT_IMAGE_FILE_SIZE)) {
      setError(t("productTooLarge"));
      return;
    }

    setProducts((items) => {
      const next = [
        ...items,
        ...files.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      productPreviews.current = next;
      return next;
    });
    setError("");
  }

  function removeProduct(index: number) {
    setProducts((items) => {
      const removed = items[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      productPreviews.current = next;
      return next;
    });
  }

  function addReferences(files: File[]) {
    const accepted = files.slice(
      0,
      MAX_PROJECT_REFERENCE_IMAGES - references.length,
    );
    if (
      accepted.some(
        (file) =>
          !isSupportedProductImageType(file.type) ||
          file.size > MAX_PRODUCT_IMAGE_FILE_SIZE,
      )
    ) {
      setError(t("invalidProductType"));
      return;
    }

    setReferences((items) => {
      const next = [
        ...items,
        ...accepted.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      referencePreviews.current = next;
      return next;
    });
    setError("");
  }

  function removeReference(index: number) {
    setReferences((items) => {
      const removed = items[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      referencePreviews.current = next;
      return next;
    });
  }

  function proceed() {
    setError("");
    if (step === "name" && !projectName.trim()) {
      setError(t("flow.nameRequired"));
      return;
    }
    if (step === "product" && !products.length) {
      setError(t("productRequired"));
      return;
    }
    if (step === "direction" && !selectedPreset && !direction.trim()) {
      setError(t("directionRequired"));
      return;
    }

    const index = steps.indexOf(step);
    if (index >= 0 && index < steps.length - 1) {
      setStep(steps[index + 1]!);
    }
  }

  async function generate() {
    if (
      !userId ||
      !products.length ||
      (!selectedPreset && !direction.trim()) ||
      locked.current
    ) {
      return;
    }

    locked.current = true;
    setGenerationStage(0);
    setGenerationSucceeded(false);
    setStep("generating");
    setError("");
    let phase: "product" | "reference" | "other" = "other";
    let failureMessage: string | null = null;

    try {
      const project = await createWorkspaceProject(locale, projectName.trim());
      if (!project.ok) throw new Error("project");
      const supabase = createClient();

      phase = "product";
      for (const { file } of products) {
        const extension =
          productImageExtensions[
            file.type as keyof typeof productImageExtensions
          ];
        const path = `${userId}/${project.projectId}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage
          .from("product-assets")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw new Error("upload");

        const registration = await registerProductAsset(
          locale,
          project.projectId,
          path,
        );
        if (registration.status === "invalid_image") {
          failureMessage = t("invalidImage");
          throw new Error("invalid image");
        }
        if (registration.status !== "success") throw new Error("register");
      }

      phase = "reference";
      for (const { file } of references) {
        const extension =
          productImageExtensions[
            file.type as keyof typeof productImageExtensions
          ];
        const path = `${userId}/${project.projectId}/reference-${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage
          .from("product-assets")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw new Error("reference upload");
        if (
          (await registerReferenceAsset(locale, project.projectId, path))
            .status !== "success"
        ) {
          throw new Error("reference register");
        }
      }

      phase = "other";
      setGenerationStage(1);
      const directionData = new FormData();
      directionData.set("creative_direction", direction.trim());
      if (
        (
          await updateCreativeDirection(
            locale,
            project.projectId,
            { status: "idle" },
            directionData,
          )
        ).status !== "success"
      ) {
        throw new Error("direction");
      }

      setGenerationStage(2);
      const generationData = new FormData();
      generationData.set("enhance_with_ai", "on");
      generationData.set("aspect_ratio", aspectRatio);
      if (selectedPreset) generationData.set("preset_id", selectedPreset.id);
      if (presentationMode) {
        generationData.set("presentation_mode", presentationMode);
      }
      if (
        !(
          await createQueuedImageGeneration(
            locale,
            project.projectId,
            null,
            generationData,
          )
        ).ok
      ) {
        throw new Error("generation");
      }

      setGenerationStage(4);
      setGenerationSucceeded(true);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      router.push(`/dashboard/projects/${project.projectId}`, { locale });
    } catch {
      setError(
        failureMessage ??
          (phase === "product"
            ? t("productUploadFailed")
            : phase === "reference"
              ? t("referenceUploadFailed")
              : t("creationError")),
      );
      setStep("failed");
      locked.current = false;
    }
  }

  const currentIndex = Math.max(0, steps.indexOf(step));
  const navItems = [
    ["product", t("flow.navProduct")],
    ["format", t("flow.navFormat")],
    ["direction", t("flow.navDirection")],
    ["reference", t("flow.navReference")],
    ["details", t("flow.navDetails")],
  ] as const;
  const furthestReachable = !projectName.trim()
    ? 1
    : !products.length
      ? 2
      : !selectedPreset && !direction.trim()
        ? 4
        : 7;
  const stepEyebrow = t("flow.stepLabel", {
    current: currentIndex + 1,
    total: steps.length,
  });

  if (step === "generating") {
    return (
      <section
        className="creation-flow creation-generation"
        aria-labelledby="creation-generating-title"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="creation-generation-intro">
          <div className="creation-orbit" aria-hidden="true" />
          <p className="creation-kicker">KLAY</p>
          <h1 id="creation-generating-title">{t("flow.generatingTitle")}</h1>
          <p>{t("flow.generatingDescription")}</p>
        </div>
        <ol className="generation-timeline">
          {[0, 1, 2, 3, 4].map((index) => {
            const state = generationSucceeded || index < generationStage
              ? "completed"
              : index === generationStage
                ? "active"
                : "pending";
            return (
              <li key={index} data-state={state}>
                <span aria-hidden="true">
                  {state === "completed" ? "✓" : ""}
                </span>
                <div>
                  <strong>{timelineT(`stages.${index}.title`)}</strong>
                  <p>{timelineT(`stages.${index}.description`)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  if (step === "failed") {
    return (
      <section
        className="creation-flow creation-failure"
        aria-labelledby="creation-failure-title"
      >
        <span className="creation-failure-mark" aria-hidden="true">!</span>
        <p className="creation-kicker">KLAY</p>
        <h1 id="creation-failure-title">{t("creationError")}</h1>
        <p role="alert">{error}</p>
        <Button onClick={() => setStep("review")}>{t("flow.tryAgain")}</Button>
      </section>
    );
  }

  return (
    <section
      id="composer"
      className={`creation-flow ${step === "type" ? "is-intro" : "is-guided"}`}
      data-step={step}
      aria-labelledby="creation-flow-title"
    >
      {step !== "type" ? (
        <nav
          className="creation-progress"
          aria-label={t("flow.progressLabel")}
        >
          {navItems.map(([key, label], index) => {
            const stepIndex = steps.indexOf(key);
            const isCurrent = step === key;
            const isComplete = currentIndex > stepIndex;
            const enabled = stepIndex <= furthestReachable;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStep(key)}
                disabled={!enabled}
                aria-current={isCurrent ? "step" : undefined}
                className={
                  isComplete ? "is-complete" : isCurrent ? "is-current" : ""
                }
              >
                <span className="creation-progress-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="creation-progress-label">{label}</span>
                <i aria-hidden="true"><b /></i>
              </button>
            );
          })}
        </nav>
      ) : null}

      <div className="creation-stage" key={step}>
        {step === "type" ? (
          <>
            <div className="creation-intro-copy">
              <div className="creation-intro-meta">
                <p className="creation-kicker">KLAY STUDIO</p>
                <span>{stepEyebrow}</span>
              </div>
              <h1 id="creation-flow-title">{t("heading")}</h1>
              <p>{t("description")}</p>
            </div>
            <div className="creation-type-options">
              <button
                type="button"
                className="creation-type-card is-primary"
                onClick={() => setStep("name")}
              >
                <span className="creation-type-visual" aria-hidden="true">
                  <span className="creation-type-frame is-landscape">
                    <DashboardIcon name="image" />
                  </span>
                  <span className="creation-type-frame is-portrait" />
                  <span className="creation-type-frame is-square" />
                </span>
                <span className="creation-type-footer">
                  <span className="creation-type-icon">
                    <DashboardIcon name="image" />
                  </span>
                  <span className="creation-type-copy">
                    <strong>{t("outputType.image.title")}</strong>
                    <span>{t("outputType.image.description")}</span>
                  </span>
                  <span className="creation-type-arrow" aria-hidden="true">
                    <DashboardIcon name="arrow" />
                  </span>
                </span>
              </button>
              <button type="button" className="creation-type-card" disabled>
                <span className="creation-type-status">
                  {t("outputType.video.badge")}
                </span>
                <span className="creation-type-video-mark" aria-hidden="true">
                  <DashboardIcon name="video" />
                </span>
                <span className="creation-type-footer">
                  <span className="creation-type-copy">
                    <strong>{t("outputType.video.title")}</strong>
                    <span>{t("outputType.video.description")}</span>
                  </span>
                </span>
              </button>
            </div>
          </>
        ) : null}

        {step === "name" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("flow.nameTitle")}
              description={t("steps.project.description")}
            />
            <div className="creation-name-field">
              <label htmlFor="creation-project-name">{t("projectNameLabel")}</label>
              <input
                id="creation-project-name"
                autoFocus
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder={t("flow.namePlaceholder")}
                maxLength={120}
                className="creation-name-input"
              />
              <span>{projectName.length}/120</span>
            </div>
          </>
        ) : null}

        {step === "product" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("flow.productTitle")}
              description={t("dropzone.secondary")}
            />
            <aside className="creation-authority-note">
              <DashboardIcon name="lock" />
              <div>
                <strong>{t("flow.productAuthority")}</strong>
                <p>{t("flow.productDescription")}</p>
              </div>
            </aside>
            <div
              className={`creation-upload-grid ${products.length ? "has-product" : ""}`}
            >
              {products.map((product, index) => (
                <article
                  key={product.previewUrl}
                  className={`creation-preview ${index === 0 ? "is-primary" : ""}`}
                >
                  <img
                    src={product.previewUrl}
                    alt={t("productPreviewAlt", { index: index + 1 })}
                  />
                  <span>
                    {index === 0
                      ? t("flow.primaryView")
                      : t("flow.supportingView")}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProduct(index)}
                    aria-label={t("removeProductView", { index: index + 1 })}
                  >
                    <DashboardIcon name="close" />
                  </button>
                </article>
              ))}
              {Array.from(
                { length: Math.max(0, MAX_PROJECT_PRODUCT_IMAGES - products.length) },
                (_, index) => (
                  <button
                    key={`slot-${index}`}
                    type="button"
                    className={`creation-upload ${products.length ? "is-supporting-slot" : ""} ${dragging ? "is-dragging" : ""}`}
                    onClick={() => productInput.current?.click()}
                    onDragOver={(event: DragEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      addProducts(Array.from(event.dataTransfer.files));
                    }}
                  >
                    <DashboardIcon name="plus" />
                    <strong>
                      {products.length ? t("addProductView") : t("addProduct")}
                    </strong>
                    <span>
                      {products.length
                        ? t("productMultiViewHelper")
                        : t("dropzone.secondary")}
                    </span>
                    {!products.length ? <small>{t("dropzone.formats")}</small> : null}
                  </button>
                ),
              )}
            </div>
            <input
              ref={productInput}
              className="sr-only"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                addProducts(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </>
        ) : null}

        {step === "format" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("steps.format.title")}
              description={t("steps.format.description")}
            />
            <div className="creation-ratio-grid" role="radiogroup" aria-label={t("steps.format.title")}>
              {GENERATION_ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.value}
                  type="button"
                  role="radio"
                  aria-checked={aspectRatio === ratio.value}
                  className={aspectRatio === ratio.value ? "is-selected" : ""}
                  onClick={() => setAspectRatio(ratio.value)}
                >
                  <AspectRatioPreview value={ratio.value} />
                  <strong>{ratio.value}</strong>
                  <span>{t(`aspectRatio.names.${ratio.nameKey}`)}</span>
                  <small>{t(`aspectRatio.descriptions.${ratio.descriptionKey}`)}</small>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === "direction" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("flow.directionTitle")}
              description={t("steps.additional.description")}
            />
            <div
              className="creation-paths"
              role="radiogroup"
              aria-label={t("flow.directionTitle")}
            >
              <button
                type="button"
                role="radio"
                aria-checked={creationMode === "preset"}
                className={creationMode === "preset" ? "is-selected" : ""}
                onClick={() => setCreationMode("preset")}
              >
                {t("flow.presetPath")}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={creationMode === "custom"}
                className={creationMode === "custom" ? "is-selected" : ""}
                onClick={() => setCreationMode("custom")}
              >
                {t("flow.customPath")}
              </button>
            </div>
            {creationMode === "preset" ? (
              <>
                <div
                  className="creation-category-list"
                  role="radiogroup"
                  aria-label={presetT("filterLabel")}
                >
                  {supportedVerticals.map((vertical) => (
                    <button
                      key={vertical}
                      type="button"
                      role="radio"
                      aria-checked={presetVertical === vertical}
                      className={presetVertical === vertical ? "is-selected" : ""}
                      onClick={() => {
                        setPresetVertical(vertical);
                        setPresetId(null);
                        setPresentationMode(null);
                      }}
                    >
                      {presetT(`filterCategories.${vertical}`)}
                    </button>
                  ))}
                </div>
                {presetVertical ? (
                  <div
                    className="creation-preset-grid"
                    role="radiogroup"
                    aria-label={t("flow.presetPath")}
                  >
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={presetId === preset.id}
                        className={presetId === preset.id ? "is-selected" : ""}
                        onClick={() => {
                          setPresetId(preset.id);
                          setPresentationMode(null);
                        }}
                      >
                        <span className="creation-preset-media">
                          <Image
                            src={preset.thumbnail}
                            alt=""
                            fill
                            sizes="(max-width: 720px) 80vw, (max-width: 1100px) 36vw, 22vw"
                          />
                          <i aria-hidden="true">✓</i>
                        </span>
                        <span className="creation-preset-copy">
                          <strong>{preset.localizedTitle[locale]}</strong>
                          <span>{preset.localizedDescription[locale]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedPreset ? (
                  <fieldset className="creation-presentation-fieldset">
                    <legend>{t("flow.presentationLabel")}</legend>
                    <div
                      className="creation-mode-grid"
                      role="radiogroup"
                      aria-label={t("flow.presentationLabel")}
                    >
                      {getPresetPresentationModes(selectedPreset.id).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          role="radio"
                          aria-checked={presentationMode === mode.id}
                          className={presentationMode === mode.id ? "is-selected" : ""}
                          onClick={() => setPresentationMode(mode.id)}
                        >
                          {presetT(`presentationModes.${mode.id}`)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </>
            ) : (
              <div className="creation-textarea-field">
                <label htmlFor="creation-direction">{t("promptLabel")}</label>
                <textarea
                  id="creation-direction"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value)}
                  placeholder={t("promptPlaceholder")}
                  className="creation-direction-input"
                />
              </div>
            )}
          </>
        ) : null}

        {step === "reference" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("flow.referenceTitle")}
              description={t("flow.referenceDescription")}
            />
            <aside className="creation-authority-note is-reference">
              <DashboardIcon name="image" />
              <div>
                <strong>{t("flow.referenceAuthority")}</strong>
                <p>{t("referenceHelper")}</p>
              </div>
              <span>{t("flow.optional")}</span>
            </aside>
            <div className="creation-reference-grid">
              {references.map((reference, index) => (
                <article key={reference.previewUrl} className="creation-preview">
                  <img
                    src={reference.previewUrl}
                    alt={t("referencePreviewAlt", { index: index + 1 })}
                  />
                  <span>
                    {index === 0
                      ? t("primaryReference")
                      : t("supportingReference")}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeReference(index)}
                    aria-label={t("removeReference", { index: index + 1 })}
                  >
                    <DashboardIcon name="close" />
                  </button>
                </article>
              ))}
              {references.length < MAX_PROJECT_REFERENCE_IMAGES ? (
                <button
                  type="button"
                  className="creation-upload is-reference-slot"
                  onClick={() => referenceInput.current?.click()}
                >
                  <DashboardIcon name="plus" />
                  <strong>{t("addReference")}</strong>
                  <span>{t("referenceCount", { count: references.length })}</span>
                </button>
              ) : null}
            </div>
            <input
              ref={referenceInput}
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                addReferences(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </>
        ) : null}

        {step === "details" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("flow.detailsTitle")}
              description={t("steps.additional.description")}
            />
            <div className="creation-chip-list">
              {["cinematic", "minimal", "product", "hardLight", "night", "editorial"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    const label = t(`flow.chips.${item}`);
                    setDirection((current) =>
                      current.includes(label)
                        ? current
                        : [current.trim(), label].filter(Boolean).join(", "),
                    );
                  }}
                >
                  {t(`flow.chips.${item}`)}
                </button>
              ))}
            </div>
            <div className="creation-textarea-field">
              <label htmlFor="creation-details">{t("promptLabel")}</label>
              <textarea
                id="creation-details"
                value={direction}
                onChange={(event) => setDirection(event.target.value)}
                placeholder={t("promptPlaceholder")}
                className="creation-direction-input"
              />
            </div>
          </>
        ) : null}

        {step === "review" ? (
          <>
            <ComposerStepHeader
              eyebrow={stepEyebrow}
              title={t("flow.reviewTitle")}
              description={t("flow.reviewDescription")}
            />
            <div className="creation-review-layout">
              <div className="creation-review-media">
                {products.map((product, index) => (
                  <figure key={product.previewUrl} className={index === 0 ? "is-primary" : ""}>
                    <img
                      src={product.previewUrl}
                      alt={t("productPreviewAlt", { index: index + 1 })}
                    />
                    <figcaption>
                      {index === 0
                        ? t("flow.primaryView")
                        : t("flow.supportingView")}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <article className="creation-brief">
                <div>
                  <span>{t("projectNameLabel")}</span>
                  <strong>{projectName}</strong>
                </div>
                <div>
                  <span>{t("aspectRatio.label")}</span>
                  <strong>{aspectRatio}</strong>
                </div>
                <div>
                  <span>{t("flow.directionTitle")}</span>
                  <strong>
                    {selectedPreset
                      ? getPresetFamily(selectedPreset.id)?.title[locale] ?? selectedPreset.title
                      : direction || t("flow.customPath")}
                  </strong>
                </div>
                <div>
                  <span>{t("flow.productAuthority")}</span>
                  <strong>{t("flow.viewCount", { count: products.length })}</strong>
                </div>
                <div>
                  <span>{t("flow.referenceAuthority")}</span>
                  <strong>
                    {references.length
                      ? t("flow.referenceCount", { count: references.length })
                      : t("flow.noReference")}
                  </strong>
                </div>
              </article>
            </div>
          </>
        ) : null}

        {error ? <p className="creation-error" role="alert">{error}</p> : null}
      </div>

      {step !== "type" ? (
        <footer className="creation-actions">
          <Button
            variant="ghost"
            onClick={() => {
              const index = steps.indexOf(step);
              if (index > 0) setStep(steps[index - 1]!);
            }}
          >
            {t("flow.back")}
          </Button>
          {step === "review" ? (
            <Button onClick={() => void generate()} disabled={!userId}>
              {t("flow.generate")}
            </Button>
          ) : (
            <Button onClick={proceed}>
              {step === "reference" || step === "details"
                ? t("flow.skip")
                : t("flow.continue")}
            </Button>
          )}
        </footer>
      ) : <footer className="creation-actions" />}
    </section>
  );
}
