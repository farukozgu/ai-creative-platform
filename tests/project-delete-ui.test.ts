import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const dashboardHome = read("src/app/[locale]/dashboard/page.tsx");
const projectsPage = read("src/app/[locale]/dashboard/projects/page.tsx");
const gallery = read("src/components/projects/project-gallery-card.tsx");
const detail = read("src/components/projects/project-header.tsx");
const menu = read("src/components/projects/project-card-menu.tsx");
const modal = read("src/components/projects/delete-project-modal.tsx");
const popover = read("src/hooks/use-dismissible-popover.ts");
const accountMenu = read("src/components/dashboard/dashboard-account-menu.tsx");
const languageSwitcher = read("src/components/layout/language-switcher.tsx");
const workspaceSelector = read("src/components/sections/workspace-project-selector.tsx");
const messages = {
  tr: JSON.parse(read("src/messages/tr.json")) as { Dashboard: { project: { composer: { invalidAspectRatio: string; aspectRatio: { label: string; names: Record<string, string> } } } } },
  en: JSON.parse(read("src/messages/en.json")) as { Dashboard: { project: { composer: { invalidAspectRatio: string; aspectRatio: { label: string; names: Record<string, string> } } } } },
};

test("projects library uses a direct delete action and page-scoped selection", () => {
  assert.doesNotMatch(dashboardHome, /RecentWork|recent-work/);
  assert.match(gallery, /<ProjectDeleteButton/);
  assert.match(gallery, /<ProjectSelectionCheckbox/);
  assert.match(projectsPage, /<ProjectsSelection key=\{JSON.stringify\(\[search, status, sort, result.page\]\)\}/);
});

test("projects library preserves server pagination and URL filter semantics", () => {
  assert.match(projectsPage, /getProjectsPage\(userId, \{page, pageSize: 16, search, status, sort\}\)/);
  assert.match(projectsPage, /query\.q/);
  assert.match(projectsPage, /query\.status/);
  assert.match(projectsPage, /query\.sort/);
  assert.match(projectsPage, /params\.set\("page", String\(target\)\)/);
  assert.match(projectsPage, /<ProjectsToolbar/);
});

test("projects library cards expose real previews, timestamps, status and named actions", () => {
  assert.match(gallery, /project\.thumbnail_url/);
  assert.match(gallery, /data-thumbnail-source=\{project\.thumbnail_source/);
  assert.match(gallery, /<time dateTime=\{project\.updated_at\}>/);
  assert.match(gallery, /<StatusBadge/);
  assert.match(gallery, /ProjectDeleteButton projectId=\{project.id\} title=\{title\}/);
});

test("library cards separate media, information and accessible management controls", () => {
  const css = read("src/app/globals.css");
  const selection = read("src/components/projects/projects-selection.tsx");
  const controls = read("src/components/projects/projects-selection.module.css");
  assert.match(gallery, /projects-gallery-controls[\s\S]*ProjectSelectionCheckbox[\s\S]*ProjectDeleteButton[\s\S]*<Link/);
  assert.match(gallery, /projects-gallery-media[\s\S]*<\/span>\s*<span className="projects-gallery-copy"/);
  assert.doesNotMatch(gallery, /projects-gallery-shade|placeholder-mark/);
  assert.match(css, /\.projects-gallery-media \{[^}]*aspect-ratio: 3 \/ 2/);
  assert.match(css, /\.projects-gallery-media img \{[^}]*object-fit: contain/);
  assert.match(css, /\.projects-gallery-grid \{[^}]*repeat\(auto-fill, minmax\(min\(100%, 15rem\), 1fr\)\)/);
  assert.match(projectsPage, /<ProjectsSelection[\s\S]*toolbar=\{/);
  assert.match(selection, /\{toolbar\}[\s\S]*className=\{styles.selectAll\}/);
  assert.doesNotMatch(controls, /position: absolute/);
  assert.match(css, /\.projects-loading \.project-card-skeleton-media \{ aspect-ratio: 3 \/ 2/);
});

test("projects library editorial copy exists in both locales", () => {
  for (const locale of ["en", "tr"]) {
    const catalog = JSON.parse(read(`src/messages/${locale}.json`)) as {Dashboard: {projectsIndex: Record<string, string>}};
    assert.ok(catalog.Dashboard.projectsIndex.title);
    assert.ok(catalog.Dashboard.projectsIndex.description);
  }
});

test("direct card deletion and detail menu reuse the existing confirmation modal", () => {
  const direct = read("src/components/projects/project-delete-button.tsx");
  assert.match(direct, /<DeleteProjectModal/);
  assert.match(direct, /deleteProject.bind\(null, locale, projectId\)/);
  assert.match(direct, /event.stopPropagation\(\)/);
  assert.match(direct, /aria-label=\{t\("deleteProject", \{title\}\)\}/);
  assert.match(menu, /<DeleteProjectModal/);
  assert.match(menu, /event\.stopPropagation\(\)/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /useDismissiblePopover/);
  assert.match(menu, /close\(\); setModalOpen\(true\)/);
});

test("custom popovers dismiss on outside pointer, Escape, and when another opens", () => {
  assert.match(popover, /addEventListener\("pointerdown"/);
  assert.match(popover, /event\.key !== "Escape"/);
  assert.match(popover, /triggerRef\.current\?\.focus\(\)/);
  assert.match(popover, /OPEN_POPOVER_EVENT/);
  for (const source of [menu, accountMenu, languageSwitcher, workspaceSelector]) {
    assert.match(source, /useDismissiblePopover/);
  }
});

test("account menu actions close before navigation or sign out", () => {
  assert.match(accountMenu, /aria-expanded=\{isOpen\}/);
  assert.match(accountMenu, /onClick=\{\(\) => close\(\)\}/);
});

test("project detail exposes shared project actions and redirects after success", () => {
  assert.match(detail, /<ProjectCardMenu/);
  assert.match(detail, /redirectOnSuccess/);
  assert.match(modal, /router\.replace\("\/dashboard\/projects"\)/);
  assert.match(modal, /if \(redirectOnSuccess\) \{\s*router\.replace\("\/dashboard\/projects"\);\s*return;\s*\}\s*router\.refresh\(\)/);
});

test("shared delete modal has pending-safe dismissal, cancel-first focus, and retry error", () => {
  assert.match(modal, /if \(pending\) event\.preventDefault\(\)/);
  assert.match(modal, /if \(pending\) return/);
  assert.match(modal, /delete-project-dialog-actions button/);
  assert.match(modal, /disabled=\{pending\}/);
  assert.match(modal, /messages\.error/);
});

test("both locales provide consistent delete copy", () => {
  for (const locale of ["en", "tr"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as Record<string, unknown>;
    const dashboard = messages.Dashboard as {recentWork: Record<string, string>; project: Record<string, string>};
    for (const section of [dashboard.recentWork, dashboard.project]) {
      assert.ok(section.deleteHeading);
      assert.ok(section.deleteDescription);
      assert.ok(section.deleteProject);
      assert.ok(section.deleteError);
    }
  }
});

test("project composer aspect-ratio messages exist in both locales", () => {
  for (const locale of ["tr", "en"] as const) {
    const composer = messages[locale].Dashboard.project.composer;
    assert.equal(typeof composer.invalidAspectRatio, "string");
    assert.equal(typeof composer.aspectRatio.label, "string");
    for (const format of ["widescreen", "vertical", "square", "classic", "tall", "cinemascope"]) {
      assert.equal(typeof composer.aspectRatio.names[format], "string");
    }
  }
});
