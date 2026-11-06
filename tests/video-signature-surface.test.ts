import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { VideoDirectorPanel, VideoDirectorPresetSelector } from "../src/features/video/video-director-panel";
import type { VideoGenerationInspector } from "../src/features/video/video-generation-inspector";
import { initialVideoStudioDraft, videoStudioCreativeFields, videoStudioReducer } from "../src/features/video/video-studio-state";
import { videoStudioPresetIds } from "../src/features/video/video-preset-catalog";
import { fallbackDirectorPlan, type VideoDirectorPlan } from "../src/lib/video-director/core";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import * as recommendations from "../src/lib/video-director/preset-recommendations";
import * as presets from "../src/lib/video-director/presets";
import { videoCategories } from "../src/lib/video-director/preset-contract";

const read = (path: string) => readFileSync(path, "utf8");
const compile = (path: string) => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const panelCode = compile("src/features/video/video-director-panel.tsx");
const css = { default: new Proxy({}, { get: (_, key) => key }) };
const previews = [
  "/images/presets/cosmetics-studio.webp", "/images/presets/watches-editorial-studio.webp",
  "/workspace-demo/jewelry/macro.webp", "/images/presets/bags-studio.webp", "/images/presets/footwear-street.webp",
  "/workspace-demo/fashion/campaign-hero.webp", "/workspace-demo/cosmetics/texture-macro.webp", "/images/presets/jewelry-lifestyle-still-life.webp",
];
function loadPanel(locale: "tr" | "en", plan: VideoDirectorPlan | null = null) {
  const messages = JSON.parse(read(`src/messages/${locale}.json`)).Dashboard.videoStudio;
  type Exports = { VideoDirectorPanel: typeof VideoDirectorPanel; VideoDirectorPresetSelector: typeof VideoDirectorPresetSelector };
  const uiModule = { exports: {} as Exports };
  let stateIndex = 0;
  runInNewContext(panelCode, { module: uiModule, exports: uiModule.exports, require: (name: string): unknown => {
    if (name === "react") return { ...React, useEffect: () => {}, useRef: (current: unknown) => ({ current }),
      useState: (initial: unknown) => [stateIndex++ === 0 && plan ? { plan, receipt: "offline", analysisStatus: "not_analyzed" } : initial, () => {}] };
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next-intl") return { useTranslations: (namespace: string) => (key: string) => key.split(".").reduce((value, part) => value?.[part], namespace.endsWith("references") ? messages.references : messages.director) ?? key };
    if (name === "next/image") return { default: ({ src }: { src: string }) => React.createElement("span", { "data-preview": src }) };
    if (name.endsWith("/button")) return { Button: ({ children }: React.PropsWithChildren) => React.createElement("button", null, children) };
    if (name.endsWith("/badge")) return { Badge: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children) };
    if (name.endsWith("/presets")) return presets;
    if (name.endsWith("/video-preset-catalog")) return { videoStudioPresetIds };
    if (name.endsWith("/preset-recommendations")) return recommendations;
    if (name.endsWith("/core")) return { shotFields: ["camera", "lighting", "composition", "motion", "pace", "focus"] };
    if (name.endsWith("/director-actions")) return {};
    if (name.endsWith(".module.css")) return css;
    throw new Error(`Unexpected panel dependency: ${name}`);
  } });
  return { ...uiModule.exports, copy: messages.director };
}

