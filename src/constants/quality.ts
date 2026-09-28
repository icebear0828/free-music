export interface QualityOption {
  id: string;
  label: string;
  badge: string;
  /** Suffix appended to the download success toast. */
  toastSuffix: string;
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { id: 'low', label: '极速标准 (128k)', badge: 'MP3', toastSuffix: ' (标准128k)' },
  { id: 'standard', label: '高品质 (320k)', badge: 'MP3', toastSuffix: ' (较高320k)' },
  { id: 'flac', label: '极高无损 (FLAC)', badge: 'FLAC', toastSuffix: ' (无损FLAC)' },
  { id: 'wav', label: '母带原轨 (WAV)', badge: 'WAV', toastSuffix: ' (原音轨WAV)' },
];

export function qualityLabel(id: string): string {
  return QUALITY_OPTIONS.find((q) => q.id === id)?.toastSuffix ?? ' (极速标准)';
}

export const DEFAULT_QUALITY_KEY = 'music_audio_quality';
