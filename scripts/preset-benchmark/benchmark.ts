import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileDirectorPlan, fallbackDirectorPlan, type VideoDirectorInput } from "../../src/lib/video-director/core";
import { videoDirectorPresets, videoPresetIds, type VideoPresetId } from "../../src/lib/video-director/presets";
import { presetProduct } from "../../src/lib/video-director/preset-recommendations";
import { directorCacheKey, sealDirectorPlan, openDirectorPlan } from "../../src/lib/video-director/receipt";
import { videoDraftHash } from "../../src/lib/video-generation/request-identity";
import { sealVideoQuote, verifyVideoQuote } from "../../src/lib/video-generation/quote-receipt";
import { buildFalVideoRequestInput } from "../../src/lib/video-generation/fal-request";
import { summarizeVideoPayload } from "../../src/lib/video-generation/payload-summary";
import { directorFixtureInput, directorProducts } from "../../tests/fixtures/video-director-fixtures";
import { benchmarkProducts, intentContracts, type IntentKind } from "./dataset";
import { assessPlan, auditBoundary, planDistance, weights, type Failure, type Parts } from "./analysis";

export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function sourceFingerprint() {
  const files: string[] = [];
  const visit = (path: string) => { for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name); if (entry.isDirectory()) visit(file); else files.push(file);
  } };
  visit("src"); visit("database");
  return fingerprint(files.sort().map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
}
const owner = "10000000-0000-4000-8000-000000000001", secret = "offline-benchmark-only-never-a-real-key", now = 1000;
type StoredPlan = { productId: string; presetId: VideoPresetId; quality: string; duration: number; mode: string;
  plan: ReturnType<typeof fallbackDirectorPlan>; compiled: ReturnType<typeof compileDirectorPlan>; payload: ReturnType<typeof buildFalVideoRequestInput>;
  preview: ReturnType<typeof summarizeVideoPayload>["preview"]; characters: number[] };
export type CaseResult = { id: string; productId: string; presetId: VideoPresetId; quality: string; duration: number; mode: string;
  intentKind: IntentKind; request: string; suitable: boolean; counterfactualGroup: string; planRef: string; planHash: string; parts: Parts; score: number; failures: Failure[]; weaknesses: string[];
  strengths: string[]; executed: boolean; explained: boolean; categoryMatch: boolean; nearestPeer: { presetId: VideoPresetId; distance: number } | null;
  boundary: { signedPlan: boolean; exactPreview: boolean; signedQuote: boolean; rejectsChangedRequest: boolean; rejectsChangedPayload: boolean } };
export type PresetSummary = { presetId: VideoPresetId; count: number; products: number; score: number; parts: Parts; hardFailures: number;
  technicalFailures: number; intentionExecutionRate: number; classification: string; weaknesses: Record<string, number>; strengths: string[]; exampleRefs: string[] };
const mean = (values: number[]) => Math.round(values.reduce((n, v) => n + v, 0) / Math.max(1, values.length) * 10) / 10;
const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(x => x === value).length]));

