import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPromptSuggestion,
  initialVideoStudioDraft,
  isVideoStudioDraftReady,
  validateVideoSourceDimensions,
  validateVideoSourceFile,
  validateVideoStudioDraft,
  videoStudioReducer,
} from "../src/features/video/video-studio-state";
import type {
  LibraryVideoSource,
  VideoStudioDraft,
} from "../src/features/video/video-studio-types";

const librarySource: LibraryVideoSource = {
  kind: "library",
  id: "generation-1",
  name: "Campaign image",
  previewUrl: "https://signed.example/image",
  generationId: "generation-1",
  projectId: "project-1",
  createdAt: "2026-10-20T10:00:00.000Z",
  aspectRatio: "4:5",
};

test("Video Studio defaults are provider-neutral and ready for V1 settings", () => {
  assert.equal(initialVideoStudioDraft.cameraMovement, "auto");
  assert.equal(initialVideoStudioDraft.quality, "standard");
  assert.equal(initialVideoStudioDraft.aspectRatio, "16:9");
  assert.equal(initialVideoStudioDraft.duration, 5);
  assert.equal(validateVideoStudioDraft(initialVideoStudioDraft), "source-required");
});

test("image source and motion prompt form the only studio draft", () => {
  let state = videoStudioReducer(initialVideoStudioDraft, {
    type: "set-source",
    source: librarySource,
  });
  state = videoStudioReducer(state, {
    type: "set-prompt",
    prompt: "Slow orbit",
  });

  assert.equal(state.source, librarySource);
  assert.equal(state.prompt, "Slow orbit");
});

test("source selection and removal update readiness without touching prompts", () => {
  let state: VideoStudioDraft = {
    ...initialVideoStudioDraft,
    source: null, prompt: "Natural fabric movement",
  };
  state = videoStudioReducer(state, { type: "set-source", source: librarySource });
  assert.equal(isVideoStudioDraftReady(state), true);

  state = videoStudioReducer(state, { type: "remove-source" });
  assert.equal(state.source, null);
  assert.equal(state.prompt, "Natural fabric movement");
  assert.equal(validateVideoStudioDraft(state), "source-required");
});

test("prompt suggestions populate empty prompts, append intentionally, and never duplicate", () => {
  const suggestion = "Gentle orbit around the product";
  assert.equal(appendPromptSuggestion("", suggestion), suggestion);
  assert.equal(
    appendPromptSuggestion("Soft light shift", suggestion),
    `Soft light shift\n${suggestion}`,
  );
  assert.equal(appendPromptSuggestion(suggestion, suggestion), suggestion);
});

test("local source validation reuses product image type and size constraints", () => {
  assert.equal(validateVideoSourceFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateVideoSourceFile({ type: "image/png", size: 1024 }), null);
  assert.equal(validateVideoSourceFile({ type: "image/webp", size: 1024 }), "invalid-source-type");
  assert.equal(
    validateVideoSourceFile({ type: "image/gif", size: 1024 }),
    "invalid-source-type",
  );
  assert.equal(
    validateVideoSourceFile({ type: "image/jpeg", size: 20 * 1024 * 1024 + 1 }),
    "source-too-large",
  );
});

test("original source sizes and ratios are accepted for automatic preparation within the decode limit", () => {
  assert.equal(validateVideoSourceDimensions(2400, 3600), null);
  assert.equal(validateVideoSourceDimensions(1200, 1800), null);
  assert.equal(validateVideoSourceDimensions(1080, 1920), null);
  assert.equal(validateVideoSourceDimensions(8000, 6000), "source-dimensions-unsupported");
  assert.equal(validateVideoSourceDimensions(0, 0), "source-dimensions-unsupported");
});

test("camera, quality, aspect ratio, and duration update independently", () => {
  let state = videoStudioReducer(initialVideoStudioDraft, {
    type: "set-camera",
    cameraMovement: "orbit",
  });
  state = videoStudioReducer(state, { type: "set-quality", quality: "pro" });
  state = videoStudioReducer(state, {
    type: "set-aspect-ratio",
    aspectRatio: "9:16",
  });
  state = videoStudioReducer(state, { type: "set-duration", duration: 10 });

  assert.equal(state.cameraMovement, "orbit");
  assert.equal(state.quality, "pro");
  assert.equal(state.aspectRatio, "9:16");
  assert.equal(state.duration, 10);
  assert.equal(state.source, initialVideoStudioDraft.source);
});

test("complete drafts report readiness without creating a generation", () => {
  const imageDraft: VideoStudioDraft = {
    ...initialVideoStudioDraft,
    source: librarySource, prompt: "Slow dolly in",
  };

  assert.equal(validateVideoStudioDraft(imageDraft), null);
  assert.equal(isVideoStudioDraftReady(imageDraft), true);
  assert.equal(
    videoStudioReducer(imageDraft, {
      type: "set-feedback",
      feedback: "not-connected",
    }).feedback,
    "not-connected",
  );
});
