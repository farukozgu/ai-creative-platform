import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveApparelArtworkCropEligibility, resolveHybridProjectionEligibility } from "../src/lib/generation/strategy/generation-strategy";
import { resolveHumanRealismPolicy } from "../src/lib/human-realism/human-realism-policy";
import { compileHumanRealismPrompt } from "../src/lib/human-realism/compile-human-realism-prompt";
import { resolveRepairPlan } from "../src/lib/auto-repair/resolve-repair-plan";
import { awaitGenerationPipeline } from "../src/lib/generation/await-generation-pipeline";

test("synchronous Composer generation keeps the configured model and quality defaults", async () => {
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  assert.match(source, /OPENAI_IMAGE_MODEL\?\.trim\(\) \|\| "gpt-image-2\.5-sunburst"/);
  assert.match(source, /quality: "high"/);
});

test("server action awaits image generation and retains its queued-state transition", async () => {
  const source = await readFile("src/app/[locale]/dashboard/projects/[projectId]/generation-actions.ts", "utf8");
  const awaitPipeline = await readFile("src/lib/generation/await-generation-pipeline.ts", "utf8");
  assert.match(source, /\.insert\([\s\S]+client_submission_id: submissionId/);
  assert.match(source, /await awaitGenerationPipeline\(generation\.id, runQueuedImageGeneration\)/);
  assert.match(awaitPipeline, /const result = await runner\(generationId\)/);
  assert.match(source, /safeGenerationEvent\("create", "insert_success"/);
  assert.match(source, /safeGenerationEvent\("dispatch", "pipeline_entered"/);
  assert.match(source, /\.eq\("status", "processing"\)/);
  assert.match(source, /queuedGeneration\.id/);
  assert.match(source, /type: "generation_completed"/);
  assert.match(source, /type: "generation_failed"/);
  assert.match(awaitPipeline, /result\.ok/);
  assert.match(source, /safeGenerationEvent\("provider", "request_start"/);
});

test("dispatch waits for the pipeline result before reporting completion", async () => {
  let release!: (result: { ok: boolean }) => void;
  let completed = false;
  const blocker = new Promise<{ ok: boolean }>((resolve) => { release = resolve; });
  const pending = awaitGenerationPipeline("generation-1", async () => {
    const result = await blocker;
    completed = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  release({ ok: true });
  assert.equal(await pending, true);
  assert.equal(completed, true);
});

test("Trigger.dev dependencies and configuration are removed", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { dependencies: Record<string, string>; scripts: Record<string, string> };
  assert.deepEqual(Object.keys(packageJson.dependencies).filter((name) => name.startsWith("@trigger.dev/")), []);
  assert.deepEqual(Object.keys(packageJson.scripts).filter((name) => name.includes(":trigger")), []);
  for (const path of ["trigger.config.ts", "trigger/image-generation.ts"]) {
    await assert.rejects(readFile(path, "utf8"));
  }
  const env = await readFile(".env.example", "utf8");
  assert.doesNotMatch(env, /trigger/i);
});

test("human realism prompt is included for visible model strategies", () => {
  const policy = resolveHumanRealismPolicy({ strategy: "fashion_on_model", vertical: "apparel" });
  assert.equal(policy.applied, true);
  assert.match(compileHumanRealismPrompt(policy, "apparel"), /HUMAN REALISM/);
});

test("apparel artwork crops and hybrid projection require localized exact-product artwork", () => {
  assert.equal(resolveApparelArtworkCropEligibility({ vertical: "apparel", exactProductApparel: true, artworkPresent: true }), true);
  assert.equal(resolveApparelArtworkCropEligibility({ vertical: "jewelry", exactProductApparel: true, artworkPresent: true }), false);
  assert.equal(resolveHybridProjectionEligibility({ vertical: "apparel", artworkPresent: true, exactProductApparel: true, artworkSide: "front", localized: true }), true);
  assert.equal(resolveHybridProjectionEligibility({ vertical: "apparel", artworkPresent: true, exactProductApparel: true, artworkSide: "unknown", localized: true }), false);
  assert.equal(resolveHybridProjectionEligibility({ vertical: "watches", artworkPresent: true, exactProductApparel: true, artworkSide: "front", localized: true }), false);
});

test("at most one automatic repair attempt is selected", () => {
  const plan = resolveRepairPlan({ status: "fail", retryRecommended: true, commerciallyUsable: false, issues: [{ code: "product_identity_drift", category: "product_identity", severity: "major", finding: "drift", expected: "preserve identity", sourceAuthoritative: true }], checks: [], severity: "major", summary: "identity drift", version: "test" });
  assert.equal(plan.shouldRetry, true);
  assert.equal(plan.shouldRetry ? 1 : 0, 1);
  assert.equal(plan.categories.length, 1);
});

test("quality-rejected final candidates fail before output upload and completion notification", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const rejection = source.indexOf('logDevelopmentGenerationEvent("quality_gate_rejected_terminal"');
  const upload = source.indexOf('.upload(outputObjectPath');
  const successNotification = source.indexOf('type: "generation_completed"');
  assert.ok(rejection >= 0 && rejection < upload && upload < successNotification);
  assert.match(source, /resolveGenerationTerminalDecision\(\{ validationStatus: selectedValidation\.status, qualityGatePassed, commerciallyUsable: selectedValidation\.commerciallyUsable \}\)/);
  assert.match(source, /validationUnavailable: finalSelection\.validationStatus === "validation_unavailable"/);
  assert.match(source, /throw new Error\("Generated candidate rejected by quality gate\."\)/);
  assert.match(source, /type: "generation_failed"/);
});

test("unavailable validation is persisted as unverified and reaches the existing success notification path", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const page = await readFile("src/app/[locale]/dashboard/projects/[projectId]/page.tsx", "utf8");
  const gallery = await readFile("src/components/projects/generation-gallery.tsx", "utf8");
  const editPanel = await readFile("src/components/projects/image-edit-panel.tsx", "utf8");
  const english = JSON.parse(await readFile("src/messages/en.json", "utf8")) as { Dashboard: { project: { outputs: { validationUnverified: string; validationUnverifiedLabel: string } } } };
  const turkish = JSON.parse(await readFile("src/messages/tr.json", "utf8")) as { Dashboard: { project: { outputs: { validationUnverified: string; validationUnverifiedLabel: string } } } };
  assert.match(source, /selectedValidation\.status === "validation_unavailable" \? null : finalSelection\.qualityGatePassed/);
  assert.match(source, /if \(selectedValidation\.status === "validation_unavailable"\) fidelityStatus = "not_available"/);
  assert.match(source, /\.upload\(outputObjectPath, finalImageData/);
  assert.match(source, /status: "succeeded"/);
  assert.match(source, /type: "generation_completed"/);
  assert.match(source, /validationUnavailable: finalSelection\.validationStatus === "validation_unavailable"/);
  assert.match(source, /validationStatus: selectedValidation\.status,[\s\S]*verificationStatus: terminalDecision === "succeeded_unverified" \? "unverified" : "verified"/);
  assert.match(source, /status: mapGenerationTerminalDecisionToStatus\(terminalDecision\)/);
  assert.match(source, /let terminalSuccessPersisted = false/);
  assert.match(source, /terminalSuccessPersisted = true;[\s\S]*type: "generation_completed"/);
  assert.match(source, /if \(terminalSuccessPersisted\) \{[\s\S]*return \{ ok: true \};/);
  assert.match(source, /\.upload\(outputObjectPath, finalImageData/);
  assert.match(source, /if \(selectedValidation\.status === "validation_unavailable"\) fidelityStatus = "not_available"/);
  assert.match(source, /type: "generation_failed"/);
  assert.doesNotMatch(source.slice(source.indexOf("if (terminalSuccessPersisted)"), source.indexOf("if (providerDiagnosticContext)", source.indexOf("if (terminalSuccessPersisted)"))), /type: "generation_failed"/);
  assert.match(source, /finalQualityAccepted = terminalDecision !== "rejected"/);
  assert.match(source, /type: "generation_completed"/);
  assert.match(source, /type: "generation_failed"/);
  assert.match(source, /safeGenerationEvent\("queue", "processor_exit", \{ generationId, status: "succeeded" \}\)/);
  assert.match(source, /return \{ ok: true \}/);
  assert.equal((source.match(/type: "generation_completed"/g) ?? []).length, 1);
  assert.match(page, /editValidationUnverified[\s\S]*validatorStatus[\s\S]*validation_unavailable/);
  assert.match(page, /const validationUnverified = Boolean\(fidelityValidationUnverified \|\| editValidationUnverified\)/);
  assert.match(page, /validationUnverified \? t\("outputs\.validationUnverifiedLabel"\)/);
  assert.match(page, /imageEditAvailable=\{isImageEditAvailableForUser\(userId\)\}/);
  assert.match(editPanel, /!available \? <p role="status">\{messages\.unavailable\}<\/p>/);
  assert.match(editPanel, /disabled=\{!available \|\| !hasOutput \|\| pending\}/);
  assert.match(gallery, /item\.status === "succeeded" && item\.validationUnverified/);
  assert.match(gallery, /data-status=\{selected\?\.validationUnverified \? "unverified"/);
  assert.match(gallery, /data-status=\{item\.validationUnverified \? "unverified"/);
  assert.ok(english.Dashboard.project.outputs.validationUnverified);
  assert.ok(english.Dashboard.project.outputs.validationUnverifiedLabel);
  assert.ok(turkish.Dashboard.project.outputs.validationUnverified);
  assert.ok(turkish.Dashboard.project.outputs.validationUnverifiedLabel);
});

test("post-storage persistence exposes its exact failure and committed success is authoritative", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  assert.match(source, /let outputStored = false/);
  assert.match(source, /let terminalSuccessPersisted = false/);
  assert.match(source, /postStorageStep = "persist_terminal_state"[\s\S]*step_start/);
  assert.match(source, /terminal_persistence_failed/);
  assert.match(source, /function getSafeGenerationErrorDetails[\s\S]*code:[\s\S]*details:[\s\S]*hint:/);
  assert.match(source, /terminalSuccessPersisted = true;[\s\S]*step_success/);
  assert.match(source, /postStorageStep = "create_notification"[\s\S]*step_start/);
  assert.match(source, /notification_not_created/);
  assert.match(source, /if \(terminalSuccessPersisted\) \{[\s\S]*post_storage_exception[\s\S]*status: "succeeded"[\s\S]*return \{ ok: true \}/);
  const failedTransition = source.indexOf('safeGenerationEvent("queue", "processor_exit", { generationId, status: "failed" })');
  const committedSuccessGuard = source.indexOf("if (terminalSuccessPersisted)");
  assert.ok(committedSuccessGuard >= 0 && failedTransition > committedSuccessGuard);
});

test("terminal persistence retains the compact input snapshot and never rewrites it with the compiled provider prompt", async () => {
  const source = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const terminalUpdate = source.slice(source.indexOf('postStorageStep = "persist_terminal_state"'), source.indexOf(".eq(\"id\", queuedGeneration.id)", source.indexOf('postStorageStep = "persist_terminal_state"')));
  assert.doesNotMatch(terminalUpdate, /creative_direction_snapshot/);
  assert.match(source, /resolveCreativeDirectionSnapshot\([\s\S]*userCreativeDirection \|\| `Preset: \$\{preset\?\.title/);
  assert.match(source, /creative_direction_snapshot: creativeDirectionSnapshot/);
  assert.match(source, /creative_direction_snapshot: instruction\.trim\(\)/);
});

test("successful galleries and favorites require succeeded status", async () => {
  const dashboard = await readFile("src/lib/generations/get-dashboard-generations.ts", "utf8");
  const favorites = await readFile("src/lib/generations/favorite-generation.ts", "utf8");
  assert.match(dashboard, /row\.status === "succeeded" && row\.output_bucket_id/);
  assert.match(favorites, /generation\.status === "succeeded"/);
  assert.match(favorites, /item\.isFavorite && item\.status === "succeeded"/);
});

test("general dashboard actions and project actions do not import the generation graph", async () => {
  for (const path of ["src/app/[locale]/dashboard/actions.ts", "src/app/[locale]/dashboard/projects/[projectId]/actions.ts"]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /generation-actions|apparel-projection|apparel-artwork-localization|sharp/);
  }
});

test("hybrid projection and Sharp remain dynamically imported behind the eligible generation branch", async () => {
  const generation = await readFile("src/lib/generation/image-worker-service.ts", "utf8");
  const projection = await readFile("src/lib/apparel-projection/project-artwork.ts", "utf8");
  const localization = await readFile("src/lib/product-identity/apparel-artwork-localization.ts", "utf8");
  assert.match(generation, /await import\("@\/lib\/apparel-projection\/project-artwork"\)/);
  assert.doesNotMatch(generation, /^\s*import .*apparel-projection/m);
  assert.match(projection, /await import\("sharp"\)/);
  assert.doesNotMatch(projection, /^\s*import sharp/m);
  assert.match(localization, /await import\("sharp"\)/);
  assert.doesNotMatch(localization, /^\s*import sharp/m);
  assert.match(generation, /runtime_unavailable/);
});