export function runBenchmark() {
  const sourceBefore = sourceFingerprint();
  const ui = readFileSync("src/features/video/video-director-panel.tsx", "utf8");
  const tr = JSON.parse(readFileSync("src/messages/tr.json", "utf8")).Dashboard.videoStudio.director;
  const plans: Record<string, StoredPlan> = {}, cases: CaseResult[] = [];
  for (const product of benchmarkProducts) for (const presetId of videoPresetIds) {
    const preset = videoDirectorPresets[presetId];
    const suitable = !preset.strategy.categories.length || product.category !== "unknown" && preset.strategy.categories.includes(product.category);
    if (!suitable && product.category !== "unknown") continue;
    for (const quality of ["standard", "pro"] as const) for (const durationSeconds of [5, 10] as const)
      for (const shotMode of ["single", "multi"] as const) for (const intent of intentContracts(product, shotMode === "multi")) {
        const base = directorFixtureInput(directorProducts[0]);
        const input: VideoDirectorInput = { ...base, profile: product.profile, presetId, shotMode,
          draft: { ...base.draft, quality, durationSeconds, shotMode, prompt: intent.text,
            criticalRegion: product.profile?.visibleBranding.hasReadableText ? { x: 0, y: 0, width: 0.1, height: 0.1, declaredText: "offline unverified hint" } : null } };
        const plan = fallbackDirectorPlan(input);
        const notices: string[] = [];
        if (ui.includes('t("fallbackNotice")')) notices.push(tr.fallbackNotice);
        if (ui.includes("selected.strategy.risks.map")) notices.push(...preset.strategy.risks.map(risk => tr.library.risks[risk] as string));
        const assessment = assessPlan(plan, input, product, intent, notices);
        const key = directorCacheKey(owner, fingerprint(product.profile), "offline-no-model", input);
        const receipt = sealDirectorPlan(key, plan, secret, now);
        const opened = openDirectorPlan(receipt, key, input, secret, now + 1);
        const signedPlan = Boolean(opened && fingerprint(opened) === fingerprint(plan));
        const compiled = compileDirectorPlan(opened ?? plan, input);
        const snapshot = { version: compiled.version, method: "kling" as const, draftHash: videoDraftHash(input.draft), sourceSha256: fingerprint(product.profile),
          geometry: { originalWidth: 100, originalHeight: 100, contentRect: { x: 0, y: 0, width: 1, height: 1 } }, criticalRegion: input.draft.criticalRegion ?? null,
          frameRegion: null, compiledPrompt: compiled.prompt, negativePrompt: compiled.negativePrompt, cfgScale: compiled.cfgScale,
          analysisConsent: null, director: { plan: opened ?? plan, multiPrompt: compiled.multiPrompt } };
        const previewData = summarizeVideoPayload(input.draft, snapshot);
        const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`, endpointId: "offline",
          sourceUrl: "https://invalid.example/offline-fixture" });
        const prompts = Array.isArray(payload.multi_prompt) ? payload.multi_prompt.map(s => s.prompt) : [String(payload.prompt)];
        const previewPrompts = previewData.preview.shots.map(s => s.prompt);
        const quote = sealVideoQuote(owner, input.draft, 0.7, secret, now, previewData.snapshotHash); // Synthetic price, never provider pricing.
        const boundary = { signedPlan, exactPreview: fingerprint(prompts) === fingerprint(previewPrompts),
          signedQuote: verifyVideoQuote(quote.receipt, owner, input.draft, 0.7, secret, now + 1, previewData.snapshotHash),
          rejectsChangedRequest: !verifyVideoQuote(quote.receipt, owner, { ...input.draft, prompt: intent.text + " changed" }, 0.7, secret, now + 1, previewData.snapshotHash),
          rejectsChangedPayload: !verifyVideoQuote(quote.receipt, owner, input.draft, 0.7, secret, now + 1, "different-payload") };
        assessment.failures.push(...auditBoundary(prompts, previewPrompts, Object.values(boundary).every(Boolean), shotMode === "multi"));
        const counterfactualGroup = `${product.id}/${presetId}/${quality}/${durationSeconds}/${shotMode}`;
        const planRef = `${counterfactualGroup}/${intent.kind}`;
        plans[planRef] = { productId: product.id, presetId, quality, duration: durationSeconds, mode: shotMode, plan, compiled, payload, preview: previewData.preview, characters: prompts.map(p => p.length) };
        assessment.parts.prompt = assessment.failures.some(f => f === "payload-limit" || f === "signed-preview-payload-mismatch") ? 0 : 4;
        if (prompts.some(p => /Compose the (?:source-resolved|close crop)|Allow a (?:a|an)|framing the source-visible/i.test(p))) {
          assessment.parts.prompt = Math.min(assessment.parts.prompt, 3); assessment.weaknesses.push("mechanical-or-meta-language");
        }
        cases.push({ id: planRef, productId: product.id, presetId, quality, duration: durationSeconds, mode: shotMode,
          intentKind: intent.kind, request: intent.text, suitable, counterfactualGroup, planRef, planHash: fingerprint(plan), parts: assessment.parts, score: 0, failures: assessment.failures,
          weaknesses: assessment.weaknesses, strengths: assessment.strengths, executed: assessment.executed, explained: assessment.explained,
          categoryMatch: presetProduct(product.profile).category === product.category, nearestPeer: null, boundary });
      }
  }
  const counterfactual = new Map<string, Set<string>>();
  for (const c of cases) counterfactual.set(c.counterfactualGroup, (counterfactual.get(c.counterfactualGroup) ?? new Set()).add(c.planHash));
  for (const c of cases) {
    if (c.intentKind !== "empty" && counterfactual.get(c.counterfactualGroup)!.size === 1) {
      c.parts.intent = Math.min(5, c.parts.intent); c.weaknesses.push("request-does-not-influence-fallback");
    }
    const product = benchmarkProducts.find(p => p.id === c.productId)!;
    const peers = videoPresetIds.filter(id => id !== c.presetId).flatMap(id => {
      const p = plans[`${c.productId}/${id}/${c.quality}/${c.duration}/${c.mode}/${c.intentKind}`];
      return p ? [{ presetId: id, distance: planDistance(plans[c.planRef].plan, p.plan, product) }] : [];
    }).sort((a, b) => a.distance - b.distance || a.presetId.localeCompare(b.presetId));
    c.nearestPeer = peers[0] ?? null;
    c.parts.difference = c.nearestPeer ? Math.round(20 * Math.min(1, c.nearestPeer.distance / 0.5)) : 0;
    if (c.nearestPeer?.distance === 0) c.weaknesses.push("semantic-strategy-collision");
    c.score = Object.values(c.parts).reduce((sum, n) => sum + n, 0);
  }
  const summaries: PresetSummary[] = videoPresetIds.map(presetId => {
    const rows = cases.filter(c => c.presetId === presetId && c.suitable && benchmarkProducts.find(p => p.id === c.productId)!.category !== "unknown");
    const hardFailures = rows.filter(c => c.failures.length).length;
    const technicalFailures = rows.filter(c => c.failures.some(f => f === "payload-limit" || f === "signed-preview-payload-mismatch" || f === "shot-mode-conflict")).length;
    const categories = [...new Set(rows.map(c => benchmarkProducts.find(p => p.id === c.productId)!.category))];
    const categoryMean = (value: (c: CaseResult) => number) => mean(categories.map(category =>
      mean(rows.filter(c => benchmarkProducts.find(p => p.id === c.productId)!.category === category).map(value))));
    const score = categoryMean(c => c.score);
    const parts = Object.fromEntries(Object.keys(weights).map(key => [key, categoryMean(c => c.parts[key as keyof Parts])])) as Parts;
    const intentRows = rows.filter(c => c.intentKind !== "empty");
    return { presetId, count: rows.length, products: new Set(rows.map(c => c.productId)).size, score, parts, hardFailures, technicalFailures,
      intentionExecutionRate: mean(intentRows.map(c => c.executed ? 100 : 0)),
      classification: hardFailures ? "riskli" : score >= 75 && mean(intentRows.map(c => c.parts.intent)) >= 10 ? "üretime hazır (yalnız metin kapısı)" : "iyileştirme gerekli",
      weaknesses: countBy(rows.flatMap(c => c.weaknesses)), strengths: [...new Set(rows.flatMap(c => c.strengths))],
      exampleRefs: [...new Set(rows.filter(c => c.quality === "standard" && c.duration === 10 && c.mode === "multi" && c.intentKind === "empty").map(c => c.planRef))],
    };
  });
  const ranking = [...summaries].sort((a, b) => a.hardFailures - b.hardFailures || b.score - a.score || a.presetId.localeCompare(b.presetId));
  const comparisons = ["product-0", "product-6", "product-4", "product-3", "product-7"].map(productId => ({
    productId, variants: videoPresetIds.flatMap(presetId => {
      const ref = `${productId}/${presetId}/standard/10/multi/empty`;
      return plans[ref] ? [{ presetId, planRef: ref, nearest: cases.find(c => c.planRef === ref)?.nearestPeer }] : [];
    }),
  }));
  return { schemaVersion: 1, mode: "offline-fallback-only", productionFingerprint: sourceBefore, unchangedProduction: sourceBefore === sourceFingerprint(),
    weights, products: benchmarkProducts, cases, plans, summaries, ranking, comparisons,
    totals: { scenarios: cases.length, suitableScenarios: cases.filter(c => c.suitable).length, storedPlans: Object.keys(plans).length,
      hardFailures: cases.filter(c => c.failures.length).length, failures: countBy(cases.flatMap(c => c.failures)), weaknesses: countBy(cases.flatMap(c => c.weaknesses)),
      counterfactualGroups: counterfactual.size, responsiveGroups: [...counterfactual.values()].filter(s => s.size > 1).length } };
}
export type BenchmarkResult = ReturnType<typeof runBenchmark>;
