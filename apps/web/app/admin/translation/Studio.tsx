'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon } from '../../../components/Icon';
import { VideoUploader } from '../../../components/VideoUploader';
import type { Health, Job } from '../../types';
import { dubbingEnabled } from '../../../lib/features';
import { api, uploadVideo } from '../../../lib/platform';
import { jobLabels as labels, workflowSteps, workflowStage } from '../../../lib/workflow';

function formatDuration(value: number) {
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

function friendlyMessage(raw: string) {
  if (raw.includes('FFmpeg/FFprobe')) return 'Видео боловсруулах серверийн хэрэгсэл бэлэн биш байна. Серверийн тохиргоог шалгана уу.';
  if (raw.includes('API тохиргоо дутуу')) return 'Бодит орчуулгын үйлчилгээ хараахан холбогдоогүй байна. API тохиргоог гүйцээнэ үү.';
  if (raw.includes('413') || raw.includes('200 MB')) return 'Файл хэт том байна. 200 MB-аас жижиг видео сонгоно уу.';
  if (raw.includes('2–180') || raw.includes('track')) return 'Энэ видео тохирохгүй байна. Аудио track-тай, 2–180 секундийн клип сонгоно уу.';
  if (raw.includes('ECONNREFUSED') || raw.includes('Failed to fetch')) return 'Серверт холбогдож чадсангүй. Dev сервер ажиллаж байгаа эсэхийг шалгана уу.';
  return raw.split(' · Request ID:')[0];
}

function Workflow({ stage }: { stage: number }) {
  const steps = workflowSteps;
  return <nav aria-label="Боловсруулах үе шат" className="workflow">{steps.map((step, index) => (
    <div className={`step${index < stage ? ' done' : ''}${index === stage ? ' active' : ''}`} key={step} aria-current={index === stage ? "step" : undefined}>
      <span className="step-dot">{index < stage ? <Icon name="check" /> : String(index + 1).padStart(2, '0')}</span>
      <span>{step}</span>
      {index < steps.length - 1 && <i />}
    </div>
  ))}</nav>;
}

function TechnicalAlert({ error, dismiss }: { error: string; dismiss: () => void }) {
  return <section className="error-alert" role="alert">
    <span className="error-mark"><Icon name="alert" /></span>
    <div className="error-copy"><strong>Ажил дууссангүй</strong><p>{friendlyMessage(error)}</p>
      <details><summary>Техникийн дэлгэрэнгүй</summary><code>{error}</code></details>
    </div>
    <button aria-label="Алдааны мэдэгдлийг хаах" className="icon-button" onClick={dismiss} type="button"><Icon name="x" /></button>
  </section>;
}

export default function Studio({ episodeId, initialJobId, movieTitle, movieSlug, episodeNumber, episodeStatus }: { episodeId: string; initialJobId?: string; movieTitle: string; movieSlug: string; episodeNumber: number; episodeStatus: string }) {
  const [health, setHealth] = useState<Health>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job>();
  const [draft, setDraft] = useState<Job>();
  const [video, setVideo] = useState<File | null>(null);
  const [bedFile, setBedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [glossary, setGlossary] = useState('[]');
  const [background, setBackground] = useState<'none' | 'api' | 'uploaded'>('none');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activity, setActivity] = useState('');
  const [processed, setProcessed] = useState(false);
  const [subtitlePreview, setSubtitlePreview] = useState(false);
  const [approved, setApproved] = useState(false);
  const [publishVersion, setPublishVersion] = useState<'subtitles' | 'dubbed'>('subtitles');
  const [publishedUrl, setPublishedUrl] = useState(episodeStatus === 'PUBLISHED' && movieSlug ? `/movies/${encodeURIComponent(movieSlug)}` : '');
  const dirty = useRef(false);
  const running = useRef(false);
  const uploadKey = useRef('');
  const uploadController = useRef<AbortController | null>(null);
  const [uploadProgress,setUploadProgress] = useState<{loaded:number;total:number}|null>(null);
  const [sourceLanguage,setSourceLanguage] = useState('auto');
  const [cancelling,setCancelling] = useState(false);
  const [allowUncertain,setAllowUncertain] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [viewedVersion, setViewedVersion] = useState('');
  const busy = Boolean(activity || job?.busy || ['preparing', 'translating', 'rendering'].includes(job?.status ?? ''));

  const speakers = useMemo(() => [...new Set(draft?.segments.map((segment) => segment.speaker) ?? [])], [draft?.segments]);
  const refreshJobs = useCallback(async () => setJobs(await api<Job[]>(`/jobs?episodeId=${episodeId}`)), [episodeId]);

  useEffect(()=>{
    const leaving=(event:BeforeUnloadEvent)=>{if(dirty.current||uploadController.current){event.preventDefault();event.returnValue='';}};
    const navigate=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target.closest('a'):null;if(target&&(dirty.current||uploadController.current)&&!window.confirm('Хадгалаагүй засвар эсвэл upload байна. Энэ хуудаснаас гарах уу?')){event.preventDefault();event.stopPropagation();}};
    const switchEpisode=(event:Event)=>{if((dirty.current||uploadController.current)&&!window.confirm('Хадгалаагүй засвар эсвэл upload байна. Өөр анги сонгох уу?'))event.preventDefault();};
    window.addEventListener('studio:before-leave',switchEpisode);window.addEventListener('beforeunload',leaving);document.addEventListener('click',navigate,true);
    return()=>{window.removeEventListener('studio:before-leave',switchEpisode);window.removeEventListener('beforeunload',leaving);document.removeEventListener('click',navigate,true);uploadController.current?.abort();};
  },[]);

  function chooseVideo(file:File|null){setVideo(file);uploadKey.current=crypto.randomUUID();setUploadProgress(null);}
  async function cancelJob(){
    if(!job||cancelling||!window.confirm('Боловсруулалтыг зогсоох уу? Дууссан шат хадгалагдана. Явсан API хүсэлт төлбөртэй байж болно.'))return;
    setCancelling(true);
    try{await api(`/jobs/${job.id}/cancel`,{method:'POST'});setNotice('Цуцалж байна. Процесс зогсохыг хүлээнэ үү.');}catch(error){setError((error as Error).message);}finally{setCancelling(false);}
  }

  function select(next: Job) {
    dirty.current = false;
    setJob(next);
    setDraft(structuredClone(next));
    setGlossary(JSON.stringify(next.context.glossary, null, 2));
    setBackground(next.background);
    setProcessed(dubbingEnabled && Boolean(next.outputs?.dubbed));
    setSubtitlePreview(Boolean(next.outputs?.subtitles));
    setPreviewError(false);
    setViewedVersion('');
    setNotice('');
    setApproved(false);
    setPublishedUrl('');
    setAllowUncertain(false);
  }

  useEffect(() => {
    let active = true;
    if (initialJobId) api<Job>(`/jobs/${initialJobId}`).then(value => { if (!active) return; if (value.episodeId !== episodeId) throw Error('Энэ ажил сонгосон ангид хамаарахгүй байна.'); select(value); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [initialJobId, episodeId]);

  useEffect(() => {
    let active = true;
    api<Health>('/health').then((value) => {
      if (!active) return;
      setHealth(value);
      setBackground(dubbingEnabled && value.mode === 'live' ? 'api' : 'none');
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Server unavailable');
    });
    refreshJobs().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to load jobs');
    });
    return () => { active = false; };
  }, [refreshJobs]);

  useEffect(() => {
    if (!video) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(video);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);

  useEffect(() => {
    if (job?.outputs?.subtitles) { setSubtitlePreview(true); setProcessed(false); }
  }, [job?.id, job?.outputs?.subtitles]);

  useEffect(() => {
    if (!job?.id) return;
    let active = true;
    const id = job.id;
    const timer = window.setInterval(async () => {
      try {
        const latest = await api<Job & { busy?: boolean }>(`/jobs/${id}`);
        if (!active) return;
        setJob((current) => {
          if (current && current.status !== 'failed' && latest.status === 'failed' && latest.error) setError(`${latest.error}${latest.requestId ? ` · Request ID: ${latest.requestId}` : ''}`);
          return latest;
        });
        if (!dirty.current) {
          setDraft(structuredClone(latest));
          setGlossary(JSON.stringify(latest.context.glossary, null, 2));
        }
        await refreshJobs();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Job update failed');
      }
    }, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [job?.id, refreshJobs]);

  async function task(label: string, work: () => Promise<void>) {
    if (running.current || busy) return;
    running.current = true;
    setActivity(label);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      if(reason instanceof Error&&reason.name==='AbortError')setNotice('Upload цуцлагдлаа. Файлаа дахин оруулж болно.');
      else setError(reason instanceof Error ? reason.message : 'Unexpected error');
    } finally {
      running.current = false;
      setActivity('');
    }
  }

  function edit(patch: Partial<Job>) {
    dirty.current = true;
    setApproved(false);
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  async function saveDraft() {
    if (!draft) throw new Error('Select a job first.');
    let terms: Job['context']['glossary'];
    try {
      terms = JSON.parse(glossary) as Job['context']['glossary'];
      if (!Array.isArray(terms) || terms.some((term) => !term || typeof term.source !== 'string' || typeof term.target !== 'string')) {
        throw new Error('Glossary must be a list of source/target pairs.');
      }
    } catch {
      throw new Error('Нэр томьёоны JSON форматыг шалгана уу.');
    }
    const saved = await api<Job>(`/jobs/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segments: draft.segments, voices: draft.voices, context: { ...draft.context, glossary: terms },
        transcriptReviewed: draft.transcriptReviewed, translationReviewed: draft.translationReviewed,
        bedReviewed: draft.bedReviewed, revision: draft.revision,
      }),
    });
    select(saved);
    return saved;
  }

  async function upload() {
    if (!video) return;
    await task('Видео байршуулж байна…', async () => {
      const ready = await api<Health>('/health');
      setHealth(ready);
      if (!ready.ffmpeg || !ready.ffprobe) throw Error('Серверийн FFmpeg/FFprobe бэлэн биш байна. FFMPEG_PATH болон FFPROBE_PATH тохиргоог шалгана уу.');
      if (ready.mode === 'live' && (!ready.openaiConfigured || !ready.elevenConfigured)) throw Error('Бодит орчуулгын API тохиргоо дутуу байна. OPENAI_API_KEY болон ELEVENLABS_API_KEY тохируулна уу.');
      const form = new FormData();
      form.append('episodeId', episodeId);
      form.append('outputMode', dubbingEnabled ? 'dubbed' : 'subtitles');
      form.append('sourceLanguage',sourceLanguage);
      form.append('video', video);
      form.append('background', dubbingEnabled ? background : 'none');
      if (dubbingEnabled && background === 'uploaded' && bedFile) form.append('bed', bedFile);
      if(!uploadKey.current)uploadKey.current=crypto.randomUUID();
      const controller=new AbortController();uploadController.current=controller;setUploadProgress({loaded:0,total:video.size});
      let created:Job;
      try{created=await uploadVideo<Job>(form,uploadKey.current,controller.signal,(loaded,total)=>setUploadProgress({loaded,total}));}
      finally{uploadController.current=null;setUploadProgress(null);}
      select(created);
      if (!dubbingEnabled) {
        await api(`/jobs/${created.id}/subtitle_auto`, { method: 'POST' });
        setJob(current => current ? { ...current, busy: true } : current);
      }
      await refreshJobs();
      setNotice(dubbingEnabled ? 'Видео бэлэн. “Яриаг таних” товчийг дарж үргэлжлүүлнэ үү.' : 'Монгол хадмалыг автоматаар бэлтгэж байна. Дуусахад preview нээгдэнэ.');
    });
  }

  async function action(name: 'prepare' | 'translate' | 'render' | 'subtitles' | 'subtitle_auto') {
    if (!job || !draft || (!dubbingEnabled && name === 'render')) return;
    await task(name === 'prepare' ? 'Яриаг таньж байна…' : name === 'translate' ? 'Монгол хэл рүү орчуулж байна…' : 'Видео үүсгэж байна…', async () => {
      if (dirty.current && draft.segments.length) await saveDraft();
      const uncertain=allowUncertain;
      if(uncertain&&!window.confirm('Хариу нь тодорхойгүй API хүсэлтийг дахин явуулах уу? Давхар төлбөр гарах боломжтой.'))return;
      await api(`/jobs/${job.id}/${name}`, { method: 'POST',body:JSON.stringify({allowUncertain:uncertain}) });
      setAllowUncertain(false);
      setJob((current) => current ? { ...current, busy: true } : current);
    });
  }

  async function publish() {
    if (!job || !draft) return;
    await task('Нийтэлж байна…', async () => {
      if (dirty.current) throw Error('Эхлээд өөрчлөлтөө хадгалж, хувилбараа дахин бэлтгэнэ үү.');
      const result = await api<{ publicUrl: string }>(`/admin/episodes/${episodeId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, version: dubbingEnabled ? publishVersion : 'subtitles', approved: true }),
      });
      setPublishedUrl(result.publicUrl);
      setNotice('Кино амжилттай нийтлэгдлээ.');
    });
  }

  async function replaceBed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job || !bedFile) return;
    await task('Арын дуу байршуулж байна…', async () => {
      const form = new FormData();
      form.append('bed', bedFile);
      const saved = await api<Job>(`/jobs/${job.id}/bed`, { method: 'POST', body: form });
      select(saved);
      setBedFile(null);
      setNotice('Арын дуу солигдлоо. Яриа салгах үйлдлийг дахин ажиллуулна уу.');
    });
  }

  async function cloneVoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    await task('Voice үүсгэж байна…', async () => {
      const result = await api<{ voice_id: string; requires_verification?: boolean }>('/voices/clone', { method: 'POST', body: new FormData(formElement) });
      setNotice(`Voice ID: ${result.voice_id}${result.requires_verification ? ' · Баталгаажуулах шаардлагатай.' : ''}`);
      formElement.reset();
    });
  }

  function newVideo() {
    if(dirty.current&&!window.confirm('Хадгалаагүй засварыг орхиод шинэ видео оруулах уу?'))return;
    dirty.current = false;
    setJob(undefined);
    setDraft(undefined);
    setVideo(null);
    uploadKey.current='';setUploadProgress(null);
    setBedFile(null);
    setProcessed(false);
    setError('');
    setNotice('');
    setPublishedUrl('');
    setBackground(dubbingEnabled && health?.mode === 'live' ? 'api' : 'none');
  }

  const hasAllVoices = Boolean(draft && speakers.every((speaker) => draft.voices[speaker]?.trim() && speaker !== 'UNKNOWN'));
  const canRender = Boolean(draft?.translationReviewed && draft.segments.every((segment) => segment.target.trim()));
  const isBedReady = Boolean(draft && (draft.background === 'none' || draft.bedReviewed));
  const publishBlockReason = !job?.outputs?.[publishVersion]
    ? publishVersion === 'subtitles' ? 'Хадмалтай боловсруулсан видео бэлэн болоогүй байна.' : 'Дубляжтай боловсруулсан видео бэлэн болоогүй байна.'
    : !draft?.translationReviewed ? 'Монгол орчуулгыг шалгаж, хадгална уу.'
    : viewedVersion !== publishVersion ? 'Нийтлэх хувилбарыг preview дээр тоглуулж шалгана уу.'
    : !approved ? 'Шалгалтын зөвшөөрлийг тэмдэглэнэ үү.'
    : dirty.current ? 'Эхлээд өөрчлөлтөө хадгалж, хувилбараа дахин бэлтгэнэ үү.'
    : '';
  const processingProgress = job?.progress ?? activity;
  const progressMatch = processingProgress.match(/(\d+)\s*\/\s*(\d+)/);
  const progressValue = progressMatch && Number(progressMatch[2]) > 0 ? Math.min(100, Math.round((Number(progressMatch[1]) / Number(progressMatch[2])) * 100)) : undefined;
  const videoSrc = dubbingEnabled && processed && job?.outputs?.dubbed
    ? `/api/jobs/${job.id}/files/dubbed.mp4`
    : subtitlePreview && job?.outputs?.subtitles ? `/api/jobs/${job.id}/files/subtitle-preview.mp4` : (job ? `/api/jobs/${job.id}/files/source.video` : previewUrl);

  return (
    <div className={`studio-workspace${job ? ' has-job' : ' awaiting-upload'}`}>
      <header className="topbar"><div><span className="eyebrow">БОЛОВСРУУЛАХ АНГИ</span><h2>{movieTitle} · {episodeNumber}-р анги</h2></div>{job && <button className="secondary" disabled={busy} onClick={newVideo}>Өөр видео оруулах</button>}</header>

      {health?.mode === 'demo' && <div className="banner"><Icon name="sparkles" /> <span><strong>Demo горим:</strong> жишээ яриа, орчуулга ашиглана. Бодит API орчуулга биш.</span></div>}
      <details className="health-panel"><summary><span className="status-badge">{health ? health.mode === 'live' ? 'Live · Бодит API' : 'Demo · Туршилт' : 'Холболтыг шалгаж байна'}</span> Үйлчилгээний төлөв</summary>{health&&<ul><li>FFmpeg / FFprobe: {health.ffmpeg&&health.ffprobe?'Бэлэн':'Бэлэн биш — серверийн executable замыг шалгана уу.'}</li><li>Яриа таних: {health.elevenConfigured?'Түлхүүр тохируулсан':'ElevenLabs түлхүүр дутуу'}</li><li>Орчуулга: {health.openaiConfigured?'Түлхүүр тохируулсан':'OpenAI түлхүүр дутуу'}</li></ul>}<p>Түлхүүрийн төлөв нь үлдэгдэл, model болон API эрхийг батлахгүй.</p><button className="secondary" onClick={()=>void task('Холболтыг шалгаж байна…',async()=>setHealth(await api<Health>('/health')))}>Дахин шалгах</button></details>
      {error && <TechnicalAlert dismiss={() => setError('')} error={error} />}
      {job?.errorCode==='PROVIDER_OUTCOME_UNKNOWN'&&<label className="checkbox-row"><input type="checkbox" checked={allowUncertain} onChange={event=>setAllowUncertain(event.target.checked)}/>Provider-ийн хэрэглээг шалгасан. Давхар төлбөр гарах эрсдэлтэй дахин оролдлогыг зөвшөөрнө.</label>}
      {job && ['failed','cancelled'].includes(job.status) && job.lastAction && (dubbingEnabled || job.lastAction !== 'render') && <button className="secondary" disabled={busy || (job.errorCode==='PROVIDER_OUTCOME_UNKNOWN'&&!allowUncertain)} onClick={() => void action(job.lastAction!)}>Тасарсан алхмыг дахин ажиллуулах</button>}
      {notice && <div className="success-notice" role="status"><Icon name="check" />{notice}{publishedUrl && <Link className="published-link" href={publishedUrl}>Үндсэн сайтаас үзэх →</Link>}</div>}
      <Workflow stage={workflowStage(job, draft)} />
      <p className="next-step" role="status"><strong>Дараагийн алхам:</strong> {busy ? (job?.progress || activity) : job?.status==='failed'||job?.status==='cancelled' ? 'Алдааны тайлбарыг шалгаад тасарсан алхмаа үргэлжлүүлнэ үү.' : ['Кино, ангиа шалгаад видео файлаа оруулна уу.', 'Хадмал бэлтгэх үйлдлээр яриа таних, орчуулах алхмууд үргэлжилнэ.', 'Монгол орчуулгыг бэлтгэж, мөр бүрийг хянаад хадгална уу.', dubbingEnabled ? 'Хоолойгоо тохируулаад дубляж эсвэл хадмалтай хувилбар бэлтгэнэ үү.' : 'Монгол хадмалтай хувилбараа бэлтгэнэ үү.', 'Бэлэн хувилбарыг тоглуулж шалгаад, доорх нийтлэх хэсэгт батална уу.'][workflowStage(job, draft)]}</p>
      {job?.busy&&<button className="secondary cancel-job" disabled={cancelling} onClick={()=>void cancelJob()}>Боловсруулалтыг цуцлах</button>}

      <div className="workspace">
        <section className="studio-main">
          <section className="card preview-card">
            <div className="title"><div><span className="eyebrow">УРЬДЧИЛАН ҮЗЭХ</span><h2>{job?.name ?? video?.name ?? 'Видеогоо урьдчилан харах'}</h2></div>{job && <span className="pill">{labels[job.status] ?? job.status}</span>}</div>
            <div className="preview-tabs"><button className={!processed && !subtitlePreview ? 'selected' : ''} onClick={() => { setPreviewError(false); setProcessed(false); setSubtitlePreview(false); }} type="button">Эх видео</button><button className={subtitlePreview ? 'selected' : ''} disabled={!job?.outputs?.subtitles || busy} onClick={() => { setPreviewError(false); setProcessed(false); setSubtitlePreview(true); }} type="button">Хадмалтай</button>{dubbingEnabled && <button className={processed ? 'selected' : ''} disabled={!job?.outputs?.dubbed || busy} onClick={() => { setPreviewError(false); setProcessed(true); setSubtitlePreview(false); }} type="button">Дубляжтай</button>}{job && <span><Icon name="clock" /> {formatDuration(job.duration)}</span>}</div>
            <div className="video-frame">
              {videoSrc ? <video key={videoSrc} controls playsInline preload="metadata" src={videoSrc} aria-label="Боловсруулж буй ангийн preview" onError={() => setPreviewError(true)} onPlay={() => { if (processed || subtitlePreview) setViewedVersion(processed ? 'dubbed' : 'subtitles'); }} onTimeUpdate={() => { if (processed || subtitlePreview) setViewedVersion(processed ? 'dubbed' : 'subtitles'); }}>{subtitlePreview && job && <track default kind="subtitles" srcLang="mn" label="Монгол" src={`/api/jobs/${job.id}/files/preview.mn.vtt`}/>}</video> : <div className="video-empty"><span><Icon name="film" /></span><strong>Видео энд харагдана</strong><small>Клипээ сонгоход урьдчилан харах боломжтой.</small></div>}
              <span className="video-tag">{processed ? 'ДУБЛЯЖТАЙ' : subtitlePreview ? 'ХАДМАЛТАЙ' : videoSrc ? 'ЭХ ВИДЕО' : 'PREVIEW'}</span>
            </div>
            {previewError && <p className="field-error" role="alert">Видео ачаалж чадсангүй. Бэлэн хувилбараа сонгоод дахин оролдоно уу.</p>}
            {busy && (
              <div aria-live="polite" className="progress-card" role="status">
                <Icon className="spin" name="loader" /><div><strong>{processingProgress || 'Видео боловсруулж байна…'}</strong><small>{health?.mode === 'demo' ? 'Demo горим · Бодит API төлбөргүй' : 'Боловсруулалт үргэлжилж байна'}</small><div aria-label={progressValue === undefined ? 'Боловсруулж байна' : `Боловсруулалт ${progressValue}%`} aria-valuemax={progressValue === undefined ? undefined : 100} aria-valuemin={progressValue === undefined ? undefined : 0} aria-valuenow={progressValue} className={`progress-track${progressValue === undefined ? ' indeterminate' : ''}`} role="progressbar"><i style={progressValue === undefined ? undefined : { width: `${progressValue}%` }} /></div></div>
              </div>
            )}
            {job && (job.outputs?.subtitles || (dubbingEnabled && job.outputs?.dubbed)) && <div className="result-banner"><span><Icon name="check" /></span><div><strong>Таны видео бэлэн боллоо</strong><small>Бэлэн файл нийтлэгдээгүй. Preview шалгаад нийтэлнэ үү.</small></div><a className="download-button" download href={`/api/jobs/${job.id}/files/${dubbingEnabled && processed ? 'dubbed.mp4' : 'subtitle-preview.mp4'}`}><Icon name="download" /> Видео татах</a></div>}
          </section>

          {job && draft && <section className="card transcript-card">
            <div className="title"><div><span className="eyebrow">02–03 · ХЯНАЛТ</span><h2>Яриа ба орчуулга</h2></div><button disabled={busy || !draft.segments.length} onClick={() => void task('Хадгалж байна…', async () => { await saveDraft(); setNotice('Өөрчлөлт хадгалагдлаа.'); })} type="button">Хадгалах</button></div>
            {!draft.segments.length ? <div className="empty-transcript"><Icon name="language" /><strong>Ярианы мөр хараахан алга</strong><small>Үргэлжлүүлэхийн тулд “Яриаг таних” алхмыг ажиллуулна уу.</small></div> : <>
              <details className="context-card"><summary>Орчуулгын контекст</summary><fieldset disabled={busy}>
                <label>Үйл явдлын товч агуулга<textarea onChange={(event) => edit({ context: { ...draft.context, synopsis: event.target.value } })} value={draft.context.synopsis} placeholder="Энэ хэсэгт юу болж байна вэ?" /></label>
                <label>Дүрүүдийн харилцаа, ярианы хэв маяг<textarea onChange={(event) => edit({ context: { ...draft.context, characters: event.target.value } })} value={draft.context.characters} placeholder="speaker_0: нас, харилцаа, ярианы өнгө..." /></label>
                <label>Нэр томьёоны толь · JSON<textarea className="mono" onChange={(event) => { dirty.current = true; setApproved(false); setViewedVersion(''); setGlossary(event.target.value); }} value={glossary} /></label>
                {dubbingEnabled && <div className="voice-list"><strong>Яригчдын voice ID</strong>{speakers.map((speaker) => <label key={speaker}>{speaker}<input onChange={(event) => edit({ voices: { ...draft.voices, [speaker]: event.target.value } })} placeholder={job.mode === 'demo' ? 'Demo voice' : 'ElevenLabs voice ID'} value={draft.voices[speaker] ?? ''} /></label>)}</div>}
              </fieldset></details>
              <fieldset disabled={busy}><div className="segments">{draft.segments.map((segment, index) => <article key={segment.id}>
                <div className="text-pair">
                  <label>Эхлэх секунд<input type="number" min="0" max={job.duration} step="0.001" value={segment.start} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) edit({ segments: draft.segments.map(item => item.id === segment.id ? { ...item, start: value } : item) }); }}/></label>
                  <label>Дуусах секунд<input type="number" min="0" max={job.duration} step="0.001" value={segment.end} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) edit({ segments: draft.segments.map(item => item.id === segment.id ? { ...item, end: value } : item) }); }}/></label>
                </div>
                {job.subtitleWarnings?.[segment.id]?.map(message => <p className="warning" key={message}>{message}</p>)}
                <div className="segment-meta"><strong>{String(index + 1).padStart(2, '0')}</strong><label>Яригч<input aria-label={`${index + 1}-р мөрийн яригч`} value={segment.speaker} onChange={(event) => edit({ segments: draft.segments.map((item, position) => position === index ? { ...item, speaker: event.target.value } : item) })} /></label><span>{formatDuration(segment.start)} – {formatDuration(segment.end)}</span>{segment.flags.length > 0 && <small className="warning"><Icon name="alert" /> Хянах</small>}</div>
                <div className="text-pair"><label>Эх яриа<textarea onChange={(event) => edit({ segments: draft.segments.map((item, position) => position === index ? { ...item, source: event.target.value } : item) })} value={segment.source} /></label><label>Монгол орчуулга<textarea onChange={(event) => edit({ segments: draft.segments.map((item, position) => position === index ? { ...item, target: event.target.value } : item) })} placeholder="Орчуулсан текст" value={segment.target} /></label></div>
              </article>)}</div>
              <div className="checks"><label><input checked={draft.transcriptReviewed} onChange={(event) => edit({ transcriptReviewed: event.target.checked })} type="checkbox" /> Эх яриа, цаг, яригчдыг шалгасан</label><label><input checked={draft.translationReviewed} onChange={(event) => edit({ translationReviewed: event.target.checked })} type="checkbox" /> Монгол орчуулгыг шалгасан</label></div></fieldset>
              <small className="subtle">Эх яриа эсвэл контекст өөрчлөгдвөл хуучин орчуулга дахин шалгах шаардлагатай.</small>
            </>}
          </section>}
        </section>

        <aside className="studio-sidebar">
          <section className="card upload-card">
            <div className="title"><div><span className="eyebrow">01 · ЭХЛЭХ</span><h2>Клипээ оруулах</h2></div><span className="step-number">01</span></div>
            <VideoUploader disabled={busy || Boolean(job)} file={video} onChange={chooseVideo} />
            <div className="upload-languages"><label>Эх хэл<select disabled={busy||Boolean(job)} value={job?.sourceLanguage||sourceLanguage} onChange={event=>{setSourceLanguage(event.target.value);uploadKey.current=crypto.randomUUID();}}><option value="auto">Автоматаар таних</option><option value="eng">Англи</option><option value="kor">Солонгос</option><option value="cmn">Хятад</option><option value="jpn">Япон</option><option value="rus">Орос</option><option value="mon">Монгол</option></select></label><label>Орчуулах хэл<input value="Монгол" readOnly aria-label="Орчуулах хэл: Монгол"/></label></div>
            {dubbingEnabled && <label>Арын дуу
              <select disabled={Boolean(activity) || Boolean(job)} onChange={(event) => setBackground(event.target.value as typeof background)} value={job?.background ?? background}>
                <option value="none">Арын дуугүй · шинэ яриа</option><option disabled={health?.mode !== 'live'} value="api">API-аар арын дуу салгах · Live</option><option value="uploaded">Бэлэн M&amp;E файл</option>
              </select>
            </label>}
            {dubbingEnabled && background === 'uploaded' && !job && <label>Видеотой ижил урттай M&amp;E файл<VideoUploader accept="audio/*" audio disabled={Boolean(activity)} file={bedFile} onChange={setBedFile} /></label>}
            <button className="primary upload-button" disabled={busy || Boolean(job) || !video || (dubbingEnabled && background === 'uploaded' && !bedFile)} onClick={() => void upload()} type="button">
              {activity.startsWith('Видео байршуулж') ? <><Icon className="spin" name="loader" /> Байршуулж байна…</> : <><Icon name="upload" />{dubbingEnabled ? 'Видео оруулах' : 'Оруулах, хадмал бэлтгэх'}</>}
            </button>
            {uploadProgress&&<div className="upload-progress" role="status"><strong>{Math.floor(uploadProgress.loaded/uploadProgress.total*100)}% · {(uploadProgress.loaded/1048576).toFixed(1)} / {(uploadProgress.total/1048576).toFixed(1)} MB</strong><progress aria-label="Видео дамжуулалт" value={uploadProgress.loaded} max={uploadProgress.total}/><small>{uploadProgress.loaded===uploadProgress.total?'Файл дамжсан. Сервер видеог шалгаж байна…':'Файлыг сервер рүү дамжуулж байна…'}</small><button className="secondary" type="button" onClick={()=>uploadController.current?.abort()}>Upload цуцлах</button></div>}
            <small className="upload-note">200 MB хүртэл · 2–180 секунд</small>
            {!dubbingEnabled && <p className="route-caption">Яриа таних → Монгол орчуулга → хадмал автоматаар бэлэн болно. Эх дуу хэвээр үлдэнэ.</p>}
          </section>

          <section className="card action-card" id="settings">
            <div className="title"><div><span className="eyebrow">02–04 · БОЛОВСРУУЛАЛТ</span><h2>Орчуулгын урсгал</h2></div><Icon className="accent-icon" name="sparkles" /></div>
            <div className="language-route"><span><small>ЭХ ХЭЛ</small><strong><Icon name="language" /> {({auto:"Автомат",eng:"Англи",kor:"Солонгос",cmn:"Хятад",jpn:"Япон",rus:"Орос",mon:"Монгол"} as Record<string,string>)[job?.sourceLanguage||sourceLanguage]}</strong></span><i>→</i><span><small>ЗОРИЛТОТ ХЭЛ</small><strong><b>MN</b> Монгол</strong></span></div>
            <p className="route-caption">Эх хэл автоматаар танигдана. Орчуулга Монгол хэл рүү гарна.</p>
            {dubbingEnabled && job?.background !== 'none' && job && draft && <div className="bed-controls">
              {job.status === 'transcript_ready' && <audio controls preload="none" src={`/api/jobs/${job.id}/files/bed.wav`} />}
              <label className="bed-check"><input disabled={busy} checked={draft.bedReviewed} onChange={(event) => edit({ bedReviewed: event.target.checked })} type="checkbox" /> Арын дууг шалгасан</label>
              <form onSubmit={(event) => void replaceBed(event)}><VideoUploader accept="audio/*" audio disabled={busy} file={bedFile} onChange={setBedFile} /><button disabled={busy || !bedFile} type="submit">Арын дуу солих</button></form>
            </div>}
            <div className="action-list">
              {!dubbingEnabled && <button disabled={!job || busy || (job.errorCode==='PROVIDER_OUTCOME_UNKNOWN'&&!allowUncertain)} onClick={() => void action('subtitle_auto')} type="button"><span className="action-icon"><Icon name="sparkles"/></span><span><strong>Хадмалыг автоматаар бэлтгэх</strong><small>Тасарсан ажлаа үргэлжлүүлэх, дахин бэлтгэх</small></span></button>}
              <details className="manual-steps" open={dubbingEnabled?true:undefined}><summary>Шат тус бүрээр ажиллах</summary><button className={job?.status === 'preparing' ? 'current' : ''} disabled={!job || busy} onClick={() => void action('prepare')} type="button"><span className="action-icon"><Icon name="file" /></span><span><strong>Яриаг таних</strong><small>Transcript ба цагийн мөрүүд</small></span><Icon className="chevron" name="arrow" /></button>
              <button className={job?.status === 'translating' ? 'current' : ''} disabled={!job || busy || !draft?.transcriptReviewed || !draft.segments.length} onClick={() => void action('translate')} type="button"><span className="action-icon"><Icon name="language" /></span><span><strong>Монгол руу орчуулах</strong><small>Эх яриагаа шалгасны дараа</small></span><Icon className="chevron" name="arrow" /></button>
              <button disabled={!job || busy || !canRender} onClick={() => void action('subtitles')} type="button"><span className="action-icon"><Icon name="file" /></span><span><strong>Хадмалтай видео бэлтгэх</strong><small>AI дуу оруулахгүй, эх дууг хадгална</small></span></button>
{dubbingEnabled && <button className={`final-action${job?.status === 'rendering' ? ' current' : ''}`} disabled={!job || busy || !canRender || !hasAllVoices || !isBedReady} onClick={() => void action('render')} type="button"><span className="action-icon"><Icon name="video" /></span><span><strong>Видео үүсгэх</strong><small>Орчуулсан яриаг видео дээр render хийнэ</small></span><Icon className="chevron" name="arrow" /></button>}</details>
            </div>
            {!job && <p className="route-caption">Клип оруулсны дараа дараагийн алхам нээгдэнэ.</p>}
            {dubbingEnabled && job?.mode === 'demo' && job.status === 'completed' && <p className="demo-footnote">Энэ demo tone нь бодит дубляж биш.</p>}
            {job && (job.outputs?.subtitles || (dubbingEnabled && job.outputs?.dubbed)) && <div className="downloads"><a download href={`/api/jobs/${job.id}/files/translated.mn.srt`}><Icon name="file" /> Монгол SRT <Icon className="chevron" name="arrow" /></a>{dubbingEnabled && job.outputs?.dubbed && <a href={`/api/jobs/${job.id}/files/qa.json`} rel="noreferrer" target="_blank"><Icon name="file" /> QA тайлан <Icon className="chevron" name="arrow" /></a>}</div>}
          </section>

          <section className="card history-card" id="history"><div className="title"><div><span className="eyebrow">ӨМНӨХ АЖЛУУД</span><h2>Түүх <small>{jobs.length}</small></h2></div><Icon name="history" /></div>
            {jobs.length === 0 ? <p className="route-caption">Энд таны ажлууд харагдана.</p> : <div className="joblist">{jobs.map((item) => <button aria-current={job?.id === item.id ? 'true' : undefined} className={`job${job?.id === item.id ? ' selected' : ''}`} key={item.id} disabled={busy} onClick={() => { if(!dirty.current||window.confirm("Хадгалаагүй засварыг орхиод өөр ажил нээх үү?"))select(item); }} type="button"><span className="job-thumb"><Icon name="film" /></span><span><strong>{item.name}</strong><small>{labels[item.status] ?? item.status} · {new Date(item.createdAt).toLocaleDateString("mn-MN")}</small></span><Icon className="chevron" name="arrow" /></button>)}</div>}
          </section>

          {dubbingEnabled && health?.mode === 'live' && <details className="card clone-card"><summary>Зөвшөөрөлтэй voice clone</summary><p className="route-caption">Ашиглах эрхтэй хоолойн sample, зөвшөөрлийн лавлагаа оруулна уу.</p><form onSubmit={(event) => void cloneVoice(event)}><label>Хоолойн нэр<input maxLength={100} name="name" required /></label><label>Зөвшөөрлийн лавлагаа<input maxLength={500} name="authorizationRef" required /></label><label>Audio sample<input accept="audio/*" name="sample" required type="file" /></label><button disabled={busy} type="submit">Voice үүсгэх</button></form></details>}
        </aside>
      </div>
      {job && <section className="card publish-box"><span className="eyebrow">05 · PREVIEW БА НИЙТЛЭХ</span><h2>{publishedUrl ? 'Нийтлэгдсэн ✓' : 'Нийтлэхэд бэлэн'}</h2><p><strong>{movieTitle} · {episodeNumber}-р анги</strong></p><p>Бэлэн файлаа preview хэсэгт тоглуулж шалгасны дараа нийтэлнэ. Render дуусахад автоматаар нийтлэгдэхгүй.</p>{publishedUrl && !notice && <p><Link className="published-link" href={publishedUrl}>Үндсэн сайтаас үзэх →</Link></p>}<label>Нийтлэх хувилбар<select disabled={busy || Boolean(publishedUrl)} value={publishVersion} onChange={e => { setPublishVersion(e.target.value as 'subtitles' | 'dubbed'); setApproved(false); }}><option disabled={!job.outputs?.subtitles} value="subtitles">Монгол хадмал + эх дуу{!job.outputs?.subtitles ? ' · Бэлэн биш' : ''}</option>{dubbingEnabled && <option disabled={!job.outputs?.dubbed} value="dubbed">Монгол AI дубляж{!job.outputs?.dubbed ? ' · Бэлэн биш' : ''}</option>}</select></label><label className="checkbox-row"><input type="checkbox" disabled={busy || Boolean(publishedUrl) || viewedVersion !== publishVersion || !job.outputs?.[publishVersion]} checked={approved} onChange={e => setApproved(e.target.checked)}/>Эцсийн видео, хадмал, дууг шалгасан. Сонгосон ангид нийтлэхийг зөвшөөрсөн.</label>{!publishedUrl && <><p className="route-caption" role="status">{busy ? activity : publishBlockReason}</p><button className="primary upload-button" disabled={busy || !approved || !draft?.translationReviewed || !job.outputs?.[publishVersion] || viewedVersion !== publishVersion || dirty.current} onClick={() => void publish()}>{activity === 'Нийтэлж байна…' ? 'Нийтэлж байна…' : 'Нийтлэх'}</button></>}</section>}
      <footer>shortkinomn · Content Studio · MP4 + Монгол SRT</footer>
    </div>
  );
}
