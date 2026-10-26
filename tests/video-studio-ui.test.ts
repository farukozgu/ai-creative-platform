import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  dashboardPrimaryNavigation,
  isDashboardNavigationItemActive,
} from "../src/data/dashboard-navigation";

const read = (path: string) => readFileSync(path, "utf8");

test("Video Studio route uses the authenticated dashboard boundary", () => {
  assert.ok(existsSync("src/app/[locale]/dashboard/video/page.tsx"));
  const page = read("src/app/[locale]/dashboard/video/page.tsx");
  const layout = read("src/app/[locale]/dashboard/layout.tsx");

  assert.match(page, /isSupportedLocale/);
  assert.match(page, /canAccessVideoBeta\(ownerId\)/);
  assert.match(page, /setRequestLocale\(locale\)/);
  assert.match(layout, /getAuthenticatedUserId/);
  assert.match(layout, /redirect\(`\/\$\{locale\}\/login`\)/);
});

test("Video Studio is a locale-aware active dashboard destination", () => {
  const videoItem = dashboardPrimaryNavigation.find((item) => item.key === "video");
  assert.ok(videoItem);
  assert.equal(videoItem.href, "/dashboard/video");
  assert.equal(videoItem.icon, "video");
  assert.equal(isDashboardNavigationItemActive(videoItem, "/dashboard/video", ""), true);
  assert.equal(isDashboardNavigationItemActive(videoItem, "/dashboard/create", ""), false);
});

test("Video Studio library reuses the authenticated owned-generation query", () => {
  const action = read("src/app/[locale]/dashboard/video/actions.ts");
  const query = read("src/lib/generations/get-dashboard-generations.ts");

  assert.match(action, /getAuthenticatedUserId\(\)/);
  assert.match(action, /getDashboardGenerations\(userId\)/);
  assert.match(query, /\.from\("projects"\).*\.eq\("user_id", userId\)/);
  assert.match(query, /\.eq\("generation_type", "image"\)\.eq\("status", "succeeded"\)/);
  assert.match(query, /createSignedUrl\(row\.output_object_path, 3600\)/);
});

test("Video Studio exposes only the image-to-video workflow", () => {
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  const inspector = read("src/features/video/video-generation-inspector.tsx");

  assert.match(workspace, /useReducer\(videoStudioReducer, initialVideoStudioDraft\)/);
  assert.doesNotMatch(workspace, /set-mode|modes\.text|suggestions\.text/);
  assert.match(inspector, /<VideoSourceSelector/);
  assert.doesNotMatch(inspector, /VideoModeSelector|onModeChange/);
  assert.match(inspector, /onClick=\{onGenerate\}/);
  assert.match(inspector, /disabled=\{!generationAvailable\}/);
  assert.doesNotMatch(inspector, /type="submit"/);
});

test("Video Studio shell has anchored controls and responsive views", () => {
  const styles = read("src/features/video/video-studio-workspace.module.css");

  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.inspectorScroll[\s\S]*min-height: 0;[\s\S]*overflow-y: auto/);
  assert.match(styles, /@media \(max-width: 1023px\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /\.workspace\[data-view="controls"\] \.canvasRegion/);
  assert.match(styles, /--video-inspector-width: 22\.5rem/);
  assert.match(styles, /\.mediaFrame\[data-aspect-ratio="16:9"\]/);
  assert.match(styles, /\.mediaFrame\[data-aspect-ratio="9:16"\]/);
  assert.match(styles, /\.mediaFrame\[data-aspect-ratio="1:1"\]/);
  assert.match(styles, /\.mediaFrame > img[\s\S]*object-fit: contain/);
  assert.match(styles, /container-type: size/);
  for (const match of styles.matchAll(/border-radius:\s*([^;]+);/g)) {
    const value = match[1]?.trim();
    assert.ok(value?.startsWith("var(--radius") || value === "50%", value);
  }
});

test("Video Studio copy is complete in both locales", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as {
      Dashboard: {
        navigation: { items: Record<string, string> };
        videoStudio: {
          title: string;
          generate: string;
          source: Record<string, string>;
          prompt: Record<string, unknown>;
          camera: Record<string, unknown>;
          quality: Record<string, unknown>;
          output: Record<string, string>;
          canvas: Record<string, string>;
          generations: Record<string, string>;
          validation: Record<string, string>;
          mobile: Record<string, string>;
        };
      };
    };
    const { navigation, videoStudio } = messages.Dashboard;

    assert.ok(navigation.items.video);
    assert.ok(videoStudio.title);
    assert.ok(videoStudio.generate);
    for (const section of [
      videoStudio.source,
      videoStudio.output,
      videoStudio.canvas,
      videoStudio.generations,
      videoStudio.validation,
      videoStudio.mobile,
    ]) {
      assert.ok(Object.values(section).every(Boolean));
    }
  }
});
