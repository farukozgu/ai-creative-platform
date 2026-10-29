"use server";

import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { SupabaseVideoJobRepository } from "@/lib/video-generation/supabase-repository";
import { canDeleteVideo } from "@/lib/video-generation/deletion-policy";

export async function deleteVideoAction(jobId: string) {
  const ownerId = await getAuthenticatedUserId();
  if (!ownerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return { status: "error" as const };
  try {
    const job = await new SupabaseVideoJobRepository().findOwned(ownerId, jobId);
    if (!job) return { status: "error" as const };
    if (!canDeleteVideo(job)) return { status: "busy" as const };
    const client = getSupabaseAdminClient();
    if (job.preservation?.analysisConsent) {
      const review = await client.from("video_fidelity_reviews").select("status").eq("owner_id", ownerId).eq("job_id", jobId);
      if (review.error) return { status: "error" as const };
      if (review.data?.some(item => !["succeeded", "failed"].includes(item.status))) return { status: "busy" as const };
    }
    if (job.outputObjectPath) {
      if (job.outputBucketId !== "generated-videos" || job.outputObjectPath !== `${ownerId}/${jobId}/output.mp4`) return { status: "error" as const };
      const { error } = await client.storage.from("generated-videos").remove([job.outputObjectPath]);
      if (error) return { status: "error" as const };
    }
    // Keep budget reservations and ledger entries: deleting media never refunds or resubmits a job.
    const { data, error } = await client.rpc("delete_owned_settled_video", { p_owner_id: ownerId, p_job_id: jobId });
    if (error) console.error("Video deletion failed", { stage: "record", code: error.code });
    return !error && data === true ? { status: "success" as const } : { status: "error" as const };
  } catch { return { status: "error" as const }; }
}
