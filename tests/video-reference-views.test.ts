import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { compileDirectorPlan, parseDirectorOutput, fallbackDirectorPlan } from "../src/lib/video-director/core";
import { directorCacheKey, openDirectorPlan, sealDirectorPlan } from "../src/lib/video-director/receipt";
import { parseReferenceReviews, klingElementReferences, referenceShotPrefix, REFERENCE_SHOT_PREFIX_MAX_CHARS } from "../src/lib/video-generation/product-references";
import { buildFalVideoRequestInput } from "../src/lib/video-generation/fal-request";
import { VideoProductionHarness, videoTestOwner, videoTestSource } from "./fixtures/video-production-harness";
import { backAssetId, frontBackInput, frontBackProfile, frontBackResponse, jacketFixtureImage } from "./fixtures/video-front-back-fixture";
import { videoPresetIds } from "../src/lib/video-director/presets";
import { directorProductContext } from "../src/lib/video-director/product-context";
import { libraryFixtures } from "./fixtures/video-preset-library-fixtures";

const hash = (image: Buffer) => createHash("sha256").update(image).digest("hex");

test("reviewed back pixels unlock only a bound later multi-shot, never hidden geometry or front-only parts", () => {
  const input = frontBackInput("b".repeat(64));
  const response = frontBackResponse(input);
  const failures: unknown[] = [];
  const plan = parseDirectorOutput(response, input, failure => failures.push(failure));
  assert.ok(plan, JSON.stringify(failures));
  assert.equal(plan.shots[2].referenceIndex, 0);
  assert.equal(plan.shots[2].focus, "Source-visible product form");
  const compiled = compileDirectorPlan(plan, input);
  assert.deepEqual(compiled.multiPrompt!.map(shot => shot.duration), ["1", "1", "1", "2"]);
  assert.match(compiled.multiPrompt![2].prompt, /@Element1: Use back view from reference image 1/);
  assert.doesNotMatch(compiled.multiPrompt![2].prompt, /zipper|front.*logo/i);
  assert.ok(compiled.multiPrompt!.every(shot => shot.prompt.length <= 512));
  const changeBack = (patch: Record<string, unknown>) => ({ ...response, shots: response.shots.map((shot, i) => i === 2 ? { ...shot, ...patch } : shot) });
  for (const patch of [{ referenceIndex: null }, { referenceIndex: 3 }, { referenceIndex: "0" },
    { motion: "Rotate the product to show its back" }, { composition: "Reveal hidden interior" },
    { composition: "Back view of the front zipper" }, { focus: `verified-evidence:${directorProductContext(input.profile).evidence.find(item => /zipper/.test(item.detail))!.id}` }]) {
    assert.equal(parseDirectorOutput(changeBack(patch), input), null, JSON.stringify(patch));
  }
  for (const status of ["uncertain", "conflict"] as const) {
    assert.equal(parseDirectorOutput({ ...response, referenceReviews: [{ index: 0, status, view: "unknown", details: [], reason: "Unverified" }] }, input), null);
  }
  assert.equal(parseDirectorOutput(response, { ...input, draft: { ...input.draft, productReferences: [] } }), null);
  assert.equal(parseDirectorOutput({ ...response, shots: [response.shots[2], response.shots[1], response.shots[0], response.shots[3]] }, input), null);
  const single = { ...input, shotMode: "single" as const };
  assert.equal(parseDirectorOutput({ ...response, shots: [{ ...response.shots[2], durationSeconds: 5 }] }, single), null);
  assert.equal(parseReferenceReviews([{ ...response.referenceReviews[0], view: "front" }], 1), null);
  const prefix = referenceShotPrefix(2, [
    { index: 0, status: "conflict", view: "unknown", reason: "Different", details: [] },
    { index: 2, status: "matched", view: "back", reason: "Same product", details: [] },
  ]);
  assert.match(prefix, /reference image 1/); // Filtered provider order, not original upload index.
  assert.ok(prefix.length <= REFERENCE_SHOT_PREFIX_MAX_CHARS);
});

