"use server";

import { getAuthenticatedUserId } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { isSupportedLocale } from "@/i18n/routing";
import { authorizeImageDownload, type ImageDownloadRepository, type ImageDownloadResult } from "@/lib/generations/image-download";

export async function downloadGeneratedImage(locale: string, generationId: string): Promise<ImageDownloadResult> {
  if (!isSupportedLocale(locale)) return { ok: false };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { ok: false };
  try {
    const supabase = await createClient();
    const repository: ImageDownloadRepository = {
      async findOwned(ownerId, id) {
        const result = await supabase.from("generations")
          .select("id,project_id,generation_type,status,output_bucket_id,output_object_path,output_mime_type")
          .eq("id", id).maybeSingle();
        if (result.error || !result.data) return null;
        const image = result.data;
        const project = await supabase.from("projects").select("id,user_id")
          .eq("id", image.project_id).eq("user_id", ownerId).maybeSingle();
        if (project.error || !project.data) return null;
        return { id: image.id, projectId: project.data.id, ownerId: project.data.user_id,
          type: image.generation_type, status: image.status, bucket: image.output_bucket_id,
          path: image.output_object_path, mimeType: image.output_mime_type };
      },
      async sign(path, expiresIn, fileName) {
        const signed = await supabase.storage.from("generated-assets").createSignedUrl(path, expiresIn, { download: fileName });
        return signed.error ? null : signed.data?.signedUrl ?? null;
      },
    };
    return await authorizeImageDownload(userId, generationId, repository, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return { ok: false };
  }
}
