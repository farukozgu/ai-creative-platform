"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { CandidateReviewData, ReviewCandidate } from "@/lib/models/candidate-review";
import styles from "./model-studio.module.css";

function Portrait({ url, alt, missing }: { url: string | null; alt: string; missing: string }) {
  return <div className={styles.portrait}>{url ? <Image src={url} alt={alt} fill unoptimized sizes="(max-width: 699px) 100vw, 40vw" /> : <span>{missing}</span>}</div>;
}

export function CandidateReview({ data }: { data: CandidateReviewData }) {
  const t = useTranslations("Dashboard.modelReview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.candidates.find((item) => item.id === selectedId) ?? data.candidates[0] ?? null;
  const ready = data.candidates.filter((item) => item.status === "ready");
  return <section className={styles.review} aria-labelledby="candidate-review-title">
    <div><p className={styles.eyebrow}>{t("eyebrow")}</p><h2 id="candidate-review-title">{t("title")}</h2><p>{t("description")}</p></div>
    {data.state === "unavailable" ? <p role="alert" className={styles.reviewState}>{t("unavailable")}</p> : <>
      <p className={styles.reviewState} role="status">{t(`job.${data.jobStatus ?? "none"}`)}</p>
      {data.candidates.length === 0 ? <p className={styles.reviewState}>{t("empty")}</p> : <div className={styles.reviewLayout}>
        <div className={styles.reviewGallery} aria-label={t("gallery")}>
          {data.candidates.map((candidate, index) => <button type="button" key={candidate.id} className={styles.candidateTile} aria-pressed={selected?.id === candidate.id} onClick={() => setSelectedId(candidate.id)}>
            <Portrait url={candidate.previewUrl} alt={t("candidateAlt", { number: index + 1 })} missing={t("previewMissing")} />
            <span>{t("candidate", { number: index + 1 })} · {t(`candidateStatus.${candidate.status}`)}</span>
          </button>)}
        </div>
        {selected && <div className={styles.selectedCandidate}><Portrait url={selected.previewUrl} alt={t("selectedAlt")} missing={t("previewMissing")} /><div><h3>{t("selected")}</h3><p>{t(`candidateStatus.${selected.status}`)}</p><time dateTime={selected.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(selected.createdAt))}</time><Appearance candidate={selected} /></div></div>}
      </div>}
      {ready.length >= 2 && <section aria-label={t("compare")}><h3>{t("compare")}</h3><div className={styles.compareGrid}>{ready.map((candidate, index) => <div key={candidate.id}><Portrait url={candidate.previewUrl} alt={t("candidateAlt", { number: index + 1 })} missing={t("previewMissing")} /><p>{t("candidate", { number: index + 1 })}</p></div>)}</div></section>}
      <section className={styles.approval} aria-labelledby="approval-title"><h3 id="approval-title">{t("approvalTitle")}</h3><p>{t("approvalExplanation")}</p><p>{selected ? t("selectedStatus", { status: t(`candidateStatus.${selected.status}`) }) : t("noSelection")}</p><ReferenceGallery data={data} selected={selected} /><p>{data.version ? t("version", { number: data.version }) : t("noVersion")}</p><Button disabled>{t("approve")}</Button><p className={styles.unavailable}>{t("approvalDisabled")}</p></section>
    </>}
  </section>;
}

function Appearance({ candidate }: { candidate: ReviewCandidate }) {
  const t = useTranslations("Dashboard.modelReview");
  const keys = ["presentation", "ageRange", "skinTone", "hairColor", "hairstyle", "eyeColor", "silhouette", "visualStyle"] as const;
  return <dl className={styles.appearanceList}>{keys.map((key) => candidate.appearance[key] ? <div key={key}><dt>{t(`attributes.${key}`)}</dt><dd>{candidate.appearance[key]}</dd></div> : null)}</dl>;
}

function ReferenceGallery({ data, selected }: { data: CandidateReviewData; selected: ReviewCandidate | null }) {
  const t = useTranslations("Dashboard.modelReview");
  const views = ["front", "three_quarter", "side"] as const;
  return <div><h4>{t("evidence")}</h4><div className={styles.referenceGrid}>{views.map((view) => {
    const reference = data.references.find((item) => item.view === view);
    const primary = view === "front" && !reference && selected?.status === "ready" ? selected.previewUrl : null;
    const url = reference?.previewUrl ?? primary ?? null;
    const state = reference ? url ? "validated" : "unavailable" : primary ? "pending" : selected?.status === "rejected" ? "rejected" : selected?.status === "pending" ? "pending" : "missing";
    return <div key={view}><Portrait url={url} alt={t(`views.${view}`)} missing={t(`evidenceState.${state}`)} /><strong>{t(`views.${view}`)}</strong><span>{t(`evidenceState.${state}`)}</span></div>;
  })}</div>{data.references.length > 3 && <p>{t("additional", { count: data.references.length - 3 })}</p>}<p className={styles.unavailable}>{t("consistency")}</p></div>;
}
