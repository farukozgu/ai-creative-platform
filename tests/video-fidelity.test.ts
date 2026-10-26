import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeVideoFidelityReport } from "../src/lib/video-fidelity/normalize-report";
import { parseVideoFidelitySessionCache } from "../src/lib/video-fidelity/session-cache";
import { parsePreparedVideoSourceLocation } from "../src/lib/video-fidelity/source-location";
import { sampleVideoFrameTimestamps } from "../src/lib/video-fidelity/sampling";
import { videoFidelityCategories } from "../src/lib/video-fidelity/types";

const sourceAssetId = "c678e227-c0f2-4f0a-8b3b-51c50834e44c";
const model = "gpt-4o-mini";
const sourceDetails = {
  color: "Black",
  material: "Leather",
  silhouette: "Waist-length jacket",
  brandingVisible: true,
  brandingDescription: "A small inner brand label is visible.",
  readableText: ["KLAY"],
  distinctiveDetails: ["Front zipper and two front pockets are visible."],
};

function sourceProfile(status = "supported") {
  return {
    status,
    vertical: status === "supported" ? "apparel" : null,
    rawCategory: status === "supported" ? "jacket" : "unidentified object",
    subcategory: status === "supported" ? "jacket" : null,
    unsupportedReason: status === "supported" ? "" : "No clear product was visible.",
    profile: status === "supported" ? {
      vertical: "apparel",
      confidence: 0.92,
      visibleProductCount: 1,
      identitySummary: ["Dark jacket with a small visible inner label."],
      sourceObservations: ["Front closure and pocket seams are visible."],
      subcategory: "jacket",
      material: "dark leather-like material",
      silhouette: "waist-length jacket",
      closure: "front zipper",
      interactionRules: [],
    } : null,
  };
}

function checks(overrides: Partial<Record<(typeof videoFidelityCategories)[number], Record<string, unknown>>> = {}) {
  const sampleTimes = [0, 1.3, 2.5, 3.8, 4.8];
  return videoFidelityCategories.map((category, index) => ({
    category,
    status: "preserved",
    confidence: "high",
    likelyCause: "product_change",
    timestampsSeconds: [sampleTimes[index]],
    reason: "The visible detail matches the source in this frame.",
    ...overrides[category],
  }));
}

function report(value: unknown) {
  const suppliedValue = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return normalizeVideoFidelityReport({
    value: { sourceDetails, ...suppliedValue },
    sourceAssetId,
    model,
    durationSeconds: 5,
    analyzedAt: "2026-10-26T00:00:00.000Z",
  });
}

test("samples the beginning, quarter points, midpoint, and near-end without fake progress", () => {
  assert.deepEqual(sampleVideoFrameTimestamps(5), [0, 1.3, 2.5, 3.8, 4.8]);
  assert.deepEqual(sampleVideoFrameTimestamps(10), [0, 2.5, 5, 7.5, 9.5]);
  assert.deepEqual(sampleVideoFrameTimestamps(0), []);
  assert.deepEqual(sampleVideoFrameTimestamps(16), []);
});

test("only marks all preserved when every category has high-confidence visible evidence", () => {
  const normalized = report({ sourceProfile: sourceProfile(), checks: checks(), summary: "Visible details match." });
  assert.equal(normalized.overallStatus, "no_clear_change_detected");
  assert.ok(normalized.checks.every((check) => check.status === "preserved"));
});

test("downgrades a low-confidence or camera-explained clear finding", () => {
  const normalized = report({
    sourceProfile: sourceProfile(),
    checks: checks({
      branding_text: { status: "clear_distortion", confidence: "high", likelyCause: "camera_angle" },
      shape_proportions: { status: "clear_distortion", confidence: "low", likelyCause: "product_change" },
    }),
    summary: "Review these frames.",
  });
  assert.equal(normalized.checks[0].status, "suspicious_change");
  assert.equal(normalized.checks[1].status, "unverified");
  assert.equal(normalized.overallStatus, "review_recommended");
});

test("uses unverified when the profile or required category evidence is missing", () => {
  const unsupported = report({ sourceProfile: sourceProfile("unsupported"), checks: checks(), summary: "" });
  assert.equal(unsupported.sourceProfile, null);
  assert.equal(unsupported.overallStatus, "inconclusive");
  assert.ok(unsupported.checks.every((check) => check.status === "unverified"));

  const incomplete = report({ sourceProfile: sourceProfile(), checks: checks().slice(1), summary: "" });
  assert.equal(incomplete.overallStatus, "inconclusive");
  assert.ok(incomplete.checks.every((check) => check.status === "unverified"));
});

test("attaches valid sampled timestamps to a high-confidence distortion", () => {
  const normalized = report({
    sourceProfile: sourceProfile(),
    checks: checks({ branding_text: { status: "clear_distortion", confidence: "high", timestampsSeconds: [0, 4.8], likelyCause: "product_change", reason: "The label letters warp into different shapes." } }),
    summary: "The label changes visibly.",
  });
  assert.equal(normalized.overallStatus, "clear_distortion");
  assert.deepEqual(normalized.checks[0].timestampsSeconds, [0, 4.8]);
});

