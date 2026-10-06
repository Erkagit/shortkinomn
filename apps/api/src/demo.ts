import fs from 'node:fs/promises';import path from 'node:path';import {config} from './config.js';import {ff} from './media.js';
await fs.mkdir(config.data,{recursive:true});const out=path.join(config.data,'demo-input.mp4');
await ff('-f','lavfi','-i','color=c=0x14293d:s=640x360:r=25:d=8','-f','lavfi','-i','sine=frequency=330:duration=8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',out);console.log(`DEMO tone video: ${out}`);
