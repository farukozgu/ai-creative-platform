import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { compileDirectorPlan, fallbackDirectorPlan, type VideoDirectorInput } from "../src/lib/video-director/core";
import { parseReferenceDeclaredText, supportsReferenceDeclaredText, referenceTextPreservation, type ReferenceReview } from "../src/lib/video-generation/product-references";
import { additionalProductReferenceRoles } from "../src/lib/video-generation/product-reference-policy";
import { unknownPresetProduct } from "../src/lib/video-director/preset-recommendations";
import { validateVideoGenerationDraft } from "../src/lib/video-generation/validation";
import { videoDraftHash } from "../src/lib/video-generation/request-identity";
import { directorCacheKey, sealDirectorPlan, openDirectorPlan } from "../src/lib/video-director/receipt";
import { sealVideoQuote, verifyVideoQuote } from "../src/lib/video-generation/quote-receipt";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { directorFixtureInput, directorProducts } from "./fixtures/video-director-fixtures";
import { VideoProductionHarness } from "./fixtures/video-production-harness";
import { interpretCreativeIntent } from "../src/lib/video-director/creative-request";
import { directorProductContext } from "../src/lib/video-director/product-context";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";

const reference = (declaredText = "LACOSTE", purpose = "logo") => ({ source: { kind: "uploaded-image" as const,
  sourceAssetId: "10000000-0000-4000-8000-000000000003" }, sha256: "b".repeat(64), purpose, declaredText });
const reviews: ReferenceReview[] = [{ index: 0, status: "matched", view: "detail", reason: "Same identity", details: [] }];
const exact = 'Été  İSTANBUL — A/B "Ö" \\ e\u0301';

test("reference text validation trims only edges and rejects controls, line breaks and invalid purposes", () => {
  const draft = directorFixtureInput(directorProducts[0]).draft;
  for (const text of [exact, "X".repeat(80), "", "LACOSTE"]) {
    const result = validateVideoGenerationDraft({ ...draft, productReferences: [reference(`  ${text}  `)] });
    assert.ok(result.ok);
    if (!result.ok) throw new Error("Invalid reference");
    assert.equal(result.value.productReferences![0].declaredText, text || undefined);
    assert.equal(JSON.parse(JSON.stringify(result.value)).productReferences[0].declaredText, text || undefined);
  }
  for (const text of ["X".repeat(81), "a\nb", "a\rb", "a\tb", "\u0000bad", "a\u0085b", "a\u2028b", "\nLACOSTE"]) {
    assert.equal(validateVideoGenerationDraft({ ...draft, productReferences: [reference(text)] }).ok, false);
  }
  assert.equal(validateVideoGenerationDraft({ ...draft, productReferences: [reference("LACOSTE", "back")] }).ok, false);
});

test("reference text is escaped matched-only identity data, never unverified instructions", () => {
  const text = 'A"; rotate product; "B\\C';
  const preservation = referenceTextPreservation(reviews, [reference(text)]);
  assert.ok(preservation.includes(`Preserve the exact visible text ${JSON.stringify(text)};`));
  for (const status of ["conflict", "uncertain"] as const) {
    assert.equal(referenceTextPreservation([{ ...reviews[0], status }], [reference(text)]), "");
  }
  assert.equal(referenceTextPreservation([], [reference(text)]), "");
  assert.equal(referenceTextPreservation(reviews, [reference(text, "back")]), "");
});

