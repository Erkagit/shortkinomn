export class ApiError extends Error {
  constructor(message:string,public status:number,public code:string,public requestId?:string){super(`${message}${status?` (HTTP ${status})`:''}${requestId?` · Request ID: ${requestId}`:''}`);}
}
export function responsePayload(text:string,status:number,requestId?:string|null):unknown {
  let payload:unknown;try{payload=text?JSON.parse(text):null;}catch{payload=null;}
  if(status>=200&&status<300){
    if(status===204)return undefined;
    if(payload!==null)return payload;
    throw new ApiError('Серверээс унших боломжгүй хариу ирлээ. Дахин оролдоно уу.',status,'INVALID_RESPONSE',requestId||undefined);
  }
  const error=payload&&typeof payload==='object'&&'error' in payload?payload.error:null;
  const details=error&&typeof error==='object'?error as Record<string,unknown>:{};
  const fallback=status===413?'Файл хэт том байна. 200 MB хүртэл видео сонгоно уу.':status===401?'Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.':status>=500?'Сервертэй холбогдож чадсангүй. API сервер болон холболтоо шалгаад дахин оролдоно уу.':'Хүсэлтийг гүйцэтгэж чадсангүй. Оруулсан мэдээллээ шалгана уу.';
  throw new ApiError(typeof details.message==='string'?details.message:typeof error==='string'?error:fallback,status,typeof details.code==='string'?details.code:'REQUEST_FAILED',typeof details.requestId==='string'?details.requestId:requestId||undefined);
}
