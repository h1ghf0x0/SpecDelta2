import type { DiffStatus, SingleSpecParseOutput, WorkerProgress } from '../types/spec';

export interface FileSlotState {
  fileName: string;
  fileSize: number;
  buffer: ArrayBuffer | null;
  status: 'idle' | 'parsing' | 'ready' | 'error';
  progress: WorkerProgress | null;
  parsed: SingleSpecParseOutput | null;
  error: string | null;
}

export const EMPTY_SLOT: FileSlotState = {
  fileName: '',
  fileSize: 0,
  buffer: null,
  status: 'idle',
  progress: null,
  parsed: null,
  error: null,
};

export interface FileUploadProgress {
  side: 'old' | 'new';
  fileName: string;
  fileSize: number;
  status: 'reading' | 'parsing' | 'ready' | 'error';
  stage: WorkerProgress['stage'] | 'reading';
  percent: number;
  detail: string;
}

export type StatusFilter = 'all' | 'changed' | DiffStatus | 'risk';

export interface DiffCounts {
  total: number;
  modified: number;
  added: number;
  deleted: number;
  unchanged: number;
  notReissued: number;
  risk: number;
  changed: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getOverlappingScannedPages(
  pageRangeStr: string,
  scannedPages?: number[]
): number[] {
  if (!scannedPages || scannedPages.length === 0 || !pageRangeStr || pageRangeStr === '—') {
    return [];
  }
  const parts = pageRangeStr
    .split(/[–-]/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return [];
  const start = parts[0];
  const end = parts[parts.length - 1];
  return scannedPages.filter((p) => p >= start && p <= end);
}
