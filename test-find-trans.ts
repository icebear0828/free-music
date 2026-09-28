import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });
import { pluginManager } from './server/plugin-manager.js';

async function test() {
  await pluginManager.initialize();
  const plugin = pluginManager.getPlugin('xiaoqiu');
  const queries = ['起风了', '孤勇者', 'rolling in the deep', 'see you again', 'faded alan walker', 'lemon'];
  
  for (const q of queries) {
      console.log('searching:', q);
      const res = await plugin?.search(q, 1, 'music');
      for (let i = 0; i < Math.min(5, res?.data?.length || 0); i++) {
          const song = res?.data?.[i];
          if (song) {
              const lrc = await plugin?.getLyric(song);
              if (lrc?.translation && lrc.translation.trim().length > 0) {
                  console.log(`FOUND TRANS FOR: ${song.title} - ${song.artist}`);
                  console.log(`trans sample:`, lrc.translation.substring(0, 150));
                  return;
              }
          }
      }
  }
}
test();
