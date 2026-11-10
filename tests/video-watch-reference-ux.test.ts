import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { VideoDirectorPanel } from "../src/features/video/video-director-panel";
import type { VideoGenerationInspector } from "../src/features/video/video-generation-inspector";
import type { VideoProductReferences } from "../src/features/video/video-product-references";
import type { VideoStudioWorkspace } from "../src/features/video/video-studio-workspace";
import * as studioState from "../src/features/video/video-studio-state";
import { videoStudioPresetIds } from "../src/features/video/video-preset-catalog";
import * as presets from "../src/lib/video-director/presets";
import * as recommendations from "../src/lib/video-director/preset-recommendations";
import * as policy from "../src/lib/video-generation/product-reference-policy";
import * as productReferences from "../src/lib/video-generation/product-references";
import type { VideoGenerationDraft } from "../src/lib/video-generation/types";
import en from "../src/messages/en.json";
import tr from "../src/messages/tr.json";
import { directorProducts } from "./fixtures/video-director-fixtures";

type PanelProps = React.ComponentProps<typeof VideoDirectorPanel>;
type ReferenceProps = React.ComponentProps<typeof VideoProductReferences>;
type InspectorProps = React.ComponentProps<typeof VideoGenerationInspector>;
type Reference = NonNullable<VideoGenerationDraft["productReferences"]>[number];
type Element = React.ReactElement<Record<string, unknown>>;
const watch = recommendations.presetProduct(directorProducts[2]);
const nonWatch = recommendations.presetProduct(directorProducts[0]);
const source = { id: "watch", name: "Watch", generationId: "watch", projectId: "project", previewUrl: "/watch.png",
  createdAt: "now", aspectRatio: "1:1" as const };
const reference = (purpose: string, sha256: string): Reference => ({
  purpose, sha256, source: { kind: "uploaded-image", sourceAssetId: sha256 },
});
const dial = reference("dial-detail", "b".repeat(64));
const side = reference("side-profile", "c".repeat(64));

const compiled = new Map<string, string>();
function loadUi<T>(file: string, modules: Record<string, unknown>, locale: "tr" | "en"): T {
  let code = compiled.get(file);
  if (!code) {
    code = ts.transpileModule(readFileSync("src/features/video/" + file + ".tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    compiled.set(file, code);
  }
  const exports = {};
  const messages: AbstractIntlMessages = { Dashboard: { videoStudio: (locale === "tr" ? tr : en).Dashboard.videoStudio } };
  const Button = ({ children, disabled, onClick, "aria-describedby": description }: React.ComponentProps<"button">) =>
    React.createElement("button", { disabled, onClick, "aria-describedby": description }, children);
  runInNewContext(code, { exports, queueMicrotask, sessionStorage: { getItem: () => "draft:offline" }, require: (name: string) => {
    if (name in modules) return modules[name];
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next-intl") return { useLocale: () => locale, useTranslations: (namespace: string) => createTranslator({ locale, messages, namespace }) };
    if (name.endsWith("/button")) return { Button };
    if (name.endsWith("/presets")) return presets;
    if (name.endsWith("/preset-recommendations")) return recommendations;
    if (name.endsWith("video-studio-state")) return studioState;
    if (name.endsWith("/video-preset-catalog")) return { videoStudioPresetIds };
    if (name.endsWith("/product-references")) return productReferences;
    if (name.endsWith("/product-reference-policy")) return policy;
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("next/") || name.endsWith("/badge") || name.endsWith("/core")
      || name.includes("/supabase/") || name.endsWith("/preservation") || name.endsWith("/video/actions")) return {};
    if (name.includes("video-canvas") || name.includes("video-preservation-controls") || name.includes("video-job-progress")
      || name.includes("dashboard-icons") || name.includes("/navigation") || name.includes("video-reference-text-input")) {
      return new Proxy({}, { get: () => () => null });
    }
    throw new Error("Unexpected test dependency " + name);
  } });
  return exports as T;
}

function hooks() {
  const values = new Map<number, unknown>();
  const effects = new Map<number, { deps?: unknown[]; cleanup?: () => void }>();
  let pending: (() => void)[] = [];
  let index = 0;
  function useState<T>(initial: T | (() => T)) {
    const slot = index++;
    if (!values.has(slot)) values.set(slot, typeof initial === "function" ? (initial as () => T)() : initial);
    return [values.get(slot) as T, (next: T | ((previous: T) => T)) =>
      values.set(slot, typeof next === "function" ? (next as (previous: T) => T)(values.get(slot) as T) : next)] as const;
  }
  return {
    render<T>(render: () => T) {
      index = 0;
      const tree = render();
      for (const effect of pending) effect();
      pending = [];
      return tree;
    },
    react: {
      useState, useRef: <T>(current: T) => useState({ current })[0], useCallback: (callback: unknown) => callback,
      useReducer(reducer: typeof studioState.videoStudioReducer, initial: typeof studioState.initialVideoStudioDraft) {
        const [draft, setDraft] = useState<typeof initial>({ ...initial, source: { kind: "library", ...source } });
        return [draft, (action: studioState.VideoStudioAction) => setDraft(current => reducer(current, action))];
      },
      useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
        const slot = index++;
        const previous = effects.get(slot);
        if (previous?.deps && deps?.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
        pending.push(() => {
          previous?.cleanup?.();
          effects.set(slot, { deps, cleanup: effect() ?? undefined });
        });
      },
    },
  };
}

function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  if (!React.isValidElement<Record<string, unknown>>(node)) return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children as React.ReactNode)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}

