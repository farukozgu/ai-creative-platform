import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getProjectsPage } from "@/lib/projects/get-projects";
import { getDashboardGenerations } from "@/lib/generations/get-dashboard-generations";
import type { PersistedModelProfile } from "@/features/models/model-profile";

type ModelPreview = {
  id: string;
  name: string;
  status: PersistedModelProfile["status"];
  updated_at: string;
};

// Sources fail independently; unavailable data must never look like zero activity.
export async function getDashboardOverview(userId: string) {
  const supabase = await createClient();
  const [projects, images, models, videos, creations] = await Promise.allSettled([
    getProjectsPage(userId, { page: 1, pageSize: 5, search: "", status: null, sort: "updated" }),
    supabase.from("generations").select("id, projects!inner(user_id)", { count: "exact", head: true })
      .eq("projects.user_id", userId).eq("generation_type", "image").eq("status", "succeeded"),
    supabase.from("model_profiles").select("id, name, status, updated_at", { count: "exact" })
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(3),
    supabase.from("generations").select("id", { count: "exact", head: true })
      .eq("owner_id", userId).eq("generation_type", "video").eq("status", "succeeded"),
    getDashboardGenerations(userId),
  ]);

  return {
    counts: {
      projects: projects.status === "fulfilled" ? projects.value.totalCount : null,
      images: images.status === "fulfilled" && !images.value.error ? images.value.count : null,
      models: models.status === "fulfilled" && !models.value.error ? models.value.count : null,
      videos: videos.status === "fulfilled" && !videos.value.error ? videos.value.count : null,
    },
    projects: projects.status === "fulfilled" ? projects.value.projects : null,
    models: models.status === "fulfilled" && !models.value.error ? models.value.data as ModelPreview[] | null : null,
    creations: creations.status === "fulfilled" ? creations.value.generations.slice(0, 4) : null,
  };
}

export type DashboardOverview = Awaited<ReturnType<typeof getDashboardOverview>>;
