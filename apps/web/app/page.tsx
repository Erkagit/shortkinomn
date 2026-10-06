import { Home, type HomeData } from '../components/stream/catalog';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let initialData: HomeData | undefined;
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/catalog/home`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (response.ok) initialData = await response.json();
  } catch { /* Client presents retry state when API is unavailable. */ }
  return <Home initialData={initialData}/>;
}