test("studio defaults stay 10s multi with legacy duration and mode choices available", () => {
  assert.equal(initialVideoStudioDraft.duration, 10);
  assert.equal(initialVideoStudioDraft.shotMode, "multi");
  assert.equal(videoStudioReducer(initialVideoStudioDraft, { type: "set-duration", duration: 5 }).duration, 5);
  assert.equal(videoStudioReducer(initialVideoStudioDraft, { type: "set-shot-mode", mode: "single" }).shotMode, "single");
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  assert.match(workspace, /const durationValues: VideoDuration\[\] = \[5, 10\]/);
  assert.match(workspace, /shotModeControls=\{<fieldset[\s\S]*?video-director-mode[\s\S]*?set-shot-mode/);
  assert.match(read("src/features/video/video-source-selector.tsx"), /className=\{styles.stepNumber\} aria-hidden="true">01/);
});

test("restored selections use the existing reducer and invalidate prepared plan, quote and consent", () => {
  const selection = { presetId: "minimal-studio" as const, shotMode: "multi" as const, receipt: "old" };
  const single = videoStudioReducer(initialVideoStudioDraft, { type: "set-shot-mode", mode: "single" });
  const shorter = videoStudioReducer(single, { type: "set-duration", duration: 5 });
  assert.equal(shorter.shotMode, "single"); assert.equal(shorter.duration, 5);
  assert.equal(videoStudioCreativeFields(shorter, selection).director, undefined);
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  assert.match(workspace, /dispatch\(\{ type: "set-shot-mode", mode \}\);\s*setDirector\(null\); setSubmissionQuote\(null\); setConfirmedReceipt\(null\)/);
  assert.match(workspace, /onDurationChange=\{\(duration\) => \{\s*dispatch\(\{ type: "set-duration", duration \}\);\s*setDirector\(null\); setSubmissionQuote\(null\); setConfirmedReceipt\(null\)/);
  for (const locale of ["tr", "en"]) {
    const copy = JSON.parse(read(`src/messages/${locale}.json`)).Dashboard.videoStudio.director;
    assert.equal(copy.single, locale === "tr" ? "Tek çekim" : "Single shot");
    assert.equal(copy.multi, locale === "tr" ? "Çoklu çekim" : "Multi-shot");
  }
});

test("rendered operator flow has six consecutive steps and both duration choices", () => {
  const uiModule = { exports: {} as { VideoGenerationInspector: typeof VideoGenerationInspector } };
  runInNewContext(compile("src/features/video/video-generation-inspector.tsx"), { module: uiModule, exports: uiModule.exports, require: (name: string): unknown => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith("/button")) return { Button: ({ children }: React.PropsWithChildren) => React.createElement("button", null, children) };
    if (name.endsWith("/navigation")) return { Link: () => null };
    if (name.endsWith("/video-source-selector")) return { VideoSourceSelector: () => React.createElement("span", { className: "stepNumber" }, "01") };
    if (name.endsWith(".module.css")) return css;
    throw new Error(`Unexpected inspector dependency: ${name}`);
  } });
  type Props = React.ComponentProps<typeof VideoGenerationInspector>;
  const props: Props = {
    copy: { title: "Studio", description: "", source: {} as Props["copy"]["source"], promptHeading: "", promptDescription: "", promptPlaceholder: "",
      qualityHeading: "Quality", outputHeading: "Output", aspectRatioLabel: "Ratio", durationLabel: "Duration", secondsLabel: String, generate: "Generate", libraryLink: "Library", approvalHeading: "Approval" },
    source: null, prompt: "", quality: "standard", qualityOptions: [{ value: "standard", label: "Standard" }], aspectRatio: "16:9", aspectRatioOptions: [],
    duration: 10, durationOptions: [{ value: 5, label: "5 seconds" }, { value: 10, label: "10 seconds" }], feedbackMessage: null, feedbackIsError: false, isReady: false, isSubmitting: false,
    showLibraryLink: false, generationAvailable: false, libraryAssets: [], libraryOpen: false, libraryStatus: "idle", incomingSourceStatus: "idle",
    promptEnabled: false, presetControls: React.createElement("span", { className: "stepNumber" }, "02"),
    shotModeControls: React.createElement("fieldset", null, React.createElement("span", { className: "stepNumber" }, "03"),
      React.createElement("label", null, React.createElement("input", { type: "radio", name: "video-director-mode", value: "single" }), "Single shot"),
      React.createElement("label", null, React.createElement("input", { type: "radio", name: "video-director-mode", value: "multi", defaultChecked: true }), "Multi-shot")),
    directorControls: React.createElement("span", { className: "stepNumber" }, "05"),
    onFile: () => {}, onRemoveSource: () => {}, onToggleLibrary: () => {}, onRetryLibrary: () => {}, onSelectLibrary: () => {},
    onPromptChange: () => {}, onQualityChange: () => {}, onAspectRatioChange: () => {}, onDurationChange: () => {}, onGenerate: () => {},
  };
  const html = renderToStaticMarkup(React.createElement(uiModule.exports.VideoGenerationInspector, props));
  assert.deepEqual([...html.matchAll(/class="stepNumber"[^>]*>(\d+)/g)].map(m => m[1]), ["01", "02", "03", "04", "05", "06"]);
  assert.equal((html.match(/name="video-duration"/g) ?? []).length, 2);
  assert.match(html, /name="video-duration"[^>]*checked=""[^>]*value="10"/);
  assert.match(html, /name="video-duration"[^>]*value="5"/);
  assert.match(html, /Single shot/); assert.match(html, /Multi-shot/);
  assert.doesNotMatch(html, /<textarea/);
});

for (const locale of ["tr", "en"] as const) {
  test(`${locale}: all eight previews are explicit existing assets and the picker only shows signature choices`, () => {
    const { VideoDirectorPresetSelector: Selector } = loadPanel(locale);
    const html = renderToStaticMarkup(React.createElement(Selector, { presetId: "minimal-studio", disabled: false, onChange: () => {} }));
    assert.deepEqual([...html.matchAll(/data-preview="([^"]+)"/g)].map(m => m[1]), previews);
    for (const src of previews) assert.ok(existsSync(`public${src}`), src);
    assert.equal((html.match(/name="video-director-preset"/g) ?? []).length, 8);
    assert.doesNotMatch(read("src/features/video/video-director-panel.tsx"), /presetImages\[id\]\s*\?\?/);
  });

  test(`${locale}: category recommendation badges survive public-catalog ranking`, () => {
    const { VideoDirectorPresetSelector: Selector, copy } = loadPanel(locale);
    const html = renderToStaticMarkup(React.createElement(Selector, { presetId: "minimal-studio", disabled: false, onChange: () => {},
      product: { category: "watches", evidence: ["visible dial"] } }));
    const card = [...html.matchAll(/<label>([\s\S]*?)<\/label>/g)].find(match => match[1].includes('value="metallic-light-sweep"'))?.[1];
    assert.ok(card?.includes(copy.library.recommendedBadge));
  });

  test(`${locale}: descriptions describe the golden grammar rather than retired detail/camera tasks`, () => {
    const copy = loadPanel(locale).copy;
    for (const id of videoStudioPresetIds) assert.match(copy.presets[id].description, locale === "tr" ? /^10 saniyelik çoklu çekim/ : /^The 10-second multi-shot/);
    const rules = locale === "tr" ? {
      "minimal-studio": [/premium stüdyo/, /tek görünür detay\/ışık/, /kilitli ürün finali/],
      "metallic-light-sweep": [/ürün sabit/, /ışık soldan sağa bir kez/, /yavaşça yaklaşır/, /geri çekilip/],
      "macro-detail-reveal": [/tek doğrulanmış görünür detay/, /tekrar tam ürün/],
      "floating-accessory": [/hafifçe yükselir/, /yumuşakça yerleşir/, /kamera kilitli/, /dönüş yoktur/],
      "cinematic-hero": [/beş kısa kesme/, /tek detay/, /yanal kadraj/, /ışık vurgusu/],
      "dramatic-backlight": [/okunabilir karanlık silüet/, /kontrollü biçimde aydınlanır/, /düşük anahtarlı/],
      "material-detail": [/tek görünür yüzey bölgesi/, /materyal tahmini yapılmadan/],
      "window-display": [/minimal vitrin yaklaşımı/, /cam ışık etkileşimi/, /ürünü baskın/],
    } : {
      "minimal-studio": [/premium studio approach/, /one visible detail\/light/, /locked product finish/],
      "metallic-light-sweep": [/product fixed/, /one left-to-right light pass/, /eases closer/, /pulls back/],
      "macro-detail-reveal": [/one verified visible detail/, /returns to a complete product/],
      "floating-accessory": [/source orientation/, /gently rises and settles/, /camera stays locked/, /no rotation/],
      "cinematic-hero": [/five quick cuts/, /one detail/, /lateral framing/, /light accent/],
      "dramatic-backlight": [/readable dark silhouette/, /controlled illumination/, /low-key product hero/],
      "material-detail": [/one visible surface region/, /without inferring material/],
      "window-display": [/minimal storefront approach/, /glass-light interaction/, /product-dominant display/],
    };
    for (const [id, patterns] of Object.entries(rules)) for (const pattern of patterns) assert.match(copy.presets[id].description, pattern);
    for (const id of ["macro-detail-reveal", "material-detail"]) assert.doesNotMatch(copy.presets[id].description, /second(?: verified)? (?:detail|surface)|different verified|junction|ikinci|farklı doğrulanmış|birleşim/i);
    assert.doesNotMatch(copy.presets["floating-accessory"].description, /lateral|glide|yanal|kamera kay/i);
    assert.equal(copy.automaticPlanning, locale === "tr"
      ? "Çekim planı seçilen preset ve ürünün doğrulanmış görünür özelliklerine göre otomatik hazırlanır."
      : "The shot plan is prepared automatically from the selected preset and verified visible product features.");
    assert.doesNotMatch(copy.prepare, /AI/);
    assert.doesNotMatch(copy.prepareAgain, /AI/);
  });

  for (const id of videoStudioPresetIds) test(`${locale}/${id}: fixed fallback-origin golden plan is presented as Signature`, () => {
    const base = directorFixtureInput(directorProducts[0]);
    const input = { ...base, presetId: id, shotMode: "multi" as const, draft: { ...base.draft, durationSeconds: 10 as const, shotMode: "multi" as const } };
    const plan = fallbackDirectorPlan(input);
    const { VideoDirectorPanel: Panel, copy } = loadPanel(locale, plan);
    const html = renderToStaticMarkup(React.createElement(Panel, { draft: input.draft, draftKey: "offline", presetId: id, shotMode: "multi", planDisabled: false, disabledReason: null, onPrepared: () => {} }));
    assert.match(html, /class="stepNumber"[^>]*>05/);
    assert.ok(html.includes(copy.signaturePlan));
    assert.ok(!html.includes(copy.fallbackPlan));
    assert.ok(!html.includes(copy.fallbackNotice));
    assert.ok(!html.includes(copy.aiPlan));
    assert.doesNotMatch(html, /AI plan|AI shot|AI çekim|AI yaratıcı|AI creative/);
  });

  test(`${locale}: legacy single and hidden presets retain fallback presentation`, () => {
    for (const presetId of [...videoStudioPresetIds, "luxury-fashion-film"] as const) for (const [shotMode, durationSeconds] of [["single", 5], ["multi", 5], ["single", 10]] as const) {
      const base = directorFixtureInput(directorProducts[0]);
      const input = { ...base, presetId, shotMode, draft: { ...base.draft, durationSeconds, shotMode } };
      const { VideoDirectorPanel: Panel, copy } = loadPanel(locale, fallbackDirectorPlan(input));
      const html = renderToStaticMarkup(React.createElement(Panel, { draft: input.draft, draftKey: "offline", presetId, shotMode, planDisabled: false, disabledReason: null, onPrepared: () => {} }));
      assert.ok(html.includes(copy.fallbackPlan));
      assert.ok(!html.includes(copy.signaturePlan));
    }
  });

  test(`${locale}: Custom plans retain their existing presentation`, () => {
    const base = directorFixtureInput(directorProducts[0]);
    const template = fallbackDirectorPlan({ ...base, presetId: "minimal-studio", shotMode: "single" });
    const plan: VideoDirectorPlan = { ...template, presetId: "custom", origin: "ai", shotMode: "multi" };
    const { VideoDirectorPanel: Panel, copy } = loadPanel(locale, plan);
    const html = renderToStaticMarkup(React.createElement(Panel, { draft: { ...base.draft, creativeMode: "custom", durationSeconds: 10 }, draftKey: "offline",
      shotMode: "multi", planDisabled: false, disabledReason: null, onPrepared: () => {} }));
    assert.ok(html.includes(copy.aiPlan));
    assert.ok(!html.includes(copy.signaturePlan));
  });
}

test("public recommendation ranking uses only visible candidates and retains category relevance and legacy defaults", () => {
  assert.deepEqual(recommendations.recommendVideoPresets(recommendations.unknownPresetProduct), [
    "luxury-fashion-film", "macro-detail-reveal", "minimal-studio", "product-spotlight", "cinematic-hero", "material-detail",
  ]);
  for (const category of [...videoCategories, "unknown"] as const) {
    const product = { category, evidence: [] };
    const ranked = recommendations.recommendVideoPresets(product, videoStudioPresetIds);
    assert.ok(ranked.length > 0 && ranked.length <= 6);
    assert.ok(ranked.every(id => videoStudioPresetIds.some(visible => visible === id)));
    if (category !== "unknown" && videoStudioPresetIds.some(id => presets.videoDirectorPresets[id].strategy.categories.includes(category))) {
      assert.ok(presets.videoDirectorPresets[ranked[0]].strategy.categories.includes(category));
    }
    assert.deepEqual(recommendations.recommendVideoPresets(product), recommendations.recommendVideoPresets(product, presets.videoPresetIds));
  }
  assert.match(read("src/features/video/video-director-panel.tsx"), /recommendVideoPresets\(product, videoStudioPresetIds\)/);
});
