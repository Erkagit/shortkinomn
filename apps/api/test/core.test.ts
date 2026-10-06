import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {groupWords,stamp,validateTimeline,type Job} from '../src/model.js';import {validateBatch} from '../src/providers.js';import {ff,fit,duration,render} from '../src/media.js';
test('SRT rounding carries into next minute',()=>assert.equal(stamp(59.9996),'00:01:00,000'));
test('speaker switch splits segment',()=>{const s=groupWords([{text:'Hello',start:0,end:.4,type:'word',speaker_id:'A'},{text:'Hi',start:.5,end:1,type:'word',speaker_id:'B'}]);assert.equal(s.length,2);assert.equal(s[1].speaker,'B');});
test('unknown speaker is flagged',()=>assert.ok(groupWords([{text:'Hi',start:0,end:1,type:'word'}])[0].flags.includes('speaker_unknown')));
test('overlap survives grouping and is flagged',()=>{const s=groupWords([{text:'Hello',start:0,end:1,type:'word',speaker_id:'A'},{text:'Hi',start:.5,end:1.5,type:'word',speaker_id:'B'}]);assert.ok(s.every(x=>x.flags.includes('overlap_review')));});
test('invalid timeline rejects duplicate IDs and overflow',()=>{const s={id:'s0',start:0,end:1,speaker:'A',source:'Hello',target:'',flags:[]};assert.throws(()=>validateTimeline([s,s],2));assert.throws(()=>validateTimeline([{...s,end:3}],2));});
test('translation IDs must match',()=>assert.throws(()=>validateBatch({lines:[{id:'wrong',text:'Сайн уу?',needsReview:false,reason:''}]},[{id:'s0',start:0,end:1,speaker:'A',source:'Hi',target:'',flags:[]}])));
test('FFmpeg timing fit and full render preserve timeline',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'mndub-'));try{
  await fs.mkdir(path.join(root,'clips'));const raw=path.join(root,'raw.wav');
  await ff('-f','lavfi','-i','sine=frequency=440:duration=1.1','-ar','48000','-ac','2',raw);
  const metric=await fit(raw,path.join(root,'clips/s0.wav'),1);assert.ok(Math.abs(metric.rate-1.1)<.001);assert.ok(Math.abs(await duration(path.join(root,'clips/s0.wav'))-1)<.001);
  await assert.rejects(()=>fit(raw,path.join(root,'bad.wav'),.3));
  await ff('-f','lavfi','-i','color=c=black:s=160x90:r=25:d=3','-c:v','libx264','-f','matroska',path.join(root,'source.video'));
  const job={id:'test',duration:3,background:'none',segments:[{id:'s0',start:1,end:2,speaker:'A',source:'Hi',target:'Сайн уу?',flags:[]}]} as Job;
  await render(job,root);assert.ok(Math.abs(await duration(path.join(root,'dubbed.mp4'))-3)<.12);
}finally{await fs.rm(root,{recursive:true,force:true});}});
