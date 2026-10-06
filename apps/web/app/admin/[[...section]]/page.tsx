import { AdminPage } from '../../../components/stream/admin';
import { notFound } from 'next/navigation';
export default async function Page({params}:{params:Promise<{section?:string[]}>}) {
  const {section=[]}=await params;
  if(section.length && !['movies','episodes','jobs','categories','payments','users','settings'].includes(section[0])) notFound();
  if(section.length>2 || (section.length===2&&section[0]!=='movies')) notFound();
  return <AdminPage/>;
}
