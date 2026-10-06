'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useResource, Failure, Skeleton } from './catalog';
import { Icon } from '../Icon';
import type { Job } from '../../app/types';
import { jobLabels } from '../../lib/workflow';
import {api} from '../../lib/platform';
import {dubbingEnabled} from '../../lib/features';

export function ProcessingJobs() {
  const { data, error, reload } = useResource<Job[]>('/jobs');
  const active = data?.some(job => job.busy);
  const [actionError,setActionError]=useState(''),[pending,setPending]=useState('');const running=useRef(false);
  async function act(job:Job,action:string){
    if(running.current)return;
    if(action==='cancel'&&!window.confirm('Боловсруулалтыг зогсоох уу? Дууссан үр дүн хадгалагдана.'))return;
    running.current=true;setPending(job.id);setActionError('');
    try{await api(`/jobs/${job.id}/${action}`,{method:'POST'});reload();}catch(error){setActionError((error as Error).message);}finally{running.current=false;setPending('');}
  }
  useEffect(() => { if (!active) return; const id = setTimeout(reload, 5000); return () => clearTimeout(id); }, [active, data]);
  return <><div className="admin-heading"><div><span className="eyebrow">shortkinomn / БОЛОВСРУУЛАЛТ</span><h1>Боловсруулалтын ажлууд</h1></div><button className="button secondary" onClick={reload}>Шинэчлэх</button></div>
    <p className="admin-note">Боловсруулалтын төлөв болон алдааг эндээс хянана. Бэлэн болсон видеог студид үзэж шалгасны дараа нийтэлнэ.</p>
    {actionError&&<p role="alert" className="form-error">{actionError}</p>}
    {error ? <Failure error={error} retry={reload}/> : !data ? <Skeleton/> : !data.length ? <div className="empty-state"><Icon name="history"/><h2>Боловсруулалтын ажил алга</h2><p>Кино, анги үүсгээд студид видео оруулаарай.</p><Link className="button" href="/admin/movies">Кинонууд руу очих</Link></div> : <div className="processing-list">{data.map(job => <article className="processing-job" key={job.id}><span className="processing-icon"><Icon name={job.busy ? 'loader' : job.status === 'failed' ? 'alert' : 'video'} className={job.busy ? 'spin' : ''}/></span><div><h2>{job.movieTitle ? `${job.movieTitle} · ${job.episodeNumber}-р анги` : job.name}</h2><p>{job.name}</p><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString("mn-MN")} · {job.mode==='live'?'Live':'Demo'}</time><span className={`status-badge ${job.status === 'failed' ? 'error' : job.busy ? 'processing' : ''}`}>{jobLabels[job.status] || job.status}</span><p className="job-progress">{job.progress}</p>{job.error && <p className="form-error" role="alert">{job.error}{job.requestId&&<small> · Request ID: {job.requestId}</small>}</p>}</div><div className="job-actions">{job.busy&&<button className="button secondary" disabled={pending===job.id} onClick={()=>void act(job,'cancel')}>Цуцлах</button>}{!job.busy&&['failed','cancelled'].includes(job.status)&&job.lastAction&&job.errorCode!=='PROVIDER_OUTCOME_UNKNOWN'&&(dubbingEnabled||job.lastAction!=='render')&&<button className="button secondary" disabled={pending===job.id} onClick={()=>void act(job,job.lastAction!)}>Үргэлжлүүлэх</button>}{job.episodeId ? <Link className="button secondary" href={`/admin/translation?episode=${job.episodeId}&job=${job.id}`}>Студид нээх <Icon name="right"/></Link> : <span className="muted">Ангитай холбоогүй хуучин ажил</span>}</div></article>)}</div>}
  </>;
}
