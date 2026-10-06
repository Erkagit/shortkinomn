import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/** Private objects only. A production adapter must issue short-lived signed URLs after entitlement verification. */
export interface MediaStorage { put(source: string, extension: 'mp4' | 'vtt'): Promise<string>; resolve(key: string): string }
const root = path.join(config.data, 'media');
export const mediaStorage: MediaStorage = {
  async put(source, extension) {
    await fs.mkdir(root, { recursive: true });
    const key = `${randomUUID()}.${extension}`;
    await fs.copyFile(source, path.join(root, key));
    return key;
  },
  resolve(key) {
    if (!/^[0-9a-f-]{36}\.(mp4|vtt)$/.test(key)) throw Error('Invalid media key');
    return path.join(root, key);
  },
};
