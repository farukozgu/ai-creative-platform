import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import en from "../src/messages/en.json";
import tr from "../src/messages/tr.json";
import { getUgcDialogueTiming } from "../src/features/ugc/ugc-dialogue-timing";
import * as contract from "../src/features/ugc/ugc-studio-contract";
import { prepareUgcKlingIntegration } from "../src/lib/ugc/ugc-kling-preparation";
import type { SupabaseUgcProjectRepository } from "../src/lib/ugc/ugc-projects";
import type { UgcStudioWorkspace } from "../src/features/ugc/ugc-studio-workspace";

function load(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(compiled, { exports, require(name: string) {
    if (name === "server-only") return {};
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}

const id = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const parsed = contract.validateUgcDraftInput({
  id, title: null, creatorConceptId: "ada", format: "demo", sceneDirection: "Show the bottle.\nSmile.", spokenDialogue: "Merhaba, bu ürünü denedim.\nÇok sevdim!",
  settings: { language: "tr", tone: "natural", voice: "warm", environment: "home", lighting: "daylight", framing: "medium", duration: "15", aspectRatio: "9:16", subtitles: true },
});
assert.ok(parsed.ok);
const draft = parsed.value;

test("dialogue estimates count Turkish/English words rather than punctuation or scene direction", () => {
  assert.deepEqual(getUgcDialogueTiming(" \n … !!! ", 15), { wordCount: 0, estimatedSeconds: 0, tooLong: false });
  assert.equal(getUgcDialogueTiming("İçeriği çok güzel.\nTürkiye’de üretiliyor!", 15).wordCount, 5);
  assert.equal(getUgcDialogueTiming("It's a well-made product.\nTry it!", 15).wordCount, 6);
  assert.equal(getUgcDialogueTiming("hello ".repeat(37), 15).tooLong, false);
  assert.equal(getUgcDialogueTiming("hello ".repeat(38), 15).tooLong, true);
  assert.equal(getUgcDialogueTiming("hello ".repeat(75), 30).tooLong, false);
  assert.equal(getUgcDialogueTiming("hello ".repeat(76), 30).tooLong, true);
  assert.equal(getUgcDialogueTiming("hello ".repeat(150), 60).tooLong, false);
  assert.equal(getUgcDialogueTiming("hello ".repeat(151), 60).tooLong, true);
});

test("repository writes compatible configuration and restores both fields after a fresh read", async () => {
  let row: Record<string, unknown> | null = null;
  const chain = {
    select() { return chain; }, eq() { return chain; },
    maybeSingle: async () => ({ data: row, error: null }),
    insert(value: Record<string, unknown>) { row = { ...value, created_at: "now", updated_at: "now" }; return chain; },
    single: async () => ({ data: row, error: null }),
  };
  const loaded = load("src/lib/ugc/ugc-projects.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ from: () => chain }) },
    "@/lib/supabase/admin": {},
    "@/features/ugc/ugc-studio-contract": { ...contract, validateUgcDraftInput: (value: unknown) => contract.validateUgcDraftInput(JSON.parse(JSON.stringify(value))) },
  });
  const Repository = loaded.SupabaseUgcProjectRepository as typeof SupabaseUgcProjectRepository;
  await new Repository().saveOwned(ownerId, draft);
  const stored = row as unknown as { configuration: Record<string, unknown> };
  assert.equal(stored.configuration.script, draft.spokenDialogue);
  assert.equal(typeof stored.configuration.script, "string");
  assert.ok([...String(stored.configuration.script)].length <= 3000);
  const restored = await new Repository().getOwned(ownerId, id);
  assert.equal(restored?.sceneDirection, draft.sceneDirection);
  assert.equal(restored?.spokenDialogue, draft.spokenDialogue);
  assert.deepEqual(restored?.settings, draft.settings);
  delete stored.configuration.spokenDialogue;
  delete stored.configuration.sceneDirection;
  const legacy = await new Repository().getOwned(ownerId, id);
  assert.equal(legacy?.spokenDialogue, draft.spokenDialogue);
  assert.equal(legacy?.sceneDirection, "");
  stored.configuration.modelTier = "standard";
  assert.equal((await new Repository().getOwned(ownerId, id))?.modelTier, "standard");
  delete stored.configuration.modelTier;
  assert.equal((await new Repository().getOwned(ownerId, id))?.modelTier, "premium");
});

test("Kling preparation retains distinct scene and speech inputs without enabling audio/generation", () => {
  const plan = prepareUgcKlingIntegration({
    id, ownerId, projectId: id, idempotencyKey: id, requestHash: "a".repeat(64), status: "draft", createdAt: "now",
    requestSnapshot: { ...contract.serializeUgcConfiguration(draft), creatorConcept: { selectionId: "ada" }, product: { objectPath: `${ownerId}/${id}/${id}.webp` } },
  });
  assert.equal(plan.visualDirection, draft.sceneDirection);
  assert.equal(plan.spokenDialogue, draft.spokenDialogue);
  assert.equal(plan.visualDirection?.includes(draft.spokenDialogue), false);
  assert.ok(plan.blockers.includes("speech_pipeline_required"));
  assert.equal(plan.generationEnabled, false);
  assert.equal(plan.submitted, false);
});

test("both localized UGC forms render labeled textareas, estimates, warnings and disabled AI actions", () => {
  for (const [locale, messages] of [["tr", tr], ["en", en]] as const) {
    const t = createTranslator({ locale, messages, namespace: "Dashboard.ugcStudio", onError: error => { throw error; } });
    const loaded = load("src/features/ugc/ugc-studio-workspace.tsx", {
      "react": React, "react/jsx-runtime": jsxRuntime,
      "next/image": { __esModule: true, default: () => null },
      "next-intl": { useLocale: () => locale, useTranslations: () => t },
      "@/components/ui/badge": { Badge: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) },
      "@/components/ui/button": { Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props) },
      "@/components/dashboard/dashboard-icons": { DashboardIcon: () => null },
      "@/app/[locale]/dashboard/ugc/actions": {}, "@/lib/supabase/client": {},
      "@/features/ugc/ugc-dialogue-timing": { getUgcDialogueTiming },
      "./ugc-studio-workspace.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    });
    const Workspace = loaded.UgcStudioWorkspace as typeof UgcStudioWorkspace;
    const registry = load("src/lib/ugc/ugc-model-registry.ts", { "@/lib/video-generation/capabilities": load("src/lib/video-generation/capabilities.ts", {}) }) as typeof import("../src/lib/ugc/ugc-model-registry");
    const props = {
      modelOptions: registry.getUgcModelOptions(),
      initialDraft: { ...draft, product: null, updatedAt: "now", spokenDialogue: "Merhaba ".repeat(100) }, initialResults: [], schemaAvailable: true,
    };
    const html = renderToStaticMarkup(React.createElement(Workspace, props));
    assert.ok(html.includes(t("sceneDirection")));
    assert.ok(html.includes(t("spokenDialogue")));
    assert.match(html, /for="ugc-scene-direction"/);
    assert.match(html, /for="ugc-spoken-dialogue"/);
    assert.match(html, /id="ugc-spoken-dialogue"[^>]*lang="tr"/);
    assert.match(html, /id="ugc-dialogue-warning"/);
    assert.ok(html.includes(t("dialogueTiming", { count: 100, seconds: 40 })));
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="ugc-dialogue-generation-hint"/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="ugc-generation-status"/);
    for (const value of ["language", "voice", "tone"] as const) assert.ok(html.includes(t(`fields.${value}`)));
    assert.ok(html.includes(t("model.standard.label"))); assert.ok(html.includes(t("model.premium.label")));
    assert.ok(html.includes(t("model.limits")));
    assert.match(html, /<input(?=[^>]*name="ugc-model-tier")(?=[^>]*value="premium")(?=[^>]*checked)[^>]*>/);
    assert.match(html, /<option[^>]*value="60"[^>]*disabled/);
    const standardHtml = renderToStaticMarkup(React.createElement(Workspace, { ...props, initialDraft: { ...props.initialDraft, modelTier: "standard", settings: { ...draft.settings, duration: "30" } } }));
    assert.match(standardHtml, /<input(?=[^>]*name="ugc-model-tier")(?=[^>]*value="standard")(?=[^>]*checked)[^>]*>/);
    assert.match(standardHtml, /<option[^>]*value="30"[^>]*disabled/);
    assert.ok(standardHtml.includes(t("model.durationUnsupported", { duration: "30" })));
    assert.ok(standardHtml.includes(t("model.standard.description")));
  }
});
