"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { emptyModelAppearanceDraft, type ModelAppearanceDraft, validateModelAppearanceDraft } from "@/features/models/model-profile";
import styles from "@/features/models/model-studio.module.css";
import { saveModelDraft } from "@/app/[locale]/dashboard/models/actions";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

const fields = ["presentation", "ageRange", "skinTone", "hairColor", "hairstyle", "eyeColor", "silhouette", "visualStyle"] as const;

export function ModelCreate({ locale, modelId = null, initial = emptyModelAppearanceDraft, embedded = false }: { locale: AppLocale; modelId?: string | null; initial?: ModelAppearanceDraft; embedded?: boolean }) {
  const t = useTranslations("Dashboard.modelStudio.create");
  const draftT = useTranslations("Dashboard.modelStudioDraft");
  const [draft, setDraft] = useState<ModelAppearanceDraft>(initial);
  const [result, setResult] = useState<"idle" | "error" | "success">("idle");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const complete = validateModelAppearanceDraft(draft);
  const update = (field: keyof ModelAppearanceDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  const Shell = embedded ? "section" : "main";
  return <Shell className={embedded ? undefined : "dashboard-main"}><div className={`dashboard-main-inner dashboard-container ${styles.page}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("description")}</p></div></header>
    <ol className={styles.steps} aria-label={t("stepsLabel")}>{["define", "review", "generate", "select", "approve", "use"].map((step, index) => <li key={step} data-active={index === 0 || undefined} data-planned={index > 1 || undefined}><span>{index + 1}</span>{t(`steps.${step}`)}</li>)}</ol>
    <div className={styles.createLayout}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const response = await saveModelDraft(locale, modelId, draft); if (response.status === "success" && response.id) { setResult("success"); router.push(`/dashboard/models/${response.id}`); } else setResult("error"); }); }}>
        <fieldset><legend>{t("identityLegend")}</legend><p className={styles.helper}>{t("identityHelper")}</p>
          <label>{t("fields.name.label")}<input value={draft.name} maxLength={80} placeholder={t("fields.name.placeholder")} onChange={(event) => update("name", event.target.value)} /></label>
          {fields.map((field) => <label key={field}>{t(`fields.${field}.label`)}<select value={draft[field]} onChange={(event) => update(field, event.target.value)}><option value="">{t("choose")}</option>{(t.raw(`fields.${field}.options`) as string[]).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
        </fieldset>
        <fieldset><legend>{t("notesLegend")}</legend><p className={styles.helper}>{t("notesHelper")}</p><label>{t("fields.notes.label")}<textarea value={draft.notes} maxLength={600} placeholder={t("fields.notes.placeholder")} onChange={(event) => update("notes", event.target.value)} /></label></fieldset><Button type="submit" disabled={!complete || pending}>{pending ? draftT("saving") : draftT("save")}</Button>{result === "error" ? <p role="alert" className={styles.unavailable}>{draftT("saveError")}</p> : null}
      </form>
      <aside className={styles.guidance}><h2>{t("guidance.title")}</h2><dl><div><dt>{t("guidance.identity.title")}</dt><dd>{t("guidance.identity.description")}</dd></div><div><dt>{t("guidance.scene.title")}</dt><dd>{t("guidance.scene.description")}</dd></div></dl><p className={styles.safety}>{t("safety")}</p></aside>
    </div>
    <section className={styles.nextStep}><div><h2>{t("reviewTitle")}</h2><p>{complete ? t("reviewReady") : t("reviewIncomplete")}</p></div><Button disabled>{t("generationUnavailable")}</Button><p className={styles.unavailable}>{t("unavailableHelper")}</p></section>
  </div></Shell>;
}
