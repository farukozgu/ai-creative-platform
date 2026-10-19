import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

for (const locale of ["tr", "en"] as const) {
  test(`${locale} educational canvas supplies all three translated stages`, () => {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
    const labels = messages.Dashboard.creationCanvas;
    for (const stage of ["upload", "direction", "create"] as const) {
      assert.ok(labels[stage].title);
      assert.ok(labels[stage].description);
      assert.ok(labels[stage].alt);
    }
    assert.ok(labels.exampleNotice);
    for (const setting of ["style", "environment", "lighting", "aspectRatio"]) {
      assert.ok(labels.direction[`${setting}Label`]);
      assert.ok(labels.direction[`${setting}Value`]);
    }
  });
}

test("workspace keeps the eight-step inspector and mobile preview switch", () => {
  const composer = readFileSync("src/components/dashboard/creative-composer.tsx", "utf8");
  const workspace = readFileSync("src/features/generation/creation-workspace.tsx", "utf8");
  const route = readFileSync("src/app/[locale]/dashboard/create/page.tsx", "utf8");
  assert.match(composer, /"type",\s*"name",\s*"product",\s*"format",\s*"direction",\s*"reference",\s*"details",\s*"review"/);
  assert.match(workspace, /setView\("preview"\)/);
  assert.match(route, /<CreativeComposer/);
  assert.match(route, /canvas=\{<CreationCanvas \/>\}/);
  assert.doesNotMatch(composer, /CanvasInput|canvasInput|<CreationCanvas/);
});

test("educational stages stack on mobile and contain no generated-result state", () => {
  const css = readFileSync("src/features/generation/creation-canvas.module.css", "utf8");
  const component = readFileSync("src/features/generation/creation-canvas.tsx", "utf8");
  assert.match(component, /const stages = \["upload", "direction", "create"\]/);
  for (const name of ["source", "campaign"]) {
    const filename = `how-it-works-shirt-${name}.webp`;
    assert.ok(existsSync(`public/create/${filename}`));
    assert.ok(component.includes(filename));
  }
  assert.match(component, /upload: "\/create\/how-it-works-shirt-source\.webp"/);
  assert.match(component, /direction: "\/create\/how-it-works-shirt-source\.webp"/);
  assert.doesNotMatch(component, /how-it-works-shirt-direction\.webp/);
  assert.match(component, /<dl>/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(component, /generationSucceeded|previewUrl|products|references|projectName/);
});
