import fs from 'node:fs/promises';
import {context,HttpError,checkCancelled,log} from './runtime.js';

// A durable pending marker covers the interval between billing and receiving a complete response.
// Never silently retry an ambiguous call after a disconnect, cancellation, or server restart.
export async function paidCache(file:string,produce:()=>Promise<Uint8Array>):Promise<Buffer>{
  try{return await fs.readFile(file);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  checkCancelled();
  const pending=file+'.pending',temp=file+'.tmp';
  if(context.getStore()?.allowUncertain)await fs.rm(pending,{force:true});
  try{await fs.writeFile(pending,JSON.stringify({requestId:context.getStore()?.requestId,startedAt:new Date().toISOString()}),{flag:'wx'});}
  catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new HttpError(409,'Өмнөх API хүсэлтийн төлбөр, үр дүн тодорхойгүй байна. Provider-ийн хэрэглээг шалгаад төлбөртэй дахин оролдлогыг зөвшөөрнө үү.','PROVIDER_OUTCOME_UNKNOWN');throw e;}
  const started=Date.now();
  try{
    const result=Buffer.from(await produce());
    await fs.writeFile(temp,result);await fs.rename(temp,file);await fs.rm(pending,{force:true});
    log('provider_result_saved',{durationMs:Date.now()-started,bytes:result.byteLength});return result;
  }catch(error){
    await fs.rm(temp,{force:true}).catch(()=>{});
    if(error instanceof HttpError&&error.code==='PROVIDER_REJECTED'){await fs.rm(pending,{force:true});throw error;}
    if(context.getStore()?.signal.aborted)throw error;
    throw new HttpError(502,'API-ийн бүрэн хариу ирсэнгүй. Төлбөр давхардахаас сэргийлж зогсоолоо. Provider-ийн хэрэглээг шалгана уу.','PROVIDER_OUTCOME_UNKNOWN');
  }
}
