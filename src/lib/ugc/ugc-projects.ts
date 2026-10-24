import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  validateUgcDraftInput,
  serializeUgcConfiguration,
  type UgcDraftInput,
  type UgcOwnedProject,
  type UgcProduct,
  type UgcProjectRepository,
  type UgcStudioInitialState,
} from "@/features/ugc/ugc-studio-contract";

type DatabaseError = { code?: string };
type ProjectRow = {
  id: string; owner_id: string; title: string | null; creator_concept: unknown; configuration: unknown;
  product_file_name: string | null; product_content_type: "image/jpeg" | "image/png" | "image/webp" | null;
  product_byte_size: number | string | null; product_object_path: string | null; created_at: string; updated_at: string;
};

export class UgcSchemaUnavailableError extends Error {
  constructor() { super("UGC persistence is not installed."); this.name = "UgcSchemaUnavailableError"; }
}

function throwDatabaseError(error: DatabaseError) {
  if (error.code === "42P01" || error.code === "PGRST205") throw new UgcSchemaUnavailableError();
  throw new Error("UGC persistence is unavailable.");
}

function projectFromRow(row: ProjectRow): UgcOwnedProject | null {
  const creator = row.creator_concept as Record<string, unknown> | null;
  const parsed = validateUgcDraftInput({
    id: row.id, title: row.title, creatorConceptId: creator?.selection_id,
    format: typeof row.configuration === "object" && row.configuration !== null
      ? (row.configuration as Record<string, unknown>).format : undefined,
    script: typeof row.configuration === "object" && row.configuration !== null
      ? (row.configuration as Record<string, unknown>).script : undefined,
    sceneDirection: typeof row.configuration === "object" && row.configuration !== null
      ? (row.configuration as Record<string, unknown>).sceneDirection : undefined,
    spokenDialogue: typeof row.configuration === "object" && row.configuration !== null
      ? (row.configuration as Record<string, unknown>).spokenDialogue : undefined,
    settings: typeof row.configuration === "object" && row.configuration !== null
      ? (row.configuration as Record<string, unknown>).settings : undefined,
  });
  if (!parsed.ok) return null;
  const product = row.product_file_name && row.product_content_type && row.product_byte_size && row.product_object_path
    ? {
        fileName: row.product_file_name,
        contentType: row.product_content_type,
        byteSize: Number(row.product_byte_size),
        objectPath: row.product_object_path,
      } satisfies NonNullable<UgcOwnedProject["product"]>
    : null;
  return { ...parsed.value, ownerId: row.owner_id, product, createdAt: row.created_at, updatedAt: row.updated_at };
}

const projectFields = "id, owner_id, title, creator_concept, configuration, product_file_name, product_content_type, product_byte_size, product_object_path, created_at, updated_at";

export class SupabaseUgcProjectRepository implements UgcProjectRepository {
  async saveOwned(ownerId: string, input: UgcDraftInput) {
    const supabase = await createClient();
    const projectData = {
      id: input.id,
      owner_id: ownerId,
      title: input.title,
      creator_concept: { selection_id: input.creatorConceptId, reference_type: "placeholder_visual" },
      configuration: serializeUgcConfiguration(input),
    };
    const { data: existing, error: lookupError } = await supabase.from("ugc_projects").select("id")
      .eq("id", input.id).eq("owner_id", ownerId).maybeSingle();
    if (lookupError) throwDatabaseError(lookupError);
    const mutation = existing
      ? await supabase.from("ugc_projects").update(projectData).eq("id", input.id).eq("owner_id", ownerId).select("id, updated_at").single()
      : await supabase.from("ugc_projects").insert(projectData).select("id, updated_at").single();
    if (mutation.error?.code === "23505" && !existing) {
      const retry = await supabase.from("ugc_projects").update(projectData)
        .eq("id", input.id).eq("owner_id", ownerId).select("id, updated_at").maybeSingle();
      if (retry.error) throwDatabaseError(retry.error);
      if (retry.data) return { id: retry.data.id, updatedAt: retry.data.updated_at };
    } else if (mutation.error) {
      throwDatabaseError(mutation.error);
    } else if (mutation.data) {
      return { id: mutation.data.id, updatedAt: mutation.data.updated_at };
    }
    throw new Error("UGC project ownership could not be verified.");
  }

  async getOwned(ownerId: string, projectId: string) {
    const { data, error } = await (await createClient()).from("ugc_projects").select(projectFields)
      .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
    if (error) throwDatabaseError(error);
    return data ? projectFromRow(data as unknown as ProjectRow) : null;
  }

  async listOwned(ownerId: string) {
    const { data, error } = await (await createClient()).from("ugc_projects").select(projectFields)
      .eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(100);
    if (error) throwDatabaseError(error);
    return ((data ?? []) as unknown as ProjectRow[]).map(projectFromRow)
      .filter((project): project is UgcOwnedProject => project !== null);
  }

