import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { User } from '../../lib/platform';
import { AdminShell } from '../../components/stream/admin';

export const metadata = { title: 'Удирдлага', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const response = await fetch(`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/auth/me`, { headers: { cookie: jar.toString() }, cache: 'no-store' });
  if (!response.ok) throw Error('Authentication service unavailable');
  const user: User | null = await response.json();
  const returnTo = (await headers()).get('x-admin-return-to') || '/admin';
  const loginUrl = `/login?next=${encodeURIComponent(returnTo)}`;
  if (!user) {
    redirect(loginUrl);
  }
  if (user.role !== 'ADMIN') return <main className="content page-content"><div className="empty-state">
    <h1>Админ эрх шаардлагатай</h1>
    <p>Орчуулгын студи болон удирдлагын хэсэгт зөвхөн админ нэвтэрнэ. Таны одоогийн бүртгэл админ эрхгүй байна.</p>
    <Link className="button" href={loginUrl}>Админ бүртгэлээр нэвтрэх</Link>
    <Link className="button secondary" href="/profile">Миний бүртгэл</Link>
  </div></main>;
  return <AdminShell>{children}</AdminShell>;
}
