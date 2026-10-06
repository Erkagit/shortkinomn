'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResource, Failure, Skeleton } from '../../../components/stream/catalog';
import type { Episode } from '../../../lib/platform';
import Studio from './Studio';
export function TranslationPage() {
  const { data, error, reload } = useResource<Episode[]>('/admin/episodes');
  const params = useSearchParams(); const router = useRouter(); const selected = data?.find(e => e.id === params.get('episode'));
  return <><div className="admin-heading"><div><span className="eyebrow">shortkinomn / КОНТЕНТ БЭЛТГЭХ</span><h1>Орчуулгын студи</h1><p className="admin-note">Кино, ангиа сонгоод эх видеог боловсруулна. Үр дүнг хянасны дараа нийтэлнэ.</p></div></div>{error ? <Failure error={error} retry={reload}/> : !data ? <Skeleton/> : <><section className="studio-selector"><label>Боловсруулах анги<select value={selected?.id || ''} onChange={e => {if(window.dispatchEvent(new Event("studio:before-leave",{cancelable:true})))router.push(`/admin/translation?episode=${e.target.value}`);}}><option value="">Кино болон анги сонгоно уу</option>{data.map(e => <option value={e.id} key={e.id}>{e.title_mn} · {e.episode_number}-р анги · {e.title}</option>)}</select></label><Link className="button secondary" href="/admin/movies">Кино удирдах →</Link>{!data.length && <p className="admin-note">Боловсруулах анги алга. Эхлээд кино болон анги үүсгэнэ үү.</p>}</section>{selected && <div className="studio-host"><Studio key={selected.id} episodeId={selected.id} initialJobId={params.get('job') || selected.job_id} movieTitle={selected.title_mn || 'Кино'} movieSlug={selected.movie_slug || ''} episodeNumber={selected.episode_number} episodeStatus={selected.status}/></div>}</>}</>;
}
