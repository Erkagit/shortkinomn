import express from 'express';import multer from 'multer';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {z} from 'zod';
import {subtitleWarnings} from './subtitles.js';
import {config} from './config.js';import {load,save,list,dir,recover,exists} from './store.js';import {inspect,run,sourceFile} from './media.js';import {launch,isBusy,cancel} from './workflow.js';import {editsSchema,validateTimeline,srt,type Job} from './model.js';import {clone} from './providers.js';
import {identify,admin,bootstrapAdmin,HttpError,rateLimit} from './platform/auth.js';
import {platform} from './platform/routes.js';
import {one,execute,transaction} from './platform/db.js';
import {upload,reserveUpload,cleanUploads} from './uploads.js';
import {context,requestContext,publicError,errorFields,log,checkCancelled} from './runtime.js';
await bootstrapAdmin();
const app=express();await cleanUploads();await recover();
app.disable('x-powered-by');app.set('trust proxy','loopback');app.use(requestContext);app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');
  const origin=req.get('origin');const protocol=req.get('x-forwarded-proto')?.split(',')[0]?.trim()||req.protocol;const requestOrigin=`${protocol}://${req.get('x-forwarded-host')||req.get('host')}`;
  if(origin&&origin!==config.origin&&origin!==requestOrigin)throw new HttpError(403,'Хүсэлтийн origin зөвшөөрөгдөөгүй.','ORIGIN_DENIED');
  if(!['GET','HEAD'].includes(req.method)&&req.get('x-mn-dub')!=='1')throw new HttpError(403,'Хүсэлтийн хамгаалалтын header шаардлагатай.','INVALID_REQUEST');next();});
