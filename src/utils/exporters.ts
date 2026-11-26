import { PDFDocument } from 'pdf-lib';
import { buildCsvString, buildXlsxBytes } from './ooxmlBuilder';
import type { CsiSection, DiffSectionResult } from '../types/spec';

export interface ScannedExportInfo {
  oldFileName?: string;
  newFileName?: string;
  oldScannedPages?: number[];
  newScannedPages?: number[];
}

export const EXPORT_HEADERS = [
  'CSI Division',
  'Section #',
  'Section Title',
  'Status',
  'Reviewed',
  'Old Pages',
  'New Pages',
  'Old Text',
  'New Text',
  'Risk Keyword Flag',
  'Skipped Scanned Sheets (No OCR)',
];

const EXPORT_COL_WIDTHS = [28, 16, 30, 16, 11, 12, 12, 52, 52, 36, 30];

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

function formatSectionScanWarning(
  oldPageRange: string,
  newPageRange: string,
  scanInfo?: ScannedExportInfo
): string {
  if (!scanInfo) return 'None';
  const oldHits = getOverlappingScannedPages(oldPageRange, scanInfo.oldScannedPages);
  const newHits = getOverlappingScannedPages(newPageRange, scanInfo.newScannedPages);
  if (oldHits.length === 0 && newHits.length === 0) return 'None';
  const parts: string[] = [];
  if (oldHits.length > 0) parts.push(`Old pp. ${oldHits.join(', ')} (no OCR)`);
  if (newHits.length > 0) parts.push(`New pp. ${newHits.join(', ')} (no OCR)`);
  return parts.join('; ');
}

