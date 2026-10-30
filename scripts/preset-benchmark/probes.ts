import { fallbackDirectorPlan, compileDirectorPlan, type VideoDirectorPlan } from "../../src/lib/video-director/core";
import { directorFixtureInput, directorProducts } from "../../tests/fixtures/video-director-fixtures";
import { benchmarkProducts, type IntentContract } from "./dataset";
import { assessPlan, auditBoundary, type Failure } from "./analysis";
import { buildFalVideoRequestInput } from "../../src/lib/video-generation/fal-request";

/** Deliberately corrupted artifacts calibrate the benchmark; never score/rank them as real outputs. */
export function runMutationProbes() {
  const input = { ...directorFixtureInput(directorProducts[0]), presetId: "macro-detail-reveal" as const };
  const product = benchmarkProducts[0], base = fallbackDirectorPlan(input);
  const staticIntent: IntentContract = { kind: "short", text: "Kamerayı sabit tut.", camera: "static" };
  const probe = (name: string, expected: Failure, plan: VideoDirectorPlan, override = input, notices: string[] = ["Explicit fallback / risk explanation"]) => {
    const assessment = assessPlan(plan, override, product, staticIntent, notices);
    let guardRejected = false;
    try { compileDirectorPlan(plan, override); } catch { guardRejected = true; }
    return { name, expected, detected: assessment.failures.includes(expected), actual: assessment.failures, guardRejected };
  };
  const out: { name: string; expected: Failure; detected: boolean; actual: Failure[]; guardRejected: boolean | null }[] = [
    probe("invented-source-feature", "invented-detail", { ...base, shots: base.shots.map(s => ({ ...s, focus: "gold diamond clasp", evidenceRefs: [0] })) }),
    probe("unexplained-loss-of-static-request", "unjustified-intent-loss", { ...base, origin: "ai", intent: "A commercial product film" },
      { ...input, draft: { ...input.draft, prompt: "Kamerayı sabit tut." } }),
    probe("cuts-inside-a-single-take", "shot-mode-conflict", { ...base, shotMode: "single", shots: base.shots.slice(0, 2) }, { ...input, shotMode: "single" }),
    probe("renamed-duplicate-scenes", "repeated-scene", { ...base, shots: [{ ...base.shots[0], durationSeconds: 3 }, { ...base.shots[0], durationSeconds: 7, purpose: "final-hero" }] }),
    probe("unknown-rear-as-a-real-view", "unseen-surface", { ...base, shots: base.shots.map(s => ({ ...s, camera: "Reveal the back in a rear view" })) }),
    probe("unsafe-orbit-with-no-notice", "unexplained-risk", { ...base, shots: base.shots.map(s => ({ ...s, camera: "Complete 360 turn" })) }, input, []),
    probe("subsecond-shots-in-five-seconds", "five-second-overload", { ...base, shots: base.shots.slice(0, 3).map((s, i) => ({ ...s, durationSeconds: [0.5, 0.5, 4][i] })) }, { ...input, draft: { ...input.draft, durationSeconds: 5 } }),
  ];
  const long = "x".repeat(513);
  let rejectedLength = false;
  try { buildFalVideoRequestInput({ ...input.draft, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/offline", prompt: "ignored", multiPrompt: [{ prompt: long, duration: "5" }, { prompt: "detail", duration: "5" }] }); } catch { rejectedLength = true; }
  out.push({ name: "multi-payload-513-characters", expected: "payload-limit", detected: auditBoundary([long], [long], true, true).includes("payload-limit"), actual: auditBoundary([long], [long], true, true), guardRejected: rejectedLength });
  let rejectedSingle = false;
  try { buildFalVideoRequestInput({ ...input.draft, modelId: "kling-v3-standard-image", endpointId: "offline", sourceUrl: "https://invalid.example/offline", prompt: "x".repeat(2501) }); } catch { rejectedSingle = true; }
  out.push({ name: "single-payload-2501-characters", expected: "payload-limit", detected: auditBoundary(["x".repeat(2501)], ["x".repeat(2501)], true, false).includes("payload-limit"), actual: auditBoundary(["x".repeat(2501)], ["x".repeat(2501)], true, false), guardRejected: rejectedSingle });
  out.push({ name: "preview-differs-from-signed-payload", expected: "signed-preview-payload-mismatch", detected: auditBoundary(["actual"], ["preview"], false, true).includes("signed-preview-payload-mismatch"), actual: auditBoundary(["actual"], ["preview"], false, true), guardRejected: null });
  return out;
}
