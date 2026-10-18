import { getCreativePreset, getPresetPresentationModes } from "@/lib/creative-presets/creative-presets";

export type CreationEntry = { presetId: string | null; presentationMode: string | null };

export function resolveCreationEntry(preset: unknown, presentation: unknown): CreationEntry {
  const selected = getCreativePreset(preset);
  if (!selected) return { presetId: null, presentationMode: null };
  const mode = getPresetPresentationModes(selected.id).find((item) => item.id === presentation);
  return { presetId: selected.id, presentationMode: mode?.id ?? null };
}

export function creationHref(entry: CreationEntry): string {
  const query = new URLSearchParams();
  if (entry.presetId) {
    query.set("preset", entry.presetId);
    if (entry.presentationMode) query.set("presentation", entry.presentationMode);
  }
  return `/dashboard/create${query.size ? `?${query}` : ""}`;
}
