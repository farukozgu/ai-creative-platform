/** Browser fixture: real Studio UI, local in-memory actions, all external requests blocked. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const requirePackage = createRequire(import.meta.url);
const { build } = requirePackage("esbuild");
const { chromium } = requirePackage(process.env.VIDEO_QA_PLAYWRIGHT_MODULE ?? "playwright");
const directory = mkdtempSync(join(tmpdir(), "video-transaction-ui-"));
const messages = JSON.parse(readFileSync("src/messages/tr.json", "utf8"));
const studioCopy = messages.Dashboard.videoStudio;
const sourceId = "10000000-0000-4000-8000-000000000001";
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

const mockActions = `
  const sourceId=${JSON.stringify(sourceId)}, image=${JSON.stringify(image)};
  const storage=()=>JSON.parse(sessionStorage.getItem('fixture-video-jobs')||'{}');
  const write=jobs=>sessionStorage.setItem('fixture-video-jobs',JSON.stringify(jobs));
  const presentation=(id)=>({id,title:'Fixture',status:'ready',progressPhase:'ready',generationMode:'image',analysisRequested:false});
  export async function resolveIncomingVideoSource(){return {status:'success',asset:{id:sourceId,name:'Fixture jacket',previewUrl:image,generationId:sourceId,projectId:sourceId,createdAt:'2026-01-01',aspectRatio:'16:9'}}}
  export async function loadVideoSourceLibrary(){return {status:'success',assets:[]}}
  export async function quoteVideoGenerationAction(quality,duration,options){return {quality,duration,hasRegion:options.hasRegion,estimatedMaxCostUsd:0.7,rate:0.14,verifiedAt:new Date().toISOString(),director:null,analysis:{enabled:true,maximumEstimatedCostUsd:0.01,model:'gpt-4o-mini',pricingVersion:'fixture'}}}
  export async function quoteVideoSubmissionAction(draft){if(storage()[draft.clientSubmissionId])return {status:'used'};return {status:'success',cost:0.7,receipt:'receipt-'+draft.clientSubmissionId,expiresAt:Date.now()+120000}}
  export async function prepareVideoSourceAction(source,aspectRatio){return {status:'success',source:{kind:'uploaded-image',sourceAssetId:sourceId},previewUrl:image,aspectRatio,width:1920,height:1080,geometry:{originalWidth:1920,originalHeight:1080,contentRect:{x:0,y:0,width:1,height:1}}}}
  export async function submitVideoGenerationAction(draft,cost,receipt,approved){
    if(approved!==true||cost!==0.7||receipt!=='receipt-'+draft.clientSubmissionId)throw Error('Incorrect quote');
    const jobs=storage();if(jobs[draft.clientSubmissionId])return {ok:true,jobId:jobs[draft.clientSubmissionId],duplicate:true};
    const jobId='fixture-job-'+Object.keys(jobs).length;jobs[draft.clientSubmissionId]=jobId;write(jobs);
    return {ok:true,jobId,duplicate:false};
  }
  export async function restoreVideoGenerationBySubmissionAction(id){const job=storage()[id];return job?{status:'success',job:presentation(job)}:{status:'none'}}
  export async function restoreLatestVideoGenerationAction(){const id=sessionStorage.getItem('fixture-legacy-active');return id?{status:'success',submissionId:id,job:presentation('legacy-job')}:{status:'none'}}
  export async function readVideoGenerationStatusAction(id){return {status:'success',job:presentation(id)}}
  export async function listVideoGenerationsAction(){return {status:'success',records:[]}}
  export async function resumeVideoFidelityReviewAction(){}
  export async function createVideoSourceUploadAction(){throw Error('Unexpected upload')}
  export async function prepareVideoDirectorAction(){throw Error('Unexpected AI request')}
`;
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {NextIntlClientProvider} from 'next-intl';
    import {VideoStudioWorkspace} from './src/features/video/video-studio-workspace'; import './src/app/globals.css';
    const messages=${JSON.stringify(messages)};
    createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale='tr' messages={messages}>
      <div className='dashboard-shell' style={{height:'100dvh'}}><VideoStudioWorkspace incomingGenerationId=${JSON.stringify(sourceId)} generationAvailable proVideoEntitled recoveryScope=${JSON.stringify(sourceId)}/></div>
    </NextIntlClientProvider>);
  ` },
  outfile: join(directory, "app.js"), bundle: true, platform: "browser", jsx: "automatic", conditions: ["style"],
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
  plugins: [{ name: "mock-video-actions", setup(builder) {
    builder.onResolve({ filter: /dashboard\/video\/(?:generation-actions|director-actions|actions)$/ }, () => ({ path: "actions", namespace: "fixture" }));
    builder.onResolve({ filter: /@\/i18n\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onResolve({ filter: /@\/lib\/supabase\/client$/ }, () => ({ path: "supabase", namespace: "fixture" }));
    builder.onLoad({ filter: /^actions$/, namespace: "fixture" }, () => ({ loader: "js", contents: mockActions }));
    builder.onLoad({ filter: /^navigation$/, namespace: "fixture" }, () => ({ loader: "jsx", resolveDir: process.cwd(), contents: "import React from 'react'; export const Link=({href,children,...props})=><a href={href} {...props}>{children}</a>" }));
    builder.onLoad({ filter: /^supabase$/, namespace: "fixture" }, () => ({ loader: "js", contents: "export function createClient(){throw Error('Unexpected Supabase request')}" }));
  } }],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
let checks = 0;
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== "https://video-fixture.invalid") return route.abort();
      if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(directory, "app.js")) });
      if (url.pathname === "/app.css") return route.fulfill({ contentType: "text/css", body: readFileSync(join(directory, "app.css")) });
      return route.fulfill({ contentType: "text/html", body: '<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>' });
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://video-fixture.invalid/");
    const prompt = page.locator("textarea");
    await prompt.fill("Calm jacket film");
    await page.getByText(studioCopy.preparation.ready, { exact: true }).waitFor();
    await page.getByText(studioCopy.director.enable, { exact: true }).click();
    const analysisConsent = page.getByLabel(studioCopy.preservation.analysisOptIn, { exact: true });
    await analysisConsent.check();
    const generate = page.getByRole("button", { name: studioCopy.generate, exact: true });
    assert.equal(await generate.isEnabled(), false); checks++;
    await page.getByRole("button", { name: studioCopy.beta.prepareQuote, exact: true }).click();
    const confirmation = page.getByText(studioCopy.beta.confirmCost.replace("{cost}", "0.700000"), { exact: true });
    await confirmation.waitFor(); assert.equal(await generate.isEnabled(), false); checks++;
    await confirmation.click(); assert.equal(await generate.isEnabled(), true); checks++;
    await prompt.fill("Changed jacket direction");
    assert.equal(await generate.isEnabled(), false); checks++;
    assert.equal(await confirmation.count(), 0); checks++;
    await prompt.fill("Calm jacket film");
    const firstId = await page.locator("small").filter({ hasText: "Test istek kimliği:" }).innerText();
    await generate.click();
    if (mobile) await page.getByRole("button", { name: studioCopy.mobile.controls, exact: true }).click();
    await page.getByRole("button", { name: studioCopy.beta.newSubmission, exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("fixture-video-jobs") || "{}" )).length), 1); checks++;
    await page.reload();
    if (mobile) await page.getByRole("button", { name: studioCopy.mobile.controls, exact: true }).click();
    await page.getByRole("button", { name: studioCopy.beta.newSubmission, exact: true }).waitFor();
    assert.equal(await page.locator("small").filter({ hasText: "Test istek kimliği:" }).innerText(), firstId); checks++;
    await page.getByRole("button", { name: studioCopy.beta.newSubmission, exact: true }).click();
    assert.notEqual(await page.locator("small").filter({ hasText: "Test istek kimliği:" }).innerText(), firstId); checks++;
    assert.equal(await generate.isEnabled(), false); checks++;
    await prompt.fill("Second jacket film");
    await page.getByText(studioCopy.preparation.ready, { exact: true }).waitFor();
    await page.getByText(studioCopy.director.enable, { exact: true }).click();
    await analysisConsent.check();
    await page.getByRole("button", { name: studioCopy.beta.prepareQuote, exact: true }).click();
    await confirmation.waitFor(); assert.equal(await generate.isEnabled(), false); checks++;
    await confirmation.click(); await generate.click();
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("fixture-video-jobs") || "{}" )).length), 2); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); checks++;
    if (mobile) await page.getByRole("button", { name: studioCopy.mobile.controls, exact: true }).click();
    await page.getByRole("button", { name: studioCopy.beta.newSubmission, exact: true }).click();
    assert.equal(await analysisConsent.isChecked(), false); checks++;
    await page.evaluate(id => sessionStorage.setItem(`video-studio-submission-v1:${id}`, "30000000-0000-4000-8000-000000000003"), sourceId);
    await page.reload();
    if (mobile) await page.getByRole("button", { name: studioCopy.mobile.controls, exact: true }).click();
    await page.getByText(studioCopy.beta.restoreUnavailable, { exact: true }).first().waitFor();
    assert.equal(await generate.isEnabled(), false); checks++;
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("fixture-video-jobs") || "{}" )).length), 2); checks++;
    await page.evaluate(id => { sessionStorage.removeItem(`video-studio-submission-v1:${id}`); sessionStorage.setItem("fixture-legacy-active", "40000000-0000-4000-8000-000000000004"); }, sourceId);
    await page.reload();
    if (mobile) await page.getByRole("button", { name: studioCopy.mobile.controls, exact: true }).click();
    await page.getByRole("button", { name: studioCopy.beta.newSubmission, exact: true }).waitFor();
    assert.match(await page.locator("small").filter({ hasText: "Test istek kimliği:" }).innerText(), /40000000-0000-4000-8000-000000000004/); checks++;
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("fixture-video-jobs") || "{}" )).length), 2); checks++;
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, runtimeErrors: errors.length, scope: "Actual Studio; mocked actions; external network blocked" }));
} finally { await browser.close(); }
