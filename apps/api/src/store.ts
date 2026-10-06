import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {config} from './config.js';import type {Job} from './model.js';
import {HttpError} from './runtime.js';
export const jobsRoot=path.join(config.data,'jobs');
export function dir(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw new HttpError(400,'Ажлын ID буруу байна.','VALIDATION_FAILED');return path.join(jobsRoot,id);}
export async function exists(file:string){return fs.access(file).then(()=>true,()=>false);}
export async function save(job:Job){
  job.revision++;
  const file=path.join(dir(job.id),'job.json');
  await fs.mkdir(dir(job.id),{recursive:true});
  const temp=`${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp,JSON.stringify(job,null,2));
    // Windows can briefly deny atomic replacement while a poller or scanner holds a read handle.
    // Keep the old file intact and retry; never delete it as a replacement strategy.
    for(let attempt=0;;attempt++){
      try { await fs.rename(temp,file); break; }
      catch(error){
        const code=(error as NodeJS.ErrnoException).code;
        if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(code||'')||attempt>=7)throw error;
        await new Promise(resolve=>setTimeout(resolve,Math.min(25*2**attempt,250)));
      }
    }
  } finally { await fs.rm(temp,{force:true}).catch(()=>{}); }
}
export async function load(id:string):Promise<Job>{try{return JSON.parse(await fs.readFile(path.join(dir(id),'job.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new HttpError(404,'Ажил олдсонгүй.','JOB_NOT_FOUND');throw e;}}
export async function list():Promise<Job[]>{await fs.mkdir(jobsRoot,{recursive:true});const items=await fs.readdir(jobsRoot);return (await Promise.all(items.map(id=>load(id).catch(()=>null)))).filter((x):x is Job=>!!x).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function cleanPartialFiles(id:string){
  for(const folder of [dir(id),path.join(dir(id),'cache'),path.join(dir(id),'clips')]){
    const files=await fs.readdir(folder,{withFileTypes:true}).catch(()=>[]);
    for(const file of files)if(file.isFile()&&(/\.(partial\.wav|partial\.mp4|stretch\.wav|tmp\.wav|tmp)$/.test(file.name)||['rendering.mp4','subtitle-rendering.mp4'].includes(file.name)))await fs.rm(path.join(folder,file.name),{force:true});
  }
}
export async function recover(){for(const job of await list()){await cleanPartialFiles(job.id);if(job.runActive||['preparing','translating','rendering'].includes(job.status)){job.runActive=false;job.status='failed';job.errorCode='SERVER_RESTARTED';job.error='Сервер дахин ассан. Дууссан шат хадгалагдсан. Үргэлжлүүлэхэд хариу нь тодорхойгүй төлбөртэй хүсэлтийг автоматаар давтахгүй.';await save(job);}}}
