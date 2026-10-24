"use client";

import {useTransition} from "react";
import {useTranslations} from "next-intl";
import {Badge} from "@/components/ui/badge";
import {useRouter} from "@/i18n/navigation";
import {archiveModelDraft} from "@/app/[locale]/dashboard/models/actions";
import type {AppLocale} from "@/i18n/routing";
import type {PersistedModelProfile} from "./model-profile";
import {ModelCreate} from "./model-create";
import {ModelProfileSummary} from "./model-profile-summary";
import {CandidateReview} from "./candidate-review";
import type {CandidateReviewData} from "@/lib/models/candidate-review";
import styles from "./model-studio.module.css";

export function ModelDetail({locale, profile, review}: {locale: AppLocale; profile: PersistedModelProfile; review: CandidateReviewData}) {
  const t = useTranslations("Dashboard.modelStudioDraft");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function archive() {
    if (pending) return;
    startTransition(async () => {
      const result = await archiveModelDraft(locale, profile.id);
      if (result.status === "success") router.push("/dashboard/models");
    });
  }
  return <main className="dashboard-main">
    {profile.status === "draft" ? <ModelCreate locale={locale} modelId={profile.id} initial={profile} embedded onArchive={archive} archiving={pending} /> :
      <div className={`dashboard-main-inner dashboard-container ${styles.page}`}>
        <header className={styles.header}><div><h1>{profile.name}</h1></div><Badge>{t(profile.status)}</Badge></header>
        <ModelProfileSummary draft={profile} />
      </div>}
    <div className={`dashboard-main-inner dashboard-container ${styles.page}`}><CandidateReview data={review} /></div>
  </main>;
}
