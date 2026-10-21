"use server";

import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type ActiveGeneration = {
  id: string;
  projectId: string;
  status: "queued" | "processing" | "succeeded" | "failed" | "reconciliation_required";
};

export async function getActiveGenerationStatuses(generationIds?: string[]): Promise<ActiveGeneration[]> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return [];
  const admin = getSupabaseAdminClient();
  const { data: projects } = await admin.from("projects").select("id").eq("user_id", userId);
  const projectIds = (projects ?? []).map(({ id }) => id);
  if (!projectIds.length) return [];
  let query = admin.from("generations").select("id, project_id, status").in("project_id", projectIds)
    .gte("created_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false }).limit(20);
  if (generationIds?.length) query = query.in("id", generationIds.slice(0, 20));
  else query = query.in("status", ["queued", "processing"]);
  const { data } = await query;
  return (data ?? []).map((row) => ({ id: row.id, projectId: row.project_id, status: row.status as ActiveGeneration["status"] }));
}