test("Cinematic Hero rejects repeated dedicated accents with verified references too", () => {
  const input = frontBackInput("b".repeat(64));
  const response = frontBackResponse(input);
  const shots = [...response.shots.slice(0, 3), { ...response.shots[1], purpose: "macro-detail", camera: "Locked off-center close framing", composition: "Alternate close crop" },
    { ...response.shots[3], durationSeconds: 1 }];
  let reason = "";
  assert.equal(parseDirectorOutput({ ...response, shots }, input, failure => { reason = failure.reasonCode; }), null);
  assert.equal(reason, "repeated_detail_focus");
  const frontOnly = { ...input, draft: { ...input.draft, productReferences: [] } };
  assert.doesNotThrow(() => compileDirectorPlan(fallbackDirectorPlan(frontOnly), frontOnly));
  const key = directorCacheKey("owner", "primary", "gpt-4o-mini", input);
  const plan = parseDirectorOutput(response, input)!;
  const receipt = sealDirectorPlan(key, plan, "fixture-secret", 1000, input.profile);
  assert.ok(openDirectorPlan(receipt, key, input, "fixture-secret", 2000));
  const changed = { ...input, draft: { ...input.draft, productReferences: [{ ...input.draft.productReferences![0], sha256: "c".repeat(64) }] } };
  assert.equal(openDirectorPlan(receipt, directorCacheKey("owner", "primary", "gpt-4o-mini", changed), changed, "fixture-secret", 2000), null);
});

