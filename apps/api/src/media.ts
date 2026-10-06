import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';
import {config} from './config.js';import type {Job} from './model.js';
import {context,HttpError,log,checkCancelled} from './runtime.js';
export function run(bin:string,args:string[],timeout=600000,signal=context.getStore()?.signal):Promise<string>{
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const started=Date.now(),child=spawn(bin,args,{shell:false,windowsHide:true});let out='',failure:unknown;
    const abort=()=>{failure=signal?.reason||new DOMException('Cancelled','AbortError');child.kill('SIGKILL');};
    const timer=setTimeout(()=>{failure=new HttpError(504,'Видео боловсруулах хугацаа дууслаа. Богино клип ашиглаад дахин оролдоно уу.','MEDIA_TIMEOUT');child.kill('SIGKILL');},timeout);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    child.stdout.on('data',d=>{out+=d;if(out.length>4*1024*1024){failure=new HttpError(422,'Видео metadata хэт том байна.','INVALID_MEDIA');child.kill('SIGKILL');}});
    child.stderr.resume();
    child.on('error',()=>{failure=new HttpError(503,'FFmpeg/FFprobe ажиллахгүй байна. Серверийн executable зам болон эрхийг шалгана уу.','MEDIA_UNAVAILABLE');});
    child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);log('media_process',{binary:path.basename(bin),exitCode:code??-1,durationMs:Date.now()-started});
      if(failure)reject(failure);else if(code===0)resolve(out);else reject(new HttpError(422,'Видео боловсруулах боломжгүй байна. Файл эвдэрсэн эсэх, аудио болон видео track-ийг шалгана уу.','INVALID_MEDIA'));
    });
  });
}
export const ff=(...args:string[])=>run(config.ffmpeg,['-hide_banner','-loglevel','error','-y',...args]);
export async function probe(file:string){return JSON.parse(await run(config.ffprobe,['-v','error','-show_format','-show_streams','-of','json',file]));}
export async function duration(file:string){const p=await probe(file);return Number(p.format.duration);}
export async function inspect(file:string){const p=await probe(file);const v=p.streams.find((s:any)=>s.codec_type==='video');const a=p.streams.find((s:any)=>s.codec_type==='audio');if(!v||!a)throw new HttpError(422,'Видео болон аудио track хоёул хэрэгтэй.','INVALID_MEDIA');const d=Number(v.duration)||Number(p.format.duration)+Number(p.format.start_time||0)-Number(v.start_time||0);if(!Number.isFinite(d)||d<2||d>config.maxSeconds)throw new HttpError(422,`2–${config.maxSeconds} секундийн клип сонгоно уу.`,'INVALID_DURATION');return d;}
export async function sourceFile(root:string){const normalized=path.join(root,'source-timeline.mp4');return await fs.access(normalized).then(()=>normalized,()=>path.join(root,'source.video'));}
export async function alignSource(root:string,seconds:number){
  const source=path.join(root,'source.video'),output=path.join(root,'source-timeline.mp4');
  if(await fs.access(output).then(()=>true,()=>false))return;
  const metadata=await probe(source);
  const video=metadata.streams.find((s:any)=>s.codec_type==='video'),audio=metadata.streams.find((s:any)=>s.codec_type==='audio');
  const videoStart=Number(video?.start_time||0),audioStart=Number(audio?.start_time||0);
  if(!Number.isFinite(videoStart)||!Number.isFinite(audioStart))throw new HttpError(422,'Видео timestamp уншигдсангүй. Өөр файл сонгоно уу.','INVALID_MEDIA');
  if(Math.abs(videoStart)<.002&&Math.abs(audioStart)<.002)return;
  const offset=audioStart-videoStart,temp=path.join(root,'source-timeline.partial.mp4');
  // Shift both tracks by the VIDEO origin. Late audio is padded with silence;
  // audio before the first video frame is trimmed. Independent STARTPTS resets would desync them.
  const filter=`[0:v:0]setpts=PTS-STARTPTS[v];[0:a:0]asetpts=PTS-STARTPTS+(${offset})/TB,aresample=async=1:first_pts=0,apad,atrim=duration=${seconds}[a]`;
  try{
    await ff('-copyts','-i',source,'-filter_complex',filter,'-map','[v]','-map','[a]','-t',String(seconds),'-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',temp);
    checkCancelled();await fs.rename(temp,output);log('source_timeline_aligned',{videoStart,audioStart,offsetSeconds:offset});
  }finally{await fs.rm(temp,{force:true});}
}
async function atomicWav(out:string,args:string[]){const temp=out+'.partial.wav';try{await ff(...args,temp);checkCancelled();await fs.rename(temp,out);}finally{await fs.rm(temp,{force:true});}}
export async function extract(input:string,out:string){await atomicWav(out,['-i',input,'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le']);}
export async function normalize(input:string,out:string){await atomicWav(out,['-i',input,'-vn','-ac','2','-ar','48000','-c:a','pcm_s16le']);}
export async function fit(raw:string,out:string,target:number){const actual=await duration(raw),rate=actual/target;if(rate<.88||rate>1.15)throw new HttpError(422,'Хугацаанд тохирохгүй: орчуулгыг засна уу.');const tmp=out+'.stretch.wav';await ff('-i',raw,'-af',`atempo=${rate}`,'-ac','2','-ar','48000','-c:a','pcm_s16le',tmp);if(Math.abs(await duration(tmp)-target)>.03)throw new HttpError(422,'Time stretch зөрүү 30ms-ээс их.');await ff('-i',tmp,'-af',`apad,atrim=duration=${target},afade=t=in:d=0.005,afade=t=out:st=${Math.max(0,target-.005)}:d=0.005`,'-c:a','pcm_s16le',out);await fs.unlink(tmp);return {actual,rate};}
export async function render(job:Job,root:string){
  // <=100 short clips; script avoids Windows command-line filter length limits.
  const args=['-i',await sourceFile(root)];
  let index=1;const filters:string[]=[];const labels:string[]=[];
  if(job.background!=='none'){args.push('-i',path.join(root,'bed.wav'));filters.push(`[${index}:a]volume=0.65,apad,atrim=duration=${job.duration}[bed]`);labels.push('[bed]');index++;}
  for(const s of job.segments){args.push('-i',path.join(root,'clips',`${s.id}.wav`));filters.push(`[${index}:a]volume=0.7,adelay=${Math.round(s.start*48000)}S:all=1[d${index}]`);labels.push(`[d${index}]`);index++;}
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=duration=${job.duration},alimiter=limit=0.95:level=false:latency=true[out]`);
  const script=path.join(root,'mix-filter.txt');await fs.writeFile(script,filters.join(';'));
  const temp=path.join(root,'rendering.mp4');
  const version=await run(config.ffmpeg,['-version']);const major=Number(version.match(/ffmpeg version (\d+)/)?.[1]||0);
  await ff(...args,major>=7?'-/filter_complex':'-filter_complex_script',script,'-map','0:v:0','-map','[out]','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-metadata:s:a:0','language=mon','-movflags','+faststart',temp);
  if(Math.abs(await duration(temp)-job.duration)>.12)throw new HttpError(422,'Гаралтын видео хугацаа зөрсөн.');await fs.rename(temp,path.join(root,'dubbed.mp4'));
}

