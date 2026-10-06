export type Segment = {
  id: string;
  start: number;
  end: number;
  speaker: string;
  source: string;
  target: string;
  flags: string[];
};

export type Job = {
  createdAt:string; startedAt?:string; finishedAt?:string; requestId?:string; errorCode?:string; stage?:string; sourceLanguage?:string;
  outputMode?: 'subtitles' | 'dubbed';
  lastAction?: 'prepare' | 'translate' | 'render' | 'subtitles' | 'subtitle_auto';
  subtitleWarnings?: Record<string, string[]>;
  id: string;
  name: string;
  mode: 'demo' | 'live';
  status: string;
  progress: string;
  error?: string;
  busy?: boolean;
  episodeId?: string;
  movieTitle?: string;
  episodeNumber?: number;
  outputs?: { subtitles: boolean; dubbed: boolean };
  revision: number;
  duration: number;
  background: 'api' | 'uploaded' | 'none';
  segments: Segment[];
  voices: Record<string, string>;
  context: { synopsis: string; characters: string; glossary: { source: string; target: string }[] };
  transcriptReviewed: boolean;
  translationReviewed: boolean;
  bedReviewed: boolean;
};

export type Health = {
  maxBytes: number;
  mode: 'demo' | 'live';
  ffmpeg: boolean;
  ffprobe: boolean;
  openaiConfigured: boolean;
  elevenConfigured: boolean;
  maxSeconds: number;
};
