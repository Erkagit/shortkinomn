import './style.css';
import type {ReactNode} from 'react';
import {Shell} from '../components/stream/context';
export const metadata={title:{default:'shortkinomn — Богино анги. Том мэдрэмж.',template:'%s | shortkinomn'},description:'Монгол хэл дээрх богино цуврал кино. Дуртай түүхээ олж, эхний ангиудыг үнэгүй үзээрэй.'};
export default function Layout({children}:{children:ReactNode}){return <html lang="mn"><body><Shell>{children}</Shell></body></html>;}
