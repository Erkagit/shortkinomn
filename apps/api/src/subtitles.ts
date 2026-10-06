import { stamp, type Segment } from './model.js';

// Editorial defaults, not provider limits. Warnings require human review.
export const subtitleLimits = { lineLength: 42, lines: 2, charactersPerSecond: 20 };
export function subtitleLines(text: string): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last < 0 || [...lines[last] + ' ' + word].length > subtitleLimits.lineLength) lines.push(word);
    else lines[last] += ' ' + word;
  }
  return lines;
}
export function subtitleWarnings(segments: Segment[]): Record<string, string[]> {
  const warnings: Record<string, string[]> = {};
  for (const segment of segments) {
    const lines = subtitleLines(segment.target);
    const messages: string[] = [];
    if (lines.length > subtitleLimits.lines) messages.push('Хадмал 2 мөрөөс урт байна. Текстээ товчилж шалгана уу.');
    if (lines.some(line => [...line].length > subtitleLimits.lineLength)) messages.push('Нэг үг 42 тэмдэгтээс урт байна.');
    if ([...lines.join(' ')].length / (segment.end - segment.start) > subtitleLimits.charactersPerSecond) messages.push('Хадмал хурдан солигдоно. Унших хугацааг шалгана уу.');
    if (segments.some(other => other.id !== segment.id && other.start < segment.end && other.end > segment.start)) messages.push('Өөр хадмалтай хугацаа давхцаж байна.');
    if (messages.length) warnings[segment.id] = messages;
  }
  return warnings;
}
export function subtitleFile(segments: Segment[], format: 'srt'|'vtt'): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const time = (seconds: number) => format === 'vtt' ? stamp(seconds).replace(',', '.') : stamp(seconds);
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + segments.map((segment, index) =>
    `${index + 1}\n${time(segment.start)} --> ${time(segment.end)}\n${subtitleLines(segment.target).map(escape).join('\n')}\n`
  ).join('\n');
}
