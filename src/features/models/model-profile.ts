export const adultAgeRanges = ["18–24", "25–34", "35–44", "45–54", "55+"] as const;

export type AdultAgeRange = (typeof adultAgeRanges)[number];

export type ModelAppearanceDraft = {
  name: string;
  presentation: string;
  ageRange: AdultAgeRange | "";
  skinTone: string;
  hairColor: string;
  hairstyle: string;
  eyeColor: string;
  silhouette: string;
  visualStyle: string;
  notes: string;
};

export const emptyModelAppearanceDraft: ModelAppearanceDraft = {
  name: "",
  presentation: "",
  ageRange: "",
  skinTone: "",
  hairColor: "",
  hairstyle: "",
  eyeColor: "",
  silhouette: "",
  visualStyle: "",
  notes: "",
};

export function validateModelAppearanceDraft(draft: ModelAppearanceDraft) {
  const fields = [draft.name, draft.presentation, draft.ageRange, draft.skinTone, draft.hairColor, draft.hairstyle, draft.eyeColor, draft.silhouette, draft.visualStyle];
  return fields.every((field) => field.trim().length > 0) && adultAgeRanges.includes(draft.ageRange as AdultAgeRange);
}

export type PersistedModelProfile = ModelAppearanceDraft & { id: string; status: "draft" | "candidate_pending" | "identity_review_pending" | "approved" | "archived"; createdAt: string; updatedAt: string };

export function parseModelAppearanceDraft(value: unknown): ModelAppearanceDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const draft: ModelAppearanceDraft = {
    name: typeof candidate.name === "string" ? candidate.name : "",
    presentation: typeof candidate.presentation === "string" ? candidate.presentation : "",
    ageRange: typeof candidate.ageRange === "string" && adultAgeRanges.includes(candidate.ageRange as AdultAgeRange) ? candidate.ageRange as AdultAgeRange : "",
    skinTone: typeof candidate.skinTone === "string" ? candidate.skinTone : "", hairColor: typeof candidate.hairColor === "string" ? candidate.hairColor : "", hairstyle: typeof candidate.hairstyle === "string" ? candidate.hairstyle : "", eyeColor: typeof candidate.eyeColor === "string" ? candidate.eyeColor : "", silhouette: typeof candidate.silhouette === "string" ? candidate.silhouette : "", visualStyle: typeof candidate.visualStyle === "string" ? candidate.visualStyle : "", notes: typeof candidate.notes === "string" ? candidate.notes : "",
  };
  return validateModelAppearanceDraft(draft) && Array.from(draft.name.trim()).length <= 80 && Array.from(draft.notes).length <= 600 ? draft : null;
}
