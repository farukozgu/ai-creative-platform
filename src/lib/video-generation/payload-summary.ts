import { createHash } from "node:crypto";
import type { VideoGenerationDraft, VideoPreservationSnapshot } from "./types";
import { buildFalVideoRequestInput } from "./fal-request";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function summarizeVideoPayload(draft: VideoGenerationDraft, snapshot: VideoPreservationSnapshot) {
  const plan = snapshot.director?.plan;
  const requestedMulti = snapshot.director?.multiPrompt;
  if ((draft.shotMode ?? "single") === "multi" && (!plan || plan.shotMode !== "multi" || !requestedMulti)) throw new Error("Multi-shot plan required.");
  if ((draft.shotMode ?? "single") === "single" && requestedMulti) throw new Error("Unexpected multi-shot payload.");
  // Compile through the exact provider payload builder, with a placeholder URL
  // that is neither persisted nor included in the signed or displayed summary.
  const input = buildFalVideoRequestInput({ modelId: `kling-v3-${draft.quality}-image`, endpointId: "", mode: draft.mode,
    prompt: snapshot.compiledPrompt, multiPrompt: requestedMulti, negativePrompt: snapshot.negativePrompt, cfgScale: snapshot.cfgScale,
    durationSeconds: draft.durationSeconds, aspectRatio: draft.aspectRatio, sourceUrl: "https://invalid.example/private-source" });
  const multi = Array.isArray(input.multi_prompt) ? input.multi_prompt : undefined;
  const shots = multi ? multi.map((item, index) => ({ duration: Number(item.duration), prompt: item.prompt, camera: plan?.shots[index]?.camera ?? "" }))
    : [{ duration: Number(input.duration), prompt: String(input.prompt), camera: plan?.shots[0]?.camera ?? snapshot.compiledPrompt.split("\n")[2] ?? draft.cameraMovement }];
  const preview = { mode: multi ? "multi" as const : "single" as const, shotType: input.shot_type === "customize" ? "customize" as const : null, shots };
  const summary = { mode: preview.mode, shotType: preview.shotType, durations: shots.map(shot => shot.duration),
    promptHashes: shots.map(shot => hash(shot.prompt)), directorVersion: plan?.version ?? null,
    presetId: plan?.presetId ?? null, presetVersion: plan?.presetVersion ?? null };
  // Include negative prompt and settings in the signed comparison, without storing them in the audit summary.
  const snapshotHash = hash(JSON.stringify({ preview, summary, duration: input.duration, generateAudio: input.generate_audio,
    safetyChecker: input.enable_safety_checker, negativePrompt: input.negative_prompt, cfgScale: input.cfg_scale }));
  return { preview, summary, snapshotHash };
}
