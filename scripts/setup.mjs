import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=path.join(root,'apps/api/.env');
try{await fs.copyFile(env+'.example',env,fs.constants.COPYFILE_EXCL);console.log('Created apps/api/.env in DEMO mode.');}catch(e){if(e.code!=='EEXIST')throw e;console.log('Existing .env preserved.');}
await fs.mkdir(path.join(root,'data'),{recursive:true});console.log('Run npm run doctor, npm run demo, npm run dev.');
