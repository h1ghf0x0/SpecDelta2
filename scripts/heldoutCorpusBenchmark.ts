import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { stripHeadersAndFooters, type RawPageLine } from '../src/utils/noiseFilter.ts';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
  matchCsiHeader,
  type OutlineSectionHint,
} from '../src/utils/pdfSectionParser.ts';
import { compareParsedBooks } from '../src/utils/specDiffEngine.ts';
import { clopperPearsonStats, type BinomialRateStats } from '../src/utils/statsCi.ts';
import {
  DEFAULT_NOISE_CONFIG,
  type SingleSpecParseOutput,
} from '../src/types/spec.ts';

interface HeldoutManifestEntry {
  file: string;
  role: 'full-scale-dover' | 'unseen-manual';
  institution: string;
  expectedPages: number;
  sha256Prefix: string;
  sourceUrl: string;
}

const HELDOUT_MANIFEST: HeldoutManifestEntry[] = [
  {
    file: 'dover_vol1_full.pdf',
    role: 'full-scale-dover',
    institution: 'City of Dover, NH (HMFH Architects)',
    expectedPages: 1046,
    sha256Prefix: '6f2e02c2',
    sourceUrl:
      'https://www.dover.nh.gov/Assets/government/city-operations/public-education/high-school-project/drawings-specs/Specifications%20-%20VOL%201%20-DHS%20Conformed%20Set.pdf',
  },
  {
    file: '01_ca_dgs_pm.pdf',
    role: 'unseen-manual',
    institution: 'California Dept. of General Services',
    expectedPages: 255,
    sha256Prefix: '286c2bf1',
    sourceUrl:
      'https://www.dgs.ca.gov/-/media/Divisions/OBAS/Plans-and-Specs/22-130586-PROJECT-MANUAL.pdf',
  },
  {
    file: '02_kenedy_tx_pm.pdf',
    role: 'unseen-manual',
    institution: 'Kenedy County, Texas',
    expectedPages: 315,
    sha256Prefix: '90fe0480',
    sourceUrl:
      'https://www.kenedycountytx.gov/upload/page/4734/Election%20Office%20Addition%20-%20Project%20Manual.pdf',
  },
  {
    file: '03_santafe_nm_pm.pdf',
    role: 'unseen-manual',
    institution: 'Santa Fe County, New Mexico',
    expectedPages: 457,
    sha256Prefix: 'de478035',
    sourceUrl:
      'https://www.santafecountynm.gov/documents/solicitations/SFC222-11_PM_100%25_%283%29.pdf',
  },
  {
    file: '04_merced_college.pdf',
    role: 'unseen-manual',
    institution: 'Merced Community College District',
    expectedPages: 127,
    sha256Prefix: '20ebce06',
    sourceUrl: 'https://www.mccd.edu/wp-content/uploads/2024/03/02-121754_SPC_A.pdf',
  },
  {
    file: '05_redrocks_cc.pdf',
    role: 'unseen-manual',
    institution: 'Red Rocks Community College',
    expectedPages: 345,
    sha256Prefix: '1cfc1dec',
    sourceUrl:
      'https://www.rrcc.edu/sites/default/files/2026-01/project_manual_upgrade_w_end_rtu_lakewood_campus.pdf',
  },
  {
    file: '06_humboldt_pm.pdf',
    role: 'unseen-manual',
    institution: 'Cal Poly Humboldt',
    expectedPages: 143,
    sha256Prefix: '0e35f6c8',
    sourceUrl:
      'https://www.humboldt.edu/sites/default/files/strategic-business-services/2024-06/pw20-1-7-exhibitfprojectmanual1.pdf',
  },
  {
    file: '07_unlv_msl.pdf',
    role: 'unseen-manual',
    institution: 'University of Nevada, Las Vegas (UNLV)',
    expectedPages: 674,
    sha256Prefix: '9c44f59b',
    sourceUrl:
      'https://www.unlv.edu/sites/default/files/page_files/182/Exhibit%20C2%20MSL%20Project%20Manual_0.pdf',
  },
  {
    file: '08_untsystem_pm.pdf',
    role: 'unseen-manual',
    institution: 'University of North Texas System',
    expectedPages: 1984,
    sha256Prefix: '481675f0',
    sourceUrl:
      'https://finance.untsystem.edu/sites/default/files/bid-documents/rfcsp763_26_1020er_project_manual.pdf',
  },
  {
    file: '09_cmich_pm.pdf',
    role: 'unseen-manual',
    institution: 'Central Michigan University',
    expectedPages: 688,
    sha256Prefix: 'd0186011',
    sourceUrl:
      'https://cdn.cmich.edu/sitefinity/documents/EDA-06-01-06375-CMURC-Bid-CD-Project-Manual-2023-05-23.pdf',
  },
  {
    file: '10_osu_docs.pdf',
    role: 'unseen-manual',
    institution: 'Oregon State University',
    expectedPages: 281,
    sha256Prefix: '0a582605',
    sourceUrl:
      'https://admin.bid.oregonstate.edu/opportunity/viewFile/49190/Exhibit%207-Construction%20Documents.pdf?1735931451',
  },
];

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

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function ensureHeldoutPdf(
  heldoutDir: string,
  entry: HeldoutManifestEntry
): Promise<{ filePath: string; bytes: Uint8Array; sha256: string }> {
  const filePath = path.join(heldoutDir, entry.file);

  if (!fs.existsSync(filePath)) {
    console.log(`Downloading ${entry.file} from ${entry.sourceUrl} ...`);
    const res = await fetch(entry.sourceUrl, {
      headers: {
        'User-Agent': 'SpecDelta-Benchmark/1.0 (+https://github.com/h1ghf0x0/SpecDelta)',
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to download ${entry.file}: HTTP ${res.status} ${res.statusText}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
  }

  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const hash = sha256Hex(bytes);
  if (!hash.startsWith(entry.sha256Prefix)) {
    throw new Error(
      `SHA-256 mismatch for ${entry.file}: expected prefix ${entry.sha256Prefix}, got ${hash.slice(0, 12)}`
    );
  }

  return { filePath, bytes, sha256: hash };
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
    // Outline metadata is optional
  }
  return hintMap;
}

function shiftOutlineHints(
  origHints: Map<number, OutlineSectionHint[]>,
  pageDelta: number
): Map<number, OutlineSectionHint[]> {
  const shifted = new Map<number, OutlineSectionHint[]>();
  for (const [page, list] of origHints.entries()) {
    const newPage = page + pageDelta;
    shifted.set(
      newPage,
      list.map((h) => ({ ...h, page: newPage }))
    );
  }
  return shifted;
}

interface ParsedHeldoutPdf {
  book: SingleSpecParseOutput;
  rawPageTexts: string[];
  extractableChars: number;
  scannedPages: number[];
  outlineHintsByPage: Map<number, OutlineSectionHint[]>;
  outlineCsiCodes: string[];
  parseMs: number;
}

async function parseHeldoutPdfBuffer(
  bytes: Uint8Array,
  fileName: string,
  options?: {
    overrideOutlineHints?: Map<number, OutlineSectionHint[]>;
    skipOutlineExtraction?: boolean;
  }
): Promise<ParsedHeldoutPdf> {
  const start = performance.now();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;

  try {
    const outlineHintsByPage = options?.overrideOutlineHints
      ? options.overrideOutlineHints
      : options?.skipOutlineExtraction
        ? new Map<number, OutlineSectionHint[]>()
        : await extractOutlineHints(doc);

    const outlineCodeSet = new Set<string>();
    let outlineBookmarkCount = 0;
    for (const list of outlineHintsByPage.values()) {
      outlineBookmarkCount += list.length;
      for (const h of list) {
        if (/^\d{2}\s\d{2}\s\d{2}$/.test(h.normalizedCode) && !h.normalizedCode.endsWith('00 00')) {
          outlineCodeSet.add(h.normalizedCode);
        }
      }
    }

    const rawLines: RawPageLine[] = [];
    const rawPageTexts: string[] = [];
    const scannedPages: number[] = [];
    let extractableChars = 0;

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      const { lines, pageChars } = assemblePageLinesFromSpans(
        textContent.items,
        pageNum,
        viewport.height || 792
      );
      rawLines.push(...lines);
      rawPageTexts.push(lines.map((l) => l.text).join('\n'));
      extractableChars += pageChars;

      if (pageChars < 30) {
        let hasImageOp = false;
        try {
          const opList = await page.getOperatorList();
          hasImageOp = opList.fnArray.some((op) => IMAGE_PAINT_OPS.has(op));
        } catch {
          hasImageOp = pageChars === 0;
        }
        if (hasImageOp) {
          scannedPages.push(pageNum);
        }
      }

      page.cleanup();
    }

    const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
      rawLines,
      doc.numPages,
      DEFAULT_NOISE_CONFIG
    );
    const { sections, outlineHintsUsed } = chunkIntoCsiSections(
      cleanLines,
      doc.numPages,
      outlineHintsByPage
    );
    const parseMs = Math.round(performance.now() - start);
    await doc.cleanup();

    return {
      book: {
        fileName,
        pageCount: doc.numPages,
        parseTimeMs: parseMs,
        scannedWarning:
          scannedPages.length > 0 && extractableChars / Math.max(1, doc.numPages) < 120,
        scannedPages,
        strippedPatterns,
        strippedLineCount,
        outlineHintsUsed,
        outlineBookmarkCount,
        sections,
      },
      rawPageTexts,
      extractableChars,
      scannedPages,
      outlineHintsByPage,
      outlineCsiCodes: Array.from(outlineCodeSet).sort(),
      parseMs,
    };
  } finally {
    await loadingTask.destroy();
  }
}

