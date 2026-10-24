import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { dashboardPrimaryNavigation, isDashboardNavigationItemActive } from "../src/data/dashboard-navigation";

const read = (path: string) => readFileSync(path, "utf8");

test("Video Library routes remain under the authenticated localized dashboard", () => {
  const pagePath = "src/app/[locale]/dashboard/videos/page.tsx";
  const detailPath = "src/app/[locale]/dashboard/videos/[videoId]/page.tsx";
  assert.ok(existsSync(pagePath));
  assert.ok(existsSync(detailPath));
  assert.match(read(pagePath), /isSupportedLocale/);
  assert.match(read(pagePath), /setRequestLocale\(locale\)/);
  assert.match(read(detailPath), /if \(!record\) notFound\(\)/);
  assert.match(read("src/app/[locale]/dashboard/layout.tsx"), /getAuthenticatedUserId/);
});

test("Video Library navigation is distinct from the singular Video Studio route", () => {
  const studio = dashboardPrimaryNavigation.find((item) => item.key === "video");
  const library = dashboardPrimaryNavigation.find((item) => item.key === "videos");
  assert.ok(studio);
  assert.ok(library);
  assert.equal(studio.href, "/dashboard/video");
  assert.equal(library.href, "/dashboard/videos");
  assert.equal(isDashboardNavigationItemActive(studio, "/dashboard/videos", ""), false);
  assert.equal(isDashboardNavigationItemActive(library, "/dashboard/videos/example", ""), true);
});

test("production library data is empty and contains no fabricated takes", () => {
  const records = read("src/features/video/video-records.ts");
  assert.match(records, /videoPresentationRecords:[^=]+\[\] = \[\]/);
  assert.doesNotMatch(records, /Take 0|example\.com|mock|fixture/i);
});

test("library supports actual controls and explicit route states", () => {
  const library = read("src/features/video/video-library.tsx");
  assert.match(library, /filterVideoRecords/);
  assert.match(library, /type="search"/);
  assert.match(library, /aria-pressed=\{filter === value\}/);
  assert.match(library, /visibleRecords\.length === 0/);
  assert.ok(existsSync("src/app/[locale]/dashboard/videos/loading.tsx"));
  assert.ok(existsSync("src/app/[locale]/dashboard/videos/error.tsx"));
});

test("detail player and actions only render for a playable asset", () => {
  const detail = read("src/features/video/video-detail.tsx");
  assert.match(detail, /const playable = isVideoPlayable\(record\)/);
  assert.match(detail, /playable \? \(/);
  assert.match(detail, /<video controls preload="metadata" playsInline/);
  assert.doesNotMatch(detail, /autoPlay/);
  assert.match(detail, /playable \? <a[^>]+download/);
});

test("Video Library copy is complete in Turkish and English", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as {
      Dashboard: {
        navigation: { items: Record<string, string> };
        videoStudio: { canvas: Record<string, string> };
        videoLibrary: Record<string, unknown>;
        videoDetail: Record<string, unknown>;
      };
    };
    assert.ok(messages.Dashboard.navigation.items.videos);
    assert.ok(messages.Dashboard.videoStudio.canvas.libraryLink);
    assert.ok(messages.Dashboard.videoLibrary);
    assert.ok(messages.Dashboard.videoDetail);
  }
});

test("library layouts preserve supported ratios, contained media, and shared radius tokens", () => {
  const styles = read("src/features/video/video-library.module.css");
  assert.match(styles, /data-aspect-ratio="16:9"/);
  assert.match(styles, /data-aspect-ratio="9:16"/);
  assert.match(styles, /data-aspect-ratio="1:1"/);
  assert.match(styles, /object-fit: contain/);
  assert.match(styles, /@media \(max-width: 899px\)/);
  assert.match(styles, /@media \(max-width: 599px\)/);
  for (const match of styles.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.ok(match[1]?.trim().startsWith("var(--radius"), match[1]);
  }
});
