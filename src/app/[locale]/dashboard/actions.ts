"use server";

import {revalidatePath} from "next/cache";

import {isSupportedLocale, type AppLocale} from "@/i18n/routing";
import {getAuthenticatedUserId} from "@/lib/auth/require-user";
import {getSupabaseAdminClient} from "@/lib/supabase/admin";
import {createClient} from "@/lib/supabase/server";

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

  const userId = await getAuthenticatedUserId();
  if (!userId || !isSupportedLocale(locale)) {
    return {status: "error"};
  }

  let error: Error | null = null;

  try {
    const supabase = getSupabaseAdminClient();
    const result = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", userId);
    error = result.error;
  } catch {
    return {status: "error"};
  }

  if (error) {
    return {status: "error"};
  }

  revalidatePath(`/${locale}/dashboard`, "page");
  revalidatePath(`/${locale}/dashboard/projects`, "page");
  return {status: "success"};
}
