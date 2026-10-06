// Local Chromium/CDP UI smoke test; fixture data lives only in a disposable directory.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mediaEnv } from './media-env.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'duulav-browser-'));
const children=[]; const logs=[];
function launch(args,env,cwd=root,executable=process.execPath){const child=spawn(executable,args,{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);child.stdout.on('data',d=>logs.push(String(d)));child.stderr.on('data',d=>logs.push(String(d)));return child;}
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.ok)return r;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Startup timeout '+url+'\n'+logs.slice(-8).join(''));}
const origin='http://127.0.0.1:3011';
const generatedFiles = ['apps/web/tsconfig.json', 'apps/web/next-env.d.ts'];
const savedGenerated = await Promise.all(generatedFiles.map(p=>fs.readFile(path.join(root,p))));
let ws;
try{
  launch(['dist/server.js'],{...mediaEnv(),PORT:'4020',NODE_ENV:'test',PROVIDER_MODE:'demo',DATA_DIR:temp,DATABASE_PATH:path.join(temp,'test.sqlite'),ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'browser-test-password',WEB_ORIGIN:origin},path.join(root,'apps/api'));
  await wait('http://127.0.0.1:4020/api/auth/me');
  const headers={'x-mn-dub':'1','Content-Type':'application/json'};
  const login=await fetch('http://127.0.0.1:4020/api/auth/login',{method:'POST',headers,body:JSON.stringify({email:'admin@example.test',password:'browser-test-password'})});
  assert.equal(login.status,200);headers.cookie=login.headers.get('set-cookie').split(';')[0];
  async function api(url,data){const response=await fetch('http://127.0.0.1:4020/api'+url,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});const result=await response.json();assert.ok(response.ok,JSON.stringify(result));return result;}
  const category=await api('/admin/categories',{name:'Романтик',slug:'romance'});
  const titles=['Нууцхан хайр','Хувь заяаны сонголт','Чиний төлөө','Сүүлчийн захидал','Зүрхний нууц','Дахин эхлэх нь','Бидний амлалт'];
  let movie,episode,fifth,portraitEpisode;
  for(let i=0;i<titles.length;i++){const m=await api('/admin/movies',{title_mn:titles[i],title_original:'ТЕСТИЙН КОНТЕНТ',slug:'story-'+i,description:'Туршилтын контент. Нэгэн санамсаргүй учрал хоёр хүний амьдралыг үүрд өөрчилнө. Хайр, нууц, итгэлийн тухай түүх.',year:2026,price:9900,total_episodes:24,status:'PUBLISHED',featured:i===0,trending:true,new_release:true,category_ids:[category.id]});if(i===0){movie=m;episode=await api('/admin/episodes',{movie_id:m.id,episode_number:1,title:'Эхлэл'});}}
  for(let n=2;n<=5;n++){fifth=await api('/admin/episodes',{movie_id:movie.id,episode_number:n,title:n+'-р анги'});if(n===2)portraitEpisode=fifth;}
  const premium=await api('/admin/episodes',{movie_id:movie.id,episode_number:6,title:'Үргэлжлэл'});
  const key=randomUUID()+'.mp4';await fs.mkdir(path.join(temp,'media'),{recursive:true});await fs.copyFile(path.join(root,'data/demo-input.mp4'),path.join(temp,'media',key));
  const portraitKey=randomUUID()+'.mp4';
  const portraitProcess=launch(['-y','-f','lavfi','-i','color=c=0x151922:s=180x320:r=25','-f','lavfi','-i','sine=frequency=440:duration=6','-t','6','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(temp,'media',portraitKey)],{},root,mediaEnv().FFMPEG_PATH||'ffmpeg');
  assert.equal((await once(portraitProcess,'exit'))[0],0);
  const fixtureDb=new DatabaseSync(path.join(temp,'test.sqlite'));fixtureDb.prepare("UPDATE episodes SET status='PUBLISHED',duration=6,media_key=? WHERE movie_id=?").run(key,movie.id);fixtureDb.prepare('UPDATE episodes SET media_key=? WHERE id=?').run(portraitKey,portraitEpisode.id);fixtureDb.close();
  launch([path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3011'],{API_INTERNAL_URL:'http://127.0.0.1:4020',NEXT_TELEMETRY_DISABLED:'1',NEXT_TEST_DIST:'.next/ui-smoke'},path.join(root,'apps/web'));
  await wait(origin);
  const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
  launch(['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9229',`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{},root,chrome);
  const tabs=await (await wait('http://127.0.0.1:9229/json')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  let seq=0;const pending=new Map();const errors=[];const network=[];let intercept=null;
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}else if(message.method==='Network.responseReceived'){network.push({url:message.params.response.url,status:message.params.response.status});}else if(message.method==='Fetch.requestPaused'){void (intercept?intercept(message.params):send('Fetch.continueRequest',{requestId:message.params.requestId})).catch(e=>{ /* React may abort a request before the CDP reply. */ if(!e.message.includes("Invalid InterceptionId"))errors.push(e.message); });}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text+': '+message.params.exceptionDetails.exception?.description);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  async function until(expression){for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{} await new Promise(r=>setTimeout(r,150));}throw Error('UI timeout '+expression+'\n'+await evaluate('document.body.innerText'));}
  async function navigate(route,text){await send('Page.navigate',{url:origin+route});await until(`document.body.innerText.includes(${JSON.stringify(text)}) && document.querySelector('#main-content')?.dataset.sessionReady==='true'`);await new Promise(r=>setTimeout(r,200));}
  const widths=[360,390,768,1280,1440];
  await fs.mkdir(path.join(root,'docs/screenshots'),{recursive:true});
  async function capture(name){const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(root,'docs/screenshots',name+'.png'),Buffer.from(image.data,'base64'));}
  async function viewport(width){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});}
  for(const width of widths){await viewport(width);await navigate('/','Нууцхан хайр');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Home overflow '+width);if([390,1440].includes(width))await capture('shortkinomn-home-'+width);}
  await navigate('/search','Кино хайх');await until("document.querySelectorAll('.movie-card').length===7");
  await navigate('/movies/story-0','Ангиуд');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  for(const width of widths){await viewport(width);await navigate('/watch/'+premium.id,'Энэ ангийг нээж үзээрэй');assert.equal(await evaluate('document.querySelector("video")===null'),true,'Locked episode must not mount video');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Watch overflow '+width);}
  await viewport(390);await capture('shortkinomn-watch-locked-390');
  await navigate('/watch/'+portraitEpisode.id,'Бүх анги');await until('document.querySelector("video")?.readyState>=1');
  assert.equal(await evaluate('document.querySelector("video").videoWidth/document.querySelector("video").videoHeight'),9/16);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("video")).objectFit'),'contain');await capture('shortkinomn-watch-portrait-390');
  await navigate('/watch/'+episode.id,'Бүх анги');await until('document.querySelector("video")?.readyState>=1');
  await evaluate('document.querySelector("video").muted=true;document.querySelector("video").play()');await until('document.querySelector("video").currentTime>0');
  await capture('shortkinomn-watch-free-390');
  // A completed fifth episode must reveal the paywall before any sixth-episode video request.
  await navigate('/watch/'+fifth.id,'Бүх анги');await until('document.querySelector("video")?.readyState>=1');
  await evaluate('document.querySelector("video").muted=true;document.querySelector("video").currentTime=5.8;document.querySelector("video").play()');
  await until("document.body.innerText.includes('Дараагийн анги төлбөртэй')");
  assert.equal(network.some(r=>r.url.includes('/stream/'+premium.id+'/video')),false);
  await capture('shortkinomn-next-locked-390');
  await evaluate("document.querySelector('.next-locked-overlay a').click()");await until("document.body.innerText.includes('Энэ ангийг нээж үзээрэй')");
  assert.equal(await evaluate('document.querySelector("video")===null'),true);
  // Browser keyboard focus, mobile disclosure and reduced-motion preference.
  await navigate('/','Нууцхан хайр');
  const tokens=await evaluate("Object.fromEntries(['--bg','--surface','--text','--muted','--accent'].map(key=>[key,getComputedStyle(document.documentElement).getPropertyValue(key).trim()]))");
  function luminance(hex){const rgb=hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  for(const [a,b] of [['--text','--bg'],['--muted','--surface'],['--accent','--bg'],['--bg','--accent']])assert.ok(contrast(tokens[a],tokens[b])>=4.5,`Text contrast ${a}/${b}`);
  await evaluate('document.activeElement.blur()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
  await evaluate("document.querySelector('.menu-button').click()");await until("document.querySelector('.menu-button').getAttribute('aria-expanded')==='true'");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until("document.querySelector('.menu-button').getAttribute('aria-expanded')==='false'");
  assert.equal(await evaluate("document.activeElement===document.querySelector('.menu-button')"),true);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.poster')).transitionDuration"),'0s');
  // Simulate a non-JSON upstream failure, then retry the same UI against the real API.
  intercept=p=>send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:502,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('<h1>Test gateway unavailable</h1>').toString('base64')});
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/catalog/movies?*'}]});
  await navigate('/search','HTTP 502');assert.equal(await evaluate("document.querySelector('[role=alert]')!==null"),true);await capture('shortkinomn-error-390');
  await send('Fetch.disable');intercept=null;
  await evaluate("document.querySelector('.error-state button').click()");await until("document.querySelectorAll('.movie-card').length===7");
  // Hold a request to inspect real loading state, including reduced-motion skeletons.
  let held;intercept=p=>{held=p;return Promise.resolve();};await send('Fetch.enable',{patterns:[{urlPattern:'*/api/catalog/movies?*'}]});
  await send('Page.navigate',{url:origin+'/search?q=not-a-real-title'});await until("document.querySelector('.skeleton-grid')!==null");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.skeleton')).animationName"),'none');
  await until('document.querySelector(".skeleton-grid")!==null');
  for(let i=0;!held&&i<40;i++)await new Promise(r=>setTimeout(r,50));assert.ok(held);
  // Disabling interception releases current requests, including a replacement
  // issued after React cancels the first request during development.
  await send('Fetch.disable');intercept=null;
  await until("document.body.innerText.includes('Хайлтад тохирох кино олдсонгүй')");await capture('shortkinomn-empty-390');
  await navigate('/admin','Дахин уулзсандаа баяртай');assert.ok((await evaluate('location.pathname')).includes('login'),'Anonymous admin redirect');
  await until('document.querySelector('+JSON.stringify('.auth-form button')+').disabled===false');
  await evaluate(`document.querySelector('input[name=email]').value='admin@example.test';document.querySelector('input[name=password]').value='browser-test-password';document.querySelector('.auth-form').requestSubmit();`);
  await until("location.pathname==='/admin' && document.body.innerText.includes('Ерөнхий тойм')");
  await navigate('/admin','Ерөнхий тойм');
  for(const width of widths){await viewport(width);await navigate('/admin/movies/new','Шинэ кино');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Admin overflow '+width);}
  await viewport(1440);await navigate('/admin/translation?episode='+episode.id,'Орчуулгын студи');await capture('shortkinomn-studio-1440');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Studio overflow desktop');
  await viewport(390);await capture('shortkinomn-studio-390');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Studio overflow mobile');
  // Admin movie → episode → studio, real browser upload and review flow.
  await navigate('/admin/movies/'+movie.id,'Ангиуд');await capture('shortkinomn-admin-movie-390');
  await evaluate(`document.querySelector('a[href="/admin/translation?episode=${episode.id}"]').click()`);await until("document.querySelector('.dropzone')!==null");
  assert.equal(await evaluate("document.querySelectorAll('.workflow .step').length"),5);
  assert.equal(await evaluate("document.querySelector('.voice-list, .clone-card, .bed-controls') === null"),true);
  assert.equal(await evaluate("document.querySelector('.upload-card select')?.value === 'auto'"),true);
  assert.equal(await evaluate("document.querySelectorAll('.preview-tabs button').length"),2);
  const invalidFile=path.join(temp,'invalid.txt');await fs.writeFile(invalidFile,'Not a video');
  async function chooseFile(file){const dom=await send('DOM.getDocument');const node=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.upload-card input[type=file]'});await send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[file]});}
  await chooseFile(invalidFile);await until("document.querySelector('.field-error')?.innerText.includes('MP4')");
  // Exercise a multipart upload above Next's default 10 MB proxy buffer.
  const uploadVideo=path.join(temp,'large-upload.mp4');
  await fs.copyFile(path.join(root,'data/demo-input.mp4'),uploadVideo);
  await fs.appendFile(uploadVideo,Buffer.alloc(16*1024*1024));
  await chooseFile(uploadVideo);await until("document.querySelector('.chosen-file')!==null");
  // A failed upload preserves the selected file and can be retried with the same key.
  intercept=p=>send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:{code:'BACKEND_UNAVAILABLE',message:'API сервертэй холбогдож чадсангүй.',requestId:'upload-test-request'}})).toString('base64')});
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/jobs'}]});
  await evaluate("document.querySelector('.upload-card .upload-button').click()");
  await until("document.querySelector('.error-alert')?.innerText.includes('503')");
  assert.equal(await evaluate("document.querySelector('.chosen-file')!==null"),true,'Failed upload keeps file selection');
  assert.equal(await evaluate("document.querySelector('.error-alert code').textContent.includes('upload-test-request')"),true);
  await send('Fetch.disable');intercept=null;
  await send('Network.emulateNetworkConditions',{offline:false,latency:5,downloadThroughput:100000000,uploadThroughput:1048576});
  await evaluate("document.querySelector('.upload-card .upload-button').click();document.querySelector('.upload-card .upload-button').click()");
  await until("document.querySelector('.upload-progress progress')?.value>0");
  assert.equal(await evaluate("document.querySelector('.upload-progress progress').value<=document.querySelector('.upload-progress progress').max"),true);
  await capture('shortkinomn-upload-progress-390');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await until("document.querySelector('.publish-box')!==null");
  let jobs=await api('/jobs?episodeId='+episode.id);assert.equal(jobs.length,1,'Duplicate upload prevented');const jobId=jobs[0].id;
  assert.equal(jobs[0].episodeId,episode.id);
  assert.equal(jobs[0].background,'none','Subtitle uploads skip background separation');
  assert.equal(jobs[0].outputMode,'subtitles','Web requests subtitle-specific translation');
  assert.equal(await evaluate("document.querySelector('.publish-box option[value=dubbed]') === null"),true);
  assert.equal(await evaluate("document.querySelector('.publish-box button').disabled"),true);
  async function clickButton(text){await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled)?.click()`);}
  // Upload alone runs STT → translation → subtitle preparation, without human approval.
  await until("!document.querySelectorAll('.preview-tabs button')[1].disabled");
  jobs=await api('/jobs?episodeId='+episode.id);assert.equal(jobs[0].outputs.subtitles,true);
  assert.equal(jobs[0].transcriptReviewed,false);assert.equal(jobs[0].translationReviewed,false);
  assert.equal(jobs[0].segments.length,2);assert.ok(jobs[0].segments.every(s=>s.target.length));
  assert.equal(network.filter(r=>r.url.endsWith('/subtitle_auto')).length,1,'One automatic pipeline per upload');
  assert.equal(network.some(r=>/\/(prepare|translate|subtitles)$/.test(new URL(r.url).pathname)),false,'No manual processing clicks needed');
  await evaluate("document.querySelector('.checks input').click();document.querySelectorAll('.checks input')[1].click()");await clickButton('Хадгалах');
  await until("document.body.innerText.includes('Өөрчлөлт хадгалагдлаа.')");
  jobs=await api('/jobs?episodeId='+episode.id);assert.equal(jobs[0].outputs.subtitles,true,'Approval does not destroy an unchanged preview');
  assert.equal(jobs[0].outputs.dubbed,false);
  assert.equal(await evaluate("document.querySelector('.result-banner a').getAttribute('href').endsWith('/subtitle-preview.mp4')"),true);
  assert.equal(await evaluate("document.querySelector('.voice-list, .clone-card, .bed-controls, .final-action') === null"),true);
  assert.equal(network.some(r=>/\/render$|\/voices\/clone$|\/bed$/.test(new URL(r.url).pathname)),false,'No dubbing requests from subtitle workflow');
  for(const width of widths){await viewport(width);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Studio preview overflow '+width);if([390,1440].includes(width))await capture('shortkinomn-preview-'+width);}
  await clickButton('Хадмалтай');await until('document.querySelector(".video-frame video")?.readyState>=1');
  await evaluate("document.querySelector('.video-frame video').muted=true;document.querySelector('.video-frame video').play()");
  await until("!document.querySelector('.publish-box input[type=checkbox]').disabled");
  assert.equal(await evaluate("document.querySelector('.publish-box button').disabled"),true,'Preview alone does not publish');
  await evaluate("const v=document.querySelector('.video-frame video');v.currentTime=0;v.muted=true;v.play()");
  await until("document.querySelector('.video-frame video').currentTime>0.2");
  await until("!document.querySelector('.publish-box input[type=checkbox]').disabled");
  await evaluate("document.querySelector('.publish-box input[type=checkbox]').click()");
  await until("!Array.from(document.querySelectorAll('.publish-box button')).find(b=>b.textContent.trim()==='Нийтлэх').disabled");
  await clickButton('Нийтлэх');
  await until("document.body.innerText.includes('Кино амжилттай нийтлэгдлээ.')");
  assert.equal(await evaluate("document.querySelector('.published-link')?.getAttribute('href')"),'/movies/story-0');
  const published=await api('/admin/movies/'+movie.id);assert.equal(published.episodes.find(e=>e.id===episode.id).status,'PUBLISHED');
  const publicMovie=await api('/catalog/movies/story-0');assert.equal(publicMovie.movie.status,'PUBLISHED');assert.ok(publicMovie.episodes.some(e=>e.id===episode.id));
  assert.equal((await fetch(`http://127.0.0.1:4020/api/stream/${episode.id}/video`,{headers})).status,200);
  assert.equal((await fetch(`http://127.0.0.1:4020/api/stream/${episode.id}/subtitles`,{headers})).status,200);
  await navigate('/movies/story-0','Ангиуд');
  await navigate('/watch/'+episode.id,'Бүх анги');await until('document.querySelector("video")?.readyState>=1');
  assert.equal(await evaluate(`document.querySelector('video').getAttribute('src')==='/api/stream/${episode.id}/video'`),true);
  assert.equal(await evaluate(`document.querySelector('video track')?.getAttribute('src')==='/api/stream/${episode.id}/subtitles'`),true);
  await evaluate('document.querySelector("video").muted=true;document.querySelector("video").play()');await until('document.querySelector("video").currentTime>0');
  // Jobs failures stay visible; a retry fetches the actual backend response.
  intercept=p=>send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:500,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:{code:'TEST_ERROR',message:'Туршилтын серверийн алдаа',requestId:'browser-test-request'}})).toString('base64')});
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/jobs'}]});await navigate('/admin/jobs','HTTP 500');await send('Fetch.disable');intercept=null;
  await evaluate("document.querySelector('.error-state button').click()");await until("document.body.innerText.includes('Студид нээх')");
  assert.ok(network.some(r=>new URL(r.url).pathname==='/api/jobs'&&r.status===200));
  const realFailures=network.filter(r=>r.url.includes('/api/jobs')&&r.status>=500);
  assert.equal(realFailures.length,2,'Only deliberately injected upload 503 and jobs 500 occurred');
  await viewport(390);await capture('shortkinomn-jobs-390');
  await navigate('/','Нууцхан хайр');assert.equal(await evaluate("document.querySelector('.site-header').innerText.includes('Translation')"),false);
  assert.deepEqual(errors,[],'Browser exceptions');
  console.log('PASS: Chromium at 360/390/768/1280/1440; home/detail/player, free 5 → paid 6, keyboard/Escape/reduced motion, loading/empty/non-JSON retry, admin login, 16 MB upload, automatic subtitles without TTS, explicit preview/review/publish, jobs 200 and injected 500 retry; no overflow or browser exceptions. Screenshots: docs/screenshots.');
}catch(error){console.error(logs.slice(-12).join(''));throw error;}
finally{ws?.close();for(const child of children.reverse()){if(child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);}}for(let i=0;i<generatedFiles.length;i++)await fs.writeFile(path.join(root,generatedFiles[i]),savedGenerated[i]);const resolved=path.resolve(temp);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('duulav-browser-'))throw Error('Unsafe cleanup');await fs.rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
