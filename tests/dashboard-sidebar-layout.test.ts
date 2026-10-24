import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { creationHref, resolveCreationEntry } from "../src/features/generation/creation-entry";
import { getRecommendedFamilyPresets, getPresetPresentationModes } from "../src/lib/creative-presets/creative-presets";

import { resolveDashboardSidebarCollapsed } from "../src/components/dashboard/dashboard-sidebar-state";
import {
  dashboardPrimaryNavigation,
  isDashboardNavigationItemActive,
} from "../src/data/dashboard-navigation";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("plan card sits in the desktop sidebar footer above the website link", () => {
  const sidebar = read("src/components/dashboard/dashboard-sidebar.tsx");
  assert.match(sidebar, /<footer className=\{styles\.footer\}>[\s\S]*<DashboardPlanCard[\s\S]*returnToWebsite[\s\S]*<DashboardAccountMenu/);
});

test("plan card follows the mobile spacer inside the drawer footer", () => {
  const mobileNav = read("src/components/dashboard/dashboard-mobile-nav.tsx");
  assert.match(mobileNav, /dashboard-drawer-spacer[\s\S]*dashboard-drawer-footer[\s\S]*dashboard-drawer-plan-slot[\s\S]*dashboard-drawer-nav-secondary/);
});

test("sidebar defaults to the icon rail and preserves explicit preferences", () => {
  assert.equal(resolveDashboardSidebarCollapsed(null), true);
  assert.equal(resolveDashboardSidebarCollapsed("true"), true);
  assert.equal(resolveDashboardSidebarCollapsed("false"), false);
  assert.equal(resolveDashboardSidebarCollapsed("invalid"), true);
});

