'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, json, money, type Episode, type Movie } from '../../lib/platform';
import { useSession } from './context';
import { EpisodeList, Failure, Skeleton, useResource } from './catalog';
import { Icon } from '../Icon';

export function UnlockModal({ movie, loggedIn }: { movie: Movie; loggedIn: boolean }) {
  return <section className="unlock-panel" role="region" aria-label="Төлбөртэй анги"><span className="lock-symbol"><Icon name="lock"/></span><span className="eyebrow">ЦУВРАЛАА ҮРГЭЛЖЛҮҮЛЭХ</span><h2>Энэ ангийг нээж үзээрэй</h2><p>Нэг удаа эрх аваад<br/>энэ киноны бүх ангийг үзнэ.</p><strong className="price">{money(movie.price)}</strong><Link className="button" href={loggedIn ? `/payments?movie=${movie.id}` : `/login?next=${encodeURIComponent(`/payments?movie=${movie.id}`)}`}>Бүх ангийн эрх авах <Icon name="right"/></Link><small>Төлбөр баталгаажсаны дараа эрх нээгдэнэ.</small><Link className="text-link" href={`/movies/${movie.slug}`}>Үнэгүй ангиудыг үзэх</Link></section>;
}
interface WatchData { episode: Episode; movie: Movie; episodes: Episode[]; stream: string | null; subtitles: string | null; progress: { current_time: number; completed: number } | null }
export function WatchPage({ id }: { id: string }) {
  const { user } = useSession(); const { data, error, reload } = useResource<WatchData>(`/watch/${id}`);
  const video = useRef<HTMLVideoElement>(null), lastSave = useRef(0);
  const [countdown, setCountdown] = useState<number | null>(null), [ended, setEnded] = useState(false);
  const [playError, setPlayError] = useState(''), [progressError, setProgressError] = useState('');
  const [portrait, setPortrait] = useState(false);
  const [buffering,setBuffering] = useState(true);
  useEffect(()=>{setBuffering(true);setPlayError('');setPortrait(false);setCountdown(null);setEnded(false);lastSave.current=0;},[id]);
  const router = useRouter(); const index = data?.episodes.findIndex(e => e.id === id) ?? -1;
  const next = data?.episodes[index + 1], previous = data?.episodes[index - 1];
  useEffect(() => {
    if (countdown === null || !next || next.locked) return;
    if (countdown <= 0) { router.push(`/watch/${next.id}`); return; }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000); return () => clearTimeout(timer);
  }, [countdown, next, router]);
  function save(force = false) {
    if (!user || !video.current || !data?.stream) return;
    const now = Date.now(); if (!force && now - lastSave.current < 10000) return; lastSave.current = now;
    void api(`/progress/${id}`, { ...json('PUT', { currentTime: video.current.currentTime }), keepalive: true }).then(() => setProgressError('')).catch(() => setProgressError('Үзсэн хугацааг хадгалж чадсангүй. Холболт сэргэхэд дахин оролдоно.'));
  }
  useEffect(() => {
    const element = video.current;
    function flush() { if (user && element && data?.stream) void api(`/progress/${id}`, { ...json('PUT', { currentTime: element.currentTime }), keepalive: true }).catch(() => {}); }
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, [user, data, id]);
  if (error) return <main className="content"><Failure error={error} retry={reload}/></main>;
  if (!data) return <main className="content page-content"><Skeleton/></main>;
  return <main className="watch-page content">
    <div className="watch-heading"><Link href={`/movies/${data.movie.slug}`}><Icon name="left"/>{data.movie.title_mn}</Link><span>{data.episode.episode_number}-р анги / {data.movie.total_episodes || data.episodes.length}</span></div>
    <div className="watch-layout"><div className="watch-main">
      <div className={`player-stage${portrait ? ' portrait' : ''}`}>
        {data.episode.locked ? <UnlockModal movie={data.movie} loggedIn={!!user}/> : <>
          <video ref={video} aria-label={`${data.movie.title_mn}, ${data.episode.episode_number}-р анги`} controls playsInline preload="metadata" src={data.stream || undefined}
            onError={() => {setBuffering(false);setPlayError('Видео ачаалагдсангүй. Холболтоо шалгаад дахин оролдоно уу.');}}
            onWaiting={()=>setBuffering(true)} onCanPlay={()=>setBuffering(false)} onPlaying={()=>setBuffering(false)}
            onLoadedMetadata={() => { if (video.current) { setPortrait(video.current.videoHeight > video.current.videoWidth); if (data.progress && !data.progress.completed) video.current.currentTime = data.progress.current_time; } }}
            onTimeUpdate={() => save()} onPause={() => save(true)} onPlay={() => { setEnded(false); setCountdown(null); }}
            onEnded={() => { save(true); setEnded(true); if (next && !next.locked) setCountdown(5); }}>
            {data.subtitles && <track default kind="subtitles" srcLang="mn" label="Монгол" src={data.subtitles}/>}
          </video>
          {buffering&&!playError&&<div className="player-loading" role="status"><Icon name="loader" className="spin"/><span>Видео ачаалж байна…</span></div>}
          {ended && next?.locked && <div className="autoplay-overlay next-locked-overlay" role="status"><Icon name="lock"/><h2>Дараагийн анги төлбөртэй</h2><p>{money(data.movie.price)} · Бүх ангийн эрх</p><Link className="button" href={`/watch/${next.id}`}>Эрх авах <Icon name="right"/></Link><button className="button secondary" onClick={() => setEnded(false)}>Хаах</button></div>}
          {countdown !== null && next && !next.locked && <div className="autoplay-overlay" role="status"><h2>Дараагийн анги {countdown} секундын дараа</h2><Link className="button" href={`/watch/${next.id}`}>Дараагийн ангид очих <Icon name="right"/></Link><button className="button secondary" onClick={() => setCountdown(null)}>Цуцлах</button></div>}
        </>}
      </div>
      {playError && <div role="alert" className="inline-error"><span>{playError}</span><button onClick={() => { setPlayError('');setBuffering(true); video.current?.load(); }}>Дахин ачаалах</button></div>}
      {progressError && <p role="status" className="muted">{progressError}</p>}
      <div className="watch-controls"><div><span className="eyebrow">{data.episode.is_free ? 'ҮНЭГҮЙ АНГИ' : data.episode.locked ? 'ТӨЛБӨРТЭЙ АНГИ' : 'ЭРХ НЭЭГДСЭН'}</span><h1>{data.episode.episode_number}-р анги · {data.episode.title}</h1><p className="muted">{user ? 'Үзсэн хугацаа автоматаар хадгалагдана.' : <Link href={`/login?next=${encodeURIComponent('/watch/' + id)}`}>Нэвтрээд үзсэн хугацаагаа хадгалаарай.</Link>}</p></div></div>
      <nav className="episode-navigation" aria-label="Анги солих">{previous ? <Link className="button secondary" href={`/watch/${previous.id}`}><Icon name="left"/>Өмнөх анги</Link> : <button className="button secondary" disabled><Icon name="left"/>Өмнөх анги</button>}{next ? <Link className="button secondary" href={`/watch/${next.id}`}><Icon name={next.locked ? 'lock' : 'right'}/>{next.locked ? `${next.episode_number}-р анги · Эрх авах` : 'Дараагийн анги'}</Link> : <span className="muted">Сүүлийн нийтлэгдсэн анги</span>}</nav>
    </div><details className="watch-episodes" open><summary>Бүх анги <span>{data.episodes.length}</span></summary><p className="muted">{data.movie.title_mn}</p><EpisodeList episodes={data.episodes} active={id}/><div className="episode-legend"><span><Icon name="play"/>Үнэгүй / Нээлттэй</span><span><Icon name="lock"/>Эрх авах</span></div></details></div>
  </main>;
}
