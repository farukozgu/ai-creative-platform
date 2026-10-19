/* eslint-disable @next/next/no-img-element -- Local object URLs are browser-only previews. */
import Image from "next/image";
import { useTranslations } from "next-intl";
import { deriveCanvasState, type CanvasInput, type CanvasImage } from "./creation-canvas-model";
import styles from "./creation-canvas.module.css";

function ImageStrip({ images, label, alt }: { images: readonly CanvasImage[]; label: string; alt: (index: number) => string }) {
  if (!images.length) return null;
  return <section className={styles.group} aria-label={label}>
    <h3>{label}</h3>
    <div className={styles.strip}>{images.map((image, index) => <figure key={image.previewUrl}>
      <img src={image.previewUrl} alt={alt(index + 1)} />
      <figcaption>{image.name}</figcaption>
    </figure>)}</div>
  </section>;
}

export function CreationCanvas({ input }: { input: CanvasInput }) {
  const t = useTranslations("Dashboard.composer");
  const p = useTranslations("Dashboard.presets");
  const c = useTranslations("Dashboard.creationCanvas");
  const state = deriveCanvasState(input);
  const isBrief = state.step === "review";
  const showFormat = ["format", "direction", "reference", "details", "review"].includes(state.step);
  const showDirection = ["direction", "reference", "details", "review"].includes(state.step);
  const showReferences = ["reference", "details", "review"].includes(state.step);

  return <div className={styles.content} data-canvas-step={state.step}>
    <header className={styles.header}>
      <span>{isBrief ? t("flow.reviewTitle") : c("sourcePreview")}</span>
      {state.projectName.trim() ? <h2>{state.projectName.trim()}</h2> : <h2>{c("untitled")}</h2>}
      {state.step === "generating" ? <p>{t("flow.generatingTitle")}</p> : null}
      {state.step === "failed" ? <p>{t("creationError")}</p> : null}
    </header>
    {state.primary ? <>
      <section className={styles.group} aria-label={t("flow.productAuthority")}>
        <h3>{t("flow.productAuthority")} <small>{t("flow.viewCount", { count: state.products.length })}</small></h3>
        <figure className={styles.primary}>
          <img src={state.primary.previewUrl} alt={t("productPreviewAlt", { index: 1 })} />
          <figcaption>{t("flow.primaryView")} · {state.primary.name}</figcaption>
        </figure>
      </section>
      <ImageStrip images={state.supporting} label={t("flow.supportingView")} alt={(index) => t("productPreviewAlt", { index: index + 1 })} />
    </> : <p className={styles.empty}>{c("emptyDescription")}</p>}
    {showFormat || isBrief ? <dl className={styles.metadata}>
      {isBrief ? <div><dt>{t("projectNameLabel")}</dt><dd>{state.projectName.trim() || c("missing")}</dd></div> : null}
      <div><dt>{t("aspectRatio.label")}</dt><dd>{state.aspectRatio}</dd></div>
      {showDirection ? <>
        <div><dt>{c("category")}</dt><dd>{state.category ? p(`filterCategories.${state.category}`) : c("missing")}</dd></div>
        <div><dt>{c("preset")}</dt><dd>{state.preset?.title ?? (state.creationMode === "custom" ? t("flow.customPath") : c("missing"))}</dd></div>
        <div><dt>{t("flow.presentationLabel")}</dt><dd>{state.presentationMode ? p(`presentationModes.${state.presentationMode}`) : c("missingOptional")}</dd></div>
      </> : null}
    </dl> : null}
    {showDirection && state.preset ? <section className={styles.inspiration} aria-label={c("presetInspiration")}>
      <h3>{c("presetInspiration")}</h3>
      <div><Image src={state.preset.thumbnail} alt="" width={112} height={84} /><p>{state.preset.title}</p></div>
    </section> : null}
    {showReferences ? <section className={styles.references} aria-label={t("flow.referenceAuthority")}>
      <ImageStrip images={state.references} label={`${t("flow.referenceAuthority")} · ${t("flow.referenceCount", { count: state.references.length })}`} alt={(index) => t("referencePreviewAlt", { index })} />
      {!state.references.length ? <p>{c("missingOptional")}</p> : null}
    </section> : null}
    {showDirection && (state.direction || isBrief) ? <section className={styles.direction}>
      <h3>{t("flow.directionTitle")}</h3>
      <p>{state.direction || c("missingOptional")}</p>
    </section> : null}
  </div>;
}
