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

test("Director selections stay available before source preparation and invalidate the approved plan", () => {
  const panel = read("src/features/video/video-director-panel.tsx");
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  assert.match(panel, /fieldset className=\{styles\.directorFields\} disabled=\{disabled\}/);
  assert.match(panel, /onChange=\{\(\) => onChange\(id\)\}/);
  assert.match(panel, /disabled=\{planDisabled \|\| busy\}/);
  assert.match(workspace, /name="video-director-mode"/);
  assert.match(workspace, /setPresetId\(nextPresetId\); setDirector\(null\); setSubmissionQuote\(null\); setConfirmedReceipt\(null\)/);
  assert.match(workspace, /setSubmissionQuote\(null\); setConfirmedReceipt\(null\); setShotMode\(mode\)/);
  assert.match(workspace, /presetControls=\{<VideoDirectorPresetSelector presetId=\{presetId\}\s+disabled=\{busy\}/);
  assert.match(workspace, /name="video-director-mode" checked=\{shotMode === mode\}\s+disabled=\{busy\}/);
  assert.match(workspace, /directorPlanDisabledReason = busy \|\| restoringJob \|\| restoreUnavailable \|\| submissionUsed \|\| Boolean\(jobId\)/);
  assert.match(workspace, /planDisabled=\{Boolean\(directorPlanDisabledReason\)\}/);
  assert.match(workspace, /setSubmissionQuote\(null\);\s*setConfirmedReceipt\(null\);\s*\}\} \/>/);
  assert.match(workspace, /approvalGeneration\.current\.value !== requestedApprovalGeneration/);
});

test("Video Studio keeps secondary controls and full prompts out of the primary flow", () => {
  const inspector = read("src/features/video/video-generation-inspector.tsx");
  const panel = read("src/features/video/video-director-panel.tsx");
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  assert.match(inspector, /\{presetControls\}[\s\S]*video-prompt-heading[\s\S]*qualityHeading[\s\S]*outputHeading[\s\S]*\{directorControls\}[\s\S]*\{advancedSettings \?\? preservationControls\}/);
  assert.doesNotMatch(inspector, /submissionId|quoteSummary|preparationOnly/);
  assert.match(panel, /<details>[\s\S]*fullPlan[\s\S]*shotFields/);
  assert.match(workspace, /<details className=\{styles\.payloadDetails\}>/);
  assert.match(workspace, /const qualityValues: VideoQuality\[\] = \["standard", "pro"\]/);
  assert.match(workspace, /const durationValues: VideoDuration\[\] = \[5, 10\]/);
  assert.match(workspace, /studioOptions\.tiers\.includes\(value\)/);
  assert.match(workspace, /studioOptions\.durations\.includes\(value\)/);
  assert.match(workspace, /singleImageNotice/);
  assert.match(workspace, /directorPlanDisabledReason/);
  assert.match(workspace, /setSubmissionQuote\(null\); setConfirmedReceipt\(null\); setShotMode\(mode\)/);
});

test("Video Studio recovers the owned submission and exposes explicit per-request cost approval", () => {
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  const progress = read("src/features/video/video-job-progress.tsx");
  const inspector = read("src/features/video/video-generation-inspector.tsx");
  const preservationControls = read("src/features/video/video-preservation-controls.tsx");
  const actions = read("src/app/[locale]/dashboard/video/generation-actions.ts");
  assert.match(workspace, /restoreVideoGenerationBySubmissionAction/);
  assert.match(workspace, /setJobId\(result\.job(?:\.id|Id)\)/);
  assert.match(workspace, /generationAvailable=\{generationAvailable && Boolean\(currentQuote\) && Boolean\(preparedFrame\)/);
  assert.match(workspace, /!restoringJob && !restoreUnavailable && !submissionUsed/);
  assert.doesNotMatch(workspace, /source-motion|restoreSourceMotionAction/);
  assert.doesNotMatch(preservationControls, /video-generation-method|source-motion/);
  assert.doesNotMatch(inspector, /isSourceMotion/);
  assert.match(progress, /aria-busy=/);
  assert.match(progress, /progressPhase/);
  assert.match(progress, /watchVideo/);
  assert.doesNotMatch(progress, /[0-9]+%|percentage|progressValue/);
  assert.match(inspector, /aria-busy=\{isSubmitting\}/);
  assert.match(actions, /findBySubmission\(ownerId, submissionId\)/);
  assert.match(actions, /reconcileVideoBeta\(ownerId, existing\.id\)/);
});

test("budget rejection stays on the controls and is shown as an explicit alert", () => {
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  const tr = JSON.parse(read("src/messages/tr.json")) as { Dashboard: { videoStudio: { beta: Record<string, string> } } };
  const en = JSON.parse(read("src/messages/en.json")) as { Dashboard: { videoStudio: { beta: Record<string, string> } } };
  assert.match(workspace, /result\.code === "budget_limit_reached" \? "budgetLimit"/);
  assert.match(workspace, /feedbackMessage=\{generationError \? t\(`beta\.\$\{generationError\}`\)/);
  assert.doesNotMatch(workspace, /if \(error !== "approval"\) setView\("preview"\)/);
  assert.ok(tr.Dashboard.videoStudio.beta.budgetLimit); assert.ok(en.Dashboard.videoStudio.beta.budgetLimit);
});

test("disabled generation explains the next required step in both locales", () => {
  const workspace = read("src/features/video/video-studio-workspace.tsx");
  const tr = JSON.parse(read("src/messages/tr.json")) as { Dashboard: { videoStudio: { beta: Record<string, string> } } };
  const en = JSON.parse(read("src/messages/en.json")) as { Dashboard: { videoStudio: { beta: Record<string, string> } } };
  assert.match(workspace, /!directorReady \? "prepareDirectorFirst"/);
  assert.match(workspace, /!activeSubmissionQuote \? "verifyCostFirst"/);
  assert.match(workspace, /!quoteConfirmed \? "confirmCostFirst"/);
  assert.match(workspace, /nextSubmissionStep \? t\(`beta\.\$\{nextSubmissionStep\}`\)/);
  for (const key of ["prepareDirectorFirst", "verifyCostFirst", "confirmCostFirst", "newSubmissionFirst"]) {
    assert.ok(tr.Dashboard.videoStudio.beta[key]);
    assert.ok(en.Dashboard.videoStudio.beta[key]);
  }
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
          director: Record<string, string>;
          advancedSettings: string;
          beta: { progressTitle: string; sending: string; queued: string; processing: string; finalizing: string; ready: string; ambiguous: string; failed: string; unknown: string; watchVideo: string; libraryLink: string; steps: Record<string, string> };
        };
      };
    };
    const { navigation, videoStudio } = messages.Dashboard;

    assert.ok(navigation.items.video);
    assert.ok(videoStudio.title);
    assert.ok(videoStudio.generate);
    assert.ok(videoStudio.advancedSettings);
    for (const reason of ["planLocked", "planNeedsSource", "planNeedsPreparedSource", "planNeedsReadyDraft"]) {
      assert.ok(videoStudio.director[reason as keyof typeof videoStudio.director]);
    }
    assert.ok(videoStudio.director.fullPlan);
    assert.ok(videoStudio.beta.progressTitle);
    assert.ok(videoStudio.beta.watchVideo);
    assert.ok(Object.values(videoStudio.beta.steps).every(Boolean));
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
