'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, json, money, freeLabel, type Movie, type Episode, type Category, type Library } from '../../lib/platform';
import { useSession } from './context';
import { useResource, Empty, Failure, Skeleton, MovieCard, Poster, EpisodeList, ContinueWatchingCard, MovieCarousel } from './catalog';
import { WatchPage } from './video-player';
import { Icon } from '../Icon';

export function CatalogPage({ category = '', search = false }: { category?: string; search?: boolean }) {
  const params = useSearchParams(); const [query, setQuery] = useState(params.get('q') || ''), [debounced, setDebounced] = useState(query), [page, setPage] = useState(1);
  useEffect(() => { setQuery(params.get('q') || ''); }, [params]);
  const sort = params.get('sort') === 'trending' ? 'trending' : 'new';
  useEffect(() => { const timer = setTimeout(() => { setDebounced(query); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [category, sort]);
  const { data: categories } = useResource<Category[]>('/catalog/categories');
  const { data, error, reload } = useResource<{ items: Movie[]; total: number; pages: number }>(`/catalog/movies?q=${encodeURIComponent(debounced)}&category=${encodeURIComponent(category)}&page=${page}&sort=${sort}`);
  return <main className="content page-content"><span className="eyebrow">ТАНЫ ДУРТАЙ ТҮҮХ ЭНД БИЙ</span><h1>{search ? 'Кино хайх' : category ? categories?.find(c => c.slug === category)?.name || 'Ангилал' : 'Бүх кино'}</h1><p className="muted">Нэг шинэ түүх. Нэг шинэ мэдрэмж.</p><label className="search-field"><span>⌕</span><input type="search" aria-label="Киноны нэр эсвэл төрлөөр хайх" placeholder="Киноны нэр, төрөл, ангиллаар хайх…" value={query} onChange={e => setQuery(e.target.value)} autoFocus={search}/></label><div className="category-chips" id="categories"><Link className={!category ? 'active' : ''} href="/movies">Бүгд</Link>{categories?.map(c => <Link className={category === c.slug ? 'active' : ''} href={`/category/${c.slug}`} key={c.id}>{c.name}</Link>)}</div><div className="section-heading"><span className="muted">{data ? `${data.total} кино` : 'Ачаалж байна…'}</span><Link href={sort === 'new' ? '/movies?sort=trending' : '/movies?sort=new'}>{sort === 'new' ? 'Шинээр нэмэгдсэн ↓' : 'Редакцын сонголт ↓'}</Link></div>{error ? <Failure error={error} retry={reload}/> : !data ? <Skeleton/> : data.items.length ? <><div className="movie-grid">{data.items.map(movie => <MovieCard key={movie.id} movie={movie}/>)}</div>{data.pages > 1 && <nav className="pagination" aria-label="Хуудас"><button disabled={page === 1} onClick={() => setPage(page - 1)}>← Өмнөх</button><span>{page} / {data.pages}</span><button disabled={page === data.pages} onClick={() => setPage(page + 1)}>Дараах →</button></nav>}</> : <Empty title={debounced ? 'Хайлтад тохирох кино олдсонгүй' : 'Энэ ангилалд кино нэмэгдээгүй байна'} text="Өөр нэр эсвэл ангиллаар хайж үзээрэй."/>}</main>;
}
export function MovieDetail({ slug }: { slug: string }) {
  const { user, toast } = useSession(); const router = useRouter(); const params = useSearchParams();
  const { data, error, reload } = useResource<{ movie: Movie; episodes: Episode[]; progress: { episode_id: string } | null; favorite: boolean }>(`/catalog/movies/${encodeURIComponent(slug)}`);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (params.get('play') === '1' && data?.episodes.length) router.replace(`/watch/${data.progress?.episode_id || data.episodes[0].id}`); }, [data, params, router]);
  if (error) return <main className="content"><Failure error={error} retry={reload}/></main>;
  if (!data) return <main className="content page-content"><Skeleton/></main>;
  const { movie, episodes } = data;
  async function favorite() { if (!user) return router.push(`/login?next=${encodeURIComponent(`/movies/${slug}`)}`); setSaving(true); try { await api(`/favorites/${movie.id}`, json('PUT', { favorite: !data!.favorite })); toast(data!.favorite ? 'Жагсаалтаас хаслаа.' : 'Таны жагсаалтад нэмлээ.'); reload(); } catch (e) { toast((e as Error).message); } finally { setSaving(false); } }
  return <main>
    <section className="detail-hero"><div className="detail-content content">
      <div className="detail-poster poster"><Poster movie={movie} priority/></div>
      <div className="detail-copy"><Link className="back-link" href="/movies"><Icon name="left"/> Бүх кино</Link><span className="eyebrow">МОНГОЛ ХЭЛЭЭР</span><h1>{movie.title_mn}</h1>{movie.title_original && <p className="original-title">{movie.title_original}</p>}
        <div className="hero-meta"><span>{movie.year}</span>{movie.country && <span>{movie.country}</span>}<span>{episodes.length} анги нийтлэгдсэн{movie.total_episodes > episodes.length ? ' / ' + movie.total_episodes : ''}</span></div>
        <div className="tag-list">{[...movie.categories, ...movie.genres].map(c => <span key={c.id}>{c.name}</span>)}</div><p className="synopsis">{movie.description}</p>
        <div className="free-badge"><Icon name={movie.free_episode_count ? 'check' : 'lock'}/>{freeLabel(movie)}</div>
        <div className="detail-actions">{episodes.length > 0 && <Link className="button" href={`/watch/${data.progress?.episode_id || episodes[0].id}`}><Icon name="play"/>{data.progress ? 'Үргэлжлүүлэн үзэх' : 'Үзэж эхлэх'}</Link>}<button className="button secondary" disabled={saving} aria-pressed={data.favorite} onClick={() => void favorite()}><Icon name={data.favorite ? 'check' : 'bookmark'}/>{data.favorite ? 'Жагсаалтад нэмсэн' : 'Миний жагсаалт'}</button></div>
      </div>
    </div></section>
    <section className="content movie-section"><div className="section-heading"><div><h2>Ангиуд <small>{episodes.length}</small></h2><p className="muted">{freeLabel(movie)}. Үзэх ангиа сонгоорой.</p></div></div>
      {episodes.some(e => e.locked) && <div className="unlock-strip"><Icon name="lock"/><div><strong>Үргэлжлэлийг бүтнээр нь үзэх</strong><span>Нэг удаагийн төлбөр · Энэ киноны бүх анги</span></div><strong>{money(movie.price)}</strong><Link className="button secondary" href={user ? '/payments?movie=' + movie.id : '/login?next=' + encodeURIComponent('/payments?movie=' + movie.id)}>Эрх авах <Icon name="right"/></Link></div>}
      {episodes.length ? <EpisodeList episodes={episodes}/> : <Empty title="Ангиуд хараахан нэмэгдээгүй"/>}
    </section>
  </main>;
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const { refresh, ready } = useSession(); const router = useRouter(); const params = useSearchParams();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const proposed = params.get('next') || '/library'; const next = proposed.startsWith('/') && !proposed.startsWith('//') && !proposed.includes('\\') ? proposed : '/library';
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await api(`/auth/${register ? 'register' : 'login'}`, json('POST', Object.fromEntries(form))); await refresh(); router.push(next); router.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <main className="auth-page"><div className="auth-story"><span className="eyebrow">shortkinomn • ТАНЫ КИНО ЕРТӨНЦ</span><h1>Түүхээ<br/><em>үргэлжлүүл.</em></h1><p>Дуртай цуврал, хадгалсан мөчүүд тань<br/>таныг хүлээж байна.</p></div><form className="auth-form panel" method="post" onSubmit={submit}><span className="eyebrow">ТАВТАЙ МОРИЛ</span><h2>{register ? 'Бүртгэл үүсгэх' : 'Дахин уулзсандаа баяртай'}</h2><p className="muted">{register ? 'Өөрийн кино ертөнцийг нээгээрэй.' : 'Бүртгэлээрээ нэвтэрч үргэлжлүүлэн үзээрэй.'}</p>{register && <label>Таны нэр<input required maxLength={80} name="name" autoComplete="name"/></label>}<label>И-мэйл<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="name@example.com"/></label><label>Нууц үг<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} placeholder="10-аас дээш тэмдэгт"/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy || !ready}>{busy ? 'Түр хүлээнэ үү…' : register ? 'Бүртгүүлэх' : 'Нэвтрэх →'}</button><p>{register ? 'Бүртгэлтэй юу?' : 'Шинэ хэрэглэгч үү?'} <Link className="accent" href={`/${register ? 'login' : 'register'}?next=${encodeURIComponent(next)}`}>{register ? 'Нэвтрэх' : 'Бүртгүүлэх'}</Link></p></form></main>;
}
export function RequireLogin() { return <div className="empty-state"><h2>Өөрийн бүртгэлээр нэвтэрнэ үү</h2><p>Таны кино болон үзсэн түүх нэг дор.</p><Link className="button" href="/login">Нэвтрэх →</Link></div>; }
export function LibraryPage() {
  const { user, ready } = useSession(); const params = useSearchParams(); const [tab, setTab] = useState(params.get('tab') === 'favorites' ? 'favorites' : 'continue');
  useEffect(() => { if (params.get('tab') === 'favorites') setTab('favorites'); }, [params]);
  const { data, error, reload } = useResource<Library>(user ? '/library' : null);
  return <main className="content page-content"><span className="eyebrow">ТАНЫ КИНО ЕРТӨНЦ</span><h1>Миний сан</h1>{!ready ? <Skeleton/> : !user ? <RequireLogin/> : <><div className="category-chips">{[['continue','Үргэлжлүүлэн үзэх'],['purchased','Худалдаж авсан'],['watched','Үзсэн'],['favorites','Миний жагсаалт']].map(([id, label]) => <button className={id === tab ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}</button>)}</div>{error ? <Failure error={error} retry={reload}/> : !data ? <Skeleton/> : tab === 'continue' || tab === 'watched' ? (tab === 'watched' ? data.progress.filter(p => p.completed) : data.continueWatching).length ? <div className="continue-grid">{(tab === 'watched' ? data.progress.filter(p => p.completed) : data.continueWatching).map(p => <ContinueWatchingCard key={p.episode_id} progress={p}/>)}</div> : <Empty title="Таны үзсэн түүх энд хадгалагдана" text="Кино сонгоод эхний ангийг үзээрэй."/> : (tab === 'purchased' ? data.purchased : data.favorites).length ? <div className="movie-grid">{(tab === 'purchased' ? data.purchased : data.favorites).map(m => <MovieCard key={m.id} movie={m}/>)}</div> : <Empty title="Таны жагсаалт хоосон байна" text="Дуртай киногоо олж, өөрийн сандаа нэмээрэй."/>}</>}</main>;
}
export function ProfilePage() {
  const { user, ready, refresh, toast } = useSession(); const router = useRouter();
  return <main className="content page-content"><h1>Миний бүртгэл</h1>{!ready ? <Skeleton/> : !user ? <RequireLogin/> : <section className="panel profile-panel"><span className="avatar">{user.name.slice(0, 1)}</span><h2>{user.name}</h2><p className="muted">{user.email}</p><div className="stack-links"><Link href="/library">Миний сан →</Link><Link href="/payments">Төлбөрийн түүх →</Link></div><button className="button secondary" onClick={async () => { try { await api('/auth/logout', { method: 'POST' }); await refresh(); router.push('/'); router.refresh(); } catch (e) { toast((e as Error).message); } }}>Гарах</button></section>}</main>;
}
interface Purchase { id: string; movie_id: string; title_mn: string; slug: string; amount: number; status: string; created_at: string }
export function PaymentsPage() {
  const { user, ready, toast } = useSession(); const params = useSearchParams(); const movieId = params.get('movie');
  const { data, error, reload } = useResource<{ items: Purchase[]; instructions: string; enabled: boolean }>(user ? '/payments' : null);
  const selected = useResource<{ movie: Movie }>(movieId ? `/catalog/movies/${encodeURIComponent(movieId)}` : null);
  const [busy, setBusy] = useState(false); const purchase = data?.items.find(p => p.movie_id === movieId);
  async function create() { setBusy(true); try { await api('/payments/checkout', json('POST', { movieId })); toast('Төлбөрийн хүсэлт үүслээ. Зааврын дагуу төлнө үү.'); reload(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); } }
  return <main className="content page-content"><span className="eyebrow">ЦУВРАЛАА БҮТНЭЭР НЬ ҮЗ</span><h1>Төлбөр</h1>{!ready ? <Skeleton/> : !user ? <RequireLogin/> : error ? <Failure error={error} retry={reload}/> : !data ? <Skeleton/> : <>{selected.error && <Failure error={selected.error} retry={selected.reload}/>} {selected.data && <section className="checkout panel"><div className="poster"><Poster movie={selected.data.movie}/></div><div><span className="eyebrow">БҮХ АНГИЙГ НЭЭХ</span><h2>{selected.data.movie.title_mn}</h2><p>Нэг удаагийн төлбөрөөр энэ цувралын бүх ангийг үзнэ.</p><strong className="price">{money(selected.data.movie.price)}</strong>{purchase ? <p className="status-label">{purchase.status === 'PAID' ? '✓ Төлбөр баталгаажсан' : '◷ Баталгаажуулалт хүлээж байна'}</p> : <button className="button" disabled={busy || !data.enabled} onClick={() => void create()}>{busy ? 'Хүсэлт үүсгэж байна…' : 'Төлбөрийн хүсэлт үүсгэх'}</button>}{!data.enabled && <p className="muted">Төлбөрийн үйлчилгээ хараахан нээгдээгүй байна.</p>}{purchase?.status === 'PAID' && <Link className="button" href={`/movies/${selected.data.movie.slug}`}>Үргэлжлүүлэн үзэх →</Link>}</div></section>}{data.instructions && <section className="panel payment-instructions"><h2>Төлөх заавар</h2><p>{data.instructions}</p><p className="muted">Гүйлгээний утгад хүсэлтийн дугаараа оруулна уу. Төлбөр баталгаажсаны дараа үзэх эрх нээгдэнэ.</p></section>}<div className="section-heading"><h2>Төлбөрийн түүх</h2><button className="button secondary" onClick={reload}>Төлөв шалгах ↻</button></div>{!data.items.length ? <Empty title="Төлбөрийн түүх алга"/> : <div className="payment-list">{data.items.map(p => <article className="panel" key={p.id}><div><Link href={`/movies/${p.slug}`}><h3>{p.title_mn}</h3></Link><small className="muted">Хүсэлт: {p.id}</small></div><strong>{money(p.amount)}</strong><span className={`status-label ${p.status.toLowerCase()}`}>{p.status === 'PAID' ? '✓ Баталгаажсан' : p.status === 'PENDING' ? '◷ Хүлээгдэж байна' : 'Цуцлагдсан'}</span></article>)}</div>}</>}</main>;
}
export function PublicPage() {
  const path = usePathname().split('/').filter(Boolean).map(decodeURIComponent);
  if (path[0] === 'movies' && path[1]) return <MovieDetail key={path[1]} slug={path[1]}/>;
  if (path[0] === 'movies') return <CatalogPage/>;
  if (path[0] === 'category' && path[1]) return <CatalogPage key={path[1]} category={path[1]}/>;
  if (path[0] === 'search') return <CatalogPage search/>;
  if (path[0] === 'watch' && path[1]) return <WatchPage key={path[1]} id={path[1]}/>;
  if (path[0] === 'login' || path[0] === 'register') return <AuthPage key={path[0]} register={path[0] === 'register'}/>;
  if (path[0] === 'library') return <LibraryPage/>;
  if (path[0] === 'profile') return <ProfilePage/>;
  if (path[0] === 'payments') return <PaymentsPage/>;
  return <main className="content"><Empty title="Хуудас олдсонгүй" text="Өөр хуудас сонгоно уу."/></main>;
}


