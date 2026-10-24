import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { dashboardDiscoveryWorkflows, dashboardLauncherWorkflows } from "../src/data/dashboard-home-workflows";
import { creationHref } from "../src/features/generation/creation-entry";
import { getCreativePreset } from "../src/lib/creative-presets/creative-presets";

const read = (path: string) => readFileSync(path, "utf8");

test("existing discovery presets, assets and creation routes remain available", () => {
  for (const workflow of [...dashboardDiscoveryWorkflows, ...dashboardLauncherWorkflows]) {
    const preset = getCreativePreset(workflow.presetId);
    assert.ok(preset?.enabled);
    assert.ok(existsSync(`public${preset.thumbnail}`));
    const url = new URL(creationHref({ presetId: workflow.presetId, presentationMode: null }), "https://example.test");
    assert.equal(url.pathname, "/dashboard/create");
    assert.equal(url.searchParams.get("preset"), workflow.presetId);
  }
});

test("overview prioritizes real activity and retains the existing gallery", () => {
  const page = read("src/app/[locale]/dashboard/page.tsx");
  const home = read("src/components/dashboard/dashboard-home.tsx");
  assert.match(page, /getDashboardOverview\(userId\)/);
  assert.match(page, /DashboardHome overview=\{overview\}/);
  assert.match(page, /RecentGenerations generations=\{overview.creations\}/);
  assert.doesNotMatch(home, /DashboardWorkflowRail|dashboardDiscoveryWorkflows|dashboardLauncherWorkflows/);
  for (const field of ["overview.counts[key]", "overview.projects", "overview.models"]) assert.ok(home.includes(field));
  assert.match(home, /overview\.projects === null/);
  assert.match(home, /overview\.projects\.length === 0/);
  assert.match(home, /overview\.models === null/);
  assert.match(home, /overview\.models\.length === 0/);
  assert.match(page, /overview\.creations === null/);
  assert.match(home, /getPathname\(\{ locale: locale as AppLocale, href: "\/dashboard\/create" \}\)/);
  assert.match(home, /href="\/dashboard\/projects"/);
  assert.match(home, /href="\/dashboard\/models"/);
  assert.doesNotMatch(home, /portrait|avatar|candidate.*src/);
  assert.match(read("src/components/dashboard/creative-composer.tsx"), /creation-preset-grid/);
});

test("recent creations retain private previews, favorites, viewer and edit actions", () => {
  const gallery = read("src/components/dashboard/recent-generations-gallery.tsx");
  const query = read("src/lib/generations/get-dashboard-generations.ts");
  assert.match(gallery, /Link href="\/dashboard\/create"/);
  for (const behavior of ["FavoriteButton", "toggleFavorite", "ProjectImageViewer", "setViewerGenerationId", "projectHref", "#project-controls-heading"]) assert.ok(gallery.includes(behavior));
  assert.match(query, /createSignedUrl/);
  assert.match(query, /\.eq\("generation_type", "image"\)\.eq\("status", "succeeded"\)/);
});

test("overview messages are complete in Turkish and English", () => {
  const home = read("src/components/dashboard/dashboard-home.tsx");
  const page = read("src/app/[locale]/dashboard/page.tsx");
  const en = JSON.parse(read("src/messages/en.json")).Dashboard.homeOverview;
  const tr = JSON.parse(read("src/messages/tr.json")).Dashboard.homeOverview;
  assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort());
  assert.deepEqual(Object.keys(tr.metrics).sort(), Object.keys(en.metrics).sort());
  for (const locale of [tr, en]) {
    for (const [, key] of (home + page.split("export default")[1]).matchAll(/\bt\("([a-zA-Z]+)"/g)) assert.ok(locale[key], key);
    assert.doesNotMatch(JSON.stringify(locale), /\?/);
    for (const key of ["projects", "images", "models", "videos"]) assert.ok(locale.metrics[key]);
  }
});

test("overview uses responsive grids, semantic tokens and accessible focus", () => {
  const styles = read("src/components/dashboard/dashboard-home.module.css");
  assert.match(styles, /\.activityGrid \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.statsGrid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.projectPreview img \{[^}]*object-fit: contain/);
  assert.match(styles, /\.home :global\(\.dashboard-generation-media img\) \{ object-fit: contain/);
  assert.match(styles, /\.panel a:focus-visible/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /var\(--dashboard-surface\)/);
});
