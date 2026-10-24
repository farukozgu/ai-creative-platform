import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import {adultAgeRanges, emptyModelAppearanceDraft, isModelGender, modelGenders, parseModelAppearanceDraft, validateModelAppearanceDraft, type ModelAppearanceDraft, type PersistedModelProfile} from "../src/features/models/model-profile";

const draft: ModelAppearanceDraft = {...emptyModelAppearanceDraft, name: "Studio model", presentation: "Masculine", ageRange: adultAgeRanges[0], skinTone: "Medium", hairColor: "Brown", hairstyle: "Long", eyeColor: "Brown", silhouette: "Balanced", visualStyle: "Natural editorial"};
const read = (file: string) => readFileSync(file, "utf8");

test("every canonical gender is valid and independent of presentation", () => {
  for (const gender of modelGenders) {
    const parsed = parseModelAppearanceDraft({...draft, gender});
    assert.ok(parsed);
    assert.equal(parsed.gender, gender);
    assert.equal(parsed.presentation, "Masculine");
    assert.equal(validateModelAppearanceDraft(parsed), true);
  }
});

test("legacy profiles and an explicitly cleared gender retain compatibility", () => {
  const {gender, ...legacy} = draft;
  void gender;
  assert.equal(parseModelAppearanceDraft(legacy)?.gender, "");
  assert.equal(validateModelAppearanceDraft(legacy), true);
  assert.equal(parseModelAppearanceDraft({...legacy, gender: ""})?.gender, "");
  for (const value of ["Female", "Male", "Non-binary", "invalid", null, 1, {}, []]) {
    assert.equal(parseModelAppearanceDraft({...legacy, gender: value}), null);
    assert.equal(isModelGender(value), false);
  }
});

test("gender does not weaken existing name, notes, age or appearance validation", () => {
  assert.equal(parseModelAppearanceDraft({...draft, gender: "female", ageRange: "12"}), null);
  assert.equal(parseModelAppearanceDraft({...draft, gender: "female", name: "x".repeat(81)}), null);
  assert.equal(parseModelAppearanceDraft({...draft, gender: "female", notes: "x".repeat(601)}), null);
  assert.equal(parseModelAppearanceDraft({...draft, gender: "female", skinTone: ""}), null);
});

test("JSON persistence round-trips canonical gender on create, reopen and draft edit", async () => {
  type Row = {id: string; user_id: string; name: string; appearance: Record<string, unknown>; notes: string | null; status: string; created_at: string; updated_at: string};
  let row: Row | null = null;
  const mutations: Record<string, unknown>[] = [];
  const client = {from(table: string) {
    assert.equal(table, "model_profiles");
    const filters: Record<string, unknown> = {};
    let operation: "read" | "create" | "update" = "read";
    let payload: Record<string, unknown> | null = null;
    const builder = {
      insert(value: Record<string, unknown>) {operation = "create"; payload = value; return builder;},
      update(value: Record<string, unknown>) {operation = "update"; payload = value; return builder;},
      select() {return builder;},
      eq(field: string, value: unknown) {filters[field] = value; return builder;},
      async single() {
        assert.equal(operation, "create");assert.equal(payload?.user_id, "owner");
        mutations.push(payload!);
        row = {...payload, id: "model", status: "draft", created_at: "2026-10-24T10:00:00Z", updated_at: "2026-10-24T10:00:00Z"} as Row;
        return {data: row, error: null};
      },
      async maybeSingle() {
        assert.equal(filters.user_id, "owner");assert.equal(filters.id, "model");
        if (operation === "update") {assert.equal(filters.status, "draft");mutations.push(payload!);row = {...row, ...payload} as Row;}
        return {data: row, error: null};
      },
    };
    return builder;
  }};
  type Repository = {
    createModelProfile: (owner: string, value: ModelAppearanceDraft) => Promise<PersistedModelProfile>;
    updateModelProfile: (owner: string, id: string, value: ModelAppearanceDraft) => Promise<PersistedModelProfile>;
    getModelProfile: (owner: string, id: string) => Promise<PersistedModelProfile>;
  };
  const exported = {} as Repository;
  const code = ts.transpileModule(read("src/lib/models/model-profiles.ts"), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(code, {exports: exported, require(name: string) {
    if (name === "server-only") return {};
    if (name.endsWith("/supabase/server")) return {createClient: async () => client};
    if (name.endsWith("/models/model-profile")) return {parseModelAppearanceDraft};
    throw new Error(name);
  }});
  for (const gender of modelGenders) {
    assert.equal((await exported.createModelProfile("owner", {...draft, gender})).gender, gender);
    assert.equal((await exported.getModelProfile("owner", "model")).gender, gender);
    assert.equal((mutations.at(-1)?.appearance as Record<string, unknown>).gender, gender);
  }
  assert.equal((await exported.updateModelProfile("owner", "model", {...draft, gender: "non_binary"})).gender, "non_binary");
  assert.equal((await exported.getModelProfile("owner", "model")).gender, "non_binary");
  await exported.updateModelProfile("owner", "model", {...draft, gender: ""});
  assert.equal((await exported.getModelProfile("owner", "model")).gender, "");
  assert.equal(Object.hasOwn(mutations.at(-1)?.appearance as object, "gender"), false);
});

test("editor and summary are localized and later workflow stages remain unavailable", () => {
  const ui = read("src/features/models/model-create.tsx");
  const summary = read("src/features/models/model-profile-summary.tsx");
  const detail = read("src/features/models/model-detail.tsx");
  assert.match(ui, /\["define", "review", "generate", "select", "approve", "use"\]/);
  assert.match(ui, /const unavailable = index > 1 \|\| \(index === 1 && !complete\)/);
  assert.match(ui, /disabled=\{unavailable \|\| busy\}/);
  assert.match(ui, /aria-current=\{state === "current" \? "step" : undefined\}/);
  assert.match(ui, /type="radio" name="gender" value=\{gender\}/);
  assert.match(ui, /saveModelDraft\(locale, modelId, draft\)/);
  assert.match(ui, /ModelProfileSummary draft=\{draft\}/);
  assert.match(detail, /onArchive=\{archive\} archiving=\{pending\}/);
  assert.match(detail, /archiveModelDraft\(locale, profile.id\)/);
  assert.doesNotMatch(ui + summary, /<img|<Image|createObjectURL|provider.generate/);
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)).Dashboard.modelStudio.editor;
    for (const [, key] of (ui + summary).matchAll(/\b(?:editor|t)\("(title|editTitle|subtitle|gender\.[a-z]+|identityTitle|identityDescription|appearanceTitle|appearanceDescription|directionTitle|directionDescription|ready|incomplete|unavailable|liveSummary|notSet|consistency|summaryNote)"/g)) {
      assert.ok(key.split('.').reduce((value, part) => value?.[part], messages), key);
    }
    for (const gender of modelGenders) assert.ok(messages.gender.options[gender]);
    for (const state of ["current", "completed", "available", "unavailable"]) assert.ok(messages.stageStates[state]);
  }
  const css = read("src/features/models/model-create.module.css");
  assert.match(css, /position: sticky/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /input:focus-visible/);
});
