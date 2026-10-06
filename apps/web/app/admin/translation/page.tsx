import { Suspense } from 'react';
import { Skeleton } from '../../../components/stream/catalog';
import { TranslationPage } from './translation-page';
import './studio.css';
export default function Page() { return <Suspense fallback={<Skeleton/>}><TranslationPage/></Suspense>; }