test("sidebar keeps text branding and its toggle without the obsolete K symbol", () => {
  const sidebar = read("src/components/dashboard/dashboard-sidebar.tsx");
  const styles = read("src/components/dashboard/dashboard-sidebar.module.css");
  assert.doesNotMatch(sidebar, /brandMark|>K<\/span>/);
  assert.doesNotMatch(styles, /\.brandMark/);
  assert.match(sidebar, /className=\{styles\.brandName\}/);
  assert.match(sidebar, /aria-expanded=\{!collapsed\}/);
  assert.match(styles, /\.frame\[data-collapsed\] \.brand \{\s*display: none/);
});

test("compact studio expansion remains local and Escape restores the compact rail", () => {
  const frame = read("src/components/dashboard/dashboard-frame.tsx");
  assert.match(frame, /pathname === "\/dashboard\/create"/);
  assert.match(frame, /pathname === "\/dashboard\/video"/);
  assert.match(frame, /isCompactWorkspace \? !compactNavigationExpanded : collapsed/);
  assert.doesNotMatch(frame, /compactRailStyle|CSSProperties|"--dashboard-rail-width"/);
  assert.match(frame, /event\.key === "Escape" && compactNavigationExpanded/);
  assert.match(frame, /onToggle=\{isCompactWorkspace \?/);
});

test("studio rails inherit the dashboard grid transition and fill its animated track", () => {
  const shared = read("src/app/globals.css");
  const sidebar = read("src/components/dashboard/dashboard-sidebar.module.css");
  assert.match(shared, /transition: grid-template-columns var\(--motion-base\) var\(--ease-standard\)/);
  assert.match(sidebar, /\.sidebar \{[^}]*width: 100%;[^}]*min-width: 0;/);
  assert.match(sidebar, /\.frame:not\(\[data-collapsed\]\) \{\s*--dashboard-rail-width: 15rem;/);
  for (const file of ["src/features/generation/creation-workspace.module.css", "src/features/video/video-studio-workspace.module.css"]) {
    const css = read(file);
    const frameRule = css.slice(0, css.indexOf("}"));
    assert.match(frameRule, /--dashboard-compact-rail-width: 4\.25rem;/);
    assert.doesNotMatch(frameRule, /--dashboard-rail-width:|transition:/);
    assert.match(frameRule, /grid-template-columns: var\(--dashboard-rail-width\) minmax\(0, 1fr\)/);
    assert.match(css, /@media \(max-width: 767px\)[\s\S]*--dashboard-rail-width: 0rem;/);
  }
  assert.match(shared, /@media \(prefers-reduced-motion: reduce\) \{\s*\.dashboard-shell,[^}]*transition: none;/);
});

test("collapsed navigation tooltips support pointer hover, keyboard focus and Escape", () => {
  const sidebar = read("src/components/dashboard/dashboard-sidebar.tsx");
  const styles = read("src/components/dashboard/dashboard-sidebar.module.css");
  assert.match(sidebar, /aria-describedby=\{collapsed \? tooltipId : undefined\}/);
  assert.match(sidebar, /event\.key === "Escape"\) setTooltipDismissed\(true\)/);
  assert.match(styles, /:not\(\[data-tooltip-dismissed\]\)[^\n]*:is\(:hover, :focus-visible\) \.tooltip/);
  assert.match(styles, /visibility: hidden/);
  assert.match(styles, /visibility: visible/);
  assert.match(styles, /pointer-events: auto/);
});

test("sidebar orders the studios and resolves their distinct active destinations", () => {
  const home = dashboardPrimaryNavigation.find((item) => item.key === "home")!;
  const create = dashboardPrimaryNavigation.find((item) => item.key === "create")!;
  const video = dashboardPrimaryNavigation.find((item) => item.key === "video")!;
  const ugc = dashboardPrimaryNavigation.find((item) => item.key === "ugc")!;
  const videos = dashboardPrimaryNavigation.find((item) => item.key === "videos")!;
  const models = dashboardPrimaryNavigation.find((item) => item.key === "models")!;
  const projects = dashboardPrimaryNavigation.find((item) => item.key === "projects")!;

  assert.deepEqual(dashboardPrimaryNavigation.map(({ key }) => key), ["home", "create", "video", "ugc", "videos", "models", "projects"]);
  assert.equal(isDashboardNavigationItemActive(ugc, "/dashboard/ugc", ""), true);
  assert.equal(isDashboardNavigationItemActive(ugc, "/dashboard/video", ""), false);
  assert.equal(isDashboardNavigationItemActive(video, "/dashboard/ugc", ""), false);
  assert.equal(create.icon, "image");
  assert.equal(isDashboardNavigationItemActive(home, "/dashboard", ""), true);
  assert.equal(isDashboardNavigationItemActive(home, "/dashboard", "#composer"), false);
  assert.equal(isDashboardNavigationItemActive(create, "/dashboard", "#composer"), true);
  assert.equal(isDashboardNavigationItemActive(create, "/dashboard/create", ""), true);
  assert.equal(isDashboardNavigationItemActive(video, "/dashboard/video", ""), true);
  assert.equal(isDashboardNavigationItemActive(video, "/dashboard/videos", ""), false);
  assert.equal(isDashboardNavigationItemActive(videos, "/dashboard/videos", ""), true);
  assert.equal(isDashboardNavigationItemActive(videos, "/dashboard/videos/example", ""), true);
  assert.equal(isDashboardNavigationItemActive(models, "/dashboard/models", ""), true);
  assert.equal(isDashboardNavigationItemActive(models, "/dashboard/models/create", ""), true);
  assert.equal(isDashboardNavigationItemActive(home, "/dashboard/create", ""), false);
  assert.equal(isDashboardNavigationItemActive(projects, "/dashboard/projects/example", ""), true);
});

test("sidebar uses scoped semantic theme styles and keeps compact access affordances", () => {
  const sidebar = read("src/components/dashboard/dashboard-sidebar.tsx");
  const styles = read("src/components/dashboard/dashboard-sidebar.module.css");

  assert.match(styles, /--dashboard-rail-width: 15rem/);
  assert.match(styles, /--dashboard-compact-rail-width: 4\.5rem/);
  assert.match(styles, /\.frame\[data-collapsed\]\s*\{\s*--dashboard-rail-width: var\(--dashboard-compact-rail-width\)/);
  assert.match(styles, /var\(--dashboard-sidebar\)/);
  assert.match(styles, /var\(--dashboard-accent-surface\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
  assert.match(sidebar, /role="tooltip"/);
  assert.match(sidebar, /dashboardPrimaryNavigation.map/);
  assert.doesNotMatch(sidebar, /primaryAction|createItem|mainItems/);
  assert.match(sidebar, /DashboardPlanCard collapsed=\{collapsed\}/);
  assert.match(sidebar, /DashboardAccountMenu displayName=\{displayName\} collapsed=\{collapsed\}/);
});

test("mobile drawer retains dismissal, focus trap and route-change handling", () => {
  const mobileNav = read("src/components/dashboard/dashboard-mobile-nav.tsx");

  assert.match(mobileNav, /event\.key === "Escape"/);
  assert.match(mobileNav, /event\.key !== "Tab"/);
  assert.match(mobileNav, /previousLocationRef\.current !== locationKey/);
  assert.match(mobileNav, /dashboard-drawer-backdrop[\s\S]*closeDrawer\(true\)/);
  assert.match(mobileNav, /dashboardPrimaryNavigation.map/);
});

test("navigation labels identify Image Studio in both locales", () => {
  const expected = { en: "Image Studio", tr: "Görsel Studio" };
  for (const [locale, label] of Object.entries(expected)) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as { Dashboard: { navigation: { items: Record<string, string> } } };
    assert.equal(messages.Dashboard.navigation.items.create, label);
  }
});

test("dashboard topbar greets the signed-in user in both locales", () => {
  const topbar = read("src/components/dashboard/dashboard-topbar.tsx");
  assert.match(topbar, /dashboard-topbar-welcome/);
  assert.match(topbar, /t\("welcome", \{ name \}\)/);

  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as { Dashboard: { topbar: Record<string, string> } };
    assert.match(messages.Dashboard.topbar.welcome, /\{name\}/);
    assert.ok(messages.Dashboard.topbar.welcomeWithoutName);
  }
});

test("dashboard overview retains an entry to the single route-owned composer", () => {
  const page = read("src/app/[locale]/dashboard/page.tsx");
  const composer = read("src/components/dashboard/creative-composer.tsx");

  assert.match(page, /DashboardHome[\s\S]*RecentGenerations/);
  assert.doesNotMatch(page, /TemplateRail|WorkspaceOverview/);
  assert.doesNotMatch(page, /<CreativeComposer/);
  const createPage = read("src/app/[locale]/dashboard/create/page.tsx");
  assert.equal(createPage.match(/<CreativeComposer\b/g)?.length, 1);
  assert.doesNotMatch(createPage, /DashboardShell|DashboardSidebar|DashboardHomeHero/);
  assert.match(read("src/components/dashboard/dashboard-home.tsx"), /getPathname[\s\S]*href: "\/dashboard\/create"/);
  assert.match(composer, /DASHBOARD_PRESET_EVENT/);
  assert.match(composer, /creation-flow/);

  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as { Dashboard: { home: Record<string, string>; generations: Record<string, string>; overview: Record<string, string> } };
    assert.ok(messages.Dashboard.home.title);
    assert.ok(messages.Dashboard.home.description);
    assert.ok(messages.Dashboard.generations.viewAll);
    assert.ok(messages.Dashboard.overview.openProjects);
  }
});

test("creation entry validates preset and compatible presentation without carrying draft data", () => {
  assert.deepEqual(resolveCreationEntry("not-a-preset", "unknown"), { presetId: null, presentationMode: null });
  assert.deepEqual(resolveCreationEntry(["apparel"], null), { presetId: null, presentationMode: null });
  const preset = getRecommendedFamilyPresets({ vertical: null })[0]!;
  const mode = getPresetPresentationModes(preset.id)[0]!;
  assert.deepEqual(resolveCreationEntry(preset.id, mode.id), { presetId: preset.id, presentationMode: mode.id });
  assert.equal(resolveCreationEntry(preset.id, "invalid-mode").presentationMode, null);
  const href = new URL(creationHref({ presetId: preset.id, presentationMode: mode.id }), "https://example.test");
  assert.equal(href.pathname, "/dashboard/create");
  assert.equal(href.searchParams.get("preset"), preset.id);
  assert.equal(href.searchParams.get("presentation"), mode.id);
  assert.equal(creationHref({ presetId: null, presentationMode: mode.id }), "/dashboard/create");
});

test("creative composer presents exactly one step from the guided sequence", () => {
  const composer = read("src/components/dashboard/creative-composer.tsx");

  assert.match(
    composer,
    /const steps: readonly FlowStep\[\] = \[\s*"name",\s*"product",\s*"format",\s*"direction",\s*"reference",\s*"details",\s*"review",\s*\]/,
  );
  assert.doesNotMatch(composer, /outputType\.video|step === "type"/);
  for (const step of ["name", "product", "format", "direction", "reference", "details", "review"]) {
    assert.match(composer, new RegExp(`\\{step === "${step}" \\? \\(`));
  }
});

test("creative composer preserves guarded navigation and submission", () => {
  const composer = read("src/components/dashboard/creative-composer.tsx");

  assert.match(composer, /step === "name" && !projectName\.trim\(\)/);
  assert.match(composer, /step === "product" && !products\.length/);
  assert.match(composer, /step === "direction" && !selectedPreset && !direction\.trim\(\)/);
  assert.match(composer, /const furthestReachable =[\s\S]*!projectName\.trim\(\)[\s\S]*!products\.length[\s\S]*!selectedPreset && !direction\.trim\(\)/);
  assert.match(composer, /disabled=\{!enabled\}/);
  assert.match(composer, /if \(index > 0\) setStep\(steps\[index - 1\]!\)/);
  assert.match(composer, /<Button onClick=\{proceed\}>/);
  assert.match(composer, /locked\.current/);
  assert.match(
    composer,
    /createWorkspaceProject[\s\S]*registerProductAsset[\s\S]*registerReferenceAsset[\s\S]*updateCreativeDirection[\s\S]*createQueuedImageGeneration/,
  );
  assert.match(composer, /registration\.status === "invalid_image"/);
});

test("creative composer exposes input authority and accessible selection states", () => {
  const composer = read("src/components/dashboard/creative-composer.tsx");

  assert.match(composer, /flow\.productAuthority/);
  assert.match(composer, /flow\.referenceAuthority/);
  assert.match(composer, /role="radiogroup"/);
  assert.match(composer, /role="radio"/);
  assert.match(composer, /aria-checked=/);
  assert.match(composer, /aria-busy="true"/);
  assert.match(composer, /disabled=\{!userId\}/);
});

test("creative composer owns preview URLs until removal or unmount", () => {
  const composer = read("src/components/dashboard/creative-composer.tsx");

  assert.match(composer, /const productPreviews = useRef<FilePreview\[\]>\(\[\]\)/);
  assert.match(composer, /const referencePreviews = useRef<FilePreview\[\]>\(\[\]\)/);
  assert.match(
    composer,
    /useEffect\(\s*\(\) => \(\) => \{[\s\S]*productPreviews\.current\.forEach[\s\S]*referencePreviews\.current\.forEach[\s\S]*\},\s*\[\],\s*\)/,
  );
  assert.match(composer, /function removeProduct[\s\S]*URL\.revokeObjectURL/);
  assert.match(composer, /function removeReference[\s\S]*URL\.revokeObjectURL/);
  assert.match(composer, /MAX_PROJECT_REFERENCE_IMAGES/);
});

test("creative composer production copy is complete in both locales", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as {
      Dashboard: { composer: { flow: Record<string, string> } };
    };
    const flow = messages.Dashboard.composer.flow;

    assert.match(flow.stepLabel, /\{current\}/);
    assert.match(flow.stepLabel, /\{total\}/);
    assert.ok(flow.productAuthority);
    assert.ok(flow.referenceAuthority);
    assert.ok(flow.presentationLabel);
    assert.ok(flow.reviewDescription);
    assert.ok(flow.generatingDescription);
  }
});
