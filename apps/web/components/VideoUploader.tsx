'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';

export function VideoUploader({ file, onChange, disabled = false, accept = 'video/*', audio = false }: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  accept?: string;
  audio?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const sequence = useRef(0);

  async function choose(next?: File) {
    if (!next || disabled || checking) return;
    const current = ++sequence.current;
    onChange(null);
    if (next.size > 200 * 1024 * 1024) {
      setError('Файл 200 MB-аас их байна. Жижиг файл сонгоно уу.');
      return;
    }
    const supported = audio ? /\.(wav|mp3|m4a|aac|ogg|flac)$/i : /\.(mp4|mov|mkv|webm)$/i;
    if (!supported.test(next.name) || (next.type && !next.type.startsWith(audio ? 'audio/' : 'video/') && next.type !== 'application/octet-stream' && !(audio && next.type === 'application/ogg'))) {
      setError(audio ? 'WAV, MP3, M4A, AAC, OGG эсвэл FLAC аудио сонгоно уу.' : 'MP4, MOV, MKV эсвэл WebM видео сонгоно уу.');
      return;
    }
    if (!next.size) { setError('Файл хоосон байна. Өөр файл сонгоно уу.'); return; }
    setError('');
    setChecking(true);
    const url = URL.createObjectURL(next);
    try {
      const duration = await new Promise<number | null>(resolve => {
        const media = document.createElement(audio ? 'audio' : 'video');
        const finish = (value: number | null) => { clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null; media.removeAttribute('src'); media.load(); resolve(value); };
        const timer = setTimeout(() => finish(null), 5000);
        media.onloadedmetadata = () => finish(Number.isFinite(media.duration) ? media.duration : null);
        media.onerror = () => finish(null);
        media.preload = 'metadata'; media.src = url;
      });
      if (current !== sequence.current) return;
      if (duration !== null && (duration < 2 || duration > 180)) {
        setError(`Файлын урт ${Math.round(duration)} секунд байна. 2–180 секундийн клип сонгоно уу.`);
        return;
      }
      // Some MKV codecs cannot be probed in the browser; the server validates every upload with ffprobe.
      onChange(next);
    } finally { URL.revokeObjectURL(url); if (current === sequence.current) setChecking(false); }
  }

  return (
    <div>
      <input ref={input} aria-label={audio ? 'Аудио файл сонгох' : 'Видео файл сонгох'} className="visually-hidden" type="file" accept={accept} disabled={disabled} onChange={(event) => choose(event.currentTarget.files?.[0])} />
      {file ? (
        <div className="chosen-file">
          <span className="file-symbol"><Icon name={audio ? 'music' : 'film'} /></span>
          <span className="chosen-copy"><strong title={file.name}>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · Сонголоо</small></span>
          <button aria-label="Файлыг арилгах" className="icon-button" disabled={disabled} onClick={() => { onChange(null); if (input.current) input.current.value = ''; }} type="button"><Icon name="x" /></button>
        </div>
      ) : (
        <button
          className={`dropzone${drag ? ' dragging' : ''}`}
          disabled={disabled || checking}
          onClick={() => input.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDrag(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDrag(false); }}
          onDrop={(event) => { event.preventDefault(); setDrag(false); choose(event.dataTransfer.files[0]); }}
          type="button"
        >
          <span className="drop-icon"><Icon name="upload" /></span>
          <strong>{checking ? 'Файлыг шалгаж байна…' : audio ? 'Арын дуугаа сонгоно уу' : 'Видеогоо энд чирж оруулна уу'}</strong>
          <span className="drop-hint">эсвэл дарж файл сонгох</span>
          {!audio && <small>MP4, MOV, MKV, WebM · 200 MB хүртэл · 2–180 сек</small>}
        </button>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
