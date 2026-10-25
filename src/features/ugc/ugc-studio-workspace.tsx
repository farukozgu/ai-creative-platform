"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardIcon } from "@/components/dashboard/dashboard-icons";
import { completeUgcProductUploadAction, createUgcProductUploadAction, removeUgcProductAction, saveUgcProjectDraftAction } from "@/app/[locale]/dashboard/ugc/actions";
import type { UgcDraftSettings, UgcStudioInitialState } from "@/features/ugc/ugc-studio-contract";
import type { UgcModelOption, UgcModelTier } from "@/features/ugc/ugc-model-contract";
import { getUgcDialogueTiming } from "@/features/ugc/ugc-dialogue-timing";
import { createClient } from "@/lib/supabase/client";
import styles from "./ugc-studio-workspace.module.css";

const creators = [
  { id: "ada", image: "/workspace-demo/cosmetics/model-usage.webp" },
  { id: "deniz", image: "/workspace-demo/fashion/social.webp" },
  { id: "maya", image: "/images/presets/bags-on-model.webp" },
] as const;
const formats = ["testimonial", "review", "unboxing", "demo", "story", "problem"] as const;
const options = {
  language: ["tr", "en"], tone: ["natural", "energetic", "professional"],
  voice: ["warm", "bright", "calm"], environment: ["home", "studio", "outdoor"],
  lighting: ["daylight", "soft", "warm"], framing: ["medium", "close", "wide"],
  duration: ["15", "30", "60"], ratio: ["9:16", "1:1", "16:9"],
} as const;
type Setting = keyof typeof options;
type Draft = { [K in Setting]: (typeof options)[K][number] };
type UgcVideoResult = { id: string; url: string; contentType: "video/mp4"; byteSize: number; durationSeconds: number; createdAt: string };

function Disclosure({ title, summary, children, open = false }: { title: string; summary: string; children: ReactNode; open?: boolean }) {
  return <details className={styles.card} open={open}>
    <summary className={styles.disclosure}><span><strong>{title}</strong><small>{summary}</small></span><DashboardIcon name="chevron" /></summary>
    <div className={styles.cardBody}>{children}</div>
  </details>;
}

