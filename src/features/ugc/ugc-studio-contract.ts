import type { UgcModelIdentity, UgcModelTier } from "@/features/ugc/ugc-model-contract";

export const ugcCreatorConceptIds = ["ada", "deniz", "maya"] as const;
export const ugcFormats = ["testimonial", "review", "unboxing", "demo", "story", "problem"] as const;
export const ugcLanguages = ["tr", "en"] as const;
export const ugcTones = ["natural", "energetic", "professional"] as const;
export const ugcVoices = ["warm", "bright", "calm"] as const;
export const ugcEnvironments = ["home", "studio", "outdoor"] as const;
export const ugcLightingStyles = ["daylight", "soft", "warm"] as const;
export const ugcCameraFramings = ["medium", "close", "wide"] as const;
export const ugcDurations = ["15", "30", "60"] as const;
export const ugcAspectRatios = ["9:16", "1:1", "16:9"] as const;

export type UgcDraftSettings = {
  language: (typeof ugcLanguages)[number];
  tone: (typeof ugcTones)[number];
  voice: (typeof ugcVoices)[number];
  environment: (typeof ugcEnvironments)[number];
  lighting: (typeof ugcLightingStyles)[number];
  framing: (typeof ugcCameraFramings)[number];
  duration: (typeof ugcDurations)[number];
  aspectRatio: (typeof ugcAspectRatios)[number];
  subtitles: boolean;
};

export type UgcDraftInput = {
  modelTier?: UgcModelTier;
  id: string;
  title: string | null;
  creatorConceptId: (typeof ugcCreatorConceptIds)[number];
  format: (typeof ugcFormats)[number];
  /** Compatibility mirror of spokenDialogue for the existing database CHECK. */
  script: string;
  sceneDirection: string;
  spokenDialogue: string;
  settings: UgcDraftSettings;
};

export type UgcProduct = {
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  previewUrl: string;
};

export type UgcStudioInitialState = {
  modelTier?: UgcModelTier;
  id: string;
  title: string | null;
  creatorConceptId: UgcDraftInput["creatorConceptId"];
  format: UgcDraftInput["format"];
  script: string;
  sceneDirection: string;
  spokenDialogue: string;
  settings: UgcDraftSettings;
  product: UgcProduct | null;
  updatedAt: string;
} | null;

export type UgcSafeErrorCode = "unauthorized" | "invalid_input" | "not_found" | "conflict" | "unavailable" | "unsupported_capability";

export type UgcResult<T> = { ok: true; value: T } | { ok: false; code: UgcSafeErrorCode };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const isOneOf = <T extends readonly string[]>(value: unknown, choices: T): value is T[number] =>
  typeof value === "string" && choices.some((choice) => choice === value);

export function validateUgcDraftInput(value: unknown): UgcResult<UgcDraftInput> {
  if (!isRecord(value) || !uuidPattern.test(String(value.id ?? ""))) return { ok: false, code: "invalid_input" };
  const title = value.title === null || value.title === undefined ? null : value.title;
  if (title !== null && (typeof title !== "string" || [...title].length > 120)) return { ok: false, code: "invalid_input" };
  // Missing new fields indicate a legacy project. Explicit empty dialogue must stay empty.
  const spokenDialogue = value.spokenDialogue === undefined ? value.script : value.spokenDialogue;
  const sceneDirection = value.sceneDirection === undefined ? "" : value.sceneDirection;
  if (!isOneOf(value.creatorConceptId, ugcCreatorConceptIds) || !isOneOf(value.format, ugcFormats)
    || typeof spokenDialogue !== "string" || [...spokenDialogue].length > 3000
    || typeof sceneDirection !== "string" || [...sceneDirection].length > 3000
    || (value.script !== undefined && (typeof value.script !== "string" || [...value.script].length > 3000
      || value.script !== spokenDialogue))) {
    return { ok: false, code: "invalid_input" };
  }
  if (!isRecord(value.settings)) return { ok: false, code: "invalid_input" };
  const settings = value.settings;
  const modelTier = value.modelTier === undefined ? "premium" : value.modelTier;
  if (modelTier !== "standard" && modelTier !== "premium") return { ok: false, code: "invalid_input" };
  if (!isOneOf(settings.language, ugcLanguages)
    || !isOneOf(settings.tone, ugcTones)
    || !isOneOf(settings.voice, ugcVoices)
    || !isOneOf(settings.environment, ugcEnvironments)
    || !isOneOf(settings.lighting, ugcLightingStyles)
    || !isOneOf(settings.framing, ugcCameraFramings)
    || !isOneOf(settings.duration, ugcDurations)
    || !isOneOf(settings.aspectRatio, ugcAspectRatios)
    || typeof settings.subtitles !== "boolean") {
    return { ok: false, code: "invalid_input" };
  }

  return {
    ok: true,
    value: {
      id: value.id as string,
      modelTier,
      title: typeof title === "string" ? title.trim() || null : null,
      creatorConceptId: value.creatorConceptId,
      format: value.format,
      script: spokenDialogue,
      sceneDirection,
      spokenDialogue,
      settings: {
        language: settings.language,
        tone: settings.tone,
        voice: settings.voice,
        environment: settings.environment,
        lighting: settings.lighting,
        framing: settings.framing,
        duration: settings.duration,
        aspectRatio: settings.aspectRatio,
        subtitles: settings.subtitles,
      },
    },
  };
}

