import { writeFileSync } from "node:fs";

// Install the network tripwire before importing the pure production compiler graph.
globalThis.fetch = async () => { throw new Error("Benchmark network access is forbidden"); };
async function main() {
const { runBenchmark } = await import("./preset-benchmark/benchmark");
const { runMutationProbes } = await import("./preset-benchmark/probes");
const { renderReport } = await import("./preset-benchmark/report");
const result = runBenchmark(), probes = runMutationProbes();
if (!result.unchangedProduction) throw new Error("Production files changed during benchmark");
if (result.summaries.some(s => s.products < 2)) throw new Error("Every preset requires at least two suitable products");
if (probes.some(p => !p.detected)) throw new Error("A mandatory failure detector missed its calibration case");
writeFileSync("docs/video-preset-quality-benchmark.md", renderReport(result, probes));
writeFileSync("docs/video-preset-quality-benchmark.json", JSON.stringify({ ...result, probes }) + "\n");
console.log(JSON.stringify({ ...result.totals, presets: result.summaries.length, probes: probes.length, unchangedProduction: result.unchangedProduction,
  top: result.ranking.slice(0, 5).map(s => [s.presetId, s.score]), bottom: result.ranking.slice(-5).map(s => [s.presetId, s.score]) }, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
