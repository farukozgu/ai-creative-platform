import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { dashboardDiscoveryWorkflows, dashboardLauncherWorkflows } from "../src/data/dashboard-home-workflows";
import { creationHref } from "../src/features/generation/creation-entry";
import { getCreativePreset } from "../src/lib/creative-presets/creative-presets";

const read = (path: string) => readFileSync(path, "utf8");

test("discovery and launcher workflows use supported presets, assets and the Create route", () => {
  assert.equal(new Set(dashboardDiscoveryWorkflows.map((workflow) => workflow.presetId)).size, dashboardDiscoveryWorkflows.length);
  for (const workflow of [...dashboardDiscoveryWorkflows, ...dashboardLauncherWorkflows]) {
    const preset = getCreativePreset(workflow.presetId);
    assert.ok(preset?.enabled, workflow.presetId);
    assert.ok(existsSync(`public${preset.thumbnail}`));
    const url = new URL(creationHref({ presetId: workflow.presetId, presentationMode: null }), "https://example.test");
    assert.equal(url.pathname, "/dashboard/create");
    assert.equal(url.searchParams.get("preset"), workflow.presetId);
  }
});

test("Home has no preset gallery while Create retains its preset selection", () => {
  const page = read("src/app/[locale]/dashboard/page.tsx");
  const home = read("src/components/dashboard/dashboard-home.tsx");
  const composer = read("src/components/dashboard/creative-composer.tsx");
  assert.doesNotMatch(page, /TemplateRail|CreativePresetRail|WorkspaceOverview/);
  assert.doesNotMatch(home, /TemplateRail|CreativePresetRail|PresetCategoryFilter/);
  assert.match(composer, /creation-preset-grid/);
  assert.match(home, /creationHref\(\{ presetId, presentationMode: null \}\)/);
  assert.match(home, /href="\/dashboard\/projects"/);
});

test("recent creations retain actions and empty state opens locale-aware Create", () => {
  const gallery = read("src/components/dashboard/recent-generations-gallery.tsx");
  const query = read("src/lib/generations/get-dashboard-generations.ts");
  assert.match(gallery, /Link href="\/dashboard\/create"/);
  assert.doesNotMatch(gallery, /href="#composer"/);
  for (const behavior of ["FavoriteButton", "toggleFavorite", "ProjectImageViewer", "setViewerGenerationId", "projectHref"]) {
    assert.ok(gallery.includes(behavior));
  }
  assert.match(query, /\.eq\("generation_type", "image"\)\.eq\("status", "succeeded"\)\.order\("created_at"/);
  assert.doesNotMatch(query, /count: "exact"/);
});

test("Home workflow and launcher messages exist in both locales", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)).Dashboard.home;
    for (const key of ["discoveryHeading", "discoveryDescription", "discoveryLabel", "previousWorkflow", "nextWorkflow", "workflowAction", "launcherHeading", "launcherDescription"]) {
      assert.ok(messages[key]);
    }
    for (const { key } of dashboardDiscoveryWorkflows) {
      assert.ok(messages.workflows[key].title);
      assert.ok(messages.workflows[key].description);
      assert.ok(messages.workflows[key].category);
    }
    for (const key of ["create", "fashion", "studio", "projects"]) {
      assert.ok(messages.launchers[key].title);
      assert.ok(messages.launchers[key].description);
    }
  }
});

test("Dashboard Home motion remains scoped, pointer-aware, and reduced-motion safe", () => {
  const styles = read("src/components/dashboard/dashboard-home.module.css");
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.doesNotMatch(styles, /scale\(|translate[XY]?\(|radial-gradient|backdrop-filter/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.workflowCard:focus-visible \.workflowAction \{ opacity: 1/);
});

test("Home preserves complete images and uses responsive action cards", () => {
  const styles = read("src/components/dashboard/dashboard-home.module.css");
  const rail = read("src/components/dashboard/dashboard-workflow-rail.tsx");
  assert.match(styles, /\.workflowMedia \{[^}]*aspect-ratio: 3 \/ 2/);
  assert.match(styles, /\.workflowMedia img \{ object-fit: contain/);
  assert.match(styles, /\.home :global\(\.dashboard-generation-media img\) \{ object-fit: contain/);
  assert.match(styles, /\.launchRow \{[^}]*border: 1px solid var\(--dashboard-border\)/);
  assert.match(styles, /@media \(min-width: 640px\)/);
  assert.match(styles, /@media \(min-width: 1200px\)/);
  assert.match(rail, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowRight"/);
  assert.match(rail, /prefers-reduced-motion: reduce/);
});
