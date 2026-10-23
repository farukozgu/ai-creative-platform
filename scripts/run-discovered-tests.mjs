import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const preflightSuites = new Set([
  "apparel-fit-preservation.test.ts", "credit-economy.test.ts", "generation-cost-optimization.test.ts",
  "generation-create-regression.test.ts", "generation-quality-benchmark.test.ts", "image-worker-durability.test.ts",
  "persisted-generation-benchmark-adapter.test.ts", "reference-validation-false-rejection.test.ts",
]);
const suites = readdirSync("tests", { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.test\.(?:ts|tsx)$/.test(entry.name) && !preflightSuites.has(entry.name))
  .map((entry) => `tests/${entry.name}`).sort();
if (!suites.length) throw new Error("No non-preflight test suites were discovered.");
const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "--test", ...suites], { stdio: "inherit" });
process.exit(result.status ?? 1);