app.use(identify);
app.get('/health',(_req,res)=>res.json({status:'ok'}));
app.use('/api',platform);
app.use(['/api/jobs','/api/voices','/api/health'],admin);
app.use(['/api/jobs','/api/voices'],rateLimit(120));
app.get('/api/health',async(_req,res)=>{const checks=await Promise.all([config.ffmpeg,config.ffprobe].map(bin=>run(bin,['-version'],5000).then(()=>true,()=>false)));res.json({mode:config.mode,ffmpeg:checks[0],ffprobe:checks[1],openaiConfigured:!!config.openai,elevenConfigured:!!config.eleven,maxSeconds:config.maxSeconds,maxBytes:config.maxBytes});});
async function jobDetails(job:Job){
  const link=one<{episodeId:string;movieTitle:string;episodeNumber:number}>('SELECT e.id episodeId,m.title_mn movieTitle,e.episode_number episodeNumber FROM processing_jobs p JOIN episodes e ON e.id=p.episode_id JOIN movies m ON m.id=e.movie_id WHERE p.job_id=?',job.id);
  const [video,vtt,srt,dubbed]=await Promise.all(['subtitle-preview.mp4','preview.mn.vtt','translated.mn.srt','dubbed.mp4'].map(file=>exists(path.join(dir(job.id),file))));const subtitles=video&&vtt&&srt&&!isBusy(job.id)&&job.status!=='failed'&&job.status!=='rendering';
  return {...job,...link,subtitleWarnings:subtitleWarnings(job.segments),busy:isBusy(job.id),outputs:{subtitles,dubbed:dubbed&&job.status==='completed'}};
}
app.get('/api/jobs',async(req,res)=>{const jobs=await list();const filtered=req.query.episodeId?jobs.filter(j=>one('SELECT 1 FROM processing_jobs WHERE job_id=? AND episode_id=?',j.id,String(req.query.episodeId))):jobs;res.json(await Promise.all(filtered.map(jobDetails)));});
app.get('/api/jobs/:id',async(req,res)=>res.json(await jobDetails(await load(String(req.params.id)))));
app.post('/api/jobs',reserveUpload,upload.fields([{name:'video',maxCount:1},{name:'bed',maxCount:1}]),async(req,res)=>{
  const files=req.files as Record<string,Express.Multer.File[]>;const video=files?.video?.[0],bed=files?.bed?.[0];
  let created:string|undefined,committed=false;
  try{const episodeId=z.string().uuid().parse(req.body.episodeId);if(!one('SELECT id FROM episodes WHERE id=?',episodeId))throw new HttpError(404,'Эхлээд анги үүсгэнэ үү.','EPISODE_NOT_FOUND');if(!video)throw new HttpError(400,'Видео файл сонгоно уу.','VIDEO_REQUIRED');const duration=await inspect(video.path);const outputMode=z.enum(['subtitles','dubbed']).default('subtitles').parse(req.body.outputMode);const background=outputMode==='subtitles'?'none':z.enum(['api','uploaded','none']).parse(req.body.background);if(background==='uploaded'&&!bed)throw new HttpError(400,'M&E файл сонгоно уу.','BED_REQUIRED');
    const sourceLanguage=z.enum(['auto','eng','kor','cmn','jpn','rus','mon']).default('auto').parse(req.body.sourceLanguage);
    checkCancelled();
    const job:Job={outputMode,id:randomUUID(),name:video.originalname.slice(0,200),createdAt:new Date().toISOString(),revision:0,mode:config.mode,status:'uploaded',progress:'Видео орсон. Боловсруулалтыг эхлүүлнэ үү.',duration,sourceLanguage,background,segments:[],context:{synopsis:'',characters:'',glossary:[]},voices:{},transcriptReviewed:false,translationReviewed:false,bedReviewed:false,transcriptDone:false,bedDone:false};
    created=job.id;await fs.mkdir(dir(job.id),{recursive:true});await fs.rename(video.path,path.join(dir(job.id),'source.video'));if(bed)await fs.rename(bed.path,path.join(dir(job.id),'bed-upload.audio'));await save(job);checkCancelled();
    transaction(()=>{execute('INSERT INTO processing_jobs(job_id,episode_id) VALUES(?,?)',job.id,episodeId);execute("UPDATE episodes SET status=CASE WHEN status='PUBLISHED' THEN status ELSE 'PROCESSING' END WHERE id=?",episodeId);if(req.get('idempotency-key'))execute('UPDATE upload_requests SET job_id=? WHERE user_id=? AND request_key=?',job.id,req.user!.id,req.get('idempotency-key')!);});committed=true;log('upload_saved',{jobId:job.id,bytes:video.size,durationSeconds:duration});res.status(201).json(job);
  }catch(error){if(created&&!committed){const root=dir(created);for(const name of ['source.video','bed-upload.audio','job.json'])await fs.rm(path.join(root,name),{force:true});await fs.rmdir(root).catch(()=>{});}throw error;
  }finally{for(const file of Object.values(files||{}).flat())await fs.rm(file.path,{force:true});}
});
app.patch('/api/jobs/:id',async(req,res)=>{const id=String(req.params.id);if(isBusy(id))throw new HttpError(409,'Ажил боловсруулж байна.','WORKER_BUSY');const job=await load(id);
  const {revision,...body}=req.body;if(revision!==job.revision)throw new HttpError(409,'Өгөгдөл өөрчлөгдсөн. Засвараа хуулж хадгалаад дахин ачаална уу.','REVISION_CONFLICT');const data=editsSchema.parse(body);validateTimeline(data.segments,job.duration);
  if(JSON.stringify(data.segments.map(s=>s.id))!==JSON.stringify(job.segments.map(s=>s.id)))throw new HttpError(400,'Мөрийн ID болон дарааллыг хадгална уу.');
  // Changing context/source invalidates old translations, avoiding silent stale results.
  const contextChanged=JSON.stringify(data.context)!==JSON.stringify(job.context);
  data.segments.forEach((s,i)=>{if(contextChanged||s.source!==job.segments[i].source)s.target='';});
  if(data.segments.some(s=>!s.target))data.translationReviewed=false;
  const contentChanged=contextChanged||JSON.stringify(data.segments)!==JSON.stringify(job.segments)||JSON.stringify(data.voices)!==JSON.stringify(job.voices)||data.bedReviewed!==job.bedReviewed;
  Object.assign(job,data);delete job.error;
  if(contentChanged){
    job.status=job.segments.every(s=>s.target)?'translation_ready':'transcript_ready';
    for(const file of ['dubbed.mp4','subtitle-preview.mp4','preview.mn.vtt','translated.mn.srt','qa.json'])await fs.rm(path.join(dir(id),file),{force:true});
  }
  await fs.writeFile(path.join(dir(id),'source.srt'),srt(job.segments));await save(job);res.json(await jobDetails(job));
});
app.post('/api/jobs/:id/bed',upload.single('bed'),async(req,res)=>{const id=String(req.params.id);try{if(!req.file)throw new HttpError(400,'Файл алга.');if(isBusy(id))throw new HttpError(400,'Ажил боловсруулж байна.');const job=await load(id);await fs.rename(req.file.path,path.join(dir(id),'bed-upload.audio'));job.background='uploaded';job.bedDone=false;job.bedReviewed=false;await save(job);res.json(job);}finally{if(req.file)await fs.rm(req.file.path,{force:true});}});
app.post('/api/jobs/:id/cancel',async(req,res)=>{const id=String(req.params.id);await load(id);cancel(id);res.status(202).json({accepted:true});});
app.post('/api/jobs/:id/:action',async(req,res)=>{const action=z.enum(['prepare','translate','render','subtitles','subtitle_auto']).parse(req.params.action);const id=String(req.params.id);const job=await load(id);if(job.mode!==config.mode)throw new HttpError(400,'Provider горим өөрчлөгдсөн. Шинэ job үүсгэнэ үү.');if(action==='render'&&job.outputMode==='subtitles')throw new HttpError(409,'Энэ ажил хадмалын горимтой. Дуу оруулахгүй.');const {allowUncertain}=z.object({allowUncertain:z.boolean().default(false)}).parse(req.body||{});res.status(202).json(await launch(id,action,allowUncertain));});
app.get('/api/jobs/:id/files/:file',async(req,res)=>{const id=String(req.params.id),file=String(req.params.file);if(!['preview.mn.vtt','source.video','subtitle-preview.mp4','source.srt','translated.mn.srt','bed.wav','dubbed.mp4','qa.json','job.json'].includes(file))throw new HttpError(404,'Файл олдсонгүй.','FILE_NOT_FOUND');const job=await load(id);if(['dubbed.mp4','qa.json'].includes(file)&&job.status!=='completed')throw new HttpError(404,'Файл олдсонгүй.','FILE_NOT_FOUND');const filePath=file==='source.video'?await sourceFile(dir(id)):path.join(dir(id),file);if(!await exists(filePath))throw new HttpError(404,'Файл олдсонгүй.','FILE_NOT_FOUND');if(file==='source.video')res.type('video/mp4');if(file==='preview.mn.vtt')res.type('text/vtt');res.sendFile(filePath);});
app.post('/api/voices/clone',upload.single('sample'),async(req,res)=>{try{const name=z.string().min(1).max(100).parse(req.body.name);const authorization=z.string().min(1).max(500).parse(req.body.authorizationRef);if(!req.file)throw new HttpError(400,'Зөвшөөрөлтэй voice sample хэрэгтэй.');const root=path.join(config.data,'voices');await fs.mkdir(root,{recursive:true});const result=await clone(name,req.file.path,authorization,path.join(root,`${randomUUID()}.json`));res.json(result);}finally{if(req.file)await fs.rm(req.file.path,{force:true});}});
app.use((_req,_res)=>{throw new HttpError(404,'API зам олдсонгүй.','NOT_FOUND');});
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(res.headersSent||res.destroyed)return;
  const safe=err instanceof multer.MulterError?new HttpError(err.code==='LIMIT_FILE_SIZE'?413:400,err.code==='LIMIT_FILE_SIZE'?'Файл 200 MB-аас хэтэрсэн байна.':'Upload талбар эсвэл файлын тоо буруу байна.',err.code==='LIMIT_FILE_SIZE'?'UPLOAD_TOO_LARGE':'UPLOAD_FAILED'):publicError(err);
  const requestId=context.getStore()?.requestId||String(res.getHeader('x-request-id'));
  log('request_failed',{...errorFields(err),code:safe.code,status:safe.status});
  res.status(safe.status).json({error:{code:safe.code,message:safe.message,requestId}});
});
app.listen(config.port,'127.0.0.1',()=>console.log(`API http://127.0.0.1:${config.port} | ${config.mode.toUpperCase()}`));

