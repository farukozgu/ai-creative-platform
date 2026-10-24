"use server";

import {revalidatePath} from "next/cache";

import {isSupportedLocale, type AppLocale} from "@/i18n/routing";
import {getAuthenticatedUserId} from "@/lib/auth/require-user";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";
import {validateProjectIds} from "@/lib/projects/project-selection";

export type CreateProjectState = {
  status: "idle" | "error";
  projectId?: string;
};

export type DeleteProjectState = {
  status: "idle" | "error" | "success";
};

export type CreateWorkspaceProjectResult =
  | { ok: false }
  | { ok: true; projectId: string };

async function createProjectForUser(userId: string, locale: AppLocale, title?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, title: title?.trim() || (locale === "en" ? "Untitled project" : "İsimsiz Proje") })
    .select("id")
    .single();

  return error || !data ? null : data.id;
}

export async function createProject(
  locale: AppLocale,
  previousState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  void previousState;
  const userId = await getAuthenticatedUserId();
  if (!userId || !isSupportedLocale(locale)) {
    return {status: "error"};
  }

  try {
    const projectId = await createProjectForUser(userId, locale, String(formData.get("title") ?? ""));
    if (!projectId) {
      return {status: "error"};
    }
    revalidatePath(`/${locale}/dashboard`, "page");
    revalidatePath(`/${locale}/dashboard/projects`, "page");
    return {status: "idle", projectId};
  } catch {
    return {status: "error"};
  }
}

export async function createWorkspaceProject(
  locale: AppLocale,
  title?: string,
): Promise<CreateWorkspaceProjectResult> {
  const userId = await getAuthenticatedUserId();
  if (!userId || !isSupportedLocale(locale)) {
    return { ok: false };
  }

  try {
    const projectId = await createProjectForUser(userId, "tr", title);
    if (!projectId) {
      return { ok: false };
    }

    revalidatePath(`/${locale}/dashboard`, "page");
    revalidatePath(`/${locale}/dashboard/projects`, "page");
    revalidatePath(`/${locale}/dashboard/projects/${projectId}`, "page");

    return { ok: true, projectId };
  } catch {
    return { ok: false };
  }
}

export async function deleteProject(
  locale: AppLocale,
  projectId: string,
  previousState: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  void previousState;
  void formData;

  const result = await deleteProjects(locale, [projectId]);
  return {status: result.status === "success" ? "success" : "error"};
}

export type DeleteProjectsResult = {
  status: "success" | "partial" | "error";
  deletedIds: string[];
  failedIds: string[];
};

export async function deleteProjects(locale: AppLocale, projectIds: unknown): Promise<DeleteProjectsResult> {
  const ids = validateProjectIds(projectIds);
  const failed = (): DeleteProjectsResult => ({status: "error", deletedIds: [], failedIds: ids ?? []});
  if (!ids || !isSupportedLocale(locale)) return failed();

  const userId = await getAuthenticatedUserId();
  if (!userId) return failed();
  const deletedIds: string[] = [];
  const failedIds: string[] = [];

  try {
    const supabase = getSupabaseAdminClient();
    const owned = await supabase.from("projects").select("id").eq("user_id", userId).in("id", ids);
    if (owned.error) return failed();
    const ownedIds = new Set((owned.data ?? []).map(project => project.id));
    for (const id of ids) {
      if (!ownedIds.has(id)) { failedIds.push(id); continue; }
      try {
        // Preserve the existing row-delete/cascade contract; no Storage cleanup.
        const result = await supabase.from("projects").delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
        if (result.error || !result.data) failedIds.push(id);
        else deletedIds.push(id);
      } catch { failedIds.push(id); }
    }
  } catch {
    return failed();
  }

  if (deletedIds.length) {
    revalidatePath(`/${locale}/dashboard`, "page");
    revalidatePath(`/${locale}/dashboard/projects`, "page");
    for (const id of deletedIds) revalidatePath(`/${locale}/dashboard/projects/${id}`, "page");
  }
  return {status: failedIds.length ? (deletedIds.length ? "partial" : "error") : "success", deletedIds, failedIds};
}
