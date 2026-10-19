import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveCanvasState, type CanvasInput } from "../src/features/generation/creation-canvas-model";

const base: CanvasInput = {
  step: "product", projectName: "Autumn campaign", aspectRatio: "3:4",
  products: [{ previewUrl: "blob:front", name: "front.png" }, { previewUrl: "blob:back", name: "back.png" }],
  references: [{ previewUrl: "blob:scene", name: "scene.png" }],
  creationMode: "preset", category: "apparel",
  preset: { title: "Studio", category: "apparel", thumbnail: "/preset.webp" },
  presentationMode: "on_model", direction: "Warm window light",
};

test("primary changes and removed views disappear while supporting views stay separate", () => {
  const first = deriveCanvasState(base);
  assert.equal(first.primary?.previewUrl, "blob:front");
  assert.deepEqual(first.supporting.map((item) => item.previewUrl), ["blob:back"]);
  const changed = deriveCanvasState({ ...base, products: base.products.slice(1) });
  assert.equal(changed.primary?.previewUrl, "blob:back");
  assert.equal(changed.supporting.length, 0);
  assert.equal(changed.products.some((item) => item.previewUrl === "blob:front"), false);
});

test("preset and custom mode expose the current creative context", () => {
  assert.equal(deriveCanvasState(base).preset?.title, "Studio");
  const custom = deriveCanvasState({ ...base, creationMode: "custom", direction: "  Soft daylight  " });
  assert.equal(custom.preset, null);
  assert.equal(custom.presentationMode, null);
  assert.equal(custom.direction, "Soft daylight");
});

test("references never become product identity views", () => {
  const state = deriveCanvasState({ ...base, products: [] });
  assert.equal(state.primary, null);
  assert.equal(state.supporting.length, 0);
  assert.deepEqual(state.references.map((item) => item.previewUrl), ["blob:scene"]);
});

test("brief reflects current fields and no generated output is claimed", () => {
  const state = deriveCanvasState({ ...base, step: "review" });
  assert.equal(state.projectName, "Autumn campaign");
  assert.equal(state.aspectRatio, "3:4");
  assert.equal(state.products.length, 2);
  assert.equal(state.references.length, 1);
  assert.equal(state.direction, "Warm window light");
  assert.equal(state.hasGeneratedOutput, false);
  assert.equal(deriveCanvasState({ ...base, step: "generating" }).hasGeneratedOutput, false);
});

test("preview input survives inspector step navigation", () => {
  const product = deriveCanvasState(base);
  const review = deriveCanvasState({ ...base, step: "review" });
  assert.equal(product.primary?.previewUrl, review.primary?.previewUrl);
  assert.deepEqual(product.supporting, review.supporting);
});
