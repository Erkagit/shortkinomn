import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-admin-return-to', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/admin/:path*' };
