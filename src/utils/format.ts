export function formatTime(time: number): string {
  if (!time || isNaN(time)) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Durations arrive as seconds from some sources and milliseconds from others. */
export function formatDuration(value?: number | string): string {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'string' && value.includes(':')) return value;
  const num = Number(value);
  if (isNaN(num) || num <= 0) return '-';
  const seconds = num > 10000 ? Math.floor(num / 1000) : num;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp?: number | string): string {
  if (!timestamp) return '-';
  if (typeof timestamp === 'string' && timestamp.includes('-')) return timestamp;
  const date = new Date(Number(timestamp));
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