export function UgcStudioWorkspace({ initialDraft, initialResults, schemaAvailable, modelOptions }: { initialDraft: UgcStudioInitialState; initialResults: UgcVideoResult[]; schemaAvailable: boolean; modelOptions: UgcModelOption[] }) {
  const t = useTranslations("Dashboard.ugcStudio");
  const locale = useLocale();
  const [modelTier, setModelTier] = useState<UgcModelTier>(initialDraft?.modelTier ?? "premium");
  const selectedModel = modelOptions.find(model => model.tier === modelTier);
  const [projectId, setProjectId] = useState<string | null>(initialDraft?.id ?? null);
  const [creator, setCreator] = useState<string>(initialDraft?.creatorConceptId ?? "ada");
  const [format, setFormat] = useState<(typeof formats)[number]>(initialDraft?.format ?? "testimonial");
  const [sceneDirection, setSceneDirection] = useState(initialDraft?.sceneDirection ?? "");
  const [spokenDialogue, setSpokenDialogue] = useState(initialDraft?.spokenDialogue ?? initialDraft?.script ?? "");
  const [draft, setDraft] = useState<Draft>(() => initialDraft ? { ...initialDraft.settings, ratio: initialDraft.settings.aspectRatio } : { language: locale === "en" ? "en" : "tr", tone: "natural", voice: "warm", environment: "home", lighting: "daylight", framing: "medium", duration: "30", ratio: "9:16" });
  const [subtitles, setSubtitles] = useState(initialDraft?.settings.subtitles ?? true);
  const [product, setProduct] = useState<{ name: string; url: string; contentType: string; byteSize: number; objectPath?: string } | null>(initialDraft?.product ? { ...initialDraft.product, name: initialDraft.product.fileName, url: initialDraft.product.previewUrl, objectPath: "saved" } : null);
  const [error, setError] = useState<"invalidFile" | "unreadableFile" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "unavailable">(schemaAvailable ? "idle" : "unavailable");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const uploadRequest = useRef(0);
  const saveRequest = useRef(0);
  const dialogueTiming = getUgcDialogueTiming(spokenDialogue, Number(draft.duration));
  const durationSupported = selectedModel?.durations.includes(Number(draft.duration)) ?? false;
  useEffect(() => () => { uploadRequest.current += 1; }, []);
  useEffect(() => () => { if (product?.url.startsWith("blob:")) URL.revokeObjectURL(product.url); }, [product]);

  useEffect(() => {
    if (!projectId) setTimeout(() => setProjectId(crypto.randomUUID()), 0);
  }, [projectId]);

  function projectDraftPayload(id: string) {
    const settings: UgcDraftSettings = {
      language: draft.language, tone: draft.tone, voice: draft.voice, environment: draft.environment,
      lighting: draft.lighting, framing: draft.framing, duration: draft.duration,
      aspectRatio: draft.ratio, subtitles,
    };
    return { id, title: null, modelTier, creatorConceptId: creator, format, sceneDirection, spokenDialogue, settings };
  }

  useEffect(() => {
    if (!schemaAvailable || !projectId) return;
    const request = ++saveRequest.current;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      const settings: UgcDraftSettings = {
        language: draft.language, tone: draft.tone, voice: draft.voice, environment: draft.environment,
        lighting: draft.lighting, framing: draft.framing, duration: draft.duration,
        aspectRatio: draft.ratio, subtitles,
      };
      void saveUgcProjectDraftAction(locale, { id: projectId, title: null, modelTier, creatorConceptId: creator, format, sceneDirection, spokenDialogue, settings }).then(result => {
        if (request === saveRequest.current) setSaveState(result.ok ? "saved" : result.code === "unavailable" ? "unavailable" : "error");
      }).catch(() => { if (request === saveRequest.current) setSaveState("unavailable"); });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [schemaAvailable, locale, projectId, modelTier, creator, format, sceneDirection, spokenDialogue, draft, subtitles]);

  async function selectProduct(file?: File) {
    if (!file) return;
    const request = ++uploadRequest.current;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0) {
      setError("invalidFile"); return;
    }
    const url = URL.createObjectURL(file);
    setProduct({ name: file.name, url, contentType: file.type, byteSize: file.size });
    try {
      const preview = new window.Image();
      preview.src = url;
      await preview.decode();
      if (request !== uploadRequest.current) { URL.revokeObjectURL(url); return; }
      if (!schemaAvailable || !projectId) { setSaveState("unavailable"); return; }
      setSaveState("saving");
      const savedDraft = await saveUgcProjectDraftAction(locale, projectDraftPayload(projectId));
      if (!savedDraft.ok) { setSaveState(savedDraft.code === "unavailable" ? "unavailable" : "error"); return; }
      const ticket = await createUgcProductUploadAction(locale, projectId, file.type, file.size);
      if (!ticket.ok) { setSaveState(ticket.code === "unavailable" ? "unavailable" : "error"); return; }
      const { error: uploadError } = await createClient().storage.from("ugc-product-assets")
        .uploadToSignedUrl(ticket.value.path, ticket.value.token, file, { contentType: file.type, cacheControl: "3600" });
      if (uploadError || request !== uploadRequest.current) { setSaveState("error"); return; }
      const completed = await completeUgcProductUploadAction(locale, projectId, ticket.value.path, file.name);
      if (!completed.ok) { setSaveState(completed.code === "unavailable" ? "unavailable" : "error"); return; }
      setProduct({ ...completed.value, name: completed.value.fileName, url: completed.value.previewUrl, objectPath: "saved" });
      setSaveState("saved"); setError(null);
    } catch {
      URL.revokeObjectURL(url);
      if (request === uploadRequest.current) setError("unreadableFile");
    }
  }

  function setting(key: Setting) {
    return <label className={styles.field} key={key}><span>{t(`fields.${key}`)}</span>
      <select value={draft[key]} aria-describedby={key === "duration" ? "ugc-model-capabilities ugc-model-limits" : undefined} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))}>
        {options[key].map(value => <option key={value} value={value} disabled={key === "duration" && !selectedModel?.durations.includes(Number(value))}>{t(`options.${key}.${value}`)}</option>)}
      </select>
    </label>;
  }

  return <div className={`dashboard-main-inner ${styles.studio}`}>
    <header className={styles.heading}><div><div className={styles.eyebrow}><DashboardIcon name="video" />{t("eyebrow")}</div><h1>{t("title")}</h1><p>{t("description")}</p></div><Badge className={styles.badge}>{t("comingSoon")}</Badge></header>
    <div className={styles.workspace}>
      <section className={styles.configuration} aria-label={t("configuration")}>
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <fieldset className={styles.group} aria-describedby="ugc-model-capabilities ugc-model-limits">
              <legend>{t("model.label")}</legend>
              <div className={styles.formats}>{modelOptions.map(model => <label className={styles.choice} key={model.tier}>
                <input type="radio" name="ugc-model-tier" value={model.tier} checked={modelTier === model.tier} onChange={() => setModelTier(model.tier)} />
                <span>{t(`model.${model.tier}.label`)}</span>
              </label>)}</div>
            </fieldset>
            <p id="ugc-model-capabilities" className={styles.hint} role="status" aria-live="polite">{t(`model.${modelTier}.description`)}</p>
            <p id="ugc-model-limits" className={styles.hint}>{t("model.limits")}</p>
            {!durationSupported ? <p className={styles.error} role="status">{t("model.durationUnsupported", { duration: draft.duration })}</p> : null}
          </div>
        </div>
        <Disclosure title={t("contentTitle")} summary={`${t(`creators.${creator}.name`)} · ${t(`formats.${format}`)}`} open>
          <fieldset className={styles.group} aria-describedby="ugc-creator-hint"><legend>{t("creator")}</legend>
            <div className={styles.creators}>{creators.map(item => <label key={item.id} className={styles.creator}>
              <input type="radio" name="ugc-creator" value={item.id} aria-label={`${t(`creators.${item.id}.name`)} · ${t(`creators.${item.id}.style`)}`} checked={creator === item.id} onChange={() => setCreator(item.id)} />
              <span className={styles.creatorBody}><span className={styles.portrait}><Image src={item.image} alt={t(`creators.${item.id}.alt`)} fill sizes="(min-width: 1440px) 180px, (min-width: 1024px) 140px, (min-width: 768px) 28vw, 30vw" /><span className={styles.selectionMark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg></span></span><strong>{t(`creators.${item.id}.name`)}</strong><small>{t(`creators.${item.id}.style`)}</small></span>
            </label>)}</div>
            <p id="ugc-creator-hint" className={styles.hint}>{t("creatorHint")}</p>
          </fieldset>
          <div className={`${styles.group} ${styles.productGroup}`}><h2>{t("product")}</h2>
            <input ref={fileInput} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label={t("upload")} onChange={event => { void selectProduct(event.target.files?.[0]); event.target.value = ""; }} />
            {product ? <div className={styles.product}><Image src={product.url} alt={t("productAlt", { name: product.name })} width={64} height={64} unoptimized /><div><strong>{product.name}</strong><small>{product.objectPath ? t("productSaved") : t("localOnly")}</small></div><Button variant="ghost" size="sm" disabled={saveState === "saving"} onClick={async () => { if (product.objectPath && projectId) { const result = await removeUgcProductAction(locale, projectId); if (!result.ok) { setSaveState("error"); return; } setSaveState("saved"); } uploadRequest.current += 1; setProduct(null); setError(null); uploadButton.current?.focus(); }}>{t("remove")}</Button></div> : null}
            <Button ref={uploadButton} variant="secondary" className={styles.upload} disabled={saveState === "saving"} aria-describedby={error ? "ugc-upload-hint ugc-upload-error" : "ugc-upload-hint"} onClick={() => fileInput.current?.click()}><DashboardIcon name={product ? "edit" : "plus"} /><span>{t(product ? "replace" : "upload")}</span></Button>
            <p id="ugc-upload-hint" className={styles.hint}>{t("uploadHint")}</p>
            {error ? <p id="ugc-upload-error" className={styles.error} role="alert">{t(error)}</p> : null}
          </div>
          <fieldset className={styles.group}><legend>{t("format")}</legend><div className={styles.formats}>{formats.map(value => <label className={styles.choice} key={value}><input type="radio" name="ugc-format" value={value} checked={format === value} onChange={() => setFormat(value)} /><span>{t(`formats.${value}`)}</span></label>)}</div></fieldset>
        </Disclosure>
        <Disclosure title={t("scriptTitle")} summary={`${t(`options.language.${draft.language}`)} · ${t(`options.tone.${draft.tone}`)}`}>
          <div className={styles.group}>
            <label className={styles.field} htmlFor="ugc-scene-direction"><span>{t("sceneDirection")}</span><textarea id="ugc-scene-direction" rows={4} maxLength={3000} value={sceneDirection} aria-describedby="ugc-scene-direction-hint" placeholder={t("sceneDirectionPlaceholder")} onChange={event => setSceneDirection(event.target.value)} /><small>{t("scriptCount", { count: [...sceneDirection].length })}</small></label>
            <p id="ugc-scene-direction-hint" className={styles.hint}>{t("sceneDirectionHint")}</p>
          </div>
          <div className={styles.group}>
            <label className={styles.field} htmlFor="ugc-spoken-dialogue"><span>{t("spokenDialogue")}</span><textarea id="ugc-spoken-dialogue" rows={5} maxLength={3000} value={spokenDialogue} lang={draft.language} aria-describedby={`ugc-dialogue-hint ugc-dialogue-timing${dialogueTiming.tooLong ? " ugc-dialogue-warning" : ""}`} placeholder={t("scriptPlaceholder")} onChange={event => setSpokenDialogue(event.target.value)} /><small>{t("scriptCount", { count: [...spokenDialogue].length })}</small></label>
            <p id="ugc-dialogue-hint" className={styles.hint}>{t("spokenDialogueHint")}</p>
            <p id="ugc-dialogue-timing" className={styles.hint} role="status" aria-live="polite">{t("dialogueTiming", { count: dialogueTiming.wordCount, seconds: dialogueTiming.estimatedSeconds })}</p>
            {dialogueTiming.tooLong ? <p id="ugc-dialogue-warning" className={styles.error} role="status">{t("dialogueTooLong", { duration: draft.duration })}</p> : null}
            <Button variant="secondary" size="sm" className={styles.upload} disabled aria-describedby="ugc-dialogue-generation-hint">{t("generateDialogue")}</Button>
            <p id="ugc-dialogue-generation-hint" className={styles.hint}>{t("dialogueGenerationHint")}</p>
          </div>
          <div className={styles.fields}>{setting("language")}{setting("tone")}{setting("voice")}</div><p className={styles.hint}>{t("voiceHint")}</p>
        </Disclosure>
        <Disclosure title={t("sceneTitle")} summary={`${t(`options.environment.${draft.environment}`)} · ${t(`options.duration.${draft.duration}`)} · ${draft.ratio}`}>
          <fieldset className={styles.group}><legend>{t("scene")}</legend><div className={styles.fields}>{setting("environment")}{setting("lighting")}{setting("framing")}</div></fieldset>
          <fieldset className={styles.group}><legend>{t("output")}</legend><div className={styles.fields}>{setting("duration")}{setting("ratio")}</div><label className={styles.checkbox}><input type="checkbox" checked={subtitles} onChange={event => setSubtitles(event.target.checked)} /><span>{t("subtitles")}</span></label></fieldset>
        </Disclosure>
        <p className={styles.hint} role="status" aria-live="polite">{t(`saveState.${saveState}`)}</p>
      </section>
      <section className={styles.videoWorkspace} aria-label={t("workspace")} tabIndex={0}>
        <div className={styles.previewCard}>
          <div className={styles.toolbar}><h2>{t("preview")}</h2><span>{t("previewLabel")}</span></div>
          <div className={styles.stage}><div className={styles.videoFrame} data-ratio={draft.ratio}>
            <span className={styles.frameLabel}>{draft.ratio}</span><div className={styles.empty}><span className={styles.emptyIcon}><DashboardIcon name="video" /></span><h3>{t("emptyTitle")}</h3><p>{t("emptyDescription")}</p></div><span className={styles.frameFooter}>{t("noVideo")}</span>
          </div></div>
          <div className={styles.brief}><h2>{t("summary")}</h2><dl>
            <div><dt>{t("model.label")}</dt><dd>{t(`model.${modelTier}.label`)}</dd></div>
            <div><dt>{t("creator")}</dt><dd>{t(`creators.${creator}.name`)}</dd></div>
            <div><dt>{t("product")}</dt><dd>{product?.name ?? t("noProduct")}</dd></div>
            <div><dt>{t("format")}</dt><dd>{t(`formats.${format}`)}</dd></div>
            <div><dt>{t("spokenDialogue")}</dt><dd>{t(`options.language.${draft.language}`)} · {t(`options.tone.${draft.tone}`)} · {t(`options.voice.${draft.voice}`)} · {t("dialogueTiming", { count: dialogueTiming.wordCount, seconds: dialogueTiming.estimatedSeconds })}</dd></div>
            <div><dt>{t("scene")}</dt><dd>{t(`options.environment.${draft.environment}`)} · {t(`options.lighting.${draft.lighting}`)} · {t(`options.framing.${draft.framing}`)}</dd></div>
            <div><dt>{t("output")}</dt><dd>{t(`options.duration.${draft.duration}`)} · {draft.ratio} · {t(subtitles ? "subtitlesOn" : "subtitlesOff")}</dd></div>
          </dl></div>
          <div className={styles.generate}><Button disabled aria-describedby="ugc-generation-status" className={styles.generateButton}><DashboardIcon name="lock" /><span>{t("generate")}</span><span>· {t("comingSoon")}</span></Button><p id="ugc-generation-status">{t("generationHint")}</p></div>
        </div>
        <div className={styles.results}><div className={styles.toolbar}><h2>{t("results")}</h2><span>{t("resultCount", { count: initialResults.length })}</span></div>{initialResults.length ? <ul className={styles.resultList}>{initialResults.map(result => <li key={result.id}><video controls playsInline preload="metadata" aria-label={t("resultVideoLabel")}><source src={result.url} type={result.contentType} /></video><p>{t("resultDetails", { duration: result.durationSeconds })}</p></li>)}</ul> : <div className={styles.resultsEmpty}><DashboardIcon name="videoLibrary" /><div><strong>{t("resultsEmpty")}</strong><p>{t("resultsHint")}</p></div></div>}</div>
      </section>
    </div>
  </div>;
}
