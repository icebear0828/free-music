import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
import { getPlugin } from './server/plugin-manager.js';
import { pluginManager } from './server/plugin-manager.js';

async function test() {
  await pluginManager.initialize();
  const plugin = pluginManager.getPlugin('xiaoqiu');
  const res = await plugin?.search('YOASOBI 夜に駆ける', 1, 'music');
  console.log('total songs:', res?.data?.length);
  for (let i = 0; i < 5; i++) {
    const song = res?.data?.[i];
    if (song) {
        const lrc = await plugin?.getLyric(song);
        console.log(`song ${i}: ${song.title} - ${song.artist}`);
        console.log(`  trans length: ${lrc?.translation?.length || 0}`);
        if (lrc?.translation) {
           console.log(`  trans sample: ${lrc.translation.substring(0, 100)}`);
        }
    }
  }
}
test();
