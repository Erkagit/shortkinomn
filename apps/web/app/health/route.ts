export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
  try {
    const response = await fetch(new URL('/health', apiUrl), { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!response.ok) return Response.json({ status: 'unavailable' }, { status: 503 });
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
