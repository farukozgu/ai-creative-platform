import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";

// Opt-in check of an already-built app. Anonymous GETs only; no database fixtures or inference.
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((done, fail) => portProbe.close(error => error ? fail(error) : done()));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", OPENAI_BETA_ENABLED: "false", OPENAI_API_KEY: "", FAL_KEY: "",
    VIDEO_GENERATION_ENABLED: "false", VIDEO_RECONCILIATION_SCHEDULER_ENABLED: "false" },
  stdio: ["ignore", "ignore", "ignore"], windowsHide: true,
});
let startupError;
server.on("error", error => { startupError = error; });
let passed = 0;
const request = (path, headers = {}) => fetch(`${base}${path}`, { redirect: "manual", headers, signal: AbortSignal.timeout(10_000) });
const check = (condition, label) => { assert.ok(condition, label); passed++; console.log(`PASS ${label}`); };

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error("Next.js exited before runtime checks; run npm run build first.");
    try { await request("/api/model-reference/invalid"); ready = true; break; }
    catch { await new Promise(done => setTimeout(done, 100)); }
  }
  assert.ok(ready, "Built Next.js server did not start.");

  const defaultRoot = await request("/");
  check(defaultRoot.status === 307 && new URL(defaultRoot.headers.get("location"), base).pathname === "/tr", "default locale is Turkish");

  for (const locale of ["tr", "en"]) {
    const root = await request("/", { "accept-language": locale });
    check(root.status === 307 && new URL(root.headers.get("location"), base).pathname === `/${locale}`, `${locale}: root locale redirect`);
    const page = await request(`/${locale}`);
    const html = await page.text();
    check(page.status === 200 && html.includes(`lang="${locale}"`), `${locale}: homepage and HTML language`);
    const protectedPage = await request(`/${locale}/dashboard`);
    check(protectedPage.status === 307 && new URL(protectedPage.headers.get("location"), base).pathname === `/${locale}/login`, `${locale}: anonymous dashboard denial`);
  }

  const brokenCookie = await request("/tr/dashboard", { cookie: "sb-project-auth-token.0=base64-eyJhY2Nlc3NfdG9rZW4iOiI" });
  check(brokenCookie.status === 307 && (brokenCookie.headers.get("set-cookie") ?? "").includes("sb-project-auth-token.0=;"), "truncated auth cookie removed before session refresh");
  const privateImage = await request("/api/model-reference/invalid");
  check(privateImage.status === 404, "private reference API remains outside locale proxy");
  const manifest = await request("/manifest.webmanifest");
  check(manifest.status === 200 && (manifest.headers.get("content-type") ?? "").includes("manifest"), "manifest remains outside locale proxy");
  const image = await request("/_next/image?url=%2Fcreate%2Fhow-it-works-shirt-source.webp&w=256&q=75", { accept: "image/webp" });
  check(image.status === 200 && (image.headers.get("content-type") ?? "").startsWith("image/") && (await image.arrayBuffer()).byteLength > 0, "local image optimizer and native sharp decode");
  console.log(`Runtime smoke: ${passed}/${passed} passed. No authenticated mutations or AI requests.`);
} finally {
  server.kill();
}
