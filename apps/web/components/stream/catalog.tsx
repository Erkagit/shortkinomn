'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, freeLabel, type Movie, type Episode, type Progress, type Library, type Category } from '../../lib/platform';
import { useSession } from './context';
import { Icon } from '../Icon';

export function useResource<T>(path: string | null, initialData?: T) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const initialPath = useRef(path);
  useEffect(() => {
    if (initialData && initialPath.current === path && version === 0) return;
    const controller = new AbortController();
    setData(undefined); setError('');
    if (path) api<T>(path, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Ачаалж чадсангүй.');
    });
    return () => controller.abort();
  }, [path, version, initialData]);
  return { data, error, reload: () => setVersion(v => v + 1) };
}

export function Empty({ title = 'Кино хараахан нэмэгдээгүй байна', text = 'Нийтлэгдсэн кинонууд энд харагдана.' }: { title?: string; text?: string }) {
  return <div className="empty-state"><Icon className="empty-symbol" name="film"/><h2>{title}</h2><p>{text}</p><Link className="button secondary" href="/movies">Кино үзэх <Icon name="right"/></Link></div>;
}
export function Failure({ error, retry }: { error: string; retry: () => void }) {
  return <div className="empty-state error-state" role="alert"><Icon className="empty-symbol" name="alert"/><h2>Ачаалж чадсангүй</h2><p>{error}</p><button className="button secondary" onClick={retry}>Дахин оролдох</button></div>;
}
export function Skeleton() {
  return <div aria-label="Кинонуудыг ачаалж байна" role="status" className="skeleton-grid">{Array.from({ length: 6 }, (_, i) => <div key={i}><div className="skeleton"/><div className="skeleton skeleton-line"/></div>)}</div>;
}
export function Poster({ movie, className = '', priority = false }: { movie: Movie; className?: string; priority?: boolean }) {
  const [failedUrl, setFailedUrl] = useState('');
  return movie.poster_url && failedUrl !== movie.poster_url
    ? <img className={className} src={movie.poster_url} alt={`${movie.title_mn} киноны постер`} loading={priority ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedUrl(movie.poster_url)}/>
    : <div className={`poster-fallback ${className}`}><Icon name="film"/><strong>{movie.title_mn}</strong><small>{movie.poster_url ? 'Зураг ачаалагдсангүй' : 'Постер оруулаагүй'}</small></div>;
}
export function MovieCard({ movie }: { movie: Movie }) {
  return <Link className="movie-card" href={`/movies/${movie.slug}`}>
    <div className="poster"><Poster movie={movie}/><span className="poster-badge"><Icon name="language"/> МОНГОЛ</span><span className="card-play"><Icon name="play"/></span></div>
    <div className="movie-card-copy"><h3>{movie.title_mn}</h3><p>{movie.categories.map(c => c.name).slice(0, 2).join(' · ') || 'Богино цуврал'} <span>· {movie.episode_count} анги</span></p><span className={`access-note${movie.free_episode_count ? ' free' : ''}`}><Icon name={movie.free_episode_count ? 'play' : 'lock'}/>{!movie.episode_count ? 'Нийтлэгдсэн анги алга' : movie.free_episode_count ? `${movie.free_episode_count} анги үнэгүй` : 'Эрх авч үзэх'}{movie.episode_count > movie.free_episode_count && <span> / Үргэлжлэл төлбөртэй</span>}</span></div>
  </Link>;
}
export function MovieCarousel({ title, movies, href = '/movies', eyebrow }: { title: string; movies: Movie[]; href?: string; eyebrow?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!movies.length) return null;
  function scroll(direction: number) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollBy({ left: direction * ref.current.clientWidth * .8, behavior: reduced ? 'auto' : 'smooth' });
  }
  return <section className="movie-section"><div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><div className="row-controls"><Link href={href}>Бүгдийг үзэх <Icon name="right"/></Link><button aria-label={`${title}: өмнөх кинонууд`} onClick={() => scroll(-1)}><Icon name="left"/></button><button aria-label={`${title}: дараах кинонууд`} onClick={() => scroll(1)}><Icon name="right"/></button></div></div><div className="movie-row" ref={ref}>{movies.map(movie => <MovieCard key={movie.id} movie={movie}/>)}</div></section>;
}
export function HeroBanner({ movie }: { movie: Movie }) {
  const [failed, setFailed] = useState(false);
  const backdrop = movie.backdrop_url && !failed;
  return <section className={`hero${backdrop ? ' has-backdrop' : ' no-backdrop'}`}>
    {backdrop && <img className="hero-backdrop" alt="" src={movie.backdrop_url} fetchPriority="high" onError={() => setFailed(true)}/>}
    <div className="hero-shade"/>
    <div className="hero-copy"><span className="eyebrow">ОНЦЛОХ ЦУВРАЛ</span><h1>{movie.title_mn}</h1><div className="hero-meta"><span>{movie.year}</span><span>{movie.episode_count} анги</span><span><Icon name="language"/> Монгол хэлээр</span></div><p>{movie.description}</p><div className="tag-list">{movie.categories.slice(0, 3).map(c => <Link href={`/category/${c.slug}`} key={c.id}>{c.name}</Link>)}</div><div className="free-badge"><Icon name={movie.free_episode_count ? 'check' : 'lock'}/>{freeLabel(movie)}</div><div className="hero-actions"><Link className="button" href={`/movies/${movie.slug}?play=1`}><Icon name="play"/> Үзэж эхлэх</Link><Link className="button secondary" href={`/movies/${movie.slug}`}>Дэлгэрэнгүй <Icon name="right"/></Link></div></div>
    {!backdrop && <div className="hero-poster poster"><Poster movie={movie} priority/></div>}
    <span className="hero-caption">shortkinomn <span>сонголт</span></span>
  </section>;
}
export function ContinueWatchingCard({ progress }: { progress: Progress }) {
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return <Link href={`/watch/${progress.episode_id}`} className="continue-card"><div className="continue-image"><Poster movie={progress.movie}/><span><Icon name="play"/></span></div><div><small>{progress.episode_number}-р анги</small><h3>{progress.movie.title_mn}</h3><progress aria-label="Үзсэн хугацаа" value={progress.current_time} max={progress.duration || 1}/><p>{time(progress.current_time)} / {time(progress.duration)}</p></div></Link>;
}
export function ContinueWatching() {
  const { user } = useSession(); const { data, error, reload } = useResource<Library>(user ? '/library' : null);
  if (error) return <div className="inline-error" role="status"><span>Үзсэн түүхийг ачаалж чадсангүй.</span><button onClick={reload}>Дахин оролдох</button></div>;
  if (!data?.continueWatching.length) return null;
  return <section className="movie-section"><div className="section-heading"><h2>Үргэлжлүүлэн үзэх</h2><Link href="/library">Миний сан <Icon name="right"/></Link></div><div className="continue-row">{data.continueWatching.map(p => <ContinueWatchingCard key={p.episode_id} progress={p}/>)}</div></section>;
}
export function EpisodeList({ episodes, active }: { episodes: Episode[]; active?: string }) {
  return <div className="episode-grid">{episodes.map(e => <Link aria-label={`${e.episode_number}-р анги: ${e.title}. ${e.locked ? 'Эрх авах' : e.is_free ? 'Үнэгүй үзэх' : 'Үзэх'}`} aria-current={e.id === active ? 'page' : undefined} className={`episode-card${e.locked ? ' locked' : ''}`} key={e.id} href={`/watch/${e.id}`}><span className="episode-number">{String(e.episode_number).padStart(2, '0')}<Icon name={e.locked ? 'lock' : e.id === active ? 'video' : e.completed ? 'check' : 'play'}/></span><span>{e.locked ? 'Эрх авах' : e.id===active ? 'Одоо үзэж буй' : e.completed ? 'Үзсэн' : e.current_time ? 'Үргэлжлүүлэх' : e.is_free ? 'Үнэгүй' : 'Нээлттэй'}</span></Link>)}</div>;
}
export interface HomeData { featured: Movie | null; trending: Movie[]; latest: Movie[]; sections: (Category & { items: Movie[] })[] }
export function Home({ initialData }: { initialData?: HomeData }) {
  const { data, error, reload } = useResource<HomeData>('/catalog/home', initialData);
  if (error) return <main className="content"><Failure error={error} retry={reload}/></main>;
  if (!data) return <main className="content"><div className="hero-skeleton skeleton"/><Skeleton/></main>;
  return <main className="home-page content">
    {data.featured ? <HeroBanner movie={data.featured}/> : <section className="welcome-hero"><Icon name="film"/><div><span className="eyebrow">shortkinomn</span><h1>Богино кино.<br/>Монгол хэлээр.</h1><p>Нийтлэгдсэн кино хараахан алга. Шинэ цуврал нэмэгдэхэд энд харагдана.</p><Link className="button" href="/movies">Кино үзэх <Icon name="right"/></Link></div></section>}
    <nav className="home-categories" aria-label="Ангиллаар үзэх"><span>Ангиллаар үзэх</span><div><Link href="/movies" className="category-chip active">Бүгд</Link>{data.sections.map(c => <Link className="category-chip" key={c.id} href={`/category/${c.slug}`}>{c.name}</Link>)}</div></nav>
    <ContinueWatching/>
    <MovieCarousel title="Шинээр нэмэгдсэн" movies={data.latest} href="/movies?sort=new"/>
    <MovieCarousel title="Санал болгох цувралууд" eyebrow="РЕДАКЦЫН СОНГОЛТ" movies={data.trending}/>
    {data.sections.map(s => <MovieCarousel key={s.id} title={s.name} movies={s.items} href={`/category/${s.slug}`}/>)}
  </main>;
}
