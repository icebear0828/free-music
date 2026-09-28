import { describe, expect, it } from 'vitest';
import { findLyricIndex } from './useCurrentLyric';
import type { LyricLine } from '../types';

const lyrics: LyricLine[] = [
  { time: 0, text: '第一句' },
  { time: 5.5, text: '第二句' },
  { time: 10, text: '第三句' },
  { time: 12.25, text: '第四句' },
];

describe('findLyricIndex', () => {
  it('returns -1 for empty lyrics', () => {
    expect(findLyricIndex([], 12)).toBe(-1);
  });

  it('returns -1 before the first timestamp', () => {
    expect(findLyricIndex([{ time: 3, text: 'x' }], 1)).toBe(-1);
  });

  it('holds a line until the next one starts', () => {
    expect(findLyricIndex(lyrics, 0)).toBe(0);
    expect(findLyricIndex(lyrics, 5.49)).toBe(0);
    expect(findLyricIndex(lyrics, 5.5)).toBe(1);
    expect(findLyricIndex(lyrics, 9.99)).toBe(1);
    expect(findLyricIndex(lyrics, 10)).toBe(2);
  });

  it('stays on the last line past the end', () => {
    expect(findLyricIndex(lyrics, 9999)).toBe(3);
  });

  it('agrees with a linear scan across the whole track', () => {
    const linear = (time: number) =>
      lyrics.findIndex((line, i) => {
        const next = lyrics[i + 1];
        return time >= line.time && (!next || time < next.time);
      });

    for (let t = 0; t < 15; t += 0.25) {
      expect(findLyricIndex(lyrics, t)).toBe(linear(t));
    }
  });
});