async function studio(locale: "tr" | "en" = "tr") {
  const workspaceHooks = hooks();
  const panelHooks = hooks();
  const Inspector = () => null;
  const References = () => null;
  const Panel = () => null;
  let calls = 0;
  let rejectDial: (() => void) | undefined;
  const workspace = loadUi<{ VideoStudioWorkspace: typeof VideoStudioWorkspace }>("video-studio-workspace", {
    react: workspaceHooks.react,
    "./video-director-panel": { VideoDirectorPanel: Panel, VideoDirectorPresetSelector: () => null },
    "./video-product-references": { VideoProductReferences: References },
    "@/features/video/video-generation-inspector": { VideoGenerationInspector: Inspector },
    "@/app/[locale]/dashboard/video/generation-actions": {
      quoteVideoGenerationAction: async () => null,
      prepareVideoSourceAction: async (origin: { generationId: string }) => ({
        status: "success", source: { kind: "uploaded-image", sourceAssetId: origin.generationId },
        sourceSha256: origin.generationId === "watch" ? "a".repeat(64) : "d".repeat(64),
        presetContext: origin.generationId === "watch" ? watch : nonWatch,
      }),
    },
  }, locale);
  const panel = loadUi<{ VideoDirectorPanel: typeof VideoDirectorPanel }>("video-director-panel", {
    react: panelHooks.react,
    "@/app/[locale]/dashboard/video/director-actions": {
      prepareVideoDirectorAction: () => {
        calls++;
        return new Promise(resolve => {
          rejectDial = () => resolve({ status: "dial_detail_required", productContext: watch, analysisStatus: "verified" });
        });
      },
    },
  }, locale);
  function inspector() {
    const tree = workspaceHooks.render(() => workspace.VideoStudioWorkspace({ generationAvailable: true, recoveryScope: "offline" }));
    const element = find(tree, el => el.type === Inspector);
    assert.ok(element);
    return element.props as unknown as InspectorProps;
  }
  function references() {
    const element = find(inspector().referenceControls, el => el.type === References);
    assert.ok(element);
    return element.props as unknown as ReferenceProps;
  }
  function plan() {
    const element = inspector().directorControls;
    assert.ok(React.isValidElement<PanelProps>(element));
    const tree = panelHooks.render(() => panel.VideoDirectorPanel(element.props));
    const button = find(tree, el => typeof el.props.onClick === "function");
    assert.ok(button);
    return { html: renderToStaticMarkup(tree), button: button.props as React.ComponentProps<"button"> };
  }
  inspector();
  await setImmediate();
  return { inspector, references, plan, calls: () => calls, rejectDial: () => { assert.ok(rejectDial); rejectDial(); } };
}

