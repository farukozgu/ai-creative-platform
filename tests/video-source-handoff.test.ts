import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isCurrentVideoSourceRequest, initialVideoStudioDraft, videoStudioReducer } from "../src/features/video/video-studio-state";
import type { VideoLibraryAsset } from "../src/features/video/video-studio-types";
import {
  getAnimateSourceId,
  getVideoStudioSourceHref,
  resolveAuthorizedVideoSource,
  type VideoSourceCandidate,
  type VideoSourceHandoffRepository,
} from "../src/lib/generations/video-source-handoff";

const generationId = "30000000-0000-4000-8000-000000000003";
const projectId = "20000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";
const candidate: VideoSourceCandidate = {
  id: generationId,
  projectId,
  generationType: "image",
  status: "succeeded",
  bucketId: "generated-assets",
  objectPath: `${userId}/${projectId}/output.png`,
  createdAt: "2026-10-20T10:00:00.000Z",
  aspectRatio: "4:5",
};

function repository(overrides: Partial<VideoSourceHandoffRepository> = {}) {
  let signed = 0;
  const value: VideoSourceHandoffRepository = {
    findGeneration: async () => candidate,
    findOwnedProject: async () => ({ id: projectId, title: "Campaign" }),
    createSignedPreview: async () => {
      signed += 1;
      return "https://signed.example/temporary-image";
    },
    ...overrides,
  };
  return { value, signedCount: () => signed };
}

test("Animate is available only for resolved successful image identities", () => {
  assert.equal(getAnimateSourceId({ id: generationId, generationType: "image", status: "succeeded", previewUrl: "/preview" }), generationId);
  assert.equal(getAnimateSourceId({ id: generationId, generationType: "video", status: "succeeded", previewUrl: "/preview" }), null);
  assert.equal(getAnimateSourceId({ id: generationId, generationType: "image", status: "failed", previewUrl: "/preview" }), null);
  assert.equal(getAnimateSourceId({ id: "not-an-id", generationType: "image", status: "succeeded", previewUrl: "/preview" }), null);
  assert.equal(getVideoStudioSourceHref(generationId), `/dashboard/video?source=${generationId}`);
});

test("authorized handoff verifies ownership before creating a short-lived preview", async () => {
  const repo = repository();
  const result = await resolveAuthorizedVideoSource(userId, generationId, repo.value);
  assert.equal(result.status, "success");
  assert.equal(result.status === "success" ? result.asset.generationId : null, generationId);
  assert.equal(repo.signedCount(), 1);
});

test("ownership rejection never signs or exposes the generated image", async () => {
  const repo = repository({ findOwnedProject: async () => null });
  assert.deepEqual(await resolveAuthorizedVideoSource(userId, generationId, repo.value), { status: "unavailable" });
  assert.equal(repo.signedCount(), 0);
});

test("missing, deleted, and invalid source records remain unavailable", async () => {
  const missing = repository({ findGeneration: async () => null });
  assert.deepEqual(await resolveAuthorizedVideoSource(userId, generationId, missing.value), { status: "unavailable" });
  assert.equal(missing.signedCount(), 0);

  const wrongPath = repository({ findGeneration: async () => ({ ...candidate, objectPath: "another-user/project/output.png" }) });
  assert.deepEqual(await resolveAuthorizedVideoSource(userId, generationId, wrongPath.value), { status: "unavailable" });
  assert.equal(wrongPath.signedCount(), 0);
});

test("incoming source replacement preserves every unrelated draft setting", () => {
  const configured = {
    ...initialVideoStudioDraft,
    source: null, prompt: "Slow orbit",
    cameraMovement: "orbit" as const,
    quality: "pro" as const,
    aspectRatio: "9:16" as const,
    duration: 10 as const,
  };
  const asset: VideoLibraryAsset = {
    id: generationId,
    generationId,
    projectId,
    name: "Campaign",
    previewUrl: "https://signed.example/temporary-image",
    createdAt: candidate.createdAt,
    aspectRatio: candidate.aspectRatio,
  };
  const next = videoStudioReducer(configured, { type: "set-source", source: { kind: "library", ...asset } });
  assert.equal(next.source?.kind, "library");
  assert.equal(next.source?.id, generationId);
  assert.equal(next.prompt, configured.prompt);
  assert.equal(next.cameraMovement, configured.cameraMovement);
  assert.equal(next.quality, configured.quality);
  assert.equal(next.aspectRatio, configured.aspectRatio);
  assert.equal(next.duration, configured.duration);
});

test("only the latest asynchronous source request may update the draft", () => {
  assert.equal(isCurrentVideoSourceRequest(4, 4), true);
  assert.equal(isCurrentVideoSourceRequest(3, 4), false);
  const workspace = readFileSync("src/features/video/video-studio-workspace.tsx", "utf8");
  assert.match(workspace, /isCurrentVideoSourceRequest\(request, sourceRequest\.current\)/);
});

test("handoff action, loading, and error labels exist in both locales", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
    assert.ok(messages.Dashboard.project.outputs.animate);
    assert.ok(messages.Dashboard.videoStudio.source.incomingName);
    assert.ok(messages.Dashboard.videoStudio.source.incomingLoading);
    assert.ok(messages.Dashboard.videoStudio.source.incomingError);
  }
});

test("server action signs only after explicit project ownership lookup", () => {
  const action = readFileSync("src/app/[locale]/dashboard/video/actions.ts", "utf8");
  const ownership = action.indexOf('.eq("user_id", ownerId)');
  const signing = action.indexOf("createSignedUrl(objectPath, 900)");
  assert.ok(ownership >= 0 && signing > ownership);
  assert.doesNotMatch(action, /getSupabaseAdminClient|service_role/i);
});
