import test from 'node:test';
import assert from 'node:assert/strict';
import { editsSchema, type Segment } from '../src/model.js';
import { subtitleFile, subtitleLines, subtitleWarnings } from '../src/subtitles.js';

const segment: Segment = { id: 's0', start: 0, end: 4, speaker: 'UNKNOWN', source: 'Hello', target: 'Сайн байна уу?', flags: [] };

test('live subtitle edits accept empty voice IDs', () => {
  assert.doesNotThrow(() => editsSchema.parse({ segments: [segment], context: {}, voices: { UNKNOWN: '' }, transcriptReviewed: true, translationReviewed: true, bedReviewed: false }));
});
test('wrapping preserves words without truncation', () => {
  const text = 'Монгол хадмалын урт текстийг үгийн дундаас таслахгүйгээр дараагийн мөрд шилжүүлж уншихад хялбар болгоно.';
  const lines = subtitleLines(text);
  assert.equal(lines.join(' '), text);
  assert.ok(lines.every(line => [...line].length <= 42));
});
test('subtitle QA detects fast text, overflow and overlapping dialogue', () => {
  const warnings = subtitleWarnings([{ ...segment, end: 0.5, target: 'Монгол '.repeat(20) }, { ...segment, id: 's1', start: 0.2 }]);
  assert.equal(warnings.s0.length, 3);
  assert.equal(warnings.s1.length, 1);
  assert.deepEqual(subtitleWarnings([segment]), {});
});
test('VTT escapes markup and cannot inject another cue through blank lines', () => {
  const output = subtitleFile([{ ...segment, target: '<b>Сайн</b> & уу?\n\n00:01 --> 00:02' }], 'vtt');
  assert.ok(output.startsWith('WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.000\n'));
  assert.ok(output.includes('&lt;b&gt;Сайн&lt;/b&gt; &amp;'));
  assert.ok(!output.includes('\n\n00:01'));
});
test('SRT timestamps retain millisecond rounding', () => {
  assert.ok(subtitleFile([{ ...segment, start: 59.9996, end: 62 }], 'srt').includes('00:01:00,000 --> 00:01:02,000'));
});
