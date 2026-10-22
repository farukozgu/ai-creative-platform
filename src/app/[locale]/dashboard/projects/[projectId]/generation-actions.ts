"use server";

import type { AppLocale } from "@/i18n/routing";
import {
  createImageEdit as createImageEditService,
  createQueuedImageGeneration as createQueuedImageGenerationService,
  type CreateImageEditResult,
  type CreateQueuedImageGenerationResult,
} from "@/lib/generation/image-worker-service";

export type {
  CreateImageEditResult,
  CreateQueuedImageGenerationResult,
  RunQueuedImageGenerationResult,
} from "@/lib/generation/image-worker-service";

export async function createQueuedImageGeneration(
  locale: AppLocale,
  projectId: string,
  previousState: CreateQueuedImageGenerationResult | null,
  formData?: FormData,
): Promise<CreateQueuedImageGenerationResult> {
  return createQueuedImageGenerationService(locale, projectId, previousState, formData);
}

export async function createImageEdit(
  locale: AppLocale,
  projectId: string,
  baseGenerationId: string,
  instruction: string,
  submissionId: string,
): Promise<CreateImageEditResult> {
  return createImageEditService(locale, projectId, baseGenerationId, instruction, submissionId);
}