  async listSuccessfulJobs(ownerId: string, projectId: string) {
    const { data, error } = await (await createClient()).from("ugc_video_jobs")
      .select("id, output_object_path, output_content_type, output_byte_size, duration_seconds, created_at")
      .eq("owner_id", ownerId).eq("project_id", projectId).eq("status", "succeeded")
      .eq("output_bucket_id", "ugc-generated-videos").order("created_at", { ascending: false }).limit(50);
    if (error) throwDatabaseError(error);
    return (data ?? []).flatMap((row) => row.output_object_path && row.output_content_type === "video/mp4"
      && row.output_byte_size && row.duration_seconds
      ? [{ id: row.id, objectPath: row.output_object_path, contentType: "video/mp4" as const,
          byteSize: Number(row.output_byte_size), durationSeconds: Number(row.duration_seconds), createdAt: row.created_at }]
      : []);
  }

  async setOwnedProduct(ownerId: string, projectId: string, product: UgcOwnedProject["product"]) {
    const { data, error } = await (await createClient()).from("ugc_projects").update({
      product_file_name: product?.fileName ?? null,
      product_content_type: product?.contentType ?? null,
      product_byte_size: product?.byteSize ?? null,
      product_object_path: product?.objectPath ?? null,
    }).eq("id", projectId).eq("owner_id", ownerId).select("id").maybeSingle();
    if (error) throwDatabaseError(error);
    return Boolean(data);
  }

  async prepareJob(input: Parameters<UgcProjectRepository["prepareJob"]>[0]) {
    const admin = getSupabaseAdminClient();
    const { data: existing, error: lookupError } = await admin.from("ugc_video_jobs")
      .select("id, owner_id, project_id, idempotency_key, request_hash, request_snapshot, status, created_at")
      .eq("owner_id", input.ownerId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (lookupError) throwDatabaseError(lookupError);
    if (existing) {
      if (existing.project_id !== input.projectId || existing.request_hash !== input.requestHash || existing.status !== "draft") return { ok: false, code: "conflict" } as const;
      return { ok: true, value: {
        id: existing.id, ownerId: existing.owner_id, projectId: existing.project_id,
        idempotencyKey: existing.idempotency_key, requestHash: existing.request_hash,
        requestSnapshot: existing.request_snapshot as Record<string, unknown>, status: "draft" as const,
        createdAt: existing.created_at,
      } } as const;
    }
    const { data: created, error: insertError } = await admin.from("ugc_video_jobs").insert({
      owner_id: input.ownerId,
      project_id: input.projectId,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      request_snapshot: input.requestSnapshot,
      status: "draft",
      provider: null,
    }).select("id, owner_id, project_id, idempotency_key, request_hash, request_snapshot, status, created_at").single();
    if (insertError?.code === "23505") {
      const { data: duplicate, error } = await admin.from("ugc_video_jobs")
        .select("id, owner_id, project_id, idempotency_key, request_hash, request_snapshot, status, created_at")
        .eq("owner_id", input.ownerId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (error) throwDatabaseError(error);
      if (duplicate?.project_id === input.projectId && duplicate.request_hash === input.requestHash && duplicate.status === "draft") {
        return { ok: true, value: {
          id: duplicate.id, ownerId: duplicate.owner_id, projectId: duplicate.project_id,
          idempotencyKey: duplicate.idempotency_key, requestHash: duplicate.request_hash,
          requestSnapshot: duplicate.request_snapshot as Record<string, unknown>, status: "draft" as const,
          createdAt: duplicate.created_at,
        } } as const;
      }
      return { ok: false, code: "conflict" } as const;
    }
    if (insertError) throwDatabaseError(insertError);
    if (!created) throw new Error("UGC request could not be prepared.");
    return { ok: true, value: {
      id: created.id, ownerId: created.owner_id, projectId: created.project_id,
      idempotencyKey: created.idempotency_key, requestHash: created.request_hash,
      requestSnapshot: created.request_snapshot as Record<string, unknown>, status: "draft" as const,
      createdAt: created.created_at,
    } } as const;
  }
}

export const ugcProjectRepository = new SupabaseUgcProjectRepository();

export async function getUgcStudioInitialState(ownerId: string): Promise<UgcStudioInitialState> {
  const repository = ugcProjectRepository;
  const project = (await repository.listOwned(ownerId))[0];
  if (!project) return null;
  let product: UgcProduct | null = null;
  if (project.product) {
    const supabase = await createClient();
    const signed = await supabase.storage.from("ugc-product-assets").createSignedUrl(project.product.objectPath, 900);
    if (!signed.error) product = { ...project.product, previewUrl: signed.data.signedUrl };
  }
  return { ...project, product };
}

export async function listUgcProjectResults(ownerId: string, projectId: string) {
  if (!(await ugcProjectRepository.getOwned(ownerId, projectId))) return null;
  const supabase = await createClient();
  const results = await ugcProjectRepository.listSuccessfulJobs(ownerId, projectId);
  return Promise.all(results.map(async (result) => {
    const signed = await supabase.storage.from("ugc-generated-videos").createSignedUrl(result.objectPath, 900);
    return signed.error ? null : { id: result.id, url: signed.data.signedUrl, contentType: result.contentType,
      byteSize: result.byteSize, durationSeconds: result.durationSeconds, createdAt: result.createdAt };
  })).then((items) => items.filter((item): item is NonNullable<typeof item> => item !== null));
}
