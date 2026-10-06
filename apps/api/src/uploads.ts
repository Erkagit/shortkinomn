import {createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import multer from 'multer';
import type {RequestHandler} from 'express';
import {config} from './config.js';
import {one,execute} from './platform/db.js';
import {load} from './store.js';
import {HttpError} from './runtime.js';

const temp=path.join(config.data,'tmp');
export async function cleanUploads(){
  await fs.mkdir(temp,{recursive:true});
  for(const item of await fs.readdir(temp,{withFileTypes:true}))if(item.isFile()&&/^([a-f\d-]{36}\.upload|[a-f\d]{32})$/.test(item.name))await fs.rm(path.join(temp,item.name),{force:true});
  execute("DELETE FROM upload_requests WHERE job_id IS NULL");
}
const storage:multer.StorageEngine={
  _handleFile(req,file,cb){
    const filename=randomUUID()+'.upload',target=path.join(temp,filename),output=createWriteStream(target,{flags:'wx'});
    const controller=new AbortController();const abort=()=>controller.abort();req.once('aborted',abort);
    if(req.aborted)abort();
    void pipeline(file.stream,output,{signal:controller.signal}).then(()=>cb(null,{destination:temp,filename,path:target,size:output.bytesWritten}),async error=>{await fs.rm(target,{force:true}).catch(()=>{});cb(error);}).finally(()=>req.off('aborted',abort));
  },
  _removeFile(_req,file,cb){void fs.rm(file.path,{force:true}).then(()=>cb(null),cb);}
};
export const upload=multer({storage,limits:{fileSize:config.maxBytes,files:2,fields:10,fieldSize:16384,parts:12},fileFilter:(_req,file,cb)=>{
  const video=file.fieldname==='video';
  const extension=video?/\.(mp4|mov|webm|mkv)$/i:/\.(wav|mp3|m4a|aac|ogg|flac)$/i;
  const mime=video?['video/mp4','video/quicktime','video/webm','video/x-matroska'].includes(file.mimetype):file.mimetype.startsWith('audio/')||file.mimetype==='application/ogg';
  if(extension.test(file.originalname)&&(mime||file.mimetype==='application/octet-stream'))cb(null,true);
  else cb(new HttpError(400,video?'MP4, MOV, MKV эсвэл WebM видео сонгоно уу.':'Аудио файлын төрөл тохирохгүй байна.','UNSUPPORTED_FILE'));
}});
// Reserve before consuming multipart bytes; completed retries return the original job.
export const reserveUpload:RequestHandler=async(req,res,next)=>{
  try{
    const key=req.get('idempotency-key');if(!key)return next();
    if(!/^[\da-f-]{36}$/i.test(key))throw new HttpError(400,'Upload түлхүүр буруу байна.','VALIDATION_FAILED');
    const userId=req.user!.id;
    const previous=one<{job_id:string|null}>('SELECT job_id FROM upload_requests WHERE user_id=? AND request_key=?',userId,key);
    if(previous?.job_id){res.status(201).json(await load(previous.job_id));return;}
    if(previous)throw new HttpError(409,'Энэ видео серверт орж байна. Түр хүлээгээд дахин оролдоно уу.','UPLOAD_IN_PROGRESS');
    execute('INSERT INTO upload_requests(user_id,request_key) VALUES(?,?)',userId,key);
    res.once('close',()=>execute('DELETE FROM upload_requests WHERE user_id=? AND request_key=? AND job_id IS NULL',userId,key));
    next();
  }catch(error){next(error);}
};
