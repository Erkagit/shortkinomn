// Reproduce upload behavior without touching production data or calling paid APIs.
import { spawn,execFile } from 'node:child_process';
import {promisify} from 'node:util';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mediaEnv } from './media-env.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'shortkinomn-upload-'));
const children=[],logs=[],results=[];
const generated=['apps/web/tsconfig.json','apps/web/next-env.d.ts'];
const originals=await Promise.all(generated.map(p=>fs.readFile(path.join(root,p))));
function launch(args,env,cwd){const child=spawn(process.execPath,args,{cwd:path.join(root,cwd),env:{...process.env,...env},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);child.stdout.on('data',d=>logs.push(String(d)));child.stderr.on('data',d=>logs.push(String(d)));return child;}
const direct='http://127.0.0.1:4040/api',proxy='http://127.0.0.1:3040/api';
async function wait(url){for(let i=0;i<150;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Server startup timeout');}
let cookie='';
async function until(work){for(let i=0;i<150;i++){if(await work())return;await new Promise(r=>setTimeout(r,100));}throw Error('Verification timeout');}
async function call(base,url,data){const r=await fetch(base+url,{method:data?'POST':'GET',headers:{cookie,'x-mn-dub':'1','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const text=await r.text();let body;try{body=JSON.parse(text);}catch{body={nonJson:true};}results.push({url:base+url,method:data?'POST':'GET',status:r.status,requestId:r.headers.get('x-request-id'),error:body.error,nonJson:body.nonJson});return {r,body};}
async function multipart(base,episodeId,file,name='sample.mp4',type='video/mp4',extraHeaders={},chunked=false){
  const boundary='----shortkinomn'+randomUUID();
  const head=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="episodeId"\r\n\r\n${episodeId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="outputMode"\r\n\r\nsubtitles\r\n--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail=Buffer.from(`\r\n--${boundary}--\r\n`),size=(await fs.stat(file)).size;
  const started=Date.now();
  return new Promise((resolve,reject)=>{
    const req=http.request(base+'/jobs',{method:'POST',headers:{cookie,'x-mn-dub':'1','Content-Type':'multipart/form-data; boundary='+boundary,...(!chunked?{'Content-Length':head.length+size+tail.length}:{}),...extraHeaders}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>{let body;try{body=JSON.parse(text);}catch{body={nonJson:true};}results.push({url:base+'/jobs',method:'POST',bytes:size,status:res.statusCode,requestId:res.headers['x-request-id'],elapsedMs:Date.now()-started,error:body.error,nonJson:body.nonJson});resolve({status:res.statusCode,body});});});
    req.on('error',reject);req.setTimeout(60000,()=>req.destroy(Error('Upload timeout')));
    req.write(head);const stream=createReadStream(file);stream.on('error',e=>req.destroy(e));stream.on('end',()=>req.end(tail));req.on('close',()=>stream.destroy());stream.pipe(req,{end:false});
  });
}
try{
  const apiEnv={...mediaEnv(),NODE_ENV:'test',PROVIDER_MODE:'demo',PORT:'4040',WEB_ORIGIN:'http://127.0.0.1:3040',DATA_DIR:temp,DATABASE_PATH:path.join(temp,'test.sqlite'),ADMIN_EMAIL:'diagnostics@example.test',ADMIN_PASSWORD:'diagnostic-password-123'};
  let api=launch(['dist/server.js'],apiEnv,'apps/api');
  await wait(direct+'/auth/me');
  launch([path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3040'],{NODE_ENV:'development',API_INTERNAL_URL:'http://127.0.0.1:4040',NEXT_TEST_DIST:'.next/upload-diagnostics',NEXT_TELEMETRY_DISABLED:'1'},'apps/web');
  await wait('http://127.0.0.1:3040');
  const login=await call(direct,'/auth/login',{email:'diagnostics@example.test',password:'diagnostic-password-123'});assert.equal(login.r.status,200);cookie=login.r.headers.get('set-cookie').split(';')[0];
  for(const base of [direct,proxy])for(const endpoint of ['/health','/jobs']){const {r,body}=await call(base,endpoint);assert.equal(r.status,200);if(endpoint==='/health')assert.ok(body.ffmpeg&&body.ffprobe);}
  const movie=(await call(direct,'/admin/movies',{title_mn:'Upload diagnostic fixture',slug:'upload-diagnostic',price:0,year:2026})).body;
  const episode=(await call(direct,'/admin/episodes',{movie_id:movie.id,episode_number:1,title:'Upload fixture'})).body;
  const small=path.join(root,'data/demo-input.mp4'),large=path.join(temp,'large.mp4');await fs.copyFile(small,large);const handle=await fs.open(large,'r+');await handle.truncate(32*1024*1024);await handle.close();
  for(const base of [direct,proxy])for(const file of [small,large]){const result=await multipart(base,episode.id,file);assert.equal(result.status,201,JSON.stringify(result.body));}
  const bad=path.join(temp,'bad.txt');await fs.writeFile(bad,'not a video');assert.equal((await multipart(proxy,episode.id,bad,'bad.txt','text/plain')).status,400);
  if(!process.argv.includes('--baseline')){
    assert.equal((await multipart(proxy,episode.id,bad,'bad.mp4','video/mp4')).status,422);
    const oversized=path.join(temp,'oversized.mp4');await fs.copyFile(small,oversized);const handle=await fs.open(oversized,'r+');await handle.truncate(201*1024*1024);await handle.close();
    for(const chunked of [false,true]){const result=await multipart(proxy,episode.id,oversized,'big.mp4','video/mp4',{},chunked);assert.equal(result.status,413);assert.equal(result.body.error.code,'UPLOAD_TOO_LARGE');assert.ok(result.body.error.requestId);}
    const key=randomUUID();const first=await multipart(proxy,episode.id,small,'repeat.mp4','video/mp4',{'idempotency-key':key});const repeat=await multipart(proxy,episode.id,small,'repeat.mp4','video/mp4',{'idempotency-key':key});assert.equal(first.body.id,repeat.body.id);
    const parallelKey=randomUUID();const parallel=await Promise.all([1,2].map(()=>multipart(proxy,episode.id,large,'repeat.mp4','video/mp4',{'idempotency-key':parallelKey})));assert.deepEqual(parallel.map(x=>x.status).sort(),[201,409]);
    // Drop the connection in the middle of a chunked multipart file.
    for(const base of [direct,proxy]){
      await new Promise(resolve=>{const req=http.request(base+'/jobs',{method:'POST',headers:{cookie,'x-mn-dub':'1','Content-Type':'multipart/form-data; boundary=abort-fixture'}},res=>res.resume());req.on('error',()=>{});req.on('close',resolve);req.write('--abort-fixture\r\nContent-Disposition: form-data; name="video"; filename="cancel.mp4"\r\nContent-Type: video/mp4\r\n\r\n');req.write(Buffer.alloc(1024*1024));setTimeout(()=>req.destroy(),300);});
      await until(async()=>(await fs.readdir(path.join(temp,'tmp'))).length===0);
    }
    const afterAbort=await multipart(proxy,episode.id,small);assert.equal(afterAbort.status,201);
    // Offset media must now be accepted and run all the way to a preview.
    const offsetVideo=path.join(temp,'offset.mp4');await promisify(execFile)(mediaEnv().FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=black:s=160x90:r=25:d=4','-itsoffset','0.5','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac',offsetVideo],{windowsHide:true});
    const aligned=await multipart(proxy,episode.id,offsetVideo);assert.equal(aligned.status,201);const id=aligned.body.id;
    const start=await call(proxy,`/jobs/${id}/subtitle_auto`,{});assert.equal(start.r.status,202);
    const duplicate=await call(proxy,`/jobs/${id}/subtitle_auto`,{});assert.equal(duplicate.r.status,202);assert.equal(duplicate.body.duplicate,true);
    const blocked=await call(proxy,`/jobs/${first.body.id}/subtitle_auto`,{});assert.equal(blocked.r.status,409);
    await until(async()=>{const response=await fetch(proxy+`/jobs/${id}`,{headers:{cookie}}),job=await response.json();assert.notEqual(job.status,'failed',job.error);return job.outputs.subtitles;});
    const preview=await fetch(proxy+`/jobs/${id}/files/subtitle-preview.mp4`,{headers:{cookie,Range:'bytes=0-99'}});assert.equal(preview.status,206);assert.equal((await preview.arrayBuffer()).byteLength,100);
    // Cancellation stops the worker before a new job is admitted.
    await call(proxy,`/jobs/${first.body.id}/subtitle_auto`,{});await call(proxy,`/jobs/${first.body.id}/cancel`,{});
    await until(async()=>{const job=await (await fetch(proxy+`/jobs/${first.body.id}`,{headers:{cookie}})).json();return !job.busy&&job.status==='cancelled';});
    await call(proxy,`/jobs/${first.body.id}/subtitle_auto`,{});
    await until(async()=>{const job=await (await fetch(proxy+`/jobs/${first.body.id}`,{headers:{cookie}})).json();assert.notEqual(job.status,'failed',job.error);return job.outputs.subtitles;});
    assert.deepEqual(await fs.readdir(path.join(temp,'tmp')),[]);
    results.push({check:'idempotency, concurrent uploads, upload cancellation, offset → preview, range, duplicate action, worker busy, cancel and resume',passed:true});
    // Simulate a restart between stages, after the transcript was durably saved.
    api.kill();await once(api,'exit');
    const jobPath=path.join(temp,'jobs',id,'job.json'),saved=JSON.parse(await fs.readFile(jobPath,'utf8'));
    saved.runActive=true;saved.status='transcript_ready';await fs.writeFile(jobPath,JSON.stringify(saved));
    await fs.writeFile(path.join(temp,'jobs',id,'source-timeline.partial.mp4'),'unfinished');await fs.writeFile(path.join(temp,'tmp',randomUUID()+'.upload'),'unfinished');
    api=launch(['dist/server.js'],apiEnv,'apps/api');await wait(direct+'/auth/me');
    const recovered=(await call(proxy,`/jobs/${id}`)).body;assert.equal(recovered.status,'failed');assert.equal(recovered.errorCode,'SERVER_RESTARTED');assert.equal(recovered.runActive,false);assert.deepEqual(recovered.segments,saved.segments);assert.deepEqual(await fs.readdir(path.join(temp,'tmp')),[]);
    assert.equal(await fs.access(path.join(temp,'jobs',id,'source-timeline.partial.mp4')).then(()=>true,()=>false),false);
    await call(proxy,`/jobs/${id}/subtitle_auto`,{});await until(async()=>(await (await fetch(proxy+`/jobs/${id}`,{headers:{cookie}})).json()).outputs.subtitles);
    api.kill();await once(api,'exit');
    api=launch(['dist/server.js'],{...apiEnv,FFPROBE_PATH:path.join(temp,'missing-ffprobe.exe')},'apps/api');await wait(direct+'/auth/me');
    const unavailableTool=await multipart(proxy,episode.id,small);assert.equal(unavailableTool.status,503);assert.equal(unavailableTool.body.error.code,'MEDIA_UNAVAILABLE');
    results.push({check:'restart between stages preserves transcript, cleans partials, resumes; missing FFprobe returns 503',passed:true});
  }
  api.kill();await once(api,'exit');const unavailable=await call(proxy,'/jobs');assert.equal(unavailable.r.status,process.argv.includes('--baseline')?500:503);if(!process.argv.includes('--baseline')){assert.equal(unavailable.body.error.code,'BACKEND_UNAVAILABLE');assert.ok(unavailable.body.error.requestId);}
  const structured=logs.join('').split(/\r?\n/).flatMap(line=>{try{const value=JSON.parse(line);return value.event?[value]:[];}catch{return [];}});
  if(!process.argv.includes('--baseline')){const failed=results.find(r=>r.error?.code==='INVALID_MEDIA');assert.ok(structured.some(entry=>entry.requestId===failed.requestId&&entry.event==='request_failed'),'Backend errors must correlate with HTTP request IDs');}
  const report={checkedAt:new Date().toISOString(),mode:'demo',results,proxyConnectionRefused:logs.some(s=>s.includes('ECONNREFUSED')),logEvidence:structured.filter(entry=>['job_started','job_stage','job_finished','source_timeline_aligned','request_failed','proxy_error'].includes(entry.event)).slice(-24),unhandled:logs.filter(s=>s.includes('Unhandled')||s.includes('Uncaught'))};
  await fs.mkdir(path.join(root,'docs'),{recursive:true});await fs.writeFile(path.join(root,process.argv.includes('--baseline')?'docs/upload-baseline.json':'docs/upload-verification.json'),JSON.stringify(report,null,2));
  for(const r of results)console.log(JSON.stringify(r));
}finally{
  for(const child of children.reverse())if(child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,2000))]);}
  for(let i=0;i<generated.length;i++)await fs.writeFile(path.join(root,generated[i]),originals[i]);
  const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('shortkinomn-upload-'))throw Error('Unsafe cleanup');
  await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:250});
}
