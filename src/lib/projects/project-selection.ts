export const maxProjectDeleteBatch = 50;

export function validateProjectIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxProjectDeleteBatch) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!value.every((id: unknown) => typeof id === "string" && uuid.test(id))) return null;
  return [...new Set((value as string[]).map(id => id.toLowerCase()))];
}

export function toggleProjectSelection(selected: string[], id: string, pageIds: string[]): string[] {
  const current = selected.filter(value => pageIds.includes(value));
  if (!pageIds.includes(id)) return current;
  return current.includes(id) ? current.filter(value => value !== id) : [...current, id];
}
