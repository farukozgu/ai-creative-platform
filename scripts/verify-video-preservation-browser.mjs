/** Real, isolated browser QA against synthetic staging fixtures. No production dependency. */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const requirePackage = createRequire(import.meta.url);
const tr = JSON.parse(readFileSync("src/messages/tr.json", "utf8"));
const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));
export async function verifyPreservationBrowser({ email, password, synthetic, jobId, reviewJobId, directory, check }) {
  let server;
  try {
      const { chromium } = requirePackage(process.env.VIDEO_QA_PLAYWRIGHT_MODULE);
      server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"], { env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let logs = ""; server.stdout?.on("data", data => { logs = (logs + data.toString()).slice(-5000); }); server.stderr?.on("data", data => { logs = (logs + data.toString()).slice(-5000); });
      let ready = false;
      for (let i = 0; i < 120; i++) { try { const r = await fetch("http://127.0.0.1:3100/tr/login", { signal: AbortSignal.timeout(2000) }); if (r.ok) { ready = true; break; } } catch { /* Await our test server only. */ } await new Promise(done => setTimeout(done, 500)); }
      assert.ok(ready, logs);
      const browser = await chromium.launch({ channel: "chrome", headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.goto("http://127.0.0.1:3100/tr/login");
        await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password);
        await page.locator('button[type="submit"]').click(); await page.waitForURL("**/dashboard", { timeout: 45000 });
        const artifactDir = process.env.VIDEO_QA_ARTIFACT_DIR ?? directory; mkdirSync(artifactDir, { recursive: true });
        for (const locale of ["tr", "en"]) for (const theme of ["light", "dark"]) for (const mobile of [false, true]) {
          await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
          await page.goto(`http://127.0.0.1:3100/${locale}/dashboard/videos/${jobId}`);
          await page.evaluate(theme => { localStorage.setItem("klay-theme-preference", theme); window.dispatchEvent(new Event("storage")); }, theme);
          await page.getByRole("heading", { name: (locale === "tr" ? tr : en).Dashboard.videoDetail.fidelityAnalysis.title, exact: true }).waitFor();
          await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
          check(await page.evaluate(theme => getComputedStyle(document.querySelector(".dashboard-shell")).colorScheme === theme, theme), `${locale}/${theme}: actual theme applied`);
          check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${theme}/${mobile ? "mobile" : "desktop"}: no horizontal overflow`);
          await page.locator("video").evaluate(async video => { video.muted = true; await video.play(); video.pause(); });
          check(await page.locator("video").evaluate(video => !video.error && video.videoWidth === 1080 && video.videoHeight === 1920), `${locale}/${theme}/${mobile ? "mobile" : "desktop"}: portrait MP4 decodes`);
          await page.screenshot({ path: join(artifactDir, `detail-${locale}-${theme}-${mobile ? "mobile" : "desktop"}.png`), fullPage: true });
        }
        await page.goto(`http://127.0.0.1:3100/en/dashboard/videos/${reviewJobId}`);
        await page.getByRole("heading", { name: en.Dashboard.videoDetail.fidelityAnalysis.checksTitle, exact: true }).waitFor();
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "long mock report and status cards fit mobile");
        check(await page.getByText(en.Dashboard.videoDetail.fidelityAnalysis.statuses.unverified, { exact: true }).count() === 4, "unverified findings remain distinct from preservation");
        await page.screenshot({ path: join(artifactDir, "mock-analysis-cards-en-mobile.png"), fullPage: true });
        await page.goto(`http://127.0.0.1:3100/en/dashboard/videos/${jobId}`);
        await page.getByRole("button", { name: en.Dashboard.videoDetail.fidelityAnalysis.prepare, exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('figure img[src^="data:image"]').length === 9, { timeout: 45000 });
        check(true, "browser shows source, five frames and three labeled closeups");
        await page.screenshot({ path: join(artifactDir, "detail-frames-en-mobile.png"), fullPage: true });
        await page.goto("http://127.0.0.1:3100/tr/dashboard/video");
        check(await page.locator('input[name="video-generation-method"][value="source-motion"]').isChecked(), "real Studio defaults to source motion");
        const fixturePath = join(directory, "product.png"); writeFileSync(fixturePath, synthetic);
        await page.locator('input[type="file"]').setInputFiles(fixturePath);
        await page.getByText(tr.Dashboard.videoStudio.preservation.regionTitle, { exact: true }).click();
        await page.getByRole("button", { name: tr.Dashboard.videoStudio.preservation.regionSelect, exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByLabel(tr.Dashboard.videoStudio.preservation.declaredText, { exact: true }).fill("TEST 42");
        check(await page.locator('input[type="number"]').count() === 4, "critical region can be selected and edited by keyboard");
        await page.screenshot({ path: join(artifactDir, "studio-region-tr-mobile.png"), fullPage: true });
        await page.getByRole("button", { name: tr.Dashboard.videoStudio.generate, exact: true }).waitFor();
        await page.waitForFunction(label => [...document.querySelectorAll("button")].some(button => button.textContent?.trim() === label && !button.disabled), tr.Dashboard.videoStudio.generate, { timeout: 45000 });
        await page.getByRole("button", { name: tr.Dashboard.videoStudio.generate, exact: true }).click();
        await page.getByRole("link", { name: tr.Dashboard.videoStudio.beta.watchVideo, exact: true }).waitFor({ timeout: 60000 });
        check(true, "browser upload → preparation → local generation → watch link completes without AI");
        check(errors.length === 0, "no browser runtime/hydration errors: " + errors.join("; "));
        console.log(`Browser artifacts: ${artifactDir}`);
      } finally { await browser.close(); }

  } finally { server?.kill(); }
}
