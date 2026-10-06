import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ff,inspect,alignSource,sourceFile,probe,extract,run} from '../src/media.js';
import {paidCache} from '../src/provider-cache.js';
import {context,HttpError,publicError} from '../src/runtime.js';
import {validateBatch} from '../src/providers.js';
import {responsePayload,ApiError} from '../../web/lib/api-error.js';

async function temporary(work:(root:string)=>Promise<void>){const root=await fs.mkdtemp(path.join(os.tmpdir(),'shortkinomn-test-'));try{await work(root);}finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('shortkinomn-test-'));await fs.rm(root,{recursive:true,force:true});}}
function pcmData(wav:Buffer){for(let offset=12;offset+8<wav.length;){const size=wav.readUInt32LE(offset+4);if(wav.toString('ascii',offset,offset+4)==='data')return wav.subarray(offset+8,offset+8+size);offset+=8+size+(size%2);}throw Error('WAV data not found');}
function rms(pcm:Buffer,start:number,end:number){let sum=0,count=0;for(let i=Math.round(start*16000)*2;i<Math.min(pcm.length,Math.round(end*16000)*2);i+=2){sum+=pcm.readInt16LE(i)**2;count++;}return Math.sqrt(sum/count);}

for(const kind of ['late audio','early audio','shared nonzero origin'] as const)test(`A/V alignment accepts ${kind} and preserves audible timing`,()=>temporary(async root=>{
  const source=path.join(root,'source.video');
  const args:string[]=[];
  if(kind==='early audio')args.push('-itsoffset','0.5');
  args.push('-f','lavfi','-i','color=c=black:s=160x90:r=25:d=4');
  if(kind==='late audio')args.push('-itsoffset','0.5');
  args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-map','0:v:0','-map','1:a:0');
  if(kind==='early audio')args.push('-af',"volume=0:enable='lt(t,1)'");
  if(kind==='shared nonzero origin')args.push('-output_ts_offset','5');
  await ff(...args,'-c:v','libx264','-c:a','pcm_s16le','-f','matroska',source);
  const before=await probe(source);assert.ok(before.streams.some((s:{start_time:string})=>Number(s.start_time)>.02));
  const seconds=await inspect(source);await alignSource(root,seconds);
  const output=await sourceFile(root);assert.notEqual(output,source);
  const after=await probe(output);for(const stream of after.streams)assert.ok(Math.abs(Number(stream.start_time||0))<.025);
  const audio=path.join(root,'speech.wav');await extract(output,audio);const pcm=pcmData(await fs.readFile(audio));
  if(kind!=='shared nonzero origin'){assert.ok(rms(pcm,.08,.25)<30,'Leading gap must remain silent');assert.ok(rms(pcm,.7,.9)>1000,'Original tone must begin after the preserved offset');}
  else assert.ok(rms(pcm,.1,.3)>1000,'Common start offset must not insert five seconds of silence');
  const first=(await fs.stat(output)).mtimeMs;await alignSource(root,seconds);assert.equal((await fs.stat(output)).mtimeMs,first,'Completed alignment is reused');
}));

test('FFmpeg process cancellation settles after process close',async()=>{const controller=new AbortController();const promise=run(process.execPath,['-e','setInterval(()=>{},1000)'],60000,controller.signal);controller.abort();await assert.rejects(promise,{name:'AbortError'});});
test('unknown server errors do not expose private messages',()=>{const error=publicError(Error('secret token and transcript'));assert.equal(error.status,500);assert.ok(!error.message.includes('secret'));});
test('HTML, empty, legacy, and structured errors preserve HTTP status and request ID',()=>{
  for(const body of ['<h1>private upstream error</h1>','','oops'])assert.throws(()=>responsePayload(body,503,'trace'),(e:unknown)=>e instanceof ApiError&&e.status===503&&e.requestId==='trace'&&!e.message.includes('private'));
  assert.throws(()=>responsePayload(JSON.stringify({error:{code:'UPLOAD_FAILED',message:'Файл буруу',requestId:'job-trace'}}),422), (e:unknown)=>e instanceof ApiError&&e.code==='UPLOAD_FAILED'&&e.requestId==='job-trace');
  assert.throws(()=>responsePayload('{"error":"Old server"}',400),/Old server/);
  assert.equal(responsePayload('',204),undefined);
});
test('ambiguous paid calls are blocked on retry until explicitly approved, then cached',()=>temporary(async root=>{
  const file=path.join(root,'response.json');let calls=0;
  await assert.rejects(()=>paidCache(file,async()=>{calls++;throw Error('connection lost');}), (e:unknown)=>e instanceof HttpError&&e.code==='PROVIDER_OUTCOME_UNKNOWN');
  await assert.rejects(()=>paidCache(file,async()=>{calls++;return Buffer.from('ok');}), (e:unknown)=>e instanceof HttpError&&e.code==='PROVIDER_OUTCOME_UNKNOWN');assert.equal(calls,1);
  await context.run({requestId:'test',signal:new AbortController().signal,allowUncertain:true},()=>paidCache(file,async()=>{calls++;return Buffer.from('ok');}));
  assert.equal((await paidCache(file,async()=>{calls++;return Buffer.from('wrong');})).toString(),'ok');assert.equal(calls,2);
}));
test('known provider rejection may be retried without ambiguous marker',()=>temporary(async root=>{const file=path.join(root,'response');await assert.rejects(()=>paidCache(file,async()=>{throw new HttpError(502,'Quota','PROVIDER_REJECTED');}));assert.equal((await paidCache(file,async()=>Buffer.from('ok'))).toString(),'ok');}));
test('incomplete translation responses become actionable provider errors',()=>{
  const segments:Parameters<typeof validateBatch>[1]=[
    {id:'s0',start:0,end:1,speaker:'speaker_0',source:'source one',target:'',flags:[]},
    {id:'s1',start:1,end:2,speaker:'speaker_0',source:'source two',target:'',flags:[]},
  ];
  assert.throws(()=>validateBatch({lines:[{id:'s0',text:'Сайн байна уу',needsReview:false,reason:''}]},segments),
    (error:unknown)=>error instanceof HttpError&&error.status===502&&error.code==='INVALID_PROVIDER_RESPONSE');
  assert.throws(()=>validateBatch({lines:[{id:'s0',text:'Hello',needsReview:false,reason:''},{id:'s1',text:'Баяртай',needsReview:false,reason:''}]},segments),
    (error:unknown)=>error instanceof HttpError&&error.status===502&&error.code==='INVALID_PROVIDER_RESPONSE');
});
