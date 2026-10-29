/** Real Studio components with in-memory actions. Never calls a provider or reads credentials.
 * VIDEO_QA_PLAYWRIGHT_MODULE may point to an existing Playwright installation.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium } = require(process.env.VIDEO_QA_PLAYWRIGHT_MODULE ?? "playwright");
const directory = mkdtempSync(join(tmpdir(), "video-studio-design-"));
execFileSync(require('ffmpeg-static'), ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=5','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-y',join(directory,'fixture.mp4')]);
const artifacts = process.env.VIDEO_QA_ARTIFACT_DIR ?? directory;
mkdirSync(artifacts, { recursive: true });
const messages = Object.fromEntries(["tr", "en"].map(locale => [locale, JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"))]));
const sourceId = "10000000-0000-4000-8000-000000000001";
const mockActions = `
  import {fallbackDirectorPlan} from './src/lib/video-director/core';
  const sourceId=${JSON.stringify(sourceId)};
  const asset={id:sourceId,name:'Campaign product',previewUrl:'/workspace-demo/fashion/campaign.webp',generationId:sourceId,projectId:sourceId,createdAt:'2026-10-28',aspectRatio:'16:9'};
  export async function resolveIncomingVideoSource(){return {status:'success',asset}}
  export async function loadVideoSourceLibrary(){return {status:'success',assets:[asset]}}
  export async function quoteVideoGenerationAction(quality,duration,options){return {quality,duration,hasRegion:options.hasRegion,estimatedMaxCostUsd:quality==='pro'?1.4:0.7,rate:0.14,director:{maximumEstimatedCostUsd:0.00627,pricingVersion:'fixture'},analysis:{enabled:false,maximumEstimatedCostUsd:null}}}
  export async function prepareVideoSourceAction(source,aspectRatio){return {status:'success',source:{kind:'uploaded-image',sourceAssetId:sourceId},previewUrl:asset.previewUrl,aspectRatio,width:1536,height:1024,presetContext:{category:'apparel',evidence:['glossy coated fabric','two visible front buttons','belted jacket silhouette']},geometry:{originalWidth:1536,originalHeight:1024,contentRect:{x:0,y:0,width:1,height:1}}}}
  export async function createVideoSourceUploadAction(){return {status:'success',sourceAssetId:sourceId,objectPath:'fixture',token:'fixture'}}
  export async function restoreLatestVideoGenerationAction(){return {status:'none'}}
  export async function restoreVideoGenerationBySubmissionAction(){return {status:'none'}}
  export async function prepareVideoDirectorAction(draft,presetId,shotMode,existingReceipt){window.fixturePlans=(window.fixturePlans||0)+1;return {status:'success',analysisStatus:'verified',plan:{...fallbackDirectorPlan({draft,presetId,shotMode,profile:null}),origin:existingReceipt?'ai':'fallback'},receipt:'plan-fixture'}}
  export async function quoteVideoSubmissionAction(draft){window.fixtureQuotes=(window.fixtureQuotes||0)+1;return {status:'success',cost:draft.quality==='pro'?1.4:0.7,receipt:'quote-fixture',expiresAt:Date.now()+(window.fixtureExpiry||120000),preview:{referenceReviews:[],references:[],mode:draft.shotMode,shotType:draft.shotMode==='multi'?'customize':null,shots:[{duration:draft.durationSeconds,camera:'Locked camera',prompt:'Source-visible product'}]}}}
  export async function submitVideoGenerationAction(draft,cost,receipt,approved){if(!approved||receipt!=='quote-fixture')throw Error('Missing explicit approval');window.fixtureSubmissions=(window.fixtureSubmissions||0)+1;if(window.fixtureReject)return {ok:false,code:'budget_limit_reached'};return {ok:true,jobId:'fixture-job'}}
  export async function readVideoGenerationStatusAction(id){const phase=window.fixturePhase||'queued';return {status:'success',job:{id,title:'Campaign video',status:phase==='storage-retry'?'processing':phase,progressPhase:phase,errorCode:phase==='storage-retry'?'output_persistence_failure':null,generationMode:'image',analysisRequested:false}}}
  export async function resumeVideoFidelityReviewAction(){}
  export async function getVideoPlaybackAccessAction(){return {status:'success',url:"/fixture.mp4",expiresInSeconds:300}}
`;
await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';
    import {VideoStudioWorkspace} from './src/features/video/video-studio-workspace';
    import {Button,buttonStyles} from './src/components/ui/button';
    import {SectionHeading} from './src/components/ui/section-heading';
    import {LoginForm} from './src/components/auth/login-form';
    import {ModelLibrary} from './src/features/models/model-library';
    import styles from './src/features/video/video-studio-workspace.module.css';
    const locale=new URLSearchParams(location.search).get('locale')||'tr';
    const messages=${JSON.stringify(messages)};
    const surface=new URLSearchParams(location.search).get('surface');
    function System(){
      const [count,setCount]=React.useState(0),[selected,setSelected]=React.useState(false);
      const tr=locale==='tr';
      return <main style={{padding:'clamp(1rem,4vw,3rem)',maxWidth:'75rem',margin:'auto'}}>
        <SectionHeading as='h1' title='KLAY AI' description={tr?'Ürününüzden yaratıcı bir kampanyaya.':'From your product to a creative campaign.'}/>
        <p className='type-body' style={{marginBlock:'2rem'}}>Çığ, ışık, özgün ürünler — Ğğ İı Şş Çç Öö Üü · Creative campaign · 0123456789</p>
        <section style={{display:'grid',gap:'1.5rem',paddingBlock:'1rem'}}>
          <h2 className='type-heading-2'>{tr?'Her aksiyonun bir rolü var.':'Every action has a purpose.'}</h2>
          <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'1rem'}}>
            <Button id='primary'>{tr?'Video oluştur':'Create video'}</Button>
            <Button id='secondary' variant='secondary'>{tr?'Taslağı kaydet':'Save draft'}</Button>
            <Button id='ghost' variant='ghost' onClick={()=>setCount(v=>v+1)}>{tr?'Vazgeç':'Cancel'}</Button>
            <Button id='outline' variant='outline' aria-pressed={selected} onClick={()=>setSelected(v=>!v)}>{tr?'Seçenek':'Option'}</Button>
            <Button variant='destructive'>{tr?'Projeyi sil':'Delete project'}</Button>
            <Button variant='icon' id='icon' shape='round' aria-label={tr?'Önizleme':'Preview'}><svg viewBox='0 0 24 24' fill='none' stroke='currentColor'><path d='m8 5 11 7-11 7Z'/></svg></Button>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'1rem'}}>
            <Button id='small' size='sm'>Small</Button><Button id='medium' size='md'>Medium</Button><Button id='large' size='lg'>Large</Button>
            <Button id='loading' loading loadingLabel={tr?'Hazırlanıyor…':'Preparing…'}>Create</Button>
            <Button id='disabled' disabled onClick={()=>setCount(v=>v+1)}>{tr?'Kullanılamıyor':'Unavailable'}</Button>
          </div>
          <form onSubmit={event=>{event.preventDefault();setCount(v=>v+1)}}><Button id='submit' type='submit' variant='secondary'>{tr?'Kaydet':'Save'}</Button></form>
          <a id='styled-link' className={buttonStyles({variant:'secondary'})} href={'/'+locale+'/dashboard'}>{tr?'Çalışma alanına dön':'Back to workspace'}</a>
          <output id='click-count'>{count}</output>
          <p className='type-small'>{tr?'Başlıklar: Bricolage Grotesque · Arayüz: Onest':'Headings: Bricolage Grotesque · Interface: Onest'}</p>
        </section>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {surface==='system'?<System/>:surface==='login'?<main className='signup-form-panel'><LoginForm/></main>:surface==='models'?<div className='dashboard-shell' style={{display:'block'}}><ModelLibrary records={[]} locale={locale}/></div>:<div className={'dashboard-shell '+styles.videoFrame} data-collapsed>
        <div aria-hidden='true'/><div className={styles.videoContent}>
          <header className='dashboard-topbar'><div className='dashboard-topbar-inner dashboard-container'>KLAY AI</div></header>
          <VideoStudioWorkspace generationAvailable recoveryScope='design-fixture'/>
        </div>
      </div>}</NextIntlClientProvider>);
  ` },
  outfile: join(directory, "app.js"), bundle: true, platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  plugins: [{ name: "fixture-boundaries", setup(builder) {
    builder.onResolve({ filter: /dashboard\/video\/(?:generation-actions|director-actions|actions)$/ }, () => ({ path: "actions", namespace: "fixture" }));
    builder.onResolve({ filter: /@\/i18n\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onResolve({ filter: /@\/lib\/supabase\/client$/ }, () => ({ path: "supabase", namespace: "fixture" }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "fixture" }));
    builder.onLoad({ filter: /^actions$/, namespace: "fixture" }, () => ({ loader: "ts", contents: mockActions, resolveDir: process.cwd() }));
    builder.onLoad({ filter: /^navigation$/, namespace: "fixture" }, () => ({ loader: "jsx", resolveDir: process.cwd(), contents: "import React from 'react';export const Link=({children,...props})=><a {...props}>{children}</a>;export const useRouter=()=>({replace(){},refresh(){},push(){}})" }));
    builder.onLoad({ filter: /^supabase$/, namespace: "fixture" }, () => ({ loader: "js", contents: "export function createClient(){return {storage:{from:()=>({uploadToSignedUrl:async()=>({error:null})})}}}" }));
    builder.onLoad({ filter: /^image$/, namespace: "fixture" }, () => ({ loader: "jsx", resolveDir: process.cwd(), contents: "import React from 'react';export default function Image({fill,sizes,...props}){return <img {...props} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:undefined}/>}" }));
  } }],
});

const productionCss = (await require("postcss")([require("@tailwindcss/postcss")()])
  .process(readFileSync("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") })).css;
const fontCss = [['Onest','onest','100 900'],['Bricolage Grotesque','bricolage-grotesque','200 800']].map(([name,file,weight]) => `@font-face{font-family:'${name}';src:url(data:font/ttf;base64,${readFileSync(`public/fonts/${file}-variable.ttf`).toString('base64')});font-weight:${weight};font-display:swap}`).join('\n');
const base = "https://video-studio.test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
let checks = 0;
const errors = [];
let lastPage;
async function openFixture(locale,width,surface='video',reducedMotion='reduce') {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion, isMobile: width < 640, hasTouch: width < 640 });
    lastPage = page;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html data-theme='light' lang='${locale}'><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${productionCss}\n${fontCss}\n${readFileSync(join(directory,'app.css'),'utf8')}\nbody{margin:0;font-family:Onest;--font-sans:Onest;--font-heading:'Bricolage Grotesque'}</style></head><body><div id='root'></div><script src='/app.js'></script></body></html>` });
      const path = url.pathname === '/app.js' ? join(directory,'app.js') : url.pathname === '/fixture.mp4' ? join(directory,'fixture.mp4') : resolve('public','.'+url.pathname);
      if (!existsSync(path)) return route.fulfill({status:404, body:''});
      return route.fulfill({contentType:extname(path)==='.js'?'text/javascript':extname(path)==='.mp4'?'video/mp4':'image/webp',body:readFileSync(path)});
    });
    await page.goto(`${base}/?locale=${locale}&surface=${surface}`);

    await page.evaluate(() => document.fonts.ready);
    return page;
}
try {
  for (const locale of ["tr", "en"]) for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await openFixture(locale,width);
    const copy = messages[locale].Dashboard.videoStudio;
    await page.getByRole("heading", { name: copy.title, exact: true }).waitFor();
    await page.locator('input[name="video-director-preset"]').first().waitFor({ state: "attached" });
    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth);
    assert.ok(await overflow(), `Initial overflow: ${locale} ${width}`); checks++;
    assert.equal(await page.getByRole("button", { name: copy.generate, exact: true }).isEnabled(), false); checks++;
    assert.equal(await page.locator('input[name="video-director-preset"]').count(), 6); checks++;
    assert.equal(await page.locator('details').first().getAttribute('open'), null); checks++;
    if (width === 1440) {
      const controls = await page.locator('#video-studio-inspector').boundingBox();
      const preview = await page.locator('#video-studio-canvas').boundingBox();
      assert.ok(controls.width > 500 && preview.width > 450 && preview.x > controls.x + controls.width); checks++;
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: join(artifacts, `${locale}-${width}-empty.png`) });
    // Select library source, then use the native radio keyboard interaction.
    await page.locator('#video-source-library-toggle').click();
    await page.getByRole("button", { name: `${copy.source.selectAsset}: Campaign product` }).click();
    await page.getByRole('button', { name: copy.director.prepare, exact: true }).waitFor();
    await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === label && !button.disabled), copy.director.prepare);
    assert.equal(await page.getByRole("textbox", { name: copy.prompt.image.heading }).inputValue(), ''); checks++;
    const filter = page.getByRole('combobox', { name: copy.director.library.filter });
    await filter.selectOption('all');
    assert.equal(await page.locator('input[name="video-director-preset"]').count(), 6); checks++;
    await page.getByRole('button', { name: copy.director.library.next, exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.locator('input[value="elegant-orbit"]').waitFor({ state: 'attached' }); checks++;
    await page.locator('input[value="elegant-orbit"]').focus(); await page.keyboard.press('Space');
    await page.getByText(copy.director.library.risks['unseen-surfaces'], { exact: true }).waitFor(); checks++;
    await filter.selectOption('furniture');
    assert.ok(await page.locator('input[name="video-director-preset"]').count() <= 6); checks++;
    await filter.selectOption('all');
    const macro = page.locator('input[name="video-director-preset"]').nth(1);
    await macro.focus(); await page.keyboard.press("Space");
    assert.ok(await macro.isChecked()); checks++;
    assert.ok(await macro.evaluate(input => getComputedStyle(input.nextElementSibling).outlineStyle !== 'none')); checks++;
    await page.getByRole("textbox", { name: copy.prompt.image.heading }).fill("Slow cinematic push toward the product.");
    await page.locator('summary').filter({ hasText: copy.advancedSettings }).click();
    await page.locator('input[name="video-director-mode"]').nth(1).locator('..').click();
    await page.locator('summary').filter({ hasText: copy.advancedSettings }).click();
    await page.getByRole("button", { name: copy.director.prepare, exact: true }).click();
    await page.getByRole("heading", { name: copy.director.fallbackPlan, exact: true }).waitFor();
    assert.equal(await page.locator('article > ol > li h4').count(), 2); checks++;
    await page.getByRole("button", { name: copy.beta.prepareQuote, exact: true }).click();
    const consent = page.getByRole('checkbox', { name: copy.beta.confirmCost.replace('{cost}', '0.700000') });
    await consent.waitFor();
    assert.equal(await page.getByRole("button", { name: copy.generate, exact: true }).isEnabled(), false); checks++;
    await consent.check();
    assert.ok(await page.getByRole("button", { name: copy.generate, exact: true }).isEnabled()); checks++;
    assert.ok(await overflow(), `Planned overflow: ${locale} ${width}`); checks++;
    // Every creative edit invalidates the plan and quote, even if reverted.
    await page.locator('input[name="video-duration"]').nth(1).locator('..').click();
    assert.equal(await page.getByRole("button", { name: copy.generate, exact: true }).isEnabled(), false); checks++;
    assert.equal(await page.locator('article > ol > li h4').count(), 0); checks++;
    await page.getByRole("button", { name: copy.director.prepare, exact: true }).click();
    await page.getByRole("heading", { name: copy.director.fallbackPlan, exact: true }).waitFor();
    await page.getByRole("button", { name: copy.beta.prepareQuote, exact: true }).click();
    await consent.check();
    if (width === 390 || width === 1440) {
      await page.getByRole('heading', { name: copy.director.planHeading, exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(artifacts, `${locale}-${width}-storyboard.png`) });
    }
    await page.clock.install();
    await page.evaluate(() => { window.fixturePhase='storage-retry'; });
    await page.getByRole("button", { name: copy.generate, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: copy.beta.storageRetry }).waitFor(); checks++;
    assert.equal(await page.locator('video[controls]').count(), 0); checks++;
    await page.evaluate(() => { window.fixturePhase='ready'; });
    await page.clock.runFor(8_100);
    await page.locator('video[controls]').waitFor();
    assert.equal(await page.evaluate(() => window.fixtureSubmissions), 1); checks++;
    assert.ok(await overflow(), `Result overflow: ${locale} ${width}`); checks++;
    const video=page.locator('video');
    await video.evaluate(async v => { await v.play(); v.pause(); }); checks++;
    if (width === 390 || width === 1440) await page.screenshot({ path: join(artifacts, `${locale}-${width}-result.png`) });
    // Verify both themes with the completed layout.
    await page.evaluate(() => document.documentElement.dataset.theme='dark');
    assert.ok(await overflow()); checks++;
    await page.close();
  }
  for (const locale of ["tr", "en"]) for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
    const page = await openFixture(locale, width, "system", "no-preference");
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.waitForFunction(() => { const el = document.getElementById('primary'); return getComputedStyle(el).color !== '' && el.getAnimations().length === 0; });
    assert.ok(await page.evaluate(() => document.fonts.check('600 20px "Bricolage Grotesque"', 'ÇĞİÖŞÜçğıöşü') && document.fonts.check('400 16px Onest', 'ÇĞİÖŞÜçğıöşü'))); checks++;
    assert.ok((await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily)).includes('Bricolage')); checks++;
    assert.ok((await page.locator('#primary').evaluate(el => getComputedStyle(el).fontFamily)).includes('Onest')); checks++;
    const contrast = await page.locator('#primary').evaluate(el => {
      const luminance = value => {
        const rgb = value.match(/[\d.]+/g).slice(0,3).map(Number).map(v => v/255).map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
        return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
      };
      const style=getComputedStyle(el),a=luminance(style.color),b=luminance(style.backgroundColor);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
    assert.ok(contrast >= 4.5, `Primary text contrast: ${contrast}`); checks++;
    const before = await page.locator('#primary').boundingBox();
    const sibling = await page.locator('#secondary').boundingBox();
    if (width > 640) {
      await page.locator('#primary').hover();
      await page.waitForFunction(() => getComputedStyle(document.getElementById('primary')).transform === 'matrix(1, 0, 0, 1, 0, -1)');
      const after = await page.locator('#primary').boundingBox();
      assert.equal(before.width, after.width); assert.equal(before.height, after.height); checks += 2;
      assert.equal((await page.locator('#secondary').boundingBox()).x, sibling.x); checks++;
    }
    await page.locator('#ghost').focus();
    assert.equal(await page.locator('#ghost').evaluate(el => getComputedStyle(el).outlineWidth), '2px'); checks++;
    await page.keyboard.press('Space');
    await page.locator('#submit').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#click-count').innerText(), '2'); checks++;
    await page.locator('#disabled').evaluate(el => el.click());
    assert.equal(await page.locator('#click-count').innerText(), '2'); checks++;
    assert.equal(await page.locator('#loading').getAttribute('aria-busy'), 'true'); checks++;
    assert.ok(await page.locator('#loading').isDisabled()); checks++;
    await page.locator('#outline').click();
    assert.equal(await page.locator('#outline').getAttribute('aria-pressed'), 'true'); checks++;
    assert.equal(await page.locator('#styled-link').getAttribute('href'), `/${locale}/dashboard`); checks++;
    const icon = await page.locator('#icon').boundingBox();
    assert.equal(icon.width, icon.height); assert.ok(icon.height >= 44); checks += 2;
    assert.equal((await page.locator('#small').boundingBox()).height, width < 640 ? 44 : 36); checks++;
    assert.equal((await page.locator('#medium').boundingBox()).height, 44); checks++;
    assert.equal((await page.locator('#large').boundingBox()).height, 52); checks++;
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); checks++;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (width > 640) {
      await page.locator('#primary').hover();
      assert.equal(await page.locator('#primary').evaluate(el => getComputedStyle(el).transform), 'none'); checks++;
    }
    assert.equal(await page.locator('#primary').evaluate(el => getComputedStyle(el).transitionDuration), '0s'); checks++;
    assert.equal(await page.locator('#loading .ui-button__spinner').evaluate(el => getComputedStyle(el).animationName), 'none'); checks++;
    await page.screenshot({ path: join(artifacts, `${locale}-${width}-${theme}-design-system.png`), fullPage: true });
    await page.close();
    for (const surface of ['login','models']) {
      const actual = await openFixture(locale,width,surface);
      await actual.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await actual.locator('h1').waitFor();
      assert.ok(await actual.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${surface} ${locale} ${width}`); checks++;
      assert.ok(await actual.locator('.ui-button--primary').count()); checks++;
      if (surface === 'login') {
        const input = await actual.locator('input[type="password"]').boundingBox();
        const toggle = await actual.locator('.signup-password-toggle').boundingBox();
        assert.ok(Math.abs(input.y + input.height/2 - toggle.y - toggle.height/2) < 1); checks++;
        await actual.locator('.signup-password-toggle').click();
        assert.equal(await actual.locator('#login-password').getAttribute('type'), 'text'); checks++;
        await actual.locator('.signup-password-toggle').click();
        await actual.locator('button[type="submit"]').click();
        assert.equal(await actual.locator('input[type="email"]').getAttribute('aria-invalid'), 'true'); checks++;
      }
      await actual.screenshot({ path: join(artifacts, `${locale}-${width}-${theme}-${surface}.png`), fullPage: true });
      await actual.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, consoleErrors: errors.length, artifacts, scope: 'Real UI; mocked paid actions; local assets; external network blocked' }));
} catch(error) {
  console.error(JSON.stringify({errors,text:await lastPage?.locator('body').innerText()}));
  await lastPage?.screenshot({path:join(artifacts,'failure.png'),fullPage:true});
  throw error;
} finally { await browser.close(); }