test("does not attach fabricated timestamps between sampled video frames", () => {
  const normalized = report({
    sourceProfile: sourceProfile(),
    checks: checks({ branding_text: { status: "clear_distortion", confidence: "high", timestampsSeconds: [2.1], likelyCause: "product_change", reason: "The letters appear warped." } }),
    summary: "The label changes visibly.",
  });
  assert.equal(normalized.checks[0].status, "unverified");
  assert.deepEqual(normalized.checks[0].timestampsSeconds, []);
  assert.equal(normalized.overallStatus, "inconclusive");
});

test("does not claim color or label preservation without visible source evidence", () => {
  const normalized = report({
    sourceProfile: sourceProfile(),
    sourceDetails: { ...sourceDetails, color: null, brandingVisible: null, brandingDescription: null, readableText: [] },
    checks: checks(),
    summary: "Every category was marked preserved.",
  });
  assert.equal(normalized.checks[0].status, "unverified");
  assert.equal(normalized.checks[2].status, "unverified");
  assert.notEqual(normalized.overallStatus, "no_clear_change_detected");
});

test("hidden or motion-blurred details cannot be preserved or called a confirmed distortion", () => {
  for (const likelyCause of ["partial_visibility", "motion_blur"]) for (const status of ["preserved", "clear_distortion"]) {
    const normalized = report({ sourceProfile: sourceProfile(), checks: checks({ branding_text: { status, confidence: "high", likelyCause, timestampsSeconds: [2.5] } }) });
    assert.equal(normalized.checks[0].status, "unverified");
  }
});

test("restores a bounded session result and treats interrupted paid analysis as uncertain", () => {
  const normalized = report({ sourceProfile: sourceProfile(), checks: checks(), summary: "Visible details match." });
  assert.deepEqual(parseVideoFidelitySessionCache(JSON.stringify({ status: "pending" })), { status: "pending" });
  assert.deepEqual(parseVideoFidelitySessionCache(JSON.stringify({ status: "complete", report: normalized })), { status: "complete", report: normalized });
  assert.equal(parseVideoFidelitySessionCache("{invalid"), null);
  assert.equal(parseVideoFidelitySessionCache(JSON.stringify({ status: "complete", report: { ...normalized, checks: [] } })), null);
});

test("resolves only owner-scoped original source paths from prepared-frame metadata", () => {
  const originalAssetId = "5f490cc1-cdf8-4a2e-8bbb-8270b4569126";
  const ownerPath = `${sourceAssetId}/${originalAssetId}/source.jpg`;
  assert.deepEqual(parsePreparedVideoSourceLocation(sourceAssetId, { sourceBucket: "video-source-images", sourcePath: ownerPath }), {
    bucketId: "video-source-images",
    objectPath: ownerPath,
    uploadedAssetId: originalAssetId,
  });
  assert.equal(parsePreparedVideoSourceLocation(sourceAssetId, { source_bucket: "video-source-images", source_path: "other-owner/file.jpg" }), null);
  assert.equal(parsePreparedVideoSourceLocation(sourceAssetId, { source_bucket: "video-source-images", source_path: `${sourceAssetId}/not-a-uuid/source.jpg` }), null);
  assert.equal(parsePreparedVideoSourceLocation(sourceAssetId, { source_bucket: "other-bucket", source_path: ownerPath }), null);
});

test("keeps Product Fidelity copy complete in Turkish and English", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as {
      Dashboard: { videoDetail: { fidelityAnalysis: Record<string, unknown> } };
    };
    const copy = messages.Dashboard.videoDetail.fidelityAnalysis;
    for (const key of ["title", "description", "prepare", "freeStep", "consentLead", "consentDetails", "consentLabel", "analyze", "uncertain", "failed"]) {
      assert.equal(typeof copy[key], "string", `${locale}.${key}`);
      assert.ok(copy[key], `${locale}.${key}`);
    }
    for (const key of ["categories", "statuses", "overallStatuses", "confidence", "causes", "verticals"]) {
      const section = copy[key];
      assert.ok(section && typeof section === "object" && Object.values(section).every(Boolean), `${locale}.${key}`);
    }
    const profile = copy.profile as Record<string, unknown>;
    assert.ok(profile.readableText && profile.noVisibleBranding, `${locale}.profile`);
  }
});

test("keeps fidelity review styles responsive, keyboard-visible, and theme-token based", () => {
  const styles = readFileSync("src/features/video/video-fidelity-analysis.module.css", "utf8");
  assert.match(styles, /@media \(max-width: 699px\)/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /var\(--dashboard-surface\)/);
  assert.match(styles, /var\(--dashboard-border\)/);
});
