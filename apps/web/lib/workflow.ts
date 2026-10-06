import type { Job } from '../app/types';
import { dubbingEnabled } from './features';

export const jobLabels: Record<string, string> = {
  uploaded: 'Видео орсон', preparing: 'Яриа таньж байна', transcript_ready: 'Эх яриа хянах',
  translating: 'Орчуулж байна', translation_ready: 'Орчуулга хянах', rendering: 'Видео бэлтгэж байна',
  completed: 'Боловсруулалт дууссан', failed: 'Алдаа гарсан', cancelled: 'Цуцалсан',
};
export const workflowSteps = ['Видео оруулах', dubbingEnabled ? 'Эх яриаг шалгах' : 'Яриа таних', 'Монгол орчуулга', dubbingEnabled ? 'Дуу оруулалт' : 'Хадмал бэлтгэх', 'Preview ба нийтлэх'];
export function workflowStage(job?: Job, draft?: Job) {
  if (!job) return 0;
  if ((dubbingEnabled && job.outputs?.dubbed) || job.outputs?.subtitles) return 4;
  if (job.status === 'rendering' || draft?.translationReviewed) return 3;
  if (job.status === 'translating' || draft?.transcriptReviewed) return 2;
  return 1;
}