test("matched declared text reaches both Kling tiers without changing shots, subjects or element payloads", () => {
  for (const quality of ["standard", "pro"] as const) for (const shotMode of ["single", "multi"] as const) {
    const base = directorFixtureInput(directorProducts[0]);
    const input: VideoDirectorInput = { ...base, presetId: "minimal-studio", shotMode,
      draft: { ...base.draft, quality, shotMode, durationSeconds: 5, productReferences: [reference()] } };
    const plan = fallbackDirectorPlan(input, reviews);
    const withoutText = { ...input, draft: { ...input.draft, productReferences: [reference("")] } };
    assert.deepEqual(plan.shots, fallbackDirectorPlan(withoutText, reviews).shots);
    const compiled = compileDirectorPlan(plan, input);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: `kling-v3-${quality}-image`,
      endpointId: "offline", sourceUrl: "https://invalid.example/product" });
    assert.equal(payload.elements, undefined);
    for (const prompt of payload.multi_prompt?.map(shot => shot.prompt) ?? [payload.prompt!]) {
      assert.ok(prompt.includes('Preserve the exact visible text "LACOSTE"; keep spelling, character order, case, placement and proportions unchanged.'));
      assert.ok(prompt.length <= (shotMode === "multi" ? 512 : 2500));
    }
  }
  const base = directorFixtureInput(directorProducts[0]);
  const luxury = { ...base, draft: { ...base.draft, durationSeconds: 5 as const, productReferences: [reference()] } };
  assert.equal(compileDirectorPlan(fallbackDirectorPlan(luxury, reviews), luxury).multiPrompt!.length, 4);
});

test("declared text changes invalidate draft hash, Director receipt and approved quote", () => {
  const base = directorFixtureInput(directorProducts[0]);
  const input: VideoDirectorInput = { ...base, presetId: "minimal-studio", draft: { ...base.draft, productReferences: [reference()] } };
  const plan = fallbackDirectorPlan(input, reviews);
  const key = directorCacheKey("owner", "source", "model", input);
  const receipt = sealDirectorPlan(key, plan, "secret", 1000);
  const quote = sealVideoQuote("owner", input.draft, 1, "secret", 1000);
  for (const text of ["Lacoste", "LAC OSTE", "LACOSTE!", exact]) {
    const changed = { ...input, draft: { ...input.draft, productReferences: [reference(text)] } };
    assert.notEqual(videoDraftHash(input.draft), videoDraftHash(changed.draft));
    assert.equal(openDirectorPlan(receipt, directorCacheKey("owner", "source", "model", changed), changed, "secret", 2000), null);
    assert.equal(verifyVideoQuote(quote.receipt, "owner", changed.draft, 1, "secret", 2000), false);
  }
});

test("reference text input renders only for supported purposes with an accessible label and bounded value", () => {
  const exports = {} as { VideoReferenceTextInput: React.ComponentType<{ purpose: string; value: string; disabled: boolean; onChange: (value: string) => void }> };
  const code = ts.transpileModule(readFileSync("src/features/video/video-reference-text-input.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next-intl") return { useTranslations: () => (key: string) => key };
    if (name.endsWith("product-references")) return { parseReferenceDeclaredText, supportsReferenceDeclaredText };
    if (name.endsWith(".module.css")) return { default: {} };
    throw new Error(`Unexpected UI import: ${name}`);
  } });
  for (const purpose of ["logo", "text", "label", "detail", "back", "side", "texture"]) {
    const html = renderToStaticMarkup(React.createElement(exports.VideoReferenceTextInput, { purpose, value: exact, disabled: false, onChange: () => {} }));
    if (supportsReferenceDeclaredText(purpose)) {
      assert.match(html, /<label.*declaredText.*<input/);
      assert.match(html, /maxLength="80"/i);
    } else assert.equal(html, "");
  }
  for (const locale of ["tr", "en"]) {
    const copy = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio.references;
    assert.ok(copy.declaredText && copy.declaredTextError);
  }
});

