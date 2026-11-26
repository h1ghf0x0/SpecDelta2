import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import { stripHeadersAndFooters, type RawPageLine } from '../utils/noiseFilter';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
  matchCsiHeader,
  type OutlineSectionHint,
} from '../utils/pdfSectionParser';
import {
  DEFAULT_NOISE_CONFIG,
  type NoiseFilterConfig,
  type SingleSpecParseOutput,
  type WorkerProgress,
} from '../types/spec';

// Bind pdfjs worker handler locally inside this Web Worker so zero external worker requests occur
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;

const IMAGE_PAINT_OPS = new Set<number>([
  pdfjsLib.OPS.paintImageMaskXObject,
  pdfjsLib.OPS.paintImageMaskXObjectGroup,
  pdfjsLib.OPS.paintImageXObject,
  pdfjsLib.OPS.paintInlineImageXObject,
  pdfjsLib.OPS.paintInlineImageXObjectGroup,
  pdfjsLib.OPS.paintImageXObjectRepeat,
  pdfjsLib.OPS.paintImageMaskXObjectRepeat,
  pdfjsLib.OPS.paintSolidColorImageMask,
]);

interface ParsePdfRequest {
  type: 'parse-pdf';
  requestId: string;
  buffer: ArrayBuffer;
  fileName: string;
  noiseConfig?: NoiseFilterConfig;
}

function postProgress(
  requestId: string,
  stage: WorkerProgress['stage'],
  percent: number,
  detail: string
) {
  self.postMessage({
    type: 'progress',
    requestId,
    payload: { stage, percent, detail } satisfies WorkerProgress,
  });
}

async function extractOutlineHints(
  pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>
): Promise<Map<number, OutlineSectionHint[]>> {
  const hintMap = new Map<number, OutlineSectionHint[]>();
  try {
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) return hintMap;

    const walk = async (items: typeof outline) => {
      for (const item of items) {
        if (item.title) {
          const parsedHeader = matchCsiHeader(item.title);
          if (parsedHeader) {
            try {
              let destArray: unknown = item.dest;
              if (typeof destArray === 'string') {
                destArray = await pdf.getDestination(destArray);
              }
              if (Array.isArray(destArray) && destArray.length > 0 && destArray[0]) {
                const pageIndex = await pdf.getPageIndex(
                  destArray[0] as Parameters<typeof pdf.getPageIndex>[0]
                );
                const page = pageIndex + 1;
                const list = hintMap.get(page) ?? [];
                list.push({
                  page,
                  rawCode: parsedHeader.rawCode,
                  normalizedCode: parsedHeader.normalizedCode,
                  title: parsedHeader.title,
                });
                hintMap.set(page, list);
              }
            } catch {
              // Ignore malformed bookmark destinations gracefully
            }
          }
        }
        if (item.items && item.items.length > 0) {
          await walk(item.items);
        }
      }
    };

    await walk(outline);
  } catch {
    // Outline metadata is optional; ignore if absent
  }
  return hintMap;
}

async function extractLinesWithCoordinates(
  buffer: ArrayBuffer,
  fileName: string,
  requestId: string
): Promise<{
  pageCount: number;
  lines: RawPageLine[];
  totalChars: number;
  scannedPages: number[];
  outlineHintsByPage: Map<number, OutlineSectionHint[]>;
}> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  try {
    const pageCount = pdf.numPages;
    const allLines: RawPageLine[] = [];
    const scannedPages: number[] = [];
    let totalChars = 0;

    // Extract PDF outline/bookmark TOC hints for section fallback & title enrichment
    const outlineHintsByPage = await extractOutlineHints(pdf);

    // Throttle progress messages cleanly on massive 600-800 page specs
    const progressStep = pageCount > 100 ? 10 : pageCount > 30 ? 4 : 1;

    for (let p = 1; p <= pageCount; p++) {
      if (p === 1 || p % progressStep === 0 || p === pageCount) {
        const pct = Math.round(6 + (p / Math.max(1, pageCount)) * 68);
        postProgress(
          requestId,
          'extracting',
          pct,
          `Extracting coordinates (${fileName}: page ${p} of ${pageCount})`
        );
      }

      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageHeight = viewport.height || 792;
      const textContent = await page.getTextContent();

      const { lines: pageLines, pageChars } = assemblePageLinesFromSpans(
        textContent.items,
        p,
        pageHeight
      );
      totalChars += pageChars;
      allLines.push(...pageLines);

      if (pageChars < 30) {
        let hasImageOp = false;
        try {
          const opList = await page.getOperatorList();
          hasImageOp = opList.fnArray.some((op) => IMAGE_PAINT_OPS.has(op));
        } catch {
          // If operator list inspection fails on a malformed stream, fall back conservatively
          hasImageOp = pageChars === 0;
        }
        if (hasImageOp) {
          scannedPages.push(p);
        }
      }

      page.cleanup();
    }

    return { pageCount, lines: allLines, totalChars, scannedPages, outlineHintsByPage };
  } finally {
    await loadingTask.destroy();
  }
}

self.onmessage = async (event: MessageEvent<ParsePdfRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'parse-pdf') return;

  const startTime = performance.now();
  const { requestId, buffer, fileName } = msg;
  const noiseConfig: NoiseFilterConfig = {
    edgeMarginPct: msg.noiseConfig?.edgeMarginPct ?? DEFAULT_NOISE_CONFIG.edgeMarginPct,
    minRecurrencePct: msg.noiseConfig?.minRecurrencePct ?? DEFAULT_NOISE_CONFIG.minRecurrencePct,
  };

  try {
    postProgress(requestId, 'loading', 3, `Opening ${fileName}...`);

    const { pageCount, lines, totalChars, scannedPages, outlineHintsByPage } =
      await extractLinesWithCoordinates(buffer, fileName, requestId);

    postProgress(
      requestId,
      'stripping',
      82,
      `Stripping top/bottom ${Math.round(noiseConfig.edgeMarginPct * 100)}% noise (>${Math.round(noiseConfig.minRecurrencePct * 100)}% recurrence)...`
    );
    const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
      lines,
      pageCount,
      noiseConfig
    );

    postProgress(requestId, 'chunking', 92, 'Normalizing & chunking CSI MasterFormat sections...');
    const { sections, outlineHintsUsed } = chunkIntoCsiSections(
      cleanLines,
      pageCount,
      outlineHintsByPage
    );
    const isMostlyScanned =
      pageCount > 0 &&
      scannedPages.length > 0 &&
      (totalChars / pageCount < 40 || scannedPages.length / pageCount >= 0.5);
    const scannedWarning = isMostlyScanned || scannedPages.length > 0;

    postProgress(requestId, 'complete', 100, 'Parsed cleanly.');

    const result: SingleSpecParseOutput = {
      fileName,
      pageCount,
      sections,
      strippedPatterns,
      strippedLineCount,
      parseTimeMs: Math.round(performance.now() - startTime),
      scannedWarning,
      scannedPages,
      isMostlyScanned,
      outlineHintsUsed,
      appliedNoiseConfig: noiseConfig,
    };

    self.postMessage({
      type: 'complete',
      requestId,
      payload: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PDF parser worker failed.';
    self.postMessage({
      type: 'error',
      requestId,
      payload: message,
    });
  }
};
