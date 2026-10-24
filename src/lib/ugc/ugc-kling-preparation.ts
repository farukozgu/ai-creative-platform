import { validateUgcDraftInput, type UgcPreparedJob } from "@/features/ugc/ugc-studio-contract";
import { videoEndpointCapabilities } from "@/lib/video-generation/capabilities";

export type UgcKlingBlocker =
  | "generation_disabled"
  | "invalid_snapshot"
  | "creator_reference_unavailable"
  | "prepared_start_frame_required"
  | "source_ratio_verification_required"
  | "unsupported_duration"
  | "speech_pipeline_required"
  | "subtitle_pipeline_required"
  | "ugc_worker_and_billing_required";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Pure dry run of the saved snapshot. Never rereads mutable project settings or signs URLs. */
export function prepareUgcKlingIntegration(job: UgcPreparedJob) {
  const capability = videoEndpointCapabilities.klingV3ProImage;
  const blockers: UgcKlingBlocker[] = ["generation_disabled"];
  const snapshot = job.requestSnapshot;
  const creator = snapshot.creatorConcept;
  const product = snapshot.product;
  const parsed = validateUgcDraftInput({
    id: job.projectId,
    creatorConceptId: typeof creator === "object" && creator !== null && "selectionId" in creator ? creator.selectionId : undefined,
    format: snapshot.format,
    script: snapshot.script,
    sceneDirection: snapshot.sceneDirection,
    spokenDialogue: snapshot.spokenDialogue,
    settings: snapshot.settings,
  });
  const validIdentity = [job.ownerId, job.projectId, job.id].every(value => uuidPattern.test(value));
  const validProduct = typeof product === "object" && product !== null && "objectPath" in product
    && typeof product.objectPath === "string"
    && product.objectPath.startsWith(`${job.ownerId}/${job.projectId}/`)
    && /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(product.objectPath.split("/")[2] ?? "")
    && product.objectPath.split("/").length === 3;
  if (!parsed.ok || !parsed.value.spokenDialogue.trim() || !validIdentity || !validProduct) {
    blockers.push("invalid_snapshot");
  } else {
    // Concept IDs are placeholders, not provider identities; a product image is not a composed scene.
    blockers.push("creator_reference_unavailable", "prepared_start_frame_required", "source_ratio_verification_required");
    if (!capability.durations.some(duration => duration === Number(parsed.value.settings.duration))) blockers.push("unsupported_duration");
    blockers.push("speech_pipeline_required");
    if (parsed.value.settings.subtitles) blockers.push("subtitle_pipeline_required");
    blockers.push("ugc_worker_and_billing_required");
  }
  return {
    jobId: job.id,
    requestHash: job.requestHash,
    provider: capability.provider,
    modelId: capability.id,
    endpointId: capability.endpointId,
    generationEnabled: false as const,
    submitted: false as const,
    // Never insert exact spoken words into the silent visual-generation prompt.
    visualDirection: parsed.ok ? parsed.value.sceneDirection : null,
    spokenDialogue: parsed.ok ? parsed.value.spokenDialogue : null,
    blockers,
    // The current UGC SQL requires owner/project/job.mp4, not Video Studio's owner/job/output.mp4.
    output: validIdentity ? {
      bucketId: "ugc-generated-videos" as const,
      objectPath: `${job.ownerId}/${job.projectId}/${job.id}.mp4`,
      contentType: "video/mp4" as const,
    } : null,
  };
}
