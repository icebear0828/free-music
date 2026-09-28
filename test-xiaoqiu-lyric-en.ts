import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
import { getPlugin } from './server/plugin-manager.js';
import { pluginManager } from './server/plugin-manager.js';

async function test() {
  await pluginManager.initialize();
  const plugin = pluginManager.getPlugin('xiaoqiu');
  const res = await plugin?.search('Shape of you', 1, 'music');
  const song = res?.data?.[0];
  console.log('song:', song.title, song.artist);
  if (song) {
    const lrc = await plugin?.getLyric(song);
    console.log('trans length:', lrc?.translation?.length);
    console.log('trans preview:', lrc?.translation?.substring(0, 500));
  }
}
test();
