import "server-only";

import { isObject } from "@/lib/ugc/ugc-request-planner";
import type { UgcJobIdentity, UgcPlanningIssue } from "@/lib/ugc/ugc-request-planner";
import type { UgcDraftInput } from "@/features/ugc/ugc-studio-contract";

export type UgcAudioReference = {
  objectPath: string; sha256: string; byteSize: number; durationSeconds: number;
  contentType: "audio/mpeg" | "audio/wav";
};
export type UgcSeedanceAudioPlan =
  | { mode: "silent"; generateAudio: false; references: [] }
  | { mode: "native"; generateAudio: true; references: [] }
  | { mode: "reference"; generateAudio: true; references: UgcAudioReference[] };

/** Metadata planning only. No private audio bucket/provisioning/decoder is installed. */
export function planUgcSeedanceAudio(job: UgcJobIdentity, draft: Pick<UgcDraftInput, "spokenDialogue"> & { settings: { language: string } }, input: unknown):
  { ok: true; plan: UgcSeedanceAudioPlan } | { ok: false; issues: UgcPlanningIssue[] } {
  const issues: UgcPlanningIssue[] = [];
  // Exact speech requirements cannot be satisfied by merely turning native audio on.
  if (draft.spokenDialogue.trim()) {
    issues.push("exact_dialogue_unverified", "voice_selection_unverified", "lip_sync_unverified");
    if (draft.settings.language === "tr") issues.push("turkish_speech_unsupported");
  }
  const value = input === undefined ? { mode: "silent" } : input;
  if (!isObject(value) || Object.keys(value).some(key => key !== "mode" && key !== "references")
    || !["silent", "native", "reference"].includes(String(value.mode))) {
    return { ok: false, issues: [...issues, "audio_settings_unsupported"] };
  }
  const refs = value.references === undefined ? [] : value.references;
  if (!Array.isArray(refs) || (value.mode !== "reference" && refs.length !== 0)
    || (value.mode === "reference" && (refs.length < 1 || refs.length > 10))) {
    return { ok: false, issues: [...issues, "audio_reference_invalid"] };
  }
  let total = 0;
  for (const ref of refs) {
    if (!isObject(ref) || Object.keys(ref).some(key => !["objectPath", "sha256", "byteSize", "durationSeconds", "contentType"].includes(key))
      || typeof ref.objectPath !== "string" || !ref.objectPath.startsWith(`${job.ownerId}/${job.projectId}/`)
      || !/^[0-9a-f-]{36}\.(mp3|wav)$/.test(ref.objectPath.split("/")[2] ?? "") || ref.objectPath.split("/").length !== 3
      || typeof ref.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(ref.sha256)
      || typeof ref.byteSize !== "number" || !Number.isSafeInteger(ref.byteSize) || ref.byteSize < 1 || ref.byteSize > 15 * 1024 * 1024
      || typeof ref.durationSeconds !== "number" || !Number.isFinite(ref.durationSeconds) || ref.durationSeconds < 1.8 || ref.durationSeconds > 30.2
      || ref.contentType !== (ref.objectPath.endsWith(".mp3") ? "audio/mpeg" : "audio/wav")) {
      return { ok: false, issues: [...issues, "audio_reference_invalid"] };
    }
    total += ref.durationSeconds;
  }
  if (total > 30.2) issues.push("audio_reference_invalid");
  if (issues.length) return { ok: false, issues };
  if (value.mode === "silent") return { ok: true, plan: { mode: "silent", generateAudio: false, references: [] } };
  if (value.mode === "native") return { ok: true, plan: { mode: "native", generateAudio: true, references: [] } };
  return { ok: true, plan: { mode: "reference", generateAudio: true, references: structuredClone(refs) as UgcAudioReference[] } };
}
