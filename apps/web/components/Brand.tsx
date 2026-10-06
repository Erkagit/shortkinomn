import Link from 'next/link';

export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={`brand-mark ${className}`} viewBox="0 0 32 36" fill="none" aria-hidden="true">
    <rect x="4" y="2" width="24" height="32" rx="4" fill="currentColor"/>
    <path d="m13 11 10 7-10 7V11Z" fill="var(--bg)"/>
    <path d="M4 8h4M4 15h4M4 22h4M4 29h4" stroke="var(--bg)" strokeWidth="2"/>
  </svg>;
}

export function Brand({ href = '/', compact = false }: { href?: string; compact?: boolean }) {
  return <Link href={href} className={`wordmark${compact ? ' compact' : ''}`} aria-label="shortkinomn — нүүр">
    <BrandMark/>{!compact && <span>shortkino<span className="wordmark-suffix">mn</span></span>}
  </Link>;
}
