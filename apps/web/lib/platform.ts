import {ApiError,responsePayload} from './api-error';
export {ApiError} from './api-error';
export interface User { id: string; email: string; name: string; avatar: string; role: 'USER' | 'ADMIN' }
export interface Category { id: string; name: string; slug: string }
export interface Movie { id: string; slug: string; title_mn: string; title_original: string; description: string; poster_url: string; backdrop_url: string; trailer_url: string; year: number; country: string; price: number; status: string; featured: number; trending: number; new_release: number; total_episodes: number; episode_count: number; free_episode_count: number; free_intro_count: number; categories: Category[]; genres: Category[] }
export interface Episode { completed?:number; current_time?:number; id: string; movie_id: string; episode_number: number; title: string; duration: number; is_free: number; status: string; locked: boolean; job_id?: string; title_mn?: string }
export interface Progress { episode_id: string; current_time: number; duration: number; completed: number; episode_number: number; movie: Movie }
export interface Library { progress: Progress[]; continueWatching: Progress[]; favorites: Movie[]; purchased: Movie[] }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try{
    const response = await fetch(`/api${path}`, { ...options, headers: { 'x-mn-dub': '1', ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    return responsePayload(await response.text(),response.status,response.headers.get('x-request-id')) as T;
  }catch(error){if(error instanceof ApiError||(error as Error).name==='AbortError')throw error;throw new ApiError('Сүлжээ тасарлаа. Холболтоо шалгаад дахин оролдоно уу.',0,'NETWORK_ERROR');}
}
export function uploadVideo<T>(body:FormData,key:string,signal:AbortSignal,onProgress:(loaded:number,total:number)=>void):Promise<T>{
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('POST','/api/jobs');xhr.timeout=300000;
    xhr.setRequestHeader('x-mn-dub','1');xhr.setRequestHeader('idempotency-key',key);
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded,event.total);};
    const abort=()=>xhr.abort();signal.addEventListener('abort',abort,{once:true});
    xhr.onloadend=()=>signal.removeEventListener('abort',abort);
    xhr.onload=()=>{try{resolve(responsePayload(xhr.responseText,xhr.status,xhr.getResponseHeader('x-request-id')) as T);}catch(error){reject(error);}};
    xhr.onerror=()=>reject(new ApiError('Upload-ийн холболт тасарлаа. Дахин оролдоход өмнө үүссэн ажил давхардахгүй.',0,'NETWORK_ERROR'));
    xhr.ontimeout=()=>reject(new ApiError('Upload-ийн хугацаа дууслаа. Холболтоо шалгаад дахин оролдоно уу.',0,'UPLOAD_TIMEOUT'));
    xhr.onabort=()=>reject(new DOMException('Upload цуцлагдлаа.','AbortError'));
    if(signal.aborted){reject(new DOMException('Upload цуцлагдлаа.','AbortError'));return;}xhr.send(body);
  });
}
export const money = (value: number) => `${new Intl.NumberFormat('mn-MN').format(value)}₮`;
export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
export function freeLabel(movie: Movie) {
  if (!movie.episode_count) return 'Нийтлэгдсэн анги алга';
  if (movie.free_intro_count) return `Эхний ${movie.free_intro_count} анги үнэгүй`;
  return movie.free_episode_count ? `${movie.free_episode_count} анги үнэгүй` : 'Үзэх эрх шаардлагатай';
}
