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

interface SealedManifestEntry {
  file: string;
  institution: string;
  expectedPages: number;
  sha256Prefix: string;
  sourceUrl: string;
}

const SEALED_MANIFEST: SealedManifestEntry[] = [
  {
    file: '01_ncdot_clay_pm.pdf',
    institution: 'North Carolina Dept. of Transportation (NCDOT)',
    expectedPages: 468,
    sha256Prefix: '7a45d2c2',
    sourceUrl:
      'https://connect.ncdot.gov/letting/Division%2014%20Letting/01%2010%202017%20SPECIAL%20LETTING/13283.01%20Clay%20Co.%20Maint%20Project%20Manual%20Vol%201.pdf',
  },
  {
    file: '02_llnl_div01_pm.pdf',
    institution: 'Lawrence Livermore National Laboratory (LLNL)',
    expectedPages: 185,
    sha256Prefix: '901244f3',
    sourceUrl:
      'https://procurement.llnl.gov/sites/procurement/files/2025-09/Division%2001%20General%20Requirements%20for%20Construction.pdf',
  },
  {
    file: '03_maconbibb_specs.pdf',
    institution: 'Macon-Bibb County, Georgia',
    expectedPages: 180,
    sha256Prefix: 'bb6e391f',
    sourceUrl:
      'https://www.maconbibb.us/wp-content/uploads/2020/05/Attachment-B-Specifications-1.pdf',
  },
  {
    file: '04_uoregon_div26.pdf',
    institution: 'University of Oregon (CPFM)',
    expectedPages: 42,
    sha256Prefix: '2808e832',
    sourceUrl:
      'https://cpfm.uoregon.edu/sites/default/files/_division_26_combined_123021.pdf',
  },
  {
    file: '05_ca_dgs_24235656.pdf',
    institution: 'California Dept. of General Services (Book II)',
    expectedPages: 764,
    sha256Prefix: 'b00024dc',
    sourceUrl:
      'https://www.dgs.ca.gov/-/media/Divisions/OBAS/Plans-and-Specs/24-235656/2-142452--Project-Manual-Book-II.pdf',
  },
  {
    file: '06_osu_kelley_add1.pdf',
    institution: 'Oregon State University (Kelley Engineering Addendum 1)',
    expectedPages: 95,
    sha256Prefix: '5d2a6a53',
    sourceUrl:
      'https://bid.oregonstate.edu/opportunity/viewFile/48782/Kelley%20Engineering%202nd%20Floor%20Remodel%20ITB%202024-012757%20Addendum%201%20Exhibit%20G%20Specifications.pdf?1694037911',
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

async function ensureSealedPdf(
  sealedDir: string,
  entry: SealedManifestEntry
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const filePath = path.join(sealedDir, entry.file);

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
  if (bytes.length < 8 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    throw new Error(`Invalid PDF header for ${entry.file}`);
  }
  const hash = sha256Hex(bytes);
  if (!hash.startsWith(entry.sha256Prefix)) {
    throw new Error(
      `SHA-256 mismatch for ${entry.file}: expected prefix ${entry.sha256Prefix}, got ${hash.slice(0, 12)}`
    );
  }
  return { bytes, sha256: hash };
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
              // Ignore malformed bookmark destinations
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

interface ParsedSealedPdf {
  book: SingleSpecParseOutput;
  rawPageTexts: string[];
  extractableChars: number;
  scannedPages: number[];
  outlineHintsByPage: Map<number, OutlineSectionHint[]>;
  outlineCsiCodes: string[];
  parseMs: number;
}

async function parseSealedPdfBuffer(
  bytes: Uint8Array,
  fileName: string,
  options?: {
    overrideOutlineHints?: Map<number, OutlineSectionHint[]>;
    skipOutlineExtraction?: boolean;
  }
): Promise<ParsedSealedPdf> {
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

async function runShiftChecks(
  entry: SealedManifestEntry,
  bytes: Uint8Array,
  origParsed: ParsedSealedPdf
) {
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
  cover.drawText(`Sealed release verbatim shift check for ${entry.file}.`, {
    x: 54,
    y: 696,
    size: 9.5,
    font: bold,
    color: rgb(0.2, 0.2, 0.2),
  });
  const copied = await shiftedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
  for (const pg of copied) shiftedPdf.addPage(pg);

  const shiftedBytes = await shiftedPdf.save();
  const shiftedHints = shiftOutlineHints(origParsed.outlineHintsByPage, 1);
  const shiftedParsed = await parseSealedPdfBuffer(shiftedBytes, `shifted_${entry.file}`, {
    overrideOutlineHints: shiftedHints,
  });

  const diff = compareParsedBooks(origParsed.book, shiftedParsed.book);
  const audited = diff.results.filter(
    (r) => r.sectionCode !== '00 00 10' && r.sectionCode !== '00 01 00'
  );
  const fp = audited.filter((r) => r.status !== 'unchanged');
  const baseline = countPageByPageDifferences(origParsed.rawPageTexts, shiftedParsed.rawPageTexts);

  return {
    origPages: origParsed.book.pageCount,
    shiftedPages: shiftedParsed.book.pageCount,
    sectionsChecked: audited.length,
    sectionFalsePositives: fp.length,
    falsePositiveCodes: fp.map((r) => `${r.sectionCode}:${r.status}`),
    pageBaselineChangedPages: baseline.changedPages,
    pageBaselineTotalPages: baseline.comparedPages,
  };
}

interface PlantedSealedEdit {
  id: string;
  sourceFile: string;
  sectionCode: string;
  type: 'modified' | 'deleted' | 'added' | 'renumbered';
  renumberedTo?: string;
  expectedRiskFlagSubstring?: string;
}

async function main() {
  const suiteStart = performance.now();
  const sealedDir = path.resolve(process.cwd(), 'benchmarks', 'sealed');
  fs.mkdirSync(sealedDir, { recursive: true });

  console.log('Running sealed release evaluation across 6 fresh public Project Manuals ...');

  let totalPages = 0;
  let totalChars = 0;
  let totalScannedPages = 0;
  let totalStrippedLines = 0;
  let totalParseMs = 0;
  let totalSectionsDetected = 0;

  let outlineCheckedManuals = 0;
  let outlineExpectedTotal = 0;
  let outlineMatchedTotal = 0;
  let outlineMissedTotal = 0;

  let symShiftSectionsChecked = 0;
  let symShiftFalsePositives = 0;
  let shiftBaselineChangedPages = 0;
  let shiftBaselineTotalPages = 0;

  const perDocument = [];
  const usedCodes = new Set<string>();
  const sampledBaseSections: Array<{
    sourceFile: string;
    code: string;
    rawHeader: string;
    title: string;
    paragraphs: string[];
  }> = [];

  for (const entry of SEALED_MANIFEST) {
    const { bytes, sha256 } = await ensureSealedPdf(sealedDir, entry);
    const parsed = await parseSealedPdfBuffer(bytes, entry.file);
    if (parsed.book.pageCount !== entry.expectedPages) {
      throw new Error(
        `Page count mismatch for ${entry.file}: expected ${entry.expectedPages}, got ${parsed.book.pageCount}`
      );
    }
    const bodySections = parsed.book.sections.filter((s) => s.normalizedCode !== '00 01 00');
    const detectedSet = new Set(bodySections.map((s) => s.normalizedCode));

    totalPages += parsed.book.pageCount;
    totalChars += parsed.extractableChars;
    totalScannedPages += parsed.scannedPages.length;
    totalStrippedLines += parsed.book.strippedLineCount ?? 0;
    totalParseMs += parsed.parseMs;
    totalSectionsDetected += bodySections.length;

    let outlineMissedCodes: string[] = [];
    if (parsed.outlineCsiCodes.length > 0) {
      outlineCheckedManuals++;
      outlineExpectedTotal += parsed.outlineCsiCodes.length;
      const missed = parsed.outlineCsiCodes.filter((c) => !detectedSet.has(c));
      outlineMissedCodes = missed;
      outlineMatchedTotal += parsed.outlineCsiCodes.length - missed.length;
      outlineMissedTotal += missed.length;
    }

    const shiftRes = await runShiftChecks(entry, bytes, parsed);
    symShiftSectionsChecked += shiftRes.sectionsChecked;
    symShiftFalsePositives += shiftRes.sectionFalsePositives;
    shiftBaselineChangedPages += shiftRes.pageBaselineChangedPages;
    shiftBaselineTotalPages += shiftRes.pageBaselineTotalPages;

    console.log(
      `  ✓ ${entry.file} (${parsed.book.pageCount}p, ${bodySections.length} CSI sections, symFP=${shiftRes.sectionFalsePositives}/${shiftRes.sectionsChecked}, sha256:${sha256.slice(0, 8)})`
    );

    // Sample up to 14 sections per sealed manual for 60+ planted-edit verification
    const candidates = bodySections.filter(
      (s) => s.paragraphs.length >= 3 && !usedCodes.has(s.normalizedCode)
    );
    let picked = 0;
    for (const sec of candidates) {
      if (picked >= 14) break;
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
      picked++;
    }

    perDocument.push({
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
      shiftTest: shiftRes,
    });
  }

  // Plant ~60 realistic addendum edits across sampled sealed sections
  sampledBaseSections.sort((a, b) => a.code.localeCompare(b.code));
  const addendumSections = sampledBaseSections.map((s) => ({
    ...s,
    paragraphs: [...s.paragraphs],
  }));

  const clauseTemplates = [
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
  ];

  const plantedEdits: PlantedSealedEdit[] = [];
  let tplIdx = 0;
  for (const entry of SEALED_MANIFEST) {
    const docSections = addendumSections.filter((s) => s.sourceFile === entry.file);
    for (let j = 0; j < Math.min(9, docSections.length); j++) {
      const target = docSections[j];
      const tpl = clauseTemplates[tplIdx % clauseTemplates.length];
      tplIdx++;
      const pIdx = Math.min(1, target.paragraphs.length - 1);
      target.paragraphs[pIdx] = `${target.paragraphs[pIdx]}${tpl.appendText}`;
      plantedEdits.push({
        id: `S_${entry.file}_${target.code.replace(/\s+/g, '')}_${tpl.label}`,
        sourceFile: entry.file,
        sectionCode: target.code,
        type: 'modified',
        expectedRiskFlagSubstring: tpl.riskSubstring,
      });
    }
  }

  const untouchedPool = addendumSections.filter(
    (s) => !plantedEdits.some((e) => e.sectionCode === s.code)
  );
  for (const toDelete of untouchedPool.slice(0, 2)) {
    const idx = addendumSections.findIndex((s) => s.code === toDelete.code);
    if (idx !== -1) {
      addendumSections.splice(idx, 1);
      plantedEdits.push({
        id: `S_${toDelete.sourceFile}_${toDelete.code.replace(/\s+/g, '')}_deleted`,
        sourceFile: toDelete.sourceFile,
        sectionCode: toDelete.code,
        type: 'deleted',
      });
    }
  }

  let renCount = 0;
  for (const candidate of untouchedPool.slice(2)) {
    if (renCount >= 2) break;
    const origCode = candidate.code;
    const newCode = origCode.slice(0, 6) + '97';
    if (usedCodes.has(newCode)) continue;
    usedCodes.add(newCode);
    candidate.code = newCode;
    candidate.rawHeader = newCode.startsWith('00 ')
      ? `DOCUMENT ${newCode}`
      : `SECTION ${newCode}`;
    plantedEdits.push({
      id: `S_${candidate.sourceFile}_${origCode.replace(/\s+/g, '')}_renumbered`,
      sourceFile: candidate.sourceFile,
      sectionCode: origCode,
      renumberedTo: newCode,
      type: 'renumbered',
    });
    renCount++;
  }

  const addedCode = '49 99 95';
  addendumSections.push({
    sourceFile: 'synthetic-sealed-addendum',
    code: addedCode,
    rawHeader: `SECTION ${addedCode}`,
    title: 'ADDENDUM COMMISSIONING TEST LOAD',
    paragraphs: [
      '1.1 Contractor shall provide load-bank commissioning for 4 hours with $18,000 testing allowance.',
    ],
  });
  plantedEdits.push({
    id: 'S_added_499995',
    sourceFile: 'synthetic-sealed-addendum',
    sectionCode: addedCode,
    type: 'added',
    expectedRiskFlagSubstring: '$18,000',
  });

  addendumSections.sort((a, b) => a.code.localeCompare(b.code));

  const [basePdfBytes, addendumPdfBytes] = await Promise.all([
    renderExtractedSectionsToPdf(sampledBaseSections, 'SEALED 6-MANUAL SAMPLE BASE', 'ISSUED FOR BID'),
    renderExtractedSectionsToPdf(addendumSections, 'SEALED 6-MANUAL SAMPLE ADDENDUM', 'ADDENDUM 01'),
  ]);
  const [baseParsed, addendumParsed] = await Promise.all([
    parseSealedPdfBuffer(basePdfBytes, 'SealedSample_Base.pdf', { skipOutlineExtraction: true }),
    parseSealedPdfBuffer(addendumPdfBytes, 'SealedSample_Addendum01.pdf', {
      skipOutlineExtraction: true,
    }),
  ]);

  const diffStart = performance.now();
  const plantedDiff = compareParsedBooks(baseParsed.book, addendumParsed.book);
  const diffMs = Math.round(performance.now() - diffStart);

  const expectedChangedMap = new Map<string, PlantedSealedEdit>();
  for (const edit of plantedEdits) {
    expectedChangedMap.set(edit.renumberedTo ?? edit.sectionCode, edit);
  }

  let plantedHits = 0;
  let plantedMisses = 0;
  let riskExpected = 0;
  let riskHits = 0;

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

    if (edit.expectedRiskFlagSubstring) {
      riskExpected++;
      const matched = Boolean(
        result?.riskFlags.some((f) =>
          f.toLowerCase().includes(edit.expectedRiskFlagSubstring!.toLowerCase())
        )
      );
      if (matched) riskHits++;
    }
  }

  const unchangedAudited = plantedDiff.results.filter(
    (r) => r.sectionCode !== '00 01 00' && !expectedChangedMap.has(r.sectionCode)
  );
  const plantedFalsePositives = unchangedAudited.filter((r) => r.status !== 'unchanged');

  const stats: Record<string, BinomialRateStats> = {
    sealedSymmetricShiftFalsePositives: clopperPearsonStats(
      symShiftFalsePositives,
      symShiftSectionsChecked
    ),
    sealedOutlineCsiSectionRecall: clopperPearsonStats(outlineMatchedTotal, outlineExpectedTotal),
    sealedOutlineCsiSectionMisses: clopperPearsonStats(outlineMissedTotal, outlineExpectedTotal),
    sealedPlantedEditsCaught: clopperPearsonStats(plantedHits, plantedEdits.length),
    sealedPlantedEditsMissed: clopperPearsonStats(plantedMisses, plantedEdits.length),
    sealedPlantedRiskFlagsMatched: clopperPearsonStats(riskHits, riskExpected),
    sealedPlantedUnchangedFalsePositives: clopperPearsonStats(
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
      manualsCount: SEALED_MANIFEST.length,
      totalPages,
      totalExtractableChars: totalChars,
      totalScannedPages,
      totalStrippedNoiseLines: totalStrippedLines,
      totalSectionsDetected,
      avgParsePagesPerSec: Math.round((totalPages / Math.max(1, totalParseMs)) * 1000),
    },
    confidenceIntervals: stats,
    suite1_sealedParserAndShift: {
      manualsCount: SEALED_MANIFEST.length,
      totalPages,
      totalSectionsDetected,
      outlineCheckedManuals,
      outlineExpectedSections: outlineExpectedTotal,
      outlineMatchedSections: outlineMatchedTotal,
      outlineMissedSections: outlineMissedTotal,
      symmetricShiftSectionsChecked: symShiftSectionsChecked,
      symmetricShiftFalsePositives: symShiftFalsePositives,
      pageBaselineChangedPages: shiftBaselineChangedPages,
      pageBaselineTotalPages: shiftBaselineTotalPages,
      perDocument,
    },
    suite2_sealedPlantedEdits: {
      sourceSectionsSampled: sampledBaseSections.length,
      basePages: baseParsed.book.pageCount,
      addendumPages: addendumParsed.book.pageCount,
      diffMs,
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
    },
  };

  const outPath = path.resolve(process.cwd(), 'benchmarks', 'sealed_results.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`\nSealed corpus benchmark results written to ${outPath}`);
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