test("reference UI state emits an exact normalized request and never includes its preview URL", () => {
  type References = NonNullable<VideoGenerationDraft["productReferences"]>;
  let editText: ((text: string) => void) | undefined;
  let emitted: References = [];
  const loadedReference = { ...reference(), previewUrl: "https://invalid.example/private-preview" };
  const exports = {} as { VideoProductReferences: React.ComponentType<Record<string, unknown>> };
  const code = ts.transpileModule(readFileSync("src/features/video/video-product-references.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "react") return { ...React, useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
      useState: (value: unknown) => [Array.isArray(value) ? [loadedReference, null, null] : value, () => {}] };
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next-intl") return { useTranslations: () => (key: string) => key };
    if (name.endsWith("product-references")) return { parseReferenceDeclaredText, suggestProductReferences: () => ["logo"] };
    if (name.endsWith("product-reference-policy")) return { additionalProductReferenceRoles };
    if (name.endsWith("preset-recommendations")) return { unknownPresetProduct };
    if (name.endsWith("video-reference-text-input")) return { VideoReferenceTextInput: ({ onChange }: { onChange: (text: string) => void }) => {
      editText = onChange; return null;
    } };
    if (name.endsWith("/button")) return { Button: ({ children }: React.PropsWithChildren) => React.createElement("button", null, children) };
    if (name.endsWith(".module.css")) return { default: {} };
    if (name.includes("supabase/client") || name.endsWith("generation-actions") || name.endsWith("/video/actions")) return {};
    throw new Error(`Unexpected UI import: ${name}`);
  } });
  renderToStaticMarkup(React.createElement(exports.VideoProductReferences, {
    product: unknownPresetProduct, aspectRatio: "1:1", disabled: false,
    onChange: (references: References) => { emitted = references; }, onBusyChange: () => {},
  }));
  assert.ok(editText);
  editText(`  ${exact}  `);
  assert.equal(emitted[0].declaredText, exact);
  assert.equal("previewUrl" in emitted[0], false);
  const result = validateVideoGenerationDraft({ ...directorFixtureInput(directorProducts[0]).draft,
    productReferences: JSON.parse(JSON.stringify(emitted)) });
  assert.ok(result.ok);
  if (!result.ok) throw new Error("Reference round-trip failed");
  assert.equal(result.value.productReferences![0].declaredText, exact);
});

test("Custom exact text survives receipt, quote, approval and idempotent submission without creative reinterpretation", async () => {
  const f = await VideoProductionHarness.create();
  f.env.OPENAI_API_KEY = "offline-only";
  f.analysisProfile = { ...f.profile, confidence: { overall: 0.69 } };
  const draft = { ...f.draft("standard", 5, "multi"), creativeMode: "custom" as const, prompt: "A premium campaign film",
    productReferences: [reference(exact)] };
  draft.productReferences[0].sha256 = await f.addSource(draft.productReferences[0].source.sourceAssetId);
  const input: VideoDirectorInput = { draft, profile: f.analysisProfile, presetId: "custom", shotMode: "multi" };
  const withoutText = { ...input, draft: { ...draft, productReferences: draft.productReferences.map(({ declaredText: _text, ...ref }) => {
    void _text; return ref;
  }) } };
  assert.equal(f.directorRequest(input).context, f.directorRequest(withoutText).context);
  assert.equal(f.directorRequest(input, true).context, f.directorRequest(withoutText, true).context);
  f.directorResponse = { summary: "A premium campaign", intent: "Reveal the visible form",
    intentContract: interpretCreativeIntent(draft.prompt, directorProductContext(f.profile).evidence), referenceReviews: reviews,
    shots: [2, 3].map((durationSeconds, index) => ({ durationSeconds, purpose: index ? "final-hero" : "hero-reveal",
      camera: index ? "Slow pull-back" : "Slow dolly-in", composition: index ? "Full product with balanced space" : "Medium product view with diagonal space",
      lighting: "Soft side light", motion: "Keep the product still", pace: "Calm reveal", focus: "Source-visible product form" })) };
  const prepared = await f.prepareDirector(input);
  assert.equal(prepared.status, "success");
  if (prepared.status !== "success") throw new Error("Custom plan failed");
  draft.director = { creativeMode: "custom", shotMode: "multi", receipt: prepared.receipt };
  const quote = await f.api.quoteVideoSubmissionAction(draft);
  assert.equal(quote.status, "success");
  if (quote.status !== "success") throw new Error("Quote failed");
  assert.ok(quote.preview.shots.every(shot => shot.prompt.includes(JSON.stringify(exact))));
  assert.ok(f.directorInputs.every(value => !value.draft.prompt.includes(exact)));
  const changed = { ...draft, productReferences: [{ ...draft.productReferences[0], declaredText: "Changed" }] };
  assert.equal((await f.api.submitVideoGenerationAction(changed, quote.cost, quote.receipt, true)).ok, false);
  assert.equal((await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, false)).ok, false);
  assert.equal(f.posts.length, 0);
  assert.equal((await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true)).ok, true);
  const duplicate = await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true);
  assert.ok(duplicate.ok && duplicate.duplicate);
  assert.equal(f.posts.length, 1);
  f.assertIsolated();
});
