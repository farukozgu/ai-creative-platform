/** Isolated UI QA of the real panel with mocked actions. Never reads credentials or calls providers. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const requirePackage = createRequire(import.meta.url);
const { build } = requirePackage("esbuild"); // Existing tsx development toolchain.
const { chromium } = requirePackage(process.env.VIDEO_QA_PLAYWRIGHT_MODULE ?? "playwright");
const directory = mkdtempSync(join(tmpdir(), "video-director-ui-"));
const artifactDirectory = process.env.VIDEO_QA_ARTIFACT_DIR ?? directory;
mkdirSync(artifactDirectory, { recursive: true });
const messages = Object.fromEntries(["tr", "en"].map(locale => [locale, {
  Dashboard: { videoStudio: { director: JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).Dashboard.videoStudio.director } },
}]));
const productionCssDirectory = ".next/static/css";
const productionCss = existsSync(productionCssDirectory) ? readdirSync(productionCssDirectory).filter(file => file.endsWith(".css"))
  .map(file => readFileSync(join(productionCssDirectory, file), "utf8")).join("\n") : "";
const fontCss = ["Regular", "Medium", "SemiBold", "Bold"].map((name, index) =>
  `@font-face{font-family:Poppins;src:url(data:font/ttf;base64,${readFileSync(`public/poppins/Poppins-${name}.ttf`).toString("base64")}) format('truetype');font-weight:${400 + index * 100};font-style:normal}`
).join("\n");
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {NextIntlClientProvider} from 'next-intl';
    import {VideoDirectorPanel} from './src/features/video/video-director-panel';
    import './src/app/globals.css';
    const messages=${JSON.stringify(messages)};
    const locale=window.fixtureLocale||'tr';
    function Harness(){
      const [ready,setReady]=useState(false),[duration,setDuration]=useState(5);
      const draft={clientSubmissionId:'20000000-0000-4000-8000-000000000001',mode:'image',prompt:'Quiet campaign film',quality:'standard',aspectRatio:'16:9',durationSeconds:duration,cameraMovement:'static',source:{kind:'uploaded-image',sourceAssetId:'10000000-0000-4000-8000-000000000001'}};
      return <NextIntlClientProvider locale={locale} messages={messages[locale]}>
        <main className='dashboard-shell' style={{display:'block',padding:'1rem',height:'100dvh',overflow:'auto',fontFamily:'Poppins', '--font-poppins':'Poppins'}}>
          <div style={{maxWidth:'22.5rem'}}>
            <VideoDirectorPanel key={duration} draft={draft} draftKey={JSON.stringify(draft)} disabled={false}
              quote={{model:'gpt-4o-mini',pricingVersion:'fixture',maximumEstimatedCostUsd:0.00627,inputTokenLimit:32998,maximumImages:6}}
              onPrepared={value=>setReady(Boolean(value))}/>
            <button id='generate' disabled={!ready}>Fixture generate</button>
            <button id='change' onClick={()=>{setReady(false);setDuration(10)}}>Fixture duration</button>
          </div>
        </main>
      </NextIntlClientProvider>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  ` },
  outfile: join(directory, "app.js"), bundle: true, platform: "browser", jsx: "automatic", conditions: ["style"],
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  plugins: [{ name: "mock-director-actions", setup(builder) {
    builder.onResolve({ filter: /dashboard\/video\/director-actions$/ }, () => ({ path: "fixture", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ resolveDir: process.cwd(), loader: "ts", contents: `
      import {fallbackDirectorPlan} from './src/lib/video-director/core';
      export async function prepareVideoDirectorAction(draft,presetId,shotMode,approval){
        window.fixtureCalls=(window.fixtureCalls||0)+1;
        return {status:'success',plan:{...fallbackDirectorPlan({draft,presetId,shotMode,profile:null}),origin:approval?'ai':'fallback'},receipt:'fixture-only'};
      }
    ` }));
  } }],
});
let browser;
const errors = [];
let checks = 0;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const locale of ["tr", "en"]) for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    await page.route("**/*", route => route.abort());
    page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
    await page.setContent('<html><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: readFileSync(join(directory, "app.css"), "utf8") });
    await page.addStyleTag({ content: productionCss + fontCss });
    await page.evaluate(value => { window.fixtureLocale = value; }, locale);
    await page.addScriptTag({ content: readFileSync(join(directory, "app.js"), "utf8") });
    const copy = messages[locale].Dashboard.videoStudio.director;
    await page.getByRole("heading", { name: copy.title, exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: copy.prepare, exact: true }).isEnabled(), false); checks++;
    await page.locator('input[name="video-director-mode"]').nth(1).focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator('input[name="video-director-mode"]').nth(1).isChecked(), true); checks++;
    assert.ok(await page.locator('input[name="video-director-mode"]').nth(1).evaluate(element => getComputedStyle(element).outlineStyle !== "none")); checks++;
    await page.getByRole("button", { name: copy.fallbackButton, exact: true }).click();
    await page.getByRole("heading", { name: copy.fallbackPlan, exact: true }).waitFor();
    assert.equal(await page.locator("article li").count(), 3); checks++;
    assert.equal(await page.locator("#generate").isEnabled(), true); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks++;
    await page.locator('input[name="video-director-preset"]').first().focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#generate").isEnabled(), false); checks++;
    await page.locator('input[type="checkbox"]').focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: copy.prepare, exact: true }).click();
    await page.getByRole("heading", { name: copy.aiPlan, exact: true }).waitFor(); checks++;
    await page.screenshot({ path: join(artifactDirectory, `${locale}-${mobile ? "mobile" : "desktop"}.png`), fullPage: true });
    await page.locator("#change").click();
    assert.equal(await page.locator("#generate").isEnabled(), false); checks++;
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, consoleErrors: errors.length, directory: artifactDirectory, scope: "Actual panel; mocked actions; external network blocked" }));
} finally {
  await browser?.close();
}
