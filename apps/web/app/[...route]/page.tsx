import { Suspense } from 'react';
import { PublicPage } from '../../components/stream/public-pages';
import { Skeleton } from '../../components/stream/catalog';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Movie } from '../../lib/platform';
export async function generateMetadata({params}:{params:Promise<{route:string[]}>}):Promise<Metadata> {
  const {route}=await params;
  const titles:Record<string,string>={movies:'Кино',search:'Кино хайх',login:'Нэвтрэх',register:'Бүртгүүлэх',library:'Миний сан',profile:'Миний бүртгэл',payments:'Төлбөр',watch:'Кино үзэх',category:'Ангилал'};
  if(route[0]==='movies'&&route[1]) {
    try {
      const response=await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/catalog/movies/${encodeURIComponent(route[1])}`,{cache:'no-store',signal:AbortSignal.timeout(4000)});
      if(response.ok){const {movie}:{movie:Movie}=await response.json();return {title:movie.title_mn,description:movie.description.slice(0,160),openGraph:{title:movie.title_mn,description:movie.description.slice(0,160),images:movie.backdrop_url?[movie.backdrop_url]:[]}};}
    } catch { /* Generic metadata remains available during API outages. */ }
  }
  return {title:titles[route[0]]||'Хуудас',...(['login','register','profile','library','payments','watch'].includes(route[0])?{robots:{index:false,follow:false}}:{})};
}
export default async function Page({params}:{params:Promise<{route:string[]}>}) {
  const {route}=await params;
  const single=['movies','search','login','register','profile','library','payments'];
  if (!(route.length===1&&single.includes(route[0])) && !(route.length===2&&['movies','watch','category'].includes(route[0]))) notFound();
  return <Suspense fallback={<Skeleton/>}><PublicPage/></Suspense>;
}