for (const quality of ["standard", "pro"] as const) for (const reference of ["back", "logo", "fallback-logo", "fallback-back", "fallback-two"] as const) test(`front + ${reference} action -> signed quote -> real SDK payload: ${quality}`, async () => {
  const f = await VideoProductionHarness.create();
  const front = await sharp(await jacketFixtureImage("front")).resize(360, 640, { fit: "contain" }).png().toBuffer();
  const back = await sharp(await jacketFixtureImage("back")).resize(640, 360, { fit: "contain" }).png().toBuffer();
  await f.addSource(backAssetId);
  f.objects.set(`video-source-images/${videoTestOwner}/${videoTestSource}/prepared-v1.png`, { bytes: front, contentType: "image/png", aspectRatio: "9:16" });
  f.objects.set(`video-source-images/${videoTestOwner}/${backAssetId}/prepared-v1.png`, { bytes: back, contentType: "image/png", aspectRatio: "16:9" });
  Object.assign(f.assets.find(asset => asset.id === videoTestSource)!, { width: 360, height: 640 });
  Object.assign(f.assets.find(asset => asset.id === backAssetId)!, { width: 640, height: 360 });
  const input = frontBackInput(hash(back));
  Object.assign(input.draft, f.draft(quality, 5, "multi"), { aspectRatio: "9:16",
    productReferences: [{ ...input.draft.productReferences![0], aspectRatio: "16:9" }] });
  f.env.OPENAI_API_KEY = "offline-fixture-only";
  f.analysisProfile = frontBackProfile;
  f.directorResponse = frontBackResponse(input);
  if (reference.includes("logo")) {
    input.draft.productReferences![0].purpose = "logo";
    f.directorResponse = { ...fallbackDirectorPlan(input), origin: "ai", referenceReviews: [{ index: 0, status: "matched", view: "detail", reason: "Matching visible product marks", details: ["visible embroidered text"] }] };
  }
  if (reference === "fallback-two") {
    const secondId = "10000000-0000-4000-8000-000000000004";
    await f.addSource(secondId);
    f.objects.set(`video-source-images/${videoTestOwner}/${secondId}/prepared-v1.png`, { bytes: back, contentType: "image/png", aspectRatio: "16:9" });
    Object.assign(f.assets.find(asset => asset.id === secondId)!, { width: 640, height: 360 });
    input.draft.productReferences!.push({ ...input.draft.productReferences![0], source: { kind: "uploaded-image", sourceAssetId: secondId } });
    const response = frontBackResponse(input);
    f.directorResponse = { ...response, referenceReviews: [...response.referenceReviews, { index: 1, status: "matched", view: "detail", reason: "Matching source details", details: [] }] };
  }
  if (reference.startsWith("fallback")) f.directorResponse = { ...(f.directorResponse as Record<string, unknown>), shots: [] };
  const result = await f.prepareDirector(input);
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("Missing prepared Director plan");
  assert.equal(result.plan.origin, reference.startsWith("fallback") ? "fallback" : "ai");
  assert.equal(f.directorInputs.length, 1);
  const received = f.directorInputs[0];
  assert.equal(received.draft.source?.kind === "uploaded-image" && received.draft.source.sourceAssetId, videoTestSource);
  assert.equal(received.draft.productReferences![0].source.kind === "uploaded-image" && received.draft.productReferences![0].source.sourceAssetId, backAssetId);
  assert.ok(received.referenceImages![0].prepared.equals(back));
  assert.equal(received.referenceImages![0].sourceSha256, hash(back));
  assert.deepEqual(f.analysisSourceIds, [videoTestSource]); // No new paid Product Understanding call per reference.
  const planningRequest = f.directorRequest(received);
  assert.deepEqual(JSON.parse(planningRequest.context).referenceImages, []);
  const request = f.directorRequest(received, true);
  const context = JSON.parse(request.context);
  assert.equal(context.primaryImage.imagePosition, 1);
  assert.equal(context.referenceImages[0].imagePosition, 2);
  assert.equal(context.referenceImages[0].purpose, reference.includes("logo") ? "logo" : "texture"); // Slot label does not pretend it is the angle.
  assert.match(request.instructions, /verified from pixels/);
  assert.equal(Object.hasOwn(request.schema.properties, "shots"), false);
  assert.ok(Buffer.byteLength(request.context + request.instructions + JSON.stringify(request.schema)) <= 16000);
  const draft = { ...input.draft, director: { presetId: input.presetId, shotMode: input.shotMode, receipt: result.receipt } };
  const referenceAsset = f.assets.find(asset => asset.id === backAssetId)!;
  referenceAsset.owner_id = "20000000-0000-4000-8000-000000000001";
  assert.notEqual((await f.api.quoteVideoSubmissionAction(draft)).status, "success");
  referenceAsset.owner_id = videoTestOwner;
  const quote = await f.api.quoteVideoSubmissionAction(draft);
  assert.equal(quote.status, "success");
  if (quote.status !== "success") throw new Error("Missing quote");
  if (reference === "back") assert.match(quote.preview.shots[2].prompt, /@Element1.*back view/);
  else assert.doesNotMatch(quote.preview.shots[2].prompt, /@Element1/);
  const altered = { ...draft, productReferences: [{ ...draft.productReferences![0], sha256: "c".repeat(64) }] };
  assert.equal((await f.api.submitVideoGenerationAction(altered, quote.cost, quote.receipt, true)).ok, false);
  assert.equal(f.posts.length, 0);
  assert.equal((await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true)).ok, true);
  assert.equal(f.posts.length, 1);
  const payload = f.posts[0].input as ReturnType<typeof buildFalVideoRequestInput>;
  if (reference.includes("logo")) assert.equal(payload.elements, undefined);
  else {
    assert.equal(payload.start_image_url, payload.elements![0].frontal_image_url);
    const backUrl = payload.elements![0].reference_image_urls[0];
    assert.ok(new URL(backUrl).pathname.endsWith(`/${backAssetId}/prepared-v1.png`));
    assert.equal(payload.elements!.length, 1);
    assert.equal(payload.elements![0].reference_image_urls.length, 1); // Detail crop is excluded even beside a back view.
  }
  assert.ok(new URL(String(payload.start_image_url)).pathname.endsWith(`/${videoTestSource}/prepared-v1.png`));
  if (reference.startsWith("fallback")) {
    assert.deepEqual(JSON.parse(JSON.stringify(result.plan.shots)), fallbackDirectorPlan(input, result.plan.referenceReviews).shots);
    assert.ok(payload.multi_prompt!.every(shot => !shot.prompt.includes("@Element1")));
    assert.deepEqual(JSON.parse(JSON.stringify(payload.multi_prompt)), compileDirectorPlan(result.plan, input).multiPrompt);
    if (reference === "fallback-back" || reference === "fallback-two") {
      assert.equal(result.plan.shots[2].referenceIndex, undefined);
      assert.equal(result.plan.shots[2].durationSeconds, 1);
      assert.doesNotMatch(payload.multi_prompt![2].prompt, /Use back view/);
      assert.equal(result.plan.shots[0].referenceIndex, undefined);
      assert.equal(result.plan.shots[4].referenceIndex, undefined);
      assert.doesNotMatch(payload.multi_prompt![2].prompt, /front zipper|embroidered text|front.*logo/i);
    }
  }
  if (reference === "back") assert.match(payload.multi_prompt![2].prompt, /@Element1.*back view.*reference image 1/);
  else if (reference.includes("logo")) {
    assert.deepEqual(JSON.parse(JSON.stringify(result.plan.shots)), fallbackDirectorPlan({ ...input, draft: { ...input.draft, productReferences: [] } }).shots);
    assert.ok(payload.multi_prompt!.every(shot => !shot.prompt.includes("@Element1")));
    const primaryInput = { ...input, draft: { ...input.draft, productReferences: [] } };
    assert.deepEqual(JSON.parse(JSON.stringify(payload.multi_prompt)), compileDirectorPlan(fallbackDirectorPlan(primaryInput), primaryInput).multiPrompt);
    assert.deepEqual(JSON.parse(JSON.stringify(payload.multi_prompt)), compileDirectorPlan(result.plan, input).multiPrompt);
    assert.equal(payload.negative_prompt, compileDirectorPlan(result.plan, input).negativePrompt);
  }
  assert.equal(payload.multi_prompt!.reduce((sum, shot) => sum + Number(shot.duration), 0), 5);
  assert.equal((await f.api.submitVideoGenerationAction(draft, quote.cost, quote.receipt, true)).ok, true);
  assert.equal(f.posts.length, 1); // Idempotent recovery never repeats the paid POST.
  const serializedLogs = JSON.stringify(f.logs);
  assert.ok(serializedLogs.includes(backAssetId));
  assert.doesNotMatch(serializedLogs, /mock-private-token|data:image|reference_image_urls|frontal_image_url/);
  assert.deepEqual(f.unexpected, []);
  // Replacing owned bytes under an unchanged reference hash is caught at quote time.
  f.objects.set(`video-source-images/${videoTestOwner}/${backAssetId}/prepared-v1.png`, { bytes: front, contentType: "image/png" });
  const fresh = { ...draft, clientSubmissionId: "20000000-0000-4000-8000-000000000009" };
  assert.notEqual((await f.api.quoteVideoSubmissionAction(fresh)).status, "success");
});

