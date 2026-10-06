import {HttpError} from './runtime.js';
import {z} from 'zod';
export const segmentSchema=z.object({
  id:z.string().regex(/^s\d+$/), start:z.number().finite().nonnegative(), end:z.number().finite().positive(),
  speaker:z.string().min(1).max(100), source:z.string().min(1).max(3000), target:z.string().max(3000),
  flags:z.array(z.string()).default([])
}).strict().refine(s=>s.end>s.start,'end must exceed start');
export type Segment=z.infer<typeof segmentSchema>;
export const contextSchema=z.object({
  synopsis:z.string().max(12000).default(''), characters:z.string().max(12000).default(''),
  glossary:z.array(z.object({source:z.string().min(1),target:z.string().min(1)})).max(200).default([])
});
export const editsSchema=z.object({segments:z.array(segmentSchema).max(100),context:contextSchema,
  voices:z.record(z.string().max(200)),transcriptReviewed:z.boolean(),translationReviewed:z.boolean(),bedReviewed:z.boolean()}).strict();
export type Status='uploaded'|'preparing'|'transcript_ready'|'translating'|'translation_ready'|'rendering'|'completed'|'failed'|'cancelled';
export interface Job {
  runActive?:boolean; requestId?:string; errorCode?:string; startedAt?:string; finishedAt?:string; stage?:string;
  outputMode?: 'subtitles'|'dubbed';
  lastAction?: 'prepare'|'translate'|'render'|'subtitles'|'subtitle_auto';
  id:string; name:string; createdAt:string; revision:number; mode:'demo'|'live'; status:Status; progress:string;
  duration:number; sourceLanguage:string; background:'api'|'uploaded'|'none'; error?:string;
  segments:Segment[]; context:z.infer<typeof contextSchema>; voices:Record<string,string>;
  transcriptReviewed:boolean;translationReviewed:boolean;bedReviewed:boolean;
  transcriptDone:boolean;bedDone:boolean;
}
export function validateTimeline(segments:Segment[],duration:number){
  if(!segments.length)throw new HttpError(422,'Ярианы мөр алга.');
  const ids=new Set<string>(); let last=-1;
  for(const s of segments){
    segmentSchema.parse(s);
    if(ids.has(s.id)||s.start<last||s.end>duration+.02)throw new HttpError(422,'Давхардсан ID эсвэл буруу timeline.');
    ids.add(s.id);last=s.start;
  }
}
export function stamp(seconds:number){let n=Math.round(seconds*1000);const h=Math.floor(n/3600000);n%=3600000;const m=Math.floor(n/60000);n%=60000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(Math.floor(n/1000)).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;}
export function srt(segments:Segment[],target=false){return segments.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${target?s.target:s.source}\n`).join('\n');}
export function groupWords(words:{text:string;start:number;end:number;speaker_id?:string|null;type:string}[]):Segment[]{
  const segments:Segment[]=[];
  for(const w of words){
    if(w.type!=='word'||!w.text.trim())continue;
    if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<=w.start)throw new HttpError(422,'STT timestamp алдаатай.');
    const speaker=w.speaker_id||'UNKNOWN';const prev=segments.at(-1);
    if(!prev||prev.speaker!==speaker||w.start-prev.end>.7||w.end-prev.start>8||/[.!?]$/.test(prev.source))
      segments.push({id:`s${segments.length}`,start:w.start,end:w.end,speaker,source:w.text,target:'',flags:speaker==='UNKNOWN'?['speaker_unknown']:[]});
    else{prev.source+=` ${w.text}`;prev.end=Math.max(prev.end,w.end);}
  }
  segments.sort((a,b)=>a.start-b.start);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length&&segments[j].start<segments[i].end;j++){
    segments[i].flags.push('overlap_review');segments[j].flags.push('overlap_review');
  }
  return segments;
}
