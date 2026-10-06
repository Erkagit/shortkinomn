import fs from 'node:fs/promises';import path from 'node:path';import {config} from './config.js';
import {load,save,dir,exists,cleanPartialFiles} from './store.js';import {extract,normalize,fit,duration,render,ff} from './media.js';import {stt,separate,translate,tts,checkTts} from './providers.js';import {validateTimeline,srt,type Job} from './model.js';
import {subtitleFile} from './subtitles.js';
import {alignSource,sourceFile} from './media.js';
import {randomUUID} from 'node:crypto';
import {context,HttpError,publicError,errorFields,log,checkCancelled} from './runtime.js';
const busy=new Map<string,{controller:AbortController;action:string}>();
export function isBusy(id:string){return busy.has(id);}
export function cancel(id:string){busy.get(id)?.controller.abort();}
export async function launch(id:string,action:NonNullable<Job['lastAction']>,allowUncertain=false){
  if(busy.get(id)?.action===action)return {accepted:true,duplicate:true};
  if(busy.size)throw new HttpError(409,'Өөр ажил боловсруулж байна. Дууссаны дараа оролдоно уу.','WORKER_BUSY');
  const controller=new AbortController();busy.set(id,{controller,action});
  let job:Job;
  try{
    job=await load(id);
    if(job.mode!==config.mode)throw new HttpError(409,'Энэ ажил өөр горимд үүссэн. Шинэ видео оруулна уу.','MODE_CHANGED');
    // Replaying a successful automatic request must never repeat provider calls or erase approval.
    if(action==='subtitle_auto'&&job.outputMode==='subtitles'&&job.status==='translation_ready'&&(await Promise.all(['subtitle-preview.mp4','preview.mn.vtt','translated.mn.srt'].map(file=>exists(path.join(dir(id),file))))).every(Boolean)){busy.delete(id);return {accepted:true,duplicate:true};}
    delete job.error;delete job.errorCode;job.lastAction=action;job.runActive=true;job.startedAt=new Date().toISOString();delete job.finishedAt;job.requestId=context.getStore()?.requestId||randomUUID();await save(job);
  }catch(error){busy.delete(id);throw error;}
  const current=job;
  void context.run({requestId:current.requestId!,jobId:id,signal:controller.signal,allowUncertain},async()=>{
    const started=Date.now();log('job_started',{action});
    try{await execute(current,action);checkCancelled();}
    catch(error){const safe=publicError(error);current.status=controller.signal.aborted?'cancelled':'failed';current.errorCode=controller.signal.aborted?'CANCELLED':safe.code;current.error=controller.signal.aborted?'Ажлыг цуцаллаа. Дууссан шат хадгалагдсан.':safe.message;log('job_failed',{...errorFields(error),code:current.errorCode});}
    finally{
      current.runActive=false;current.finishedAt=new Date().toISOString();
      try{await cleanPartialFiles(id);}catch(error){log('partial_cleanup_failed',errorFields(error));}
      try{await save(current);}finally{busy.delete(id);log('job_finished',{status:current.status,durationMs:Date.now()-started});}
    }
  }).catch(error=>log('job_persistence_failed',errorFields(error)));
  return {accepted:true,duplicate:false};
}
async function progress(job:Job,text:string){checkCancelled();job.progress=text;await save(job);}
async function execute(job:Job,action:'prepare'|'translate'|'render'|'subtitles'|'subtitle_auto',automaticPreview=false){
  checkCancelled();job.stage=action;const current=context.getStore();if(current)current.stage=action;log('job_stage',{action});
  const root=dir(job.id);
  if(action==='subtitle_auto'){
    if(job.outputMode!=='subtitles')throw new HttpError(422,'Автомат урсгал зөвхөн хадмалын ажилд нээлттэй.');
    job.background='none';job.transcriptReviewed=false;job.translationReviewed=false;
    // Automated preparation never records a human approval or publishes an episode.
    await execute(job,'prepare',true);
    await execute(job,'translate',true);
    await execute(job,'subtitles',true);
    await progress(job,'Монгол хадмал бэлэн. Preview үзэж, орчуулгыг хянаад нийтэлнэ үү.');
    return;
  }
  if(action==='prepare'){
    job.status='preparing';await progress(job,'Аудио болон яриаг боловсруулж байна…');
    await alignSource(root,job.duration);
    if(!await exists(path.join(root,'speech.wav')))await extract(await sourceFile(root),path.join(root,'speech.wav'));
    if(job.background==='api'&&!await exists(path.join(root,'mix.wav')))await normalize(await sourceFile(root),path.join(root,'mix.wav'));
    if(!job.transcriptDone){job.segments=await stt(root,job.duration,job.sourceLanguage);validateTimeline(job.segments,job.duration);if(job.segments.length>100)throw new HttpError(422,'100-аас олон мөр гарлаа. Богино клип ашиглана уу.','TOO_MANY_SEGMENTS');job.transcriptDone=true;job.voices=Object.fromEntries([...new Set(job.segments.map(s=>s.speaker))].map((s,i)=>[s,config.mode==='demo'?`demo-${i+1}`:'']));await save(job);}
    if(!job.bedDone){
      if(job.background==='api'){if(config.mode==='demo')throw new HttpError(422,'Demo горимд арын дуугүй сонголт эсвэл тусдаа M&E файл ашиглана уу.');await progress(job,'Арын дууг API-аар салгаж байна…');await separate(root);}
      if(job.background==='uploaded'){await normalize(path.join(root,'bed-upload.audio'),path.join(root,'bed.wav'));if(Math.abs(await duration(path.join(root,'bed.wav'))-job.duration)>.15)throw new HttpError(422,'M&E файл видеотой ижил timeline, урттай байх ёстой.');}
      job.bedDone=true;
    }
    await fs.writeFile(path.join(root,'source.srt'),srt(job.segments));job.status='transcript_ready';await progress(job,'Эх яриа, цаг болон яригчдыг шалгана уу.');return;
  }
  if(!job.transcriptDone)throw new HttpError(422,'Эхлээд яриа салгана уу.');validateTimeline(job.segments,job.duration);
  if(action==='translate'){
    if(!job.transcriptReviewed&&!automaticPreview)throw new HttpError(422,'Эх яриаг шалгаж баталгаажуулна уу.');job.status='translating';await progress(job,'Монгол орчуулга хийж байна…');
    for(let i=0;i<job.segments.length;i+=15){const targets=job.segments.slice(i,i+15);if(targets.every(s=>s.target))continue;const out=await translate(job,targets,job.segments.slice(Math.max(0,i-6),i),job.segments.slice(i+15,i+21),root);
      out.lines.forEach((l,k)=>{targets[k].target=l.text;targets[k].flags=targets[k].flags.filter(f=>!f.startsWith('translation:'));if(l.needsReview)targets[k].flags.push(`translation:${l.reason}`);});await progress(job,`${Math.min(i+15,job.segments.length)}/${job.segments.length} мөр орчуулсан.`);}
    job.translationReviewed=false;job.status='translation_ready';await progress(job,'Монгол орчуулгыг хянаж баталгаажуулна уу.');return;
  }
  if((!job.translationReviewed&&!automaticPreview)||!job.segments.every(s=>s.target.trim()))throw new HttpError(422,'Орчуулгаа шалгаж баталгаажуулна уу.');
  if(action==='subtitles'){
    if(await exists(path.join(root,'subtitle-preview.mp4'))&&await exists(path.join(root,'preview.mn.vtt'))&&await exists(path.join(root,'translated.mn.srt'))){job.status='translation_ready';return;}
    job.status='rendering';await progress(job,'Хадмалтай хувилбар бэлтгэж байна…');
    await ff('-i',await sourceFile(root),'-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',path.join(root,'subtitle-rendering.mp4'));
    await fs.writeFile(path.join(root,'translated.mn.srt'),subtitleFile(job.segments,'srt'));
    await fs.writeFile(path.join(root,'preview.mn.vtt'),subtitleFile(job.segments,'vtt'));
    await fs.rename(path.join(root,'subtitle-rendering.mp4'),path.join(root,'subtitle-preview.mp4'));
    job.status='translation_ready';await progress(job,'Хадмалтай хувилбар бэлэн. Хянаад нийтэлнэ үү.');return;
  }
  if(!job.bedDone||(job.background!=='none'&&!job.bedReviewed))throw new HttpError(422,'Арын дууг бэлтгэж шалгана уу.');
  if(job.segments.some(s=>!job.voices[s.speaker]?.trim()||s.speaker==='UNKNOWN'))throw new HttpError(422,'Яригч бүрт voice ID онооно уу.');
  await checkTts();job.status='rendering';await progress(job,'Дуу оруулж байна…');await fs.mkdir(path.join(root,'clips'),{recursive:true});
  const qa=[];
  for(let i=0;i<job.segments.length;i++){
    const s=job.segments[i];let fitted=false;
    for(let attempt=1;attempt<=3;attempt++){
      const raw=await tts(s.target,job.voices[s.speaker],root,s.end-s.start);const actual=await duration(raw),ratio=actual/(s.end-s.start);
      if(ratio>=.88&&ratio<=1.15){const metric=await fit(raw,path.join(root,'clips',s.id+'.wav'),s.end-s.start);qa.push({id:s.id,...metric,attempt});fitted=true;break;}
      if(attempt===3)break;
      const out=await translate(job,[s],job.segments.slice(Math.max(0,i-6),i),job.segments.slice(i+1,i+7),root,{previousText:s.target,actualSeconds:actual,targetSeconds:s.end-s.start,action:ratio>1.15?'shorten':'expand naturally; no new facts'});
      s.target=out.lines[0].text;await save(job);if(out.lines[0].needsReview){s.flags.push(`translation:${out.lines[0].reason}`);job.translationReviewed=false;throw new HttpError(422,`${s.id}: дахин найруулсан текстийг шалгана уу.`);}
    }
    if(!fitted){s.flags.push('timing_review');job.translationReviewed=false;throw new HttpError(422,`${s.id}: 3 оролдлогоор хугацаанд тохироогүй. Орчуулга эсвэл timestamp-ийг засна уу.`);}
    await progress(job,`${i+1}/${job.segments.length} мөрийн дуу бэлэн.`);
  }
  await progress(job,'Видеотой нэгтгэж байна…');await render(job,root);await fs.writeFile(path.join(root,'translated.mn.srt'),srt(job.segments,true));
  await fs.writeFile(path.join(root,'qa.json'),JSON.stringify({mode:job.mode,clips:qa,status:'rendered_pending_listening_review',limitations:['not lip sync','manual semantic/pronunciation/bed QA']},null,2));
  job.status='completed';await progress(job,config.mode==='demo'?'DEMO бэлэн: бодит ярианы оронд tone ашигласан.':'Видео бэлэн. Эцсийн үр дүнг сонсож шалгана уу.');
}