/** Retains the applied SQL contract without concatenating scene instructions and dialogue. */
export function serializeUgcConfiguration(input: UgcDraftInput) {
  return {
    modelTier: input.modelTier ?? "premium",
    script: input.spokenDialogue,
    sceneDirection: input.sceneDirection,
    spokenDialogue: input.spokenDialogue,
    format: input.format,
    settings: { ...input.settings },
  };
}

export type UgcOwnedProject = UgcDraftInput & {
  ownerId: string;
  product: Omit<UgcProduct, "previewUrl"> & { objectPath: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type UgcPreparedJob = {
  id: string;
  ownerId: string;
  projectId: string;
  idempotencyKey: string;
  requestHash: string;
  requestSnapshot: Record<string, unknown>;
  status: "draft";
  createdAt: string;
};

export interface UgcProjectRepository {
  saveOwned(ownerId: string, input: UgcDraftInput): Promise<{ id: string; updatedAt: string }>;
  getOwned(ownerId: string, projectId: string): Promise<UgcOwnedProject | null>;
  listOwned(ownerId: string): Promise<UgcOwnedProject[]>;
  listSuccessfulJobs(ownerId: string, projectId: string): Promise<Array<{
    id: string;
    objectPath: string;
    contentType: "video/mp4";
    byteSize: number;
    durationSeconds: number;
    createdAt: string;
  }>>;
  setOwnedProduct(ownerId: string, projectId: string, product: UgcOwnedProject["product"]): Promise<boolean>;
  prepareJob(input: Omit<UgcPreparedJob, "id" | "createdAt">): Promise<UgcResult<UgcPreparedJob>>;
}

export async function saveUgcDraftForUser(
  userId: string | null,
  payload: unknown,
  repository: UgcProjectRepository,
): Promise<UgcResult<{ id: string; updatedAt: string }>> {
  if (!userId) return { ok: false, code: "unauthorized" };
  const parsed = validateUgcDraftInput(payload);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, value: await repository.saveOwned(userId, parsed.value) };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function prepareUgcJobForUser(
  userId: string | null,
  projectId: string,
  idempotencyKey: string,
  repository: UgcProjectRepository,
  hashRequest: (snapshot: Record<string, unknown>) => string,
  resolveModel: (project: UgcOwnedProject) => UgcResult<UgcModelIdentity> = () => ({ ok: false, code: "unavailable" }),
): Promise<UgcResult<{ id: string; status: "draft"; submitted: false; createdAt: string }>> {
  if (!userId) return { ok: false, code: "unauthorized" };
  if (!uuidPattern.test(projectId) || !uuidPattern.test(idempotencyKey)) return { ok: false, code: "invalid_input" };
  try {
    const project = await repository.getOwned(userId, projectId);
    if (!project) return { ok: false, code: "not_found" };
    if (!project.product || (!project.spokenDialogue.trim() && !project.sceneDirection.trim())) return { ok: false, code: "invalid_input" };
    const model = resolveModel(project);
    if (!model.ok) return model;
    const snapshot = {
      model: { ...model.value },
      creatorConcept: { selectionId: project.creatorConceptId, referenceType: "placeholder_visual" },
      format: project.format,
      product: {
        fileName: project.product.fileName,
        contentType: project.product.contentType,
        byteSize: project.product.byteSize,
        objectPath: project.product.objectPath,
      },
      script: project.spokenDialogue,
      sceneDirection: project.sceneDirection,
      spokenDialogue: project.spokenDialogue,
      settings: { ...project.settings },
    };
    const prepared = await repository.prepareJob({
      ownerId: userId,
      projectId,
      idempotencyKey,
      requestHash: hashRequest(snapshot),
      requestSnapshot: snapshot,
      status: "draft",
    });
    if (!prepared.ok) return prepared;
    return { ok: true, value: { id: prepared.value.id, status: "draft", submitted: false, createdAt: prepared.value.createdAt } };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
