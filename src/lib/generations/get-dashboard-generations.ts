import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { GenerationStatus } from "@/lib/projects/get-projects";
import { isMissingFavoriteColumnError } from "@/lib/generations/favorite-generation";

export type DashboardGeneration = {
  id: string;
  projectId: string;
  projectTitle: string | null;
  status: GenerationStatus;
  type: "image" | "video";
  createdAt: string;
  previewUrl: string | null;
  aspectRatio: string | null;
  isFavorite: boolean;
};

export async function getDashboardGenerations(userId: string) {
  const supabase = await createClient();
  const { data: ownedProjects, error: projectError } = await supabase.from("projects").select("id, title").eq("user_id", userId);
  if (projectError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[dashboard-projects] query_failed", { code: projectError.code, message: projectError.message, details: projectError.details, hint: projectError.hint });
    }
    throw new Error("Unable to load dashboard projects.");
  }
  const projects = ownedProjects ?? [];
  if (projects.length === 0) return { generations: [] as DashboardGeneration[] };

  const projectIds = projects.map((project) => project.id);
  const generationResult = await supabase.from("generations").select("id, project_id, generation_type, status, created_at, aspect_ratio, output_bucket_id, output_object_path, is_favorite").in("project_id", projectIds).eq("generation_type", "image").eq("status", "succeeded").order("created_at", { ascending: false }).limit(6);
  let { data: rows, error } = generationResult;
  if (isMissingFavoriteColumnError(error)) {
    if (process.env.NODE_ENV === "development") console.warn("[generation-favorites] migration_pending", { migration: "20261007010000_add_generation_favorites.sql" });
    const fallback = await supabase.from("generations").select("id, project_id, generation_type, status, created_at, aspect_ratio, output_bucket_id, output_object_path").in("project_id", projectIds).eq("generation_type", "image").eq("status", "succeeded").order("created_at", { ascending: false }).limit(6);
    rows = fallback.data?.map((generation) => ({ ...generation, is_favorite: false })) ?? null;
    error = fallback.error;
  }
  if (error) throw new Error("Unable to load dashboard generations.");
  const titleById = new Map(projects.map((project) => [project.id, project.title]));
  const generations = await Promise.all((rows ?? []).map(async (row) => {
    let previewUrl: string | null = null;
    if (row.generation_type === "image" && row.status === "succeeded" && row.output_bucket_id && row.output_object_path) {
      const { data } = await supabase.storage.from(row.output_bucket_id).createSignedUrl(row.output_object_path, 3600);
      previewUrl = data?.signedUrl ?? null;
    }
    return { id: row.id, projectId: row.project_id, projectTitle: titleById.get(row.project_id) ?? null, status: row.status as GenerationStatus, type: row.generation_type as "image" | "video", createdAt: row.created_at, previewUrl, aspectRatio: row.aspect_ratio, isFavorite: row.is_favorite };
  }));
  return { generations };
}
