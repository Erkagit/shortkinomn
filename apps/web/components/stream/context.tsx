'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, type User } from '../../lib/platform';
import { Brand } from '../Brand';
import { Icon } from '../Icon';

const Context = createContext<{ user: User | null; ready: boolean; refresh: () => Promise<void>; toast: (message: string) => void }>({ user: null, ready: false, refresh: async () => {}, toast: () => {} });
export const useSession = () => useContext(Context);
export function Shell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false), [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const refresh = useCallback(async () => { try { setUser(await api<User | null>('/auth/me')); } finally { setReady(true); } }, []);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu) { setMenu(false); menuButton.current?.focus(); } };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [menu]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  const isAdmin = pathname.startsWith('/admin');
  return <Context.Provider value={{ user, ready, refresh, toast: setNotice }}>
    <a className="skip-link" href="#main-content">Үндсэн агуулга руу очих</a>
    {!isAdmin && <header className="site-header"><div className="header-inner">
      <Brand/>
      <nav id="public-menu" className={`desktop-nav public-nav${menu ? ' open' : ''}`} aria-label="Үндсэн цэс">
        <Link aria-current={pathname === '/movies' ? 'page' : undefined} href="/movies">Кино үзэх</Link>
        <Link href="/movies#categories">Ангилал</Link>
        <Link href="/library?tab=favorites"><Icon name="bookmark"/> Миний жагсаалт</Link>
      </nav>
      <form action="/search" className="header-search" role="search"><Icon name="search"/><input name="q" type="search" aria-label="Кино хайх" placeholder="Кино хайх…"/><button type="submit" aria-label="Хайх"><Icon name="right"/></button></form>
      <div className="header-actions">
        <Link className="mobile-search icon-button" aria-label="Кино хайх" href="/search"><Icon name="search"/></Link>
        <Link className="account-link" aria-label={user ? 'Миний бүртгэл' : 'Нэвтрэх'} href={user ? '/profile' : '/login'}><Icon name="user"/><span>{user ? 'Бүртгэл' : 'Нэвтрэх'}</span></Link>
        <button ref={menuButton} className="menu-button icon-button" aria-label={menu ? 'Цэс хаах' : 'Цэс нээх'} aria-controls="public-menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name={menu ? 'x' : 'menu'}/></button>
      </div>
    </div></header>}
    <div id="main-content" tabIndex={-1} data-session-ready={ready}>{children}</div>
    {!isAdmin && <footer className="site-footer"><div className="footer-inner"><div><Brand/><p>Монгол хэл дээрх богино цуврал кино.</p></div><nav aria-label="Хөлийн цэс"><Link href="/movies">Кино үзэх</Link><Link href="/library">Миний сан</Link><Link href="/profile">Миний бүртгэл</Link></nav><small>© {new Date().getFullYear()} shortkinomn</small></div></footer>}
    {notice && <div className="toast" role="status">{notice}<button aria-label="Мэдэгдэл хаах" onClick={() => setNotice('')}><Icon name="x"/></button></div>}
  </Context.Provider>;
}