test("all presets preserve primary directing while identity crops stay out of provider elements across categories", () => {
  for (const presetId of videoPresetIds) {
    const base = frontBackInput("b".repeat(64));
    const input = { ...base, presetId, draft: { ...base.draft, productReferences: [{ ...base.draft.productReferences![0], purpose: "logo" }] } };
    const original = fallbackDirectorPlan({ ...input, draft: { ...input.draft, productReferences: [] } });
    const review = { index: 0, status: "matched" as const, view: "detail" as const, reason: "Matching visible product mark", details: ["visible logo"] };
    const plan = parseDirectorOutput({ ...original, origin: "ai", referenceReviews: [review] }, input);
    assert.ok(plan, presetId);
    assert.deepEqual(plan.shots, original.shots);
    const focused = { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, focus: "visible logo", evidenceRefs: [directorProductContext(input.profile).evidence.length] } : shot) };
    assert.equal(parseDirectorOutput(focused, input), null, presetId);
  }
  for (const fixture of libraryFixtures.filter(item => item.category !== "unknown")) {
    const base = frontBackInput("b".repeat(64));
    const input = { ...base, profile: fixture.profile, presetId: fixture.presetId };
    const original = fallbackDirectorPlan(input);
    const plan = parseDirectorOutput({ ...original, origin: "ai", referenceReviews: [{ index: 0, status: "matched", view: "detail", reason: "Matching product mark", details: ["visible label"] }] }, input);
    assert.ok(plan, fixture.category);
    const compiled = compileDirectorPlan(plan, input);
    const payload = buildFalVideoRequestInput({ ...input.draft, ...compiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/main", elementImageUrls: klingElementReferences(plan.referenceReviews ?? [], input.draft.productReferences).map(() => "https://invalid.example/label") });
    const primaryInput = { ...input, draft: { ...input.draft, productReferences: [] } };
    const primaryCompiled = compileDirectorPlan(parseDirectorOutput({ ...original, origin: "ai" }, primaryInput)!, primaryInput);
    const primaryPayload = buildFalVideoRequestInput({ ...primaryInput.draft, ...primaryCompiled, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/main" });
    assert.equal(primaryPayload.elements, undefined);
    assert.equal(payload.elements, undefined);
    assert.equal(payload.negative_prompt, primaryPayload.negative_prompt);
    assert.deepEqual(payload.multi_prompt!.map(shot => shot.duration), primaryPayload.multi_prompt!.map(shot => shot.duration));
    assert.deepEqual(payload.multi_prompt, primaryPayload.multi_prompt, fixture.category);
    assert.deepEqual(plan.shots, original.shots);
  }
});

test("UI retains reference selection while only the primary output ratio is re-prepared", () => {
  const workspace = readFileSync("src/features/video/video-studio-workspace.tsx", "utf8");
  assert.match(workspace, /const referenceKey = JSON\.stringify\(\[draft\.source\?\.id\]\)/);
  assert.match(workspace, /referenceControls=\{draft\.source \?/);
  assert.match(workspace, /onBusyChange=\{handleReferenceBusy\}/);
  assert.match(workspace, /productReferences: !classicCinematic/);
  assert.match(workspace, /hidden=\{classicCinematic\}/);
  const upload = readFileSync("src/features/video/video-product-references.tsx", "utf8");
  assert.match(upload, /aspectRatio: result\.aspectRatio/);
  assert.match(upload, /source, sha256, purpose, aspectRatio/);
});

for (const outcome of ["missing", "uncertain", "conflict", "unavailable"] as const) test(`unverified references stop planning without a silent fallback or provider request: ${outcome}`, async () => {
  const f = await VideoProductionHarness.create();
  await f.addSource(backAssetId);
  const input = frontBackInput("b".repeat(64));
  Object.assign(input.draft, f.draft("standard", 5, "multi"));
  f.analysisProfile = frontBackProfile;
  f.env.OPENAI_API_KEY = outcome === "unavailable" ? "" : "offline-fixture-only";
  const response = frontBackResponse(input);
  f.directorResponse = { ...response, referenceReviews: outcome === "missing" ? [] : [{ index: 0, status: outcome, view: "unknown", reason: "Could not verify", details: [] }] };
  // Use the prepared owned reference's real hash, as the UI does.
  const object = f.objects.get(`video-source-images/${videoTestOwner}/${backAssetId}/prepared-v1.png`)!;
  input.draft.productReferences![0].sha256 = hash(object.bytes);
  const result = await f.prepareDirector(input);
  assert.equal(result.status, "references_unverified");
  if (result.status === "references_unverified") assert.equal(result.reason, outcome === "missing" ? "invalid_review" : outcome === "unavailable" ? "unavailable" : "unverified");
  assert.equal(f.posts.length, 0);
});
