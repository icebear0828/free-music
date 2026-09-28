import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
import { getPlugin } from './server/plugin-manager.js';
import { pluginManager } from './server/plugin-manager.js';
import axios from 'axios';

class LyricParser {
  public parseLyric(lrc: string): any[] {
    const lines = lrc.split('\n');
    const result: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const timeExp = /\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g;
      const rawText = line.replace(timeExp, '').trim();
      let mainText = rawText;
      let translationText = '';
      if (rawText.includes('//')) {
        const parts = rawText.split('//');
        mainText = parts[0].trim();
        translationText = parts.slice(1).join('//').trim();
      } else if (rawText.includes('\\n')) {
        const parts = rawText.split('\\n');
        mainText = parts[0].trim();
        translationText = parts.slice(1).join(' ').trim();
      }

      let match;
      timeExp.lastIndex = 0;
      while ((match = timeExp.exec(line)) !== null) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
        const time = min * 60 + sec + ms / 1000;
        
        result.push({
          time,
          text: mainText,
          translation: translationText || undefined
        });
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }
}

async function test() {
  await pluginManager.initialize();
  const plugin = pluginManager.getPlugin('xiaoqiu');
  const res = await plugin?.search('YOASOBI 夜に駆ける', 1, 'music');
  const musicItem = res?.data?.[0];
  if (musicItem) {
     const lrc = await plugin?.getLyric(musicItem);
     const parser = new LyricParser();
     const parsed = parser.parseLyric(lrc.rawLrc);
     console.log('parsed length:', parsed.length);
     console.log('first 5:', parsed.slice(0, 5));
     
     const rawLines = lrc.rawLrc.split('\n').filter(l => l.includes('沈むように溶けてゆくように'));
     console.log('raw snippet:', rawLines);
  }
}
test();