for (const locale of ["tr", "en"] as const) test(locale + ": a missing watch dial disables the plan and marks required and optional cards", async () => {
  const ui = await studio(locale);
  const copy = (locale === "tr" ? tr : en).Dashboard.videoStudio.references;
  const plan = ui.plan();
  assert.equal(plan.button.disabled, true);
  assert.equal(plan.button["aria-describedby"], "video-director-dial-required");
  assert.ok(plan.html.indexOf(copy.dialPlanRequired) >= 0 && plan.html.indexOf(copy.dialPlanRequired) < plan.html.indexOf("<button"));

  const { VideoProductReferences: References } = loadUi<{ VideoProductReferences: typeof VideoProductReferences }>("video-product-references", {
    react: hooks().react, "@/app/[locale]/dashboard/video/generation-actions": {},
  }, locale);
  const html = renderToStaticMarkup(React.createElement(References, ui.references()));
  assert.ok(html.includes(copy.dialRequired));
  for (const [role, marker] of [["dial-detail", copy.required], ["side-profile", copy.optional], ["other-product-view", copy.optional]] as const) {
    const title = copy.roles[role];
    const card = html.split("<article").find(section => section.startsWith(" ") && section.includes('aria-label="' + title + '"'));
    assert.ok(card?.includes("<p>" + marker + "</p>"), title);
  }
});

test("side/profile and a duplicate primary dial cannot unlock watch planning", async () => {
  const ui = await studio();
  ui.references().onChange([side]);
  assert.equal(ui.plan().button.disabled, true);
  assert.ok(ui.plan().html.includes(tr.Dashboard.videoStudio.references.dialPlanRequired));
  ui.references().onChange([side, { ...dial, sha256: "a".repeat(64) }]);
  assert.equal(ui.plan().button.disabled, true);
  assert.equal(ui.calls(), 0);
});

test("a dial candidate enables planning when references are idle", async () => {
  const ui = await studio();
  ui.references().onChange([dial]);
  assert.equal(ui.plan().button.disabled, false);
  assert.equal(ui.plan().button["aria-describedby"], undefined);
  ui.references().onBusyChange(true);
  assert.equal(ui.plan().button.disabled, true);
  ui.references().onBusyChange(false);
  assert.equal(ui.plan().button.disabled, false);
});

test("a server-rejected dial blocks retry until a replacement is added or the product changes", async () => {
  const ui = await studio();
  const copy = tr.Dashboard.videoStudio.references;
  ui.references().onChange([dial]);
  ui.plan().button.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
  assert.equal(ui.calls(), 1);
  assert.equal(ui.plan().button.disabled, true);
  ui.rejectDial();
  await setImmediate();
  assert.equal(ui.references().dialDetailIssue, "rejected", ui.plan().html);
  assert.equal(ui.plan().button.disabled, true);
  assert.ok(ui.plan().html.includes(copy.dialRejected));
  assert.ok(!ui.plan().html.includes(copy.dialPlanRequired));
  ui.references().onChange([side, dial]);
  assert.equal(ui.plan().button.disabled, true);
  ui.references().onChange([side, { ...dial, sha256: "e".repeat(64) }]);
  assert.equal(ui.plan().button.disabled, false);
  assert.ok(!ui.plan().html.includes(copy.dialRejected));

  ui.references().onChange([dial]);
  assert.equal(ui.plan().button.disabled, true);
  ui.inspector().onSelectLibrary({ ...source, id: "jacket", generationId: "jacket", name: "Jacket" });
  ui.inspector();
  await setImmediate();
  assert.equal(ui.references().dialDetailIssue, null);
  assert.equal(ui.plan().button.disabled, false);
  assert.ok(!ui.plan().html.includes(copy.dialRejected));
});
