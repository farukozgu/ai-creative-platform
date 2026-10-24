"use client";

import {useId, useRef, useState, useTransition} from "react";
import {useTranslations} from "next-intl";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {DashboardIcon} from "@/components/dashboard/dashboard-icons";
import {emptyModelAppearanceDraft, modelGenders, validateModelAppearanceDraft, type ModelAppearanceDraft} from "./model-profile";
import {ModelProfileSummary} from "./model-profile-summary";
import {saveModelDraft} from "@/app/[locale]/dashboard/models/actions";
import {useRouter} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import styles from "./model-create.module.css";

const appearanceFields = ["skinTone", "hairColor", "hairstyle", "eyeColor", "silhouette"] as const;
type SelectField = typeof appearanceFields[number] | "ageRange" | "presentation";
const steps = ["define", "review", "generate", "select", "approve", "use"] as const;

type ModelCreateProps = {
  locale: AppLocale; modelId?: string | null; initial?: ModelAppearanceDraft; embedded?: boolean;
  onArchive?: () => void; archiving?: boolean;
};

export function ModelCreate({locale, modelId = null, initial = emptyModelAppearanceDraft, embedded = false, onArchive, archiving = false}: ModelCreateProps) {
  const t = useTranslations("Dashboard.modelStudio.create");
  const editor = useTranslations("Dashboard.modelStudio.editor");
  const draftT = useTranslations("Dashboard.modelStudioDraft");
  const [draft, setDraft] = useState<ModelAppearanceDraft>(initial);
  const [result, setResult] = useState<"idle" | "error" | "success">("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const genderHelp = useId();
  const router = useRouter();
  const complete = validateModelAppearanceDraft(draft);
  const busy = pending || archiving;
  const update = (field: keyof ModelAppearanceDraft, value: string) => {
    setDraft(current => ({...current, [field]: value}));
    setResult("idle");
    setActiveStep(0);
  };

  function navigateStage(index: number) {
    if (busy || (index === 1 && !complete) || index > 1) return;
    setActiveStep(index);
    (index === 0 ? nameRef.current : saveRef.current)?.focus();
  }

  function selectField(field: SelectField) {
    const options = t.raw(`fields.${field}.options`) as string[];
    const current = draft[field];
    return <label key={field}>{t(`fields.${field}.label`)}<select name={field} value={current} onChange={event => update(field, event.target.value)}>
      <option value="">{t("choose")}</option>
      {current && !options.includes(current) ? <option value={current}>{current}</option> : null}
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select></label>;
  }

  const visualStyles = t.raw("fields.visualStyle.options") as string[];
  const styleOptions = draft.visualStyle && !visualStyles.includes(draft.visualStyle) ? [draft.visualStyle, ...visualStyles] : visualStyles;
  const Shell = embedded ? "section" : "main";
  return <Shell className={embedded ? undefined : "dashboard-main"}><div className={`dashboard-main-inner dashboard-container ${styles.editor}`}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{t("eyebrow")}</p><h1>{modelId ? editor("editTitle") : editor("title")}</h1><p>{editor("subtitle")}</p></div>
      <Badge className={styles.status}><span aria-hidden="true" />{draftT("draft")}</Badge>
    </header>
    <ol className={styles.steps} aria-label={t("stepsLabel")}>
      {steps.map((step, index) => {
        const unavailable = index > 1 || (index === 1 && !complete);
        const state = unavailable ? "unavailable" : activeStep === index ? "current" : index < activeStep ? "completed" : "available";
        return <li key={step} data-state={state}><button type="button" disabled={unavailable || busy} onClick={() => navigateStage(index)} aria-current={state === "current" ? "step" : undefined}>
          <span className={styles.stepNumber}>{state === "completed" ? <span aria-hidden="true">{"\u2713"}</span> : index > 1 ? <DashboardIcon name="lock" /> : index + 1}</span>
          <span><strong>{t(`steps.${step}`)}</strong><small>{editor(`stageStates.${state}`)}</small></span>
        </button></li>;
      })}
    </ol>

    <div className={styles.layout}>
      <form className={styles.form} onSubmit={event => {
        event.preventDefault();
        if (!complete || busy || submitting.current) return;
        submitting.current = true;
        setResult("idle");
        startTransition(async () => {
          try {
            const response = await saveModelDraft(locale, modelId, draft);
            if (response.status === "success" && response.id) {setResult("success"); router.push(`/dashboard/models/${response.id}`);}
            else setResult("error");
          } catch {setResult("error");}
          finally {submitting.current = false;}
        });
      }}>
        <fieldset className={styles.section} disabled={busy}>
          <legend><span className={styles.sectionIcon}><DashboardIcon name="account" /></span>{editor("identityTitle")}</legend>
          <p className={styles.helper}>{editor("identityDescription")}</p>
          <div className={styles.fields}>
            <label className={styles.fullWidth}>{t("fields.name.label")}<input ref={nameRef} name="name" value={draft.name} maxLength={80} placeholder={t("fields.name.placeholder")} onChange={event => update("name", event.target.value)} /></label>
            <fieldset className={styles.choices} aria-describedby={genderHelp}><legend>{editor("gender.label")}</legend><div className={styles.chips}>
              {modelGenders.map(gender => <label key={gender} className={styles.chip}><input type="radio" name="gender" value={gender} checked={draft.gender === gender} onChange={() => update("gender", gender)} /><span>{editor(`gender.options.${gender}`)}</span></label>)}
            </div><p id={genderHelp} className={styles.helper}>{editor("gender.helper")}{draft.gender ? <button type="button" className={styles.clearGender} onClick={() => update("gender", "")}>{editor("gender.clear")}</button> : null}</p></fieldset>
            {selectField("ageRange")}{selectField("presentation")}
          </div>
        </fieldset>
        <fieldset className={styles.section} disabled={busy}>
          <legend><span className={styles.sectionIcon}><DashboardIcon name="models" /></span>{editor("appearanceTitle")}</legend>
          <p className={styles.helper}>{editor("appearanceDescription")}</p>
          <div className={styles.fields}>{appearanceFields.map(selectField)}</div>
        </fieldset>
        <fieldset className={styles.section} disabled={busy}>
          <legend><span className={styles.sectionIcon}><DashboardIcon name="spark" /></span>{editor("directionTitle")}</legend>
          <p className={styles.helper}>{editor("directionDescription")}</p>
          <fieldset className={styles.choices}><legend>{t("fields.visualStyle.label")}</legend><div className={styles.chips}>{styleOptions.map(option => <label key={option} className={styles.chip}><input type="radio" name="visualStyle" value={option} checked={draft.visualStyle === option} onChange={() => update("visualStyle", option)} /><span>{option}</span></label>)}</div></fieldset>
          <label>{t("fields.notes.label")}<textarea name="notes" value={draft.notes} maxLength={600} placeholder={t("fields.notes.placeholder")} onChange={event => update("notes", event.target.value)} /></label>
          <p className={styles.helper}>{t("notesHelper")}</p>
        </fieldset>

        <div className={styles.actionBar}>
          <div className={styles.readiness}><DashboardIcon name={complete ? "spark" : "edit"} /><p>{complete ? editor("ready") : editor("incomplete")}</p></div>
          <div className={styles.actionButtons}>{onArchive ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onArchive}>{draftT("archive")}</Button> : null}<Button ref={saveRef} className={styles.save} type="submit" size="sm" disabled={!complete || busy} aria-busy={pending}>{pending ? draftT("saving") : draftT("save")}</Button></div>
          {result === "error" ? <p role="alert" className={styles.error}>{draftT("saveError")}</p> : null}
        </div>
        <p className={styles.availability}><DashboardIcon name="lock" />{editor("unavailable")}</p>
      </form>
      <ModelProfileSummary draft={draft} />
    </div>
  </div></Shell>;
}
