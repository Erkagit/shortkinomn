import {randomUUID} from 'node:crypto';

export const runtime='nodejs';
export const dynamic='force-dynamic';
// Two 200 MiB files (legacy video + M&E), plus bounded multipart fields.
const maxBody=401*1024*1024;
const hopHeaders=['host','connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
async function proxy(request:Request){
  const started=Date.now(),requestId=randomUUID();
  const failure=(status:number,code:string,message:string)=>{
    console.error(JSON.stringify({event:'proxy_error',requestId,method:request.method,path:new URL(request.url).pathname,status,code,durationMs:Date.now()-started}));
    return Response.json({error:{code,message,requestId}},{status,headers:{'X-Request-Id':requestId,'Cache-Control':'no-store'}});
  };
  if(Number(request.headers.get('content-length'))>maxBody)return failure(413,'UPLOAD_TOO_LARGE','Файлын хэмжээ хэтэрсэн байна. Нэг файл 200 MB хүртэл байна.');
  const headers=new Headers(request.headers);
  for(const name of hopHeaders)headers.delete(name);
  headers.set('x-request-id',requestId);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','TimeoutError')),300000);
  let bytes=0,tooLarge=false;
  const body=request.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,out){
    bytes+=chunk.byteLength;
    if(bytes>maxBody){tooLarge=true;controller.abort();throw new Error('UPLOAD_TOO_LARGE');}
    out.enqueue(chunk);
  }}));
  try{
    const incoming=new URL(request.url),upstream=new URL(process.env.API_INTERNAL_URL||'http://127.0.0.1:4000');
    upstream.pathname=incoming.pathname;upstream.search=incoming.search;
    const response=await fetch(upstream,{method:request.method,headers,body,duplex:'half',redirect:'manual',cache:'no-store',signal:AbortSignal.any([request.signal,controller.signal])} as RequestInit & {duplex:'half'});
    const outgoing=new Headers(response.headers);
    for(const name of hopHeaders)outgoing.delete(name);
    // fetch transparently decompresses responses; do not send stale encoding/length.
    if(outgoing.has('content-encoding')){outgoing.delete('content-encoding');outgoing.delete('content-length');}
    outgoing.set('x-request-id',requestId);outgoing.set('cache-control','no-store');
    return new Response(response.body,{status:response.status,headers:outgoing});
  }catch{
    if(tooLarge)return failure(413,'UPLOAD_TOO_LARGE','Файлын хэмжээ хэтэрсэн байна. Нэг файл 200 MB хүртэл байна.');
    if(request.signal.aborted)return failure(499,'CANCELLED','Upload цуцлагдлаа.');
    if(controller.signal.aborted)return failure(504,'BACKEND_TIMEOUT','Серверийн хариуг хүлээх хугацаа дууслаа. Ажлын жагсаалтаа шалгаад дахин оролдоно уу.');
    return failure(503,'BACKEND_UNAVAILABLE','API сервертэй холбогдож чадсангүй. Сервер ажиллаж байгаа эсэхийг шалгаад дахин оролдоно уу.');
  }finally{clearTimeout(timer);}
}
export {proxy as GET,proxy as HEAD,proxy as POST,proxy as PATCH,proxy as PUT,proxy as DELETE,proxy as OPTIONS};
