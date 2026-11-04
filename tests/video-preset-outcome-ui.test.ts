import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { videoPresetIds, videoDirectorPresets, type VideoPresetId } from "../src/lib/video-director/presets";
import * as recommendations from "../src/lib/video-director/preset-recommendations";
import { videoStudioPresetIds } from "../src/features/video/video-preset-catalog";

const read = (path: string) => readFileSync(path, "utf8");
const panelCode = ts.transpileModule(read("src/features/video/video-director-panel.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
type PresetCopy = { title: string; description: string };
type SelectorProps = { presetId: VideoPresetId; disabled: boolean; onChange(id: VideoPresetId): void };

for (const locale of ["tr", "en"] as const) {
  const messages = JSON.parse(read(`src/messages/${locale}.json`));
  const copy: Record<string, PresetCopy> = messages.Dashboard.videoStudio.director.presets;

  test(`${locale}: all 24 outcome descriptions are short, distinct and explain multi-shot without internal terms`, () => {
    assert.equal(videoPresetIds.length, 24);
    assert.equal(new Set(videoPresetIds.map(id => copy[id].description)).size, 24);
    for (const id of videoPresetIds) {
      const description = copy[id].description;
      assert.ok(description.length > 40 && description.length <= 260, `${id}: ${description.length}`);
      assert.match(description, locale === "tr" ? /çoklu çekim/i : /multi-shot/i);
      assert.ok(description.split(/[.!?]+/).filter(part => part.trim()).length <= 2, id);
      assert.doesNotMatch(description, /hero-reveal|material-study|final-hero|macro-detail|360|levitat|havalan|dalgalan|rüzgâr/i);
    }
  });

  test(`${locale}: picker renders exactly eight signature presets with localized outcomes`, () => {
    const renderedIds = new Set<string>();
    assert.deepEqual(videoStudioPresetIds.map(id => messages.Dashboard.videoStudio.director.presets[id].signatureTitle), [
      "Signature Studio", "Light Sweep", "Macro Details", "Floating", "Quick Cuts", "Dark Reveal", "Material Study", "Window Display",
    ]);
    const uiModule = { exports: {} as { VideoDirectorPresetSelector: React.ComponentType<SelectorProps> } };
    runInNewContext(panelCode, {
      module: uiModule, exports: uiModule.exports,
      require: (name: string): unknown => {
        if (name === "react") return React;
        if (name === "react/jsx-runtime") return jsxRuntime;
        if (name === "next-intl") return { useTranslations: () => (key: string) => key.split(".").reduce((value, part) => value?.[part], messages.Dashboard.videoStudio.director) ?? key };
        if (name === "next/image") return { default: ({ src }: { src: string }) => React.createElement("span", { "data-preview": src }) };
        if (name.endsWith("/button")) return { Button: ({ children }: React.PropsWithChildren) => React.createElement("button", null, children) };
        if (name.endsWith("/badge")) return { Badge: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children) };
        if (name.endsWith("/presets")) return { videoPresetIds, videoDirectorPresets };
        if (name.endsWith("/video-preset-catalog")) return { videoStudioPresetIds };
        if (name.endsWith("/preset-recommendations")) return recommendations;
        if (name.endsWith("/core") || name.endsWith("/director-actions")) return {};
        if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
        throw new Error(`Unexpected UI dependency: ${name}`);
      },
    });
    const html = renderToStaticMarkup(React.createElement(uiModule.exports.VideoDirectorPresetSelector, {
      presetId: videoPresetIds[0], disabled: false, onChange: () => {},
    }));
    assert.equal((html.match(/type="radio"/g) ?? []).length, 8);
    assert.doesNotMatch(html, /<select|value="custom"|presetPagination/);
    for (const id of videoPresetIds.filter(id => !videoStudioPresetIds.some(visible => visible === id))) {
      assert.ok(!html.includes('value="' + id + '"'), id);
    }
    for (const id of videoStudioPresetIds) {
      const text = renderToStaticMarkup(React.createElement("small", null, copy[id].description));
      assert.ok(html.includes(text), id);
      assert.ok(html.includes(renderToStaticMarkup(React.createElement("strong", null, messages.Dashboard.videoStudio.director.presets[id].signatureTitle))), id);
      assert.ok(html.includes(`value="${id}"`), id);
      renderedIds.add(id);
    }
    assert.equal(renderedIds.size, 8);
  });
}

test("outcomes remain visible on mobile without clamping or hiding card copy", () => {
  const css = read("src/features/video/video-studio-workspace.module.css");
  assert.doesNotMatch(css, /\.presetCopy\s+small\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.presetCopy small\s*\{[^}]*font-size: var\(--text-caption\)/);
  assert.match(css, /\.presetGrid input:focus-visible|label:has\(input:focus-visible\)/);
});
