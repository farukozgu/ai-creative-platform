"use client";

import {useTranslations} from "next-intl";
import {DashboardIcon} from "@/components/dashboard/dashboard-icons";
import type {ModelAppearanceDraft} from "./model-profile";
import styles from "./model-create.module.css";

export function ModelProfileSummary({draft}: {draft: ModelAppearanceDraft}) {
  const t = useTranslations("Dashboard.modelStudio.editor");
  const fields = useTranslations("Dashboard.modelStudio.create.fields");
  const traits = ["skinTone", "hairColor", "hairstyle", "eyeColor", "silhouette", "visualStyle"] as const;
  const value = (text: string | undefined) => text?.trim() || t("notSet");
  return <aside className={styles.summary} aria-labelledby="model-profile-summary-title">
    <div className={styles.summaryHeading}><span className={styles.sectionIcon}><DashboardIcon name="models" /></span><div><p className={styles.eyebrow}>{t("liveSummary")}</p><h2 id="model-profile-summary-title">{value(draft.name)}</h2></div></div>
    <dl className={styles.summaryIdentity}>
      <div><dt>{t("gender.label")}</dt><dd>{draft.gender ? t(`gender.options.${draft.gender}`) : t("notSet")}</dd></div>
      <div><dt>{fields("ageRange.label")}</dt><dd>{value(draft.ageRange)}</dd></div>
      <div><dt>{fields("presentation.label")}</dt><dd>{value(draft.presentation)}</dd></div>
    </dl>
    <div className={styles.summaryTraits}><h3>{t("appearanceTitle")}</h3><dl>{traits.map(field => <div key={field}><dt>{fields(`${field}.label`)}</dt><dd>{value(draft[field])}</dd></div>)}</dl></div>
    <div className={styles.consistency}><DashboardIcon name="lock" /><p>{t("consistency")}</p></div>
    <p className={styles.summaryFootnote}>{t("summaryNote")}</p>
  </aside>;
}