function safeCellText(text: string): string {
  const limit = 31950;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}... [truncated to 32k Excel cell limit]`;
}

export function buildChangeLogRows(
  results: DiffSectionResult[],
  reviewedCodes?: Set<string>,
  scanInfo?: ScannedExportInfo
): string[][] {
  const rows: string[][] = [];

  const oldSkipped = scanInfo?.oldScannedPages ?? [];
  const newSkipped = scanInfo?.newScannedPages ?? [];
  if (oldSkipped.length > 0 || newSkipped.length > 0) {
    const summaryParts: string[] = [];
    if (oldSkipped.length > 0) {
      summaryParts.push(
        `Baseline${scanInfo?.oldFileName ? ` (${scanInfo.oldFileName})` : ''}: pp. ${oldSkipped.join(', ')}`
      );
    }
    if (newSkipped.length > 0) {
      summaryParts.push(
        `Revised${scanInfo?.newFileName ? ` (${scanInfo.newFileName})` : ''}: pp. ${newSkipped.join(', ')}`
      );
    }
    rows.push([
      '00 - VERIFICATION NOTICE',
      'NO-OCR PAGES',
      'Raster / Scanned Sheets Skipped (No OCR)',
      'Warning',
      'Manual Check',
      oldSkipped.length > 0 ? `${oldSkipped.length} skipped` : '0',
      newSkipped.length > 0 ? `${newSkipped.length} skipped` : '0',
      oldSkipped.length > 0
        ? `Baseline pages skipped (no OCR text layer): ${oldSkipped.join(', ')}`
        : '',
      newSkipped.length > 0
        ? `Revised pages skipped (no OCR text layer): ${newSkipped.join(', ')}`
        : '',
      'Manual PDF verification required on skipped raster sheets',
      summaryParts.join(' | '),
    ]);
  }

  for (const sec of results) {
    if (sec.status === 'unchanged' && !sec.renumberedFrom) continue;
    const reviewedLabel = reviewedCodes?.has(sec.sectionCode) ? 'Reviewed' : 'Pending';
    const divLabel = `${sec.division} - ${sec.divisionTitle}`;
    const scanWarning = formatSectionScanWarning(sec.oldPageRange, sec.newPageRange, scanInfo);

    if (sec.status === 'added') {
      rows.push([
        divLabel,
        sec.sectionCode,
        sec.title,
        'Added',
        reviewedLabel,
        '—',
        sec.newPageRange,
        '',
        safeCellText(sec.fullNewText),
        sec.riskFlags.join('; ') || 'None',
        scanWarning,
      ]);
      continue;
    }

    if (sec.status === 'deleted') {
      rows.push([
        divLabel,
        sec.sectionCode,
        sec.title,
        'Deleted',
        reviewedLabel,
        sec.oldPageRange,
        '—',
        safeCellText(sec.fullOldText),
        '',
        sec.riskFlags.join('; ') || 'None',
        scanWarning,
      ]);
      continue;
    }

    const sectionLabel = sec.renumberedFrom
      ? `${sec.sectionCode} (was ${sec.renumberedFrom})`
      : sec.sectionCode;
    const statusLabel = sec.renumberedFrom
      ? sec.status === 'unchanged'
        ? 'Renumbered'
        : 'Renumbered & Modified'
      : 'Modified';

    if (sec.changedParagraphs.length === 0) {
      rows.push([
        divLabel,
        sectionLabel,
        sec.title,
        statusLabel,
        reviewedLabel,
        sec.oldPageRange,
        sec.newPageRange,
        safeCellText(sec.fullOldText),
        safeCellText(sec.fullNewText),
        sec.riskFlags.join('; ') || 'None',
        scanWarning,
      ]);
    } else {
      for (const para of sec.changedParagraphs) {
        rows.push([
          divLabel,
          sectionLabel,
          sec.title,
          statusLabel,
          reviewedLabel,
          sec.oldPageRange,
          sec.newPageRange,
          safeCellText(para.oldText),
          safeCellText(para.newText),
          para.riskFlags.join('; ') || 'None',
          scanWarning,
        ]);
      }
    }
  }

  return rows;
}

export function exportChangeLogToExcel(
  results: DiffSectionResult[],
  fileBaseName = 'SpecDelta_Change_Log',
  reviewedCodes?: Set<string>,
  scanInfo?: ScannedExportInfo
): void {
  const rows = buildChangeLogRows(results, reviewedCodes, scanInfo);
  const bytes = buildXlsxBytes(EXPORT_HEADERS, rows, EXPORT_COL_WIDTHS, 'Spec Change Log');
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, `${fileBaseName}.xlsx`);
}

export function exportChangeLogToCsv(
  results: DiffSectionResult[],
  fileBaseName = 'SpecDelta_Change_Log',
  reviewedCodes?: Set<string>,
  scanInfo?: ScannedExportInfo
): void {
  const rows = buildChangeLogRows(results, reviewedCodes, scanInfo);
  const csv = buildCsvString(EXPORT_HEADERS, rows);
  // Prepend UTF-8 BOM so Microsoft Excel preserves em-dashes and smart quotes
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, `${fileBaseName}.csv`);
}

export async function slicePdfBySections(
  sourceBuffer: ArrayBuffer,
  selectedSections: CsiSection[],
  outputFileName: string
): Promise<{ pageCount: number; bytes: Uint8Array }> {
  const sourceDoc = await PDFDocument.load(sourceBuffer);
  const targetDoc = await PDFDocument.create();
  const totalPages = sourceDoc.getPageCount();

  const pageIndexSet = new Set<number>();
  for (const sec of selectedSections) {
    const startIdx = Math.max(0, sec.startPage - 1);
    const endIdx = Math.min(totalPages - 1, sec.endPage - 1);
    for (let i = startIdx; i <= endIdx; i++) {
      pageIndexSet.add(i);
    }
  }

  const sortedIndices = Array.from(pageIndexSet).sort((a, b) => a - b);
  const copiedPages = await targetDoc.copyPages(sourceDoc, sortedIndices);
  for (const page of copiedPages) {
    targetDoc.addPage(page);
  }

  const outBytes = await targetDoc.save();
  const blob = new Blob([outBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  triggerBlobDownload(blob, outputFileName);
  return { pageCount: sortedIndices.length, bytes: outBytes };
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
