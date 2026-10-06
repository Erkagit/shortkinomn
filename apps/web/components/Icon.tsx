import type { SVGProps } from 'react';

export type IconName = 'alert' | 'arrow' | 'check' | 'clock' | 'download' | 'file' | 'film' | 'history' | 'language' | 'loader' | 'music' | 'plus' | 'settings' | 'sparkles' | 'upload' | 'video' | 'x' | 'search' | 'menu' | 'user' | 'bookmark' | 'play' | 'lock' | 'left' | 'right' | 'grid';

const paths: Record<IconName, string> = {
  search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  user: 'M20 21v-2a8 8 0 0 0-16 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  play: 'm8 4 12 8-12 8V4Z',
  lock: 'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4m-4 4v3',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  alert: 'M12 9v4m0 4h.01M10.3 3.9l-8 13.8A1.5 1.5 0 0 0 3.6 20h16.8a1.5 1.5 0 0 0 1.3-2.3l-8-13.8a2 2 0 0 0-3.4 0Z',
  arrow: 'M7 17 17 7M7 7h10v10',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 17h8M8 13h3',
  film: 'M3 3h18v18H3zM7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  language: 'M5 8l6 6m-7 0 6-6 2-3M2 5h12m7 16-5-10-5 10m2-4h6',
  loader: 'M12 2v4m0 12v4m10-10h-4M6 12H2m17.1 7.1-2.8-2.8M7.7 7.7 4.9 4.9m14.2 0-2.8 2.8M7.7 16.3l-2.8 2.8',
  music: 'M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  plus: 'M12 5v14m-7-7h14',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4-1.5 1 .2 1.8-1.8 1-.1 1.9h-2l-.9 1.5-1.8-.5-1.8.5-.9-1.5h-2l-.1-1.9-1.8-1 .2-1.8L5 12l1.5-1-.2-1.8 1.8-1 .1-1.9h2l.9-1.5 1.8.5 1.8-.5.9 1.5h2l.1 1.9 1.8 1-.2 1.8L20 12Z',
  sparkles: 'm12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 2l.8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8L5 2Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-7 5-5 5 5m-5-5v12',
  video: 'M3 5h13v14H3zM16 10l5-3v10l-5-3',
  x: 'm18 6-12 12M6 6l12 12',
};

export function Icon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg className={`icon ${className}`} width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" {...props}><path d={paths[name]} /></svg>;
}
