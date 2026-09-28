import { LyricLine } from '../types';

/**
 * Index of the line that should be highlighted at `time`, or -1 before the
 * first timestamp. Lyrics are already sorted by time when parsed.
 */
export function findLyricIndex(lyrics: LyricLine[], time: number): number {
  if (lyrics.length === 0) return -1;

  let low = 0;
  let high = lyrics.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}
