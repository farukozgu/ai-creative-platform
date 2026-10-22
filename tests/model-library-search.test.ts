import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const library = readFileSync("src/features/models/model-library.tsx", "utf8");
const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));
const tr = JSON.parse(readFileSync("src/messages/tr.json", "utf8"));

test("Model Library keeps the genuinely empty state separate from search results", () => {
  assert.match(library, /records\.length === 0/);
  assert.match(library, /matchingRecords\.length === 0/);
  assert.match(library, /t\("empty\.title"\)/);
  assert.match(library, /t\("noResults\.title"\)/);
});

test("search-empty state offers an accessible reset and has matching TR/EN copy", () => {
  assert.match(library, /aria-live="polite"/);
  assert.match(library, /onClick=\{\(\) => setQuery\(""\)\}/);
  assert.deepEqual(Object.keys(en.Dashboard.modelStudio.library.noResults).sort(), Object.keys(tr.Dashboard.modelStudio.library.noResults).sort());
});
