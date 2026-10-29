import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { canDeleteVideo } from '../src/lib/video-generation/deletion-policy';

test('video deletion waits for terminal generation and settled billing', () => {
  for (const status of ['queued', 'processing'] as const) assert.equal(canDeleteVideo({status,billingStatus:'finalized',errorCode:null}),false);
  for (const billingStatus of ['reserved','reconciliation_required'] as const) assert.equal(canDeleteVideo({status:'failed',billingStatus,errorCode:null}),false);
  assert.equal(canDeleteVideo({status:'failed',billingStatus:'released',errorCode:'provider_submission_ambiguous'}),false);
  for (const status of ['succeeded','failed'] as const) for(const billingStatus of ['finalized','released','not_configured'] as const) assert.equal(canDeleteVideo({status,billingStatus,errorCode:null}),true);
});

test('delete action enforces ownership, media boundaries and failure handling', async () => {
  const result = await build({entryPoints:['src/app/[locale]/dashboard/video/delete-actions.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-boundaries',setup(builder){
    builder.onResolve({filter:/@\/lib\/(auth\/require-user|supabase\/admin|video-generation\/supabase-repository)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('require-user')?'export async function getAuthenticatedUserId(){return globalThis.deletionFixture.owner}':args.path.endsWith('supabase-repository')?'export class SupabaseVideoJobRepository{async findOwned(owner,id){globalThis.deletionFixture.lookup=[owner,id];return globalThis.deletionFixture.job}}':'export function getSupabaseAdminClient(){return globalThis.deletionFixture.client}'}));
  }}]});
  const {deleteVideoAction}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const id='10000000-0000-4000-8000-000000000001',owner='20000000-0000-4000-8000-000000000002';
  const calls: unknown[][]=[];
  const query={delete(){calls.push(['delete']);return this},eq(...args:unknown[]){calls.push(['eq',...args]);return this},in(...args:unknown[]){calls.push(['in',...args]);return this},select(){return this},async maybeSingle(){return {data:{id},error:null}}};
  const fixture={owner:owner as string|null,job:{status:'succeeded',billingStatus:'finalized',errorCode:null,outputBucketId:'generated-videos',outputObjectPath:owner+'/'+id+'/output.mp4'},client:{async rpc(name:string,args:Record<string,string>){calls.push(['rpc',name,args]);return {data:true,error:null}},from(table:string){calls.push(['from',table]);return query},storage:{from(bucket:string){calls.push(['bucket',bucket]);return {async remove(paths:string[]){calls.push(['remove',...paths]);return {error:null}}}}}}};
  Object.assign(globalThis,{deletionFixture:fixture});
  try {
    fixture.owner=null;assert.equal((await deleteVideoAction(id)).status,'error');assert.equal(calls.length,0);
    fixture.owner=owner;assert.equal((await deleteVideoAction('invalid')).status,'error');assert.equal(calls.length,0);
    fixture.job.outputObjectPath='another-owner/output.mp4';assert.equal((await deleteVideoAction(id)).status,'error');assert.equal(calls.length,0);
    fixture.job.outputObjectPath=owner+'/'+id+'/output.mp4';fixture.job.billingStatus='reserved';assert.equal((await deleteVideoAction(id)).status,'busy');assert.equal(calls.length,0);
    fixture.job.billingStatus='finalized';assert.equal((await deleteVideoAction(id)).status,'success');
    assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['rpc','delete_owned_settled_video',{p_owner_id:owner,p_job_id:id}])));
    assert.ok(calls.findIndex(call=>call[0]==='remove')<calls.findIndex(call=>call[0]==='rpc'));
    assert.deepEqual(calls.filter(call=>call[0]==='from'),[]);
  } finally {Reflect.deleteProperty(globalThis,'deletionFixture');}
});
