import fs from 'node:fs';
import path from 'node:path';
export function mediaEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    const root = path.join(env.LOCALAPPDATA, 'Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe');
    if (fs.existsSync(root)) for (const folder of fs.readdirSync(root)) {
      const bin = path.join(root, folder, 'bin');
      if (fs.existsSync(path.join(bin, 'ffmpeg.exe'))) {
        env.FFMPEG_PATH ||= path.join(bin, 'ffmpeg.exe');
        env.FFPROBE_PATH ||= path.join(bin, 'ffprobe.exe');
        break;
      }
    }
  }
  return env;
}
