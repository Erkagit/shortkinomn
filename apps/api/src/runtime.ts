import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import type {Request,Response,NextFunction} from 'express';

export class HttpError extends Error {
  constructor(public status:number,message:string,public code='REQUEST_FAILED'){super(message);}
}
export const context=new AsyncLocalStorage<{requestId:string;jobId?:string;stage?:string;signal:AbortSignal;allowUncertain?:boolean}>();
export function log(event:string,fields:Record<string,string|number|boolean|undefined>={}){
  const current=context.getStore();
  console.log(JSON.stringify({time:new Date().toISOString(),event,requestId:current?.requestId,jobId:current?.jobId,stage:current?.stage,...fields}));
}
export function checkCancelled(){context.getStore()?.signal.throwIfAborted();}
export function requestContext(req:Request,res:Response,next:NextFunction){
  const incoming=req.get('x-request-id');
  const requestId=incoming&&/^[\da-f-]{36}$/i.test(incoming)?incoming:randomUUID();
  const controller=new AbortController(),started=Date.now();
  res.setHeader('X-Request-Id',requestId);
  req.once('aborted',()=>controller.abort());
  res.once('close',()=>{if(!res.writableFinished)controller.abort();});
  context.run({requestId,signal:controller.signal},()=>{
    res.once('finish',()=>log('http_request',{method:req.method,path:req.path,status:res.statusCode,durationMs:Date.now()-started}));
    next();
  });
}
export function publicError(error:unknown){
  if(error instanceof HttpError)return error;
  const e=error as {name?:string;code?:string;type?:string};
  if(e?.name==='AbortError')return new HttpError(409,'Үйлдлийг цуцаллаа.','CANCELLED');
  if(e?.type==='entity.too.large')return new HttpError(413,'Хүсэлтийн хэмжээ хэтэрсэн байна.','UPLOAD_TOO_LARGE');
  if(e?.type==='entity.parse.failed'||e?.name==='ZodError')return new HttpError(400,'Оруулсан мэдээлэл буруу байна. Талбаруудаа шалгана уу.','VALIDATION_FAILED');
  if(e?.code==='ENOSPC'||e?.code==='EACCES'||e?.code==='EPERM')return new HttpError(503,'Сервер файл хадгалж чадсангүй. Дискний сул зай болон бичих эрхийг шалгана уу.','STORAGE_UNAVAILABLE');
  if(e?.code?.startsWith('SQLITE_CONSTRAINT'))return new HttpError(409,'Энэ бүртгэл давхардсан эсвэл холбоотой бүртгэл олдсонгүй.','CONFLICT');
  return new HttpError(500,'Серверийн алдаа гарлаа. Request ID-аар логийг шалгаад дахин оролдоно уу.','INTERNAL_ERROR');
}
// Deliberately exclude error.message/stack: provider payloads can contain dialogue or secrets.
export function errorFields(error:unknown){const e=error as {name?:string;code?:string};return {errorType:e?.name||'UnknownError',technicalCode:e?.code&&/^[\w-]{1,80}$/.test(e.code)?e.code:undefined};}
