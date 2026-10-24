import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedVideoSchedulerRequest } from "@/lib/video-generation/scheduler-auth";
import { IMAGE_EXECUTION_LEASE_SECONDS, isImageGenerationWorkerEnabled } from "./image-scheduler";
import { parseLocalImageAuthorization, selectedImageClaimQuery } from "./local-image-claim";
import { withLocalImageBudget } from "./local-image-budget";
import { uuidPattern } from "./local-image-claim";
import { runQueuedImageGeneration } from "./image-worker-service";

let running = false;
function permitted(request: Request) {
  return process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://fnzrnlvpkzwztccqzyzf.supabase.co" &&
    isAuthorizedVideoSchedulerRequest(request.headers.get("authorization"), process.env.IMAGE_GENERATION_WORKER_SECRET);
}

export async function readLocalImageStatus(request: Request) {
  if (!permitted(request)) return Response.json({ error: "unauthorized_or_not_local" }, { status: 403 });
  const query = new URL(request.url).searchParams;
  const ids = ["generationId", "ownerId", "projectId"].map((key) => query.get(key));
  if (!ids.every((id) => id && uuidPattern.test(id))) return Response.json({ error: "invalid_selection" }, { status: 400 });
  const { data, error } = await getSupabaseAdminClient().from("generations")
    .select("id,status,provider_submission_state,execution_lease_expires_at,output_object_path")
    .eq("id", ids[0]!).eq("owner_id", ids[1]!).eq("project_id", ids[2]!).eq("generation_type", "image").maybeSingle();
  if (error || !data) return Response.json({ error: "status_unavailable" }, { status: 404 });
  return Response.json({ generationId: data.id, status: data.status, submissionState: data.provider_submission_state,
    leaseExpiresAt: data.execution_lease_expires_at, outputStored: Boolean(data.output_object_path) });
}

export async function handleLocalImageWorker(request: Request) {
  if (!permitted(request)) return Response.json({ error: "unauthorized_or_not_local" }, { status: 403 });
  if (!isImageGenerationWorkerEnabled()) return Response.json({ error: "worker_disabled" }, { status: 503 });
  const authorization = parseLocalImageAuthorization(await request.json().catch(() => null));
  if (!authorization) return Response.json({ error: "explicit_job_and_cost_authorization_required" }, { status: 400 });
  if (running) return Response.json({ error: "local_worker_busy" }, { status: 409 });
  running = true;
  try {
    const admin = getSupabaseAdminClient();
    const { data: project, error: projectError } = await admin.from("projects").select("id")
      .eq("id", authorization.projectId).eq("user_id", authorization.ownerId).maybeSingle();
    if (projectError || !project) return Response.json({ error: "ownership_not_verified" }, { status: 409 });
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + IMAGE_EXECUTION_LEASE_SECONDS * 1000).toISOString();
    const { data: claimed, error } = await admin.from("generations").update({
      execution_lease_token: leaseToken, execution_lease_version: 1,
      // Exhaust automatic retries: even a pre-provider crash must not allow a
      // scheduler to reclaim this operator-authorized job outside its budget.
      execution_attempts: 3, execution_lease_expires_at: leaseExpiresAt,
    }).match(selectedImageClaimQuery(authorization))
      .is("execution_lease_token", null).is("execution_lease_expires_at", null)
      .not("client_submission_id", "is", null).not("input_asset_id", "is", null)
      .is("output_object_path", null).is("provider_request_id", null)
      .or("provider_submission_state.is.null,provider_submission_state.eq.not_started")
      .select("id").maybeSingle();
    if (error || !claimed) return Response.json({ error: "selected_job_not_fresh_or_claim_conflict" }, { status: 409 });
    const result = await withLocalImageBudget(authorization, () => runQueuedImageGeneration({
      jobId: claimed.id, leaseToken, leaseVersion: 1, leaseExpiresAt,
    }));
    return Response.json({ generationId: claimed.id, ...result });
  } catch {
    // Never return provider/DB details, credentials or media. Do not retry.
    return Response.json({ error: "execution_interrupted_inspect_status_do_not_retry" }, { status: 500 });
  } finally { running = false; }
}
