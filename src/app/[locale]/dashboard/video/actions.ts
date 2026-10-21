"use server";

import type { IncomingVideoSourceResult, VideoLibraryResult } from "@/features/video/video-studio-types";
import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { getDashboardGenerations } from "@/lib/generations/get-dashboard-generations";
import { resolveAuthorizedVideoSource } from "@/lib/generations/video-source-handoff";
import { createClient } from "@/lib/supabase/server";

export async function loadVideoSourceLibrary(): Promise<VideoLibraryResult> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "unauthorized", assets: [] };

  try {
    const { generations } = await getDashboardGenerations(userId);
    return {
      status: "success",
      assets: generations.flatMap((generation) =>
        generation.previewUrl
          ? [{
              id: generation.id,
              name: generation.projectTitle?.trim() || generation.id,
              previewUrl: generation.previewUrl,
              generationId: generation.id,
              projectId: generation.projectId,
              createdAt: generation.createdAt,
              aspectRatio: generation.aspectRatio,
            }]
          : [],
      ),
    };
  } catch {
    return { status: "error", assets: [] };
  }
}

export async function resolveIncomingVideoSource(generationId: string): Promise<IncomingVideoSourceResult> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "unavailable" };

  try {
    const supabase = await createClient();
    return await resolveAuthorizedVideoSource(userId, generationId, {
      async findGeneration(id) {
        const { data, error } = await supabase
          .from("generations")
          .select("id, project_id, generation_type, status, output_bucket_id, output_object_path, created_at, aspect_ratio")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return null;
        return {
          id: data.id,
          projectId: data.project_id,
          generationType: data.generation_type,
          status: data.status,
          bucketId: data.output_bucket_id,
          objectPath: data.output_object_path,
          createdAt: data.created_at,
          aspectRatio: data.aspect_ratio,
        };
      },
      async findOwnedProject(ownerId, projectId) {
        const { data, error } = await supabase
          .from("projects")
          .select("id, title")
          .eq("id", projectId)
          .eq("user_id", ownerId)
          .maybeSingle();
        return error || !data ? null : data;
      },
      async createSignedPreview(bucketId, objectPath) {
        const { data, error } = await supabase.storage.from(bucketId).createSignedUrl(objectPath, 900);
        return error ? null : data?.signedUrl ?? null;
      },
    });
  } catch {
    return { status: "unavailable" };
  }
}