function countPageByPageDifferences(
  oldPages: string[],
  newPages: string[]
): { comparedPages: number; changedPages: number } {
  const comparedPages = Math.max(oldPages.length, newPages.length);
  let changedPages = 0;
  for (let i = 0; i < comparedPages; i++) {
    if ((oldPages[i] ?? '') !== (newPages[i] ?? '')) {
      changedPages++;
    }
  }
  return { comparedPages, changedPages };
}

function sanitizeForWinAnsi(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(text: string, maxChars: number): string[] {
  const clean = sanitizeForWinAnsi(text);
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderExtractedSectionsToPdf(
  sections: Array<{ code: string; rawHeader?: string; title: string; paragraphs: string[] }>,
  projectHeader: string,
  issueStamp: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 54;
  const linesPerPage = 38;

  const pageRows: Array<{
    code: string;
    title: string;
    rows: Array<{ text: string; bold: boolean }>;
  }> = [];

  for (const sec of sections) {
    const cleanHeader = sanitizeForWinAnsi(
      `${sec.rawHeader ?? `SECTION ${sec.code}`} - ${sec.title}`
    );
    const rows: Array<{ text: string; bold: boolean }> = [{ text: cleanHeader, bold: true }];
    for (const p of sec.paragraphs) {
      for (const wrappedLine of wrapText(p, 90)) {
        rows.push({ text: wrappedLine, bold: false });
      }
    }
    for (let i = 0; i < rows.length; i += linesPerPage) {
      pageRows.push({
        code: sec.code,
        title: sec.title,
        rows: rows.slice(i, i + linesPerPage),
      });
    }
  }

  const totalPages = pageRows.length;
  pageRows.forEach((pg, idx) => {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const pageNum = idx + 1;
    page.drawText(sanitizeForWinAnsi(projectHeader), {
      x: marginX,
      y: pageHeight - 36,
      size: 8.5,
      font: bold,
      color: rgb(0.2, 0.25, 0.35),
    });
    page.drawText(sanitizeForWinAnsi(issueStamp), {
      x: pageWidth - marginX - 140,
      y: pageHeight - 36,
      size: 8.5,
      font,
      color: rgb(0.2, 0.25, 0.35),
    });

    let y = pageHeight - 78;
    for (const row of pg.rows) {
      page.drawText(row.text, {
        x: marginX,
        y,
        size: 9,
        font: row.bold ? bold : font,
        color: rgb(0.08, 0.1, 0.16),
      });
      y -= 16;
    }

    const titleCase = pg.title.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    page.drawText(
      sanitizeForWinAnsi(`${titleCase.slice(0, 42)} ${pg.code.replace(/\s+/g, '')} - ${pageNum}`),
      { x: marginX, y: 34, size: 8.5, font, color: rgb(0.32, 0.38, 0.46) }
    );
    page.drawText(`Page ${pageNum} of ${totalPages}`, {
      x: pageWidth - marginX - 72,
      y: 34,
      size: 8.5,
      font,
      color: rgb(0.32, 0.38, 0.46),
    });
  });

  return pdfDoc.save();
}

async function runSymmetricAndAsymmetricShiftChecks(
  entry: HeldoutManifestEntry,
  bytes: Uint8Array,
  origParsed: ParsedHeldoutPdf
): Promise<{
  symmetricWithOutlines: {
    origPages: number;
    shiftedPages: number;
    sectionsChecked: number;
    sectionFalsePositives: number;
    falsePositiveCodes: string[];
    pageBaselineChangedPages: number;
    pageBaselineTotalPages: number;
  };
  asymmetricBookmarkedVsUnbookmarked: {
    tested: boolean;
    sectionsChecked: number;
    sectionFalsePositives: number;
    falsePositiveCodes: string[];
    warningTriggered: boolean;
  };
}> {
  const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const shiftedPdf = await PDFDocument.create();
  const cover = shiftedPdf.addPage([612, 792]);
  const bold = await shiftedPdf.embedFont(StandardFonts.HelveticaBold);
  cover.drawText('DOCUMENT 00 00 10 - ADDENDUM 01 COVER NOTICE', {
    x: 54,
    y: 720,
    size: 12,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  cover.drawText(
    `Held-out verbatim page-shift verification notice inserted before ${entry.file}.`,
    {
      x: 54,
      y: 696,
      size: 9.5,
      font: bold,
      color: rgb(0.2, 0.2, 0.2),
    }
  );
  const copied = await shiftedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
  for (const pg of copied) shiftedPdf.addPage(pg);

  const shiftedBytes = await shiftedPdf.save();

  // 1. Symmetric shift: preserve outline hints shifted by +1 page (equivalent to a re-bookmarked Addendum)
  const shiftedHints = shiftOutlineHints(origParsed.outlineHintsByPage, 1);
  const shiftedSymmetricParsed = await parseHeldoutPdfBuffer(
    shiftedBytes,
    `shifted_${entry.file}`,
    { overrideOutlineHints: shiftedHints }
  );

  const symDiff = compareParsedBooks(origParsed.book, shiftedSymmetricParsed.book);
  const symAudited = symDiff.results.filter(
    (r) => r.sectionCode !== '00 00 10' && r.sectionCode !== '00 01 00'
  );
  const symFp = symAudited.filter((r) => r.status !== 'unchanged');
  const baseline = countPageByPageDifferences(
    origParsed.rawPageTexts,
    shiftedSymmetricParsed.rawPageTexts
  );

  // 2. Asymmetric bookmark scenario: bookmarked Baseline vs. un-bookmarked Addendum (pdf-lib strips outline)
  let asymRes = {
    tested: false,
    sectionsChecked: 0,
    sectionFalsePositives: 0,
    falsePositiveCodes: [] as string[],
    warningTriggered: false,
  };

  if ((origParsed.book.outlineBookmarkCount ?? 0) > 0) {
    const shiftedNoOutlines = await parseHeldoutPdfBuffer(
      shiftedBytes,
      `shifted_no_outline_${entry.file}`,
      { skipOutlineExtraction: true }
    );
    const asymDiff = compareParsedBooks(origParsed.book, shiftedNoOutlines.book);
    const asymAudited = asymDiff.results.filter(
      (r) => r.sectionCode !== '00 00 10' && r.sectionCode !== '00 01 00'
    );
    const asymFp = asymAudited.filter((r) => r.status !== 'unchanged');
    asymRes = {
      tested: true,
      sectionsChecked: asymAudited.length,
      sectionFalsePositives: asymFp.length,
      falsePositiveCodes: asymFp.map((r) => `${r.sectionCode}:${r.status}`),
      warningTriggered: Boolean(asymDiff.diagnostics.bookmarkAsymmetryWarning),
    };
  }

  return {
    symmetricWithOutlines: {
      origPages: origParsed.book.pageCount,
      shiftedPages: shiftedSymmetricParsed.book.pageCount,
      sectionsChecked: symAudited.length,
      sectionFalsePositives: symFp.length,
      falsePositiveCodes: symFp.map((r) => `${r.sectionCode}:${r.status}`),
      pageBaselineChangedPages: baseline.changedPages,
      pageBaselineTotalPages: baseline.comparedPages,
    },
    asymmetricBookmarkedVsUnbookmarked: asymRes,
  };
}

interface PlantedHeldoutEdit {
  id: string;
  sourceFile: string;
  sectionCode: string;
  type: 'modified' | 'deleted' | 'added' | 'renumbered';
  renumberedTo?: string;
  expectedRiskFlagSubstring?: string;
}

async function main() {
  const suiteStart = performance.now();
  const heldoutDir = path.resolve(process.cwd(), 'benchmarks', 'heldout');
  fs.mkdirSync(heldoutDir, { recursive: true });

  console.log('Verifying & running symmetric + asymmetric checks on 11 held-out PDFs...');

  let doverSummary: Record<string, unknown> | null = null;
  let doverSymSectionsChecked = 0;
  let doverSymFalsePositives = 0;

  let unseenTotalPages = 0;
  let unseenTotalChars = 0;
  let unseenTotalScannedPages = 0;
  let unseenTotalStrippedLines = 0;
  let unseenTotalParseMs = 0;
  let unseenTotalSectionsDetected = 0;

  let outlineCheckedManuals = 0;
  let outlineExpectedTotal = 0;
  let outlineMatchedTotal = 0;
  let outlineMissedTotal = 0;

  let unseenSymShiftSectionsChecked = 0;
  let unseenSymShiftFalsePositives = 0;
  let unseenShiftBaselineChangedPages = 0;
  let unseenShiftBaselineTotalPages = 0;

  let asymBookmarkedManualsCount = 0;
  let asymSectionsChecked = 0;
  let asymFalsePositives = 0;
  let asymWarningsTriggered = 0;

  const unseenPerDocument = [];
  const usedCodes = new Set<string>();
  const sampledBaseSections: Array<{
    sourceFile: string;
    code: string;
    rawHeader: string;
    title: string;
    paragraphs: string[];
  }> = [];

  // Process manuals sequentially and release raw PDF bytes immediately to keep memory bounded
  for (const entry of HELDOUT_MANIFEST) {
    const { bytes, sha256 } = await ensureHeldoutPdf(heldoutDir, entry);
    const parsed = await parseHeldoutPdfBuffer(bytes, entry.file);

    if (parsed.book.pageCount !== entry.expectedPages) {
      throw new Error(
        `Page count mismatch for ${entry.file}: expected ${entry.expectedPages}, got ${parsed.book.pageCount}`
      );
    }

    const bodySections = parsed.book.sections.filter((s) => s.normalizedCode !== '00 01 00');
    const shiftOut = await runSymmetricAndAsymmetricShiftChecks(entry, bytes, parsed);
    const rssAfterDocMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

    console.log(
      `  ✓ ${entry.file} (${parsed.book.pageCount}p, ${bodySections.length} CSI sections, symFP=${shiftOut.symmetricWithOutlines.sectionFalsePositives}/${shiftOut.symmetricWithOutlines.sectionsChecked}, asymFP=${shiftOut.asymmetricBookmarkedVsUnbookmarked.sectionFalsePositives}, rss=${rssAfterDocMb}MB)`
    );

    if (entry.role === 'full-scale-dover') {
      doverSymSectionsChecked = shiftOut.symmetricWithOutlines.sectionsChecked;
      doverSymFalsePositives = shiftOut.symmetricWithOutlines.sectionFalsePositives;
      doverSummary = {
        file: entry.file,
        sha256Prefix: sha256.slice(0, 8),
        pages: parsed.book.pageCount,
        extractableChars: parsed.extractableChars,
        scannedPagesCount: parsed.scannedPages.length,
        parseMs: parsed.parseMs,
        parsePagesPerSec: Math.round((parsed.book.pageCount / Math.max(1, parsed.parseMs)) * 1000),
        strippedLines: parsed.book.strippedLineCount ?? 0,
        detectedSectionsCount: bodySections.length,
        outlineCsiBookmarksCount: parsed.outlineCsiCodes.length,
        rssAfterDocMb,
        shiftTest: shiftOut.symmetricWithOutlines,
        asymmetricBookmarkTest: shiftOut.asymmetricBookmarkedVsUnbookmarked,
      };
    } else {
      const detectedSet = new Set(bodySections.map((s) => s.normalizedCode));

      unseenTotalPages += parsed.book.pageCount;
      unseenTotalChars += parsed.extractableChars;
      unseenTotalScannedPages += parsed.scannedPages.length;
      unseenTotalStrippedLines += parsed.book.strippedLineCount ?? 0;
      unseenTotalParseMs += parsed.parseMs;
      unseenTotalSectionsDetected += bodySections.length;

      let outlineMissedCodes: string[] = [];
      if (parsed.outlineCsiCodes.length > 0) {
        outlineCheckedManuals++;
        outlineExpectedTotal += parsed.outlineCsiCodes.length;
        const missed = parsed.outlineCsiCodes.filter((c) => !detectedSet.has(c));
        outlineMissedCodes = missed;
        outlineMatchedTotal += parsed.outlineCsiCodes.length - missed.length;
        outlineMissedTotal += missed.length;
      }

      unseenSymShiftSectionsChecked += shiftOut.symmetricWithOutlines.sectionsChecked;
      unseenSymShiftFalsePositives += shiftOut.symmetricWithOutlines.sectionFalsePositives;
      unseenShiftBaselineChangedPages += shiftOut.symmetricWithOutlines.pageBaselineChangedPages;
      unseenShiftBaselineTotalPages += shiftOut.symmetricWithOutlines.pageBaselineTotalPages;

      if (shiftOut.asymmetricBookmarkedVsUnbookmarked.tested) {
        asymBookmarkedManualsCount++;
        asymSectionsChecked += shiftOut.asymmetricBookmarkedVsUnbookmarked.sectionsChecked;
        asymFalsePositives += shiftOut.asymmetricBookmarkedVsUnbookmarked.sectionFalsePositives;
        if (shiftOut.asymmetricBookmarkedVsUnbookmarked.warningTriggered) {
          asymWarningsTriggered++;
        }
      }

      // Sample up to 15 clean sections per unseen manual (excluding 00 01 00 front-matter) for 100+ edit suite
      const candidates = bodySections.filter(
        (s) => s.paragraphs.length >= 3 && !usedCodes.has(s.normalizedCode)
      );
      let pickedForDoc = 0;
      for (const sec of candidates) {
        if (pickedForDoc >= 15) break;
        const cleanParagraphs = sec.paragraphs
          .map(sanitizeForWinAnsi)
          .filter((p) => p.length >= 25)
          .slice(0, 8);
        if (cleanParagraphs.length < 2) continue;
        usedCodes.add(sec.normalizedCode);
        sampledBaseSections.push({
          sourceFile: entry.file,
          code: sec.normalizedCode,
          rawHeader: sec.normalizedCode.startsWith('00 ')
            ? `DOCUMENT ${sec.normalizedCode}`
            : `SECTION ${sec.normalizedCode}`,
          title: sanitizeForWinAnsi(sec.title) || 'GENERAL REQUIREMENTS',
          paragraphs: cleanParagraphs,
        });
        pickedForDoc++;
      }

      unseenPerDocument.push({
        file: entry.file,
        institution: entry.institution,
        sha256Prefix: sha256.slice(0, 8),
        sourceUrl: entry.sourceUrl,
        pages: parsed.book.pageCount,
        extractableChars: parsed.extractableChars,
        scannedPagesCount: parsed.scannedPages.length,
        parseMs: parsed.parseMs,
        pagesPerSec: Math.round((parsed.book.pageCount / Math.max(1, parsed.parseMs)) * 1000),
        strippedLines: parsed.book.strippedLineCount ?? 0,
        detectedSectionsCount: bodySections.length,
        outlineCsiBookmarksCount: parsed.outlineCsiCodes.length,
        outlineCsiBookmarksMissed: outlineMissedCodes,
        rssAfterDocMb,
        shiftTest: shiftOut.symmetricWithOutlines,
        asymmetricBookmarkTest: shiftOut.asymmetricBookmarkedVsUnbookmarked,
      });
    }
  }

  // Suite 3: 100+ Held-Out Planted Real-Clause Edits across all 10 unseen manuals (excluding 00 01 00 consistently)
  sampledBaseSections.sort((a, b) => a.code.localeCompare(b.code));
  const addendumSections = sampledBaseSections.map((s) => ({
    ...s,
    paragraphs: [...s.paragraphs],
  }));

  const plantedEdits: PlantedHeldoutEdit[] = [];

  const clauseTemplates: Array<{
    label: string;
    appendText: string;
    riskSubstring: string;
  }> = [
    {
      label: 'psi_tolerance_upgrade',
      appendText: ' Minimum 28-day compressive strength shall be 5000 psi with 20 mil vapor retarder.',
      riskSubstring: '5000 psi',
    },
    {
      label: 'allowance_and_owner_scope',
      appendText: ' Include a cash allowance of $35,000; metering equipment furnished and installed by Owner.',
      riskSubstring: '$35,000',
    },
    {
      label: 'warranty_and_threshold',
      appendText: ' Manufacturer warranty shall cover not less than 20 years on all installed assemblies.',
      riskSubstring: 'warranty',
    },
    {
      label: 'gauge_and_directive',
      appendText: ' Framing members shall be minimum 16 gauge galvanized steel with no substitutions permitted.',
      riskSubstring: '16 gauge',
    },
    {
      label: 'fire_rating_upgrade',
      appendText: ' Assembly shall maintain a 2-hour UL fire-resistance rating and 65 kAIC interrupting rating.',
      riskSubstring: '2-hour',
    },
    {
      label: 'liquidated_damages_and_percentage',
      appendText: ' Delay liquidated damages of $2,500 per calendar day apply; retainage shall not exceed 5%.',
      riskSubstring: '$2,500',
    },
  ];

  // Apply up to 10 modifications per unseen manual (~100 modified sections across 10 manuals)
  let templateIdx = 0;
  for (const entry of HELDOUT_MANIFEST.filter((e) => e.role === 'unseen-manual')) {
    const docSections = addendumSections.filter((s) => s.sourceFile === entry.file);
    for (let j = 0; j < Math.min(10, docSections.length); j++) {
      const target = docSections[j];
      const tpl = clauseTemplates[templateIdx % clauseTemplates.length];
      templateIdx++;
      const pIdx = Math.min(1, target.paragraphs.length - 1);
      target.paragraphs[pIdx] = `${target.paragraphs[pIdx]}${tpl.appendText}`;
      plantedEdits.push({
        id: `H_${entry.file}_${target.code.replace(/\s+/g, '')}_${tpl.label}`,
        sourceFile: entry.file,
        sectionCode: target.code,
        type: 'modified',
        expectedRiskFlagSubstring: tpl.riskSubstring,
      });
    }
  }

  // Plus 4 deleted sections, 4 renumbered sections, and 2 added sections from remaining sampled pool
  const untouchedPool = addendumSections.filter(
    (s) => !plantedEdits.some((e) => e.sectionCode === s.code)
  );
  const deleteTargets = untouchedPool.slice(0, 4);
  for (const toDelete of deleteTargets) {
    const delIdx = addendumSections.findIndex((s) => s.code === toDelete.code);
    if (delIdx !== -1) {
      addendumSections.splice(delIdx, 1);
      plantedEdits.push({
        id: `H_${toDelete.sourceFile}_${toDelete.code.replace(/\s+/g, '')}_deleted`,
        sourceFile: toDelete.sourceFile,
        sectionCode: toDelete.code,
        type: 'deleted',
      });
    }
  }

  let renumberedAdded = 0;
  for (const candidate of untouchedPool.slice(4)) {
    if (renumberedAdded >= 4) break;
    const origCode = candidate.code;
    const newCode = origCode.slice(0, 6) + '98';
    if (usedCodes.has(newCode)) continue;
    usedCodes.add(newCode);
    candidate.code = newCode;
    candidate.rawHeader = newCode.startsWith('00 ')
      ? `DOCUMENT ${newCode}`
      : `SECTION ${newCode}`;
    plantedEdits.push({
      id: `H_${candidate.sourceFile}_${origCode.replace(/\s+/g, '')}_renumbered`,
      sourceFile: candidate.sourceFile,
      sectionCode: origCode,
      renumberedTo: newCode,
      type: 'renumbered',
    });
    renumberedAdded++;
  }

  for (const [addedCode, title, text, riskSub] of [
    [
      '49 99 98',
      'ADDENDUM TEMPORARY POWER TAP',
      '1.1 Contractor shall provide temporary 400A generator tap with minimum 65 kAIC breaker and $15,000 allowance.',
      '$15,000',
    ],
    [
      '49 99 99',
      'ADDENDUM TEMPORARY UTILITY METERING',
      '1.1 Contractor shall furnish and install temporary utility metering with minimum 100-psi rated valves and $12,500 allowance.',
      '$12,500',
    ],
  ] as const) {
    addendumSections.push({
      sourceFile: 'synthetic-heldout-addendum',
      code: addedCode,
      rawHeader: `SECTION ${addedCode}`,
      title,
      paragraphs: [text],
    });
    plantedEdits.push({
      id: `H_added_${addedCode.replace(/\s+/g, '')}`,
      sourceFile: 'synthetic-heldout-addendum',
      sectionCode: addedCode,
      type: 'added',
      expectedRiskFlagSubstring: riskSub,
    });
  }

  addendumSections.sort((a, b) => a.code.localeCompare(b.code));

  const [basePdfBytes, addendumPdfBytes] = await Promise.all([
    renderExtractedSectionsToPdf(sampledBaseSections, 'HELDOUT 10-MANUAL SAMPLE BASE', 'ISSUED FOR BID'),
    renderExtractedSectionsToPdf(addendumSections, 'HELDOUT 10-MANUAL SAMPLE ADDENDUM', 'ADDENDUM 01'),
  ]);
  const [baseParsed, addendumParsed] = await Promise.all([
    parseHeldoutPdfBuffer(basePdfBytes, 'HeldoutSample_Base.pdf', { skipOutlineExtraction: true }),
    parseHeldoutPdfBuffer(addendumPdfBytes, 'HeldoutSample_Addendum01.pdf', {
      skipOutlineExtraction: true,
    }),
  ]);

  const plantedDiffStart = performance.now();
  const plantedDiff = compareParsedBooks(baseParsed.book, addendumParsed.book);
  const plantedDiffMs = Math.round(performance.now() - plantedDiffStart);

  const expectedChangedMap = new Map<string, PlantedHeldoutEdit>();
  for (const edit of plantedEdits) {
    expectedChangedMap.set(edit.renumberedTo ?? edit.sectionCode, edit);
  }

  let plantedHits = 0;
  let plantedMisses = 0;
  let riskExpected = 0;
  let riskHits = 0;
  const plantedOutcomes = [];

  for (const edit of plantedEdits) {
    const targetCode = edit.renumberedTo ?? edit.sectionCode;
    const result = plantedDiff.results.find((r) => r.sectionCode === targetCode);

    let hit = false;
    if (edit.type === 'deleted') hit = result?.status === 'deleted';
    else if (edit.type === 'added') hit = result?.status === 'added';
    else if (edit.type === 'renumbered')
      hit = Boolean(result && result.renumberedFrom === edit.sectionCode);
    else hit = Boolean(result && result.status === 'modified' && result.changedParagraphs.length > 0);

    if (hit) plantedHits++;
    else plantedMisses++;

    let riskMatched: boolean | null = null;
    if (edit.expectedRiskFlagSubstring) {
      riskExpected++;
      riskMatched = Boolean(
        result?.riskFlags.some((f) =>
          f.toLowerCase().includes(edit.expectedRiskFlagSubstring!.toLowerCase())
        )
      );
      if (riskMatched) riskHits++;
    }

    plantedOutcomes.push({
      id: edit.id,
      sectionCode: targetCode,
      expectedType: edit.type,
      detectedStatus: result?.status ?? 'missing',
      renumberedFrom: result?.renumberedFrom ?? null,
      detected: hit,
      riskFlagMatched: riskMatched,
    });
  }

  // Exclude 00 01 00 pseudo-section consistently with realCorpusBenchmark.ts & benchmark.test.ts
  const unchangedAudited = plantedDiff.results.filter(
    (r) => r.sectionCode !== '00 01 00' && !expectedChangedMap.has(r.sectionCode)
  );
  const plantedFalsePositives = unchangedAudited.filter((r) => r.status !== 'unchanged');

  const stats: Record<string, BinomialRateStats> = {
    doverFullScaleShiftFalsePositives: clopperPearsonStats(
      doverSymFalsePositives,
      doverSymSectionsChecked
    ),
    unseenManualsSymmetricShiftFalsePositives: clopperPearsonStats(
      unseenSymShiftFalsePositives,
      unseenSymShiftSectionsChecked
    ),
    unseenAsymmetricBookmarkShiftFalsePositives: clopperPearsonStats(
      asymFalsePositives,
      asymSectionsChecked
    ),
    unseenOutlineCsiSectionRecall: clopperPearsonStats(outlineMatchedTotal, outlineExpectedTotal),
    unseenOutlineCsiSectionMisses: clopperPearsonStats(outlineMissedTotal, outlineExpectedTotal),
    heldoutPlantedEditsCaught: clopperPearsonStats(plantedHits, plantedEdits.length),
    heldoutPlantedEditsMissed: clopperPearsonStats(plantedMisses, plantedEdits.length),
    heldoutPlantedRiskFlagsMatched: clopperPearsonStats(riskHits, riskExpected),
    heldoutPlantedUnchangedFalsePositives: clopperPearsonStats(
      plantedFalsePositives.length,
      unchangedAudited.length
    ),
  };

  const rssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    totalDurationMs: Math.round(performance.now() - suiteStart),
    peakRssMb: rssMb,
    corpusOverview: {
      fullScaleDoverPages: 1046,
      unseenManualsCount: 10,
      unseenTotalPages,
      unseenTotalExtractableChars: unseenTotalChars,
      unseenTotalScannedPages,
      unseenTotalStrippedNoiseLines: unseenTotalStrippedLines,
      unseenTotalSectionsDetected,
      unseenAvgParsePagesPerSec: Math.round(
        (unseenTotalPages / Math.max(1, unseenTotalParseMs)) * 1000
      ),
    },
    confidenceIntervals: stats,
    suite1_fullScaleDover1046p: doverSummary,
    suite2_unseenTenManuals: {
      manualsCount: 10,
      totalPages: unseenTotalPages,
      totalSectionsDetected: unseenTotalSectionsDetected,
      outlineCheckedManuals,
      outlineExpectedSections: outlineExpectedTotal,
      outlineMatchedSections: outlineMatchedTotal,
      outlineMissedSections: outlineMissedTotal,
      symmetricShiftSectionsChecked: unseenSymShiftSectionsChecked,
      symmetricShiftFalsePositives: unseenSymShiftFalsePositives,
      asymmetricBookmarkManualsTested: asymBookmarkedManualsCount,
      asymmetricBookmarkSectionsChecked: asymSectionsChecked,
      asymmetricBookmarkFalsePositives: asymFalsePositives,
      asymmetricBookmarkWarningsTriggered: asymWarningsTriggered,
      verbatimShiftPageBaselineChangedPages: unseenShiftBaselineChangedPages,
      verbatimShiftPageBaselineTotalPages: unseenShiftBaselineTotalPages,
      perDocument: unseenPerDocument,
    },
    suite3_heldoutPlantedEdits: {
      sourceSectionsSampled: sampledBaseSections.length,
      basePages: baseParsed.book.pageCount,
      addendumPages: addendumParsed.book.pageCount,
      diffMs: plantedDiffMs,
      totalSectionsCompared: plantedDiff.results.length,
      unchangedSectionsAudited: unchangedAudited.length,
      falsePositiveSectionCount: plantedFalsePositives.length,
      falsePositiveSections: plantedFalsePositives.map((r) => ({
        sectionCode: r.sectionCode,
        status: r.status,
      })),
      plantedEditsTotal: plantedEdits.length,
      plantedEditsCaught: plantedHits,
      plantedEditsMissed: plantedMisses,
      riskFlagsExpected: riskExpected,
      riskFlagsMatched: riskHits,
      outcomes: plantedOutcomes,
    },
  };

  const outPath = path.resolve(process.cwd(), 'benchmarks', 'heldout_results.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`\nHeld-out corpus benchmark results written to ${outPath}`);
  console.log(
    JSON.stringify(
      {
        overview: report.corpusOverview,
        peakRssMb: report.peakRssMb,
        confidenceIntervals: Object.fromEntries(
          Object.entries(report.confidenceIntervals).map(([k, v]) => [k, v.summary])
        ),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
