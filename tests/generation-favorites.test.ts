import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isValidElement, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../src/components/ui/button";
import { FavoriteButton } from "../src/components/ui/favorite-button";
import {
  filterFavoriteGenerations,
  isMissingFavoriteColumnError,
  updateGenerationFavorite,
  type FavoriteGenerationRecord,
  type FavoriteGenerationRepository,
} from "../src/lib/generations/favorite-generation";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function createRepository(record: FavoriteGenerationRecord | null, updateSucceeds = true) {
  let favorite = false;
  const repository: FavoriteGenerationRepository = {
    async findGeneration() { return record; },
    async updateFavorite(_id, value) { favorite = value; return updateSucceeds; },
  };
  return { repository, favorite: () => favorite };
}

const successfulOutput: FavoriteGenerationRecord = {
  id: "generation-1",
  ownerId: "user-1",
  status: "succeeded",
  outputBucketId: "generated-assets",
  outputObjectPath: "user-1/project-1/output.png",
};

test("successful output can be favorited and unfavorited", async () => {
  const state = createRepository(successfulOutput);
  assert.deepEqual(await updateGenerationFavorite(state.repository, { userId: "user-1", generationId: "generation-1", nextValue: true }), { status: "success", isFavorite: true });
  assert.equal(state.favorite(), true);
  assert.deepEqual(await updateGenerationFavorite(state.repository, { userId: "user-1", generationId: "generation-1", nextValue: false }), { status: "success", isFavorite: false });
  assert.equal(state.favorite(), false);
});

test("another user cannot mutate a generation", async () => {
  const state = createRepository(successfulOutput);
  assert.deepEqual(await updateGenerationFavorite(state.repository, { userId: "user-2", generationId: "generation-1", nextValue: true }), { status: "error" });
  assert.equal(state.favorite(), false);
});

test("failed and processing generations cannot be favorited", async () => {
  for (const status of ["failed", "processing"] as const) {
    const state = createRepository({ ...successfulOutput, status });
    assert.deepEqual(await updateGenerationFavorite(state.repository, { userId: "user-1", generationId: "generation-1", nextValue: true }), { status: "error" });
  }
});

test("successful Image Edit output can be favorited", async () => {
  const state = createRepository({ ...successfulOutput, id: "image-edit-output" });
  assert.deepEqual(await updateGenerationFavorite(state.repository, { userId: "user-1", generationId: "image-edit-output", nextValue: true }), { status: "success", isFavorite: true });
});

test("favorite filter includes only favorited successful usable outputs", () => {
  const items = [
    { id: "favorite", status: "succeeded", previewUrl: "/favorite.png", isFavorite: true },
    { id: "plain", status: "succeeded", previewUrl: "/plain.png", isFavorite: false },
    { id: "failed", status: "failed", previewUrl: "/failed.png", isFavorite: true },
    { id: "missing", status: "succeeded", previewUrl: null, isFavorite: true },
  ];
  assert.deepEqual(filterFavoriteGenerations(items, "favorites").map((item) => item.id), ["favorite"]);
  assert.equal(filterFavoriteGenerations(items, "all").length, 4);
});

test("favorite state is selected in canonical project and dashboard queries", () => {
  assert.match(read("src/lib/generations/get-project-generations.ts"), /"is_favorite"/);
  assert.match(read("src/lib/generations/get-dashboard-generations.ts"), /is_favorite/);
});

test("a pending favorite migration is detected without masking unrelated query errors", () => {
  assert.equal(isMissingFavoriteColumnError({ code: "42703", message: "column generations.is_favorite does not exist" }), true);
  assert.equal(isMissingFavoriteColumnError({ code: "PGRST204", message: "Could not find the is_favorite column; it does not exist" }), true);
  assert.equal(isMissingFavoriteColumnError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingFavoriteColumnError(null), false);
});

test("selected generation drives toolbar favorite state and favorites empty state renders", () => {
  const gallery = read("src/components/projects/generation-gallery.tsx");
  assert.match(gallery, /active=\{selected\.isFavorite\}/);
  assert.match(gallery, /favoritesEmptyHeading/);
  assert.match(gallery, /filterFavoriteGenerations\(galleryItems, filter\)/);
});

test("favorite mutation failure rolls back without throwing in both galleries", () => {
  for (const path of ["src/components/projects/generation-gallery.tsx", "src/components/dashboard/recent-generations-gallery.tsx"]) {
    const source = read(path);
    assert.match(source, /failed = result\.status === "error"/);
    assert.match(source, /setFavoriteError\(true\)/);
    assert.match(source, /catch \{/);
  }
});

test("TR and EN favorite copy exists", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(read(`src/messages/${locale}.json`)) as { Dashboard: { generations: Record<string, string>; project: { outputs: Record<string, string> } } };
    for (const section of [messages.Dashboard.generations, messages.Dashboard.project.outputs]) {
      assert.ok(section.favoriteAdd);
      assert.ok(section.favoriteRemove);
      assert.ok(section.favoriteError);
    }
    assert.ok(messages.Dashboard.project.outputs.filterAll);
    assert.ok(messages.Dashboard.project.outputs.filterFavorites);
    assert.ok(messages.Dashboard.project.outputs.favoritesEmptyHeading);
    assert.ok(messages.Dashboard.project.outputs.favoritesEmptyDescription);
  }
});

test("favorite controls are real pressed buttons and stop parent selection", () => {
  const calls: string[] = [];
  const favorite = FavoriteButton({ active: true, label: "Remove favorite", onClick: () => calls.push("favorite") });
  assert.ok(isValidElement<ButtonHTMLAttributes<HTMLButtonElement>>(favorite));
  assert.equal(favorite.type, Button);
  const markup = renderToStaticMarkup(favorite);
  assert.match(markup, /^<button\b[^>]*type="button"/);
  assert.match(markup, /^<button\b[^>]*aria-label="Remove favorite"/);
  assert.match(markup, /^<button\b[^>]*aria-pressed="true"/);
  assert.ok(favorite.props.onClick);
  favorite.props.onClick({
    preventDefault: () => { calls.push("prevent default"); },
    stopPropagation: () => { calls.push("stop propagation"); },
  } as MouseEvent<HTMLButtonElement>);
  assert.deepEqual(calls, ["prevent default", "stop propagation", "favorite"]);
});
