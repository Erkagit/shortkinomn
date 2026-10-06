'use client';
import {Failure} from '../components/stream/catalog';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="content page-content"><Failure error="Түр алдаа гарлаа. Дахин оролдоно уу." retry={reset}/></main>;}
