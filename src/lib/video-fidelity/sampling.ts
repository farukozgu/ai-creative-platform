const samplePoints = [0, 0.25, 0.5, 0.75, 0.95] as const;

/** Beginning, quarter, middle, three-quarter, and near-end frames. */
export function sampleVideoFrameTimestamps(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 15) return [];
  return samplePoints.map((point) => Math.round(durationSeconds * point * 10) / 10);
}
