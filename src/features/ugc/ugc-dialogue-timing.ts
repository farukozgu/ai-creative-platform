/** Planning estimate only: 150 words/minute, without synthesized audio or pause analysis. */
export function getUgcDialogueTiming(dialogue: string, durationSeconds: number) {
  const wordCount = dialogue.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const estimatedSeconds = Math.ceil(wordCount * 60 / 150);
  return { wordCount, estimatedSeconds, tooLong: estimatedSeconds > durationSeconds };
}
