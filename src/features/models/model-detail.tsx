"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { archiveModelDraft } from "@/app/[locale]/dashboard/models/actions";
import type { AppLocale } from "@/i18n/routing";
import type { PersistedModelProfile } from "@/features/models/model-profile";
import { ModelCreate } from "@/features/models/model-create";
import { CandidateReview } from "@/features/models/candidate-review";
import type { CandidateReviewData } from "@/lib/models/candidate-review";
import styles from "@/features/models/model-studio.module.css";
export function ModelDetail({ locale, profile, review }: { locale: AppLocale; profile: PersistedModelProfile; review: CandidateReviewData }) { const t = useTranslations("Dashboard.modelStudioDraft"); const router = useRouter(); const [pending, startTransition] = useTransition(); return <><main className="dashboard-main"><div className={`dashboard-main-inner dashboard-container ${styles.page}`}><header className={styles.header}><div><p className={styles.eyebrow}>{t(profile.status)}</p><h1>{profile.name}</h1></div></header><CandidateReview data={review} /></div></main>{profile.status === "draft" && <><ModelCreate locale={locale} modelId={profile.id} initial={profile} embedded /><div className={styles.archive}><Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => { const result = await archiveModelDraft(locale, profile.id); if (result.status === "success") router.push("/dashboard/models"); })}>{t("archive")}</Button></div></>}</>; }
