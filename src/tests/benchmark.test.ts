import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { stripHeadersAndFooters } from '../utils/noiseFilter';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
} from '../utils/pdfSectionParser';
import { compareParsedBooks } from '../utils/specDiffEngine';
import {
  DEFAULT_NOISE_CONFIG,
  type CsiSection,
  type SingleSpecParseOutput,
} from '../types/spec';

interface RealCorpusSpec {
  file: string;
  label: string;
  expectedSections: string[];
}

const FIVE_REAL_MANUALS: RealCorpusSpec[] = [
  {
    file: '01_uh_033000.pdf',
    label: 'University of Houston — 03 30 00 Concrete (50p)',
    expectedSections: ['03 30 00'],
  },
  {
    file: '03_uh_042000.pdf',
    label: 'University of Houston — 04 20 00 Unit Masonry (33p)',
    expectedSections: ['04 20 00'],
  },
  {
    file: '05_uh_071413.pdf',
    label: 'University of Houston — 07 14 13 Waterproofing (10p)',
    expectedSections: ['07 14 13'],
  },
  {
    file: '06_prince_albert_03300.pdf',
    label: 'City of Prince Albert — Legacy 03300 Concrete (5p)',
    expectedSections: ['03 30 00'],
  },
  {
    file: '08_nh_dover_div00_01_100p.pdf',
    label: 'City of Dover, NH — Conformed Set Vol. 1 Div 00–01 (100p)',
    expectedSections: [
      '00 01 05',
      '00 01 07',
      '01 11 00',
      '01 14 00',
      '01 22 00',
      '01 23 00',
      '01 24 00',
      '01 31 00',
      '01 31 19',
      '01 32 00',
      '01 33 00',
      '01 35 43',
      '01 40 00',
      '01 50 00',
    ],
  },
];

async function parsePdfWithPipeline(
  bytes: Uint8Array,
  fileName: string
): Promise<{ book: SingleSpecParseOutput; parseMs: number }> {
  const start = performance.now();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const rawLines = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const { lines } = assemblePageLinesFromSpans(
      textContent.items,
      pageNum,
      viewport.height
    );
    rawLines.push(...lines);
  }

  const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
    rawLines,
    doc.numPages,
    DEFAULT_NOISE_CONFIG
  );
  const { sections } = chunkIntoCsiSections(cleanLines, doc.numPages, new Map());
  const parseMs = Math.round(performance.now() - start);

  return {
    book: {
      fileName,
      pageCount: doc.numPages,
      parseTimeMs: parseMs,
      scannedWarning: false,
      strippedPatterns,
      strippedLineCount,
      sections,
    },
    parseMs,
  };
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
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) {
      line = w;
    } else if (line.length + 1 + w.length <= maxChars) {
      line += ' ' + w;
    } else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

async function renderSectionsPdf(
  sections: Array<{ code: string; rawHeader: string; title: string; paragraphs: string[] }>,
  headerTitle: string,
  stamp: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 54;
  const linesPerPage = 38;

  const pageRows: Array<{ code: string; title: string; rows: Array<{ text: string; bold: boolean }> }> = [];

  for (const sec of sections) {
    const rows: Array<{ text: string; bold: boolean }> = [
      { text: sanitizeForWinAnsi(`${sec.rawHeader} - ${sec.title}`), bold: true },
    ];
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
    page.drawText(sanitizeForWinAnsi(headerTitle), {
      x: marginX,
      y: pageHeight - 36,
      size: 8.5,
      font: bold,
      color: rgb(0.2, 0.25, 0.35),
    });
    page.drawText(sanitizeForWinAnsi(stamp), {
      x: pageWidth - marginX - 140,
      y: pageHeight - 36,
      size: 8.5,
      font,
      color: rgb(0.2, 0.25, 0.35),
    });

    let y = pageHeight - 78;
    for (const r of pg.rows) {
      page.drawText(r.text, {
        x: marginX,
        y,
        size: 9,
        font: r.bold ? bold : font,
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

test('5-PDF real-world Project Manual benchmark logs parse speed, false-positive count, and missed-edit count', async () => {
  const corpusDir = path.resolve(process.cwd(), 'benchmarks', 'corpus');
  const parsedDocs: Array<{
    spec: RealCorpusSpec;
    book: SingleSpecParseOutput;
    parseMs: number;
    bytes: Uint8Array;
  }> = [];

  let parserFalsePositiveSplits = 0;
  let parserMissedSections = 0;
  let totalPagesParsed = 0;
  let totalParseMs = 0;

  for (const spec of FIVE_REAL_MANUALS) {
    const filePath = path.join(corpusDir, spec.file);
    assert.ok(fs.existsSync(filePath), `Missing real corpus PDF: ${filePath}`);
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const { book, parseMs } = await parsePdfWithPipeline(bytes, spec.file);

    const detected = book.sections
      .filter((s) => s.normalizedCode !== '00 01 00')
      .map((s) => s.normalizedCode);
    const expectedSet = new Set(spec.expectedSections);
    const detectedSet = new Set(detected);

    parserFalsePositiveSplits += detected.filter((c) => !expectedSet.has(c)).length;
    parserMissedSections += spec.expectedSections.filter((c) => !detectedSet.has(c)).length;
    totalPagesParsed += book.pageCount;
    totalParseMs += parseMs;

    parsedDocs.push({ spec, book, parseMs, bytes });
  }

  // 1. Verbatim +1 page shift across all 5 real PDFs (tracks diff false positives under re-pagination)
  let verbatimShiftFalsePositives = 0;
  let verbatimShiftSectionsChecked = 0;
  let verbatimShiftDiffMs = 0;

  for (const entry of parsedDocs) {
    const srcPdf = await PDFDocument.load(entry.bytes);
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
    const copied = await shiftedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    for (const pg of copied) shiftedPdf.addPage(pg);

    const shiftedBytes = await shiftedPdf.save();
    const shiftedParsed = await parsePdfWithPipeline(shiftedBytes, `shifted_${entry.spec.file}`);
    totalPagesParsed += shiftedParsed.book.pageCount;
    totalParseMs += shiftedParsed.parseMs;

    const diffStart = performance.now();
    const diff = compareParsedBooks(entry.book, shiftedParsed.book);
    verbatimShiftDiffMs += Math.round(performance.now() - diffStart);

    const audited = diff.results.filter(
      (r) => r.sectionCode !== '00 00 10' && r.sectionCode !== '00 01 00'
    );
    verbatimShiftSectionsChecked += audited.length;
    verbatimShiftFalsePositives += audited.filter((r) => r.status !== 'unchanged').length;
  }

  // 2. Consolidated real-paragraph diff with 5 planted addendum edits (tracks missed-edit & FP counts)
  const extractBody = (book: SingleSpecParseOutput, overrideCode?: string): CsiSection[] =>
    book.sections
      .filter((s) => s.normalizedCode !== '00 01 00')
      .map((s) => ({ ...s, normalizedCode: overrideCode ?? s.normalizedCode }));

  const baseSections = [
    ...extractBody(parsedDocs[4].book), // Dover NH Div 00-01 (14 sections)
    ...extractBody(parsedDocs[0].book), // UH 03 30 00 Concrete
    ...extractBody(parsedDocs[3].book, '03 30 01'), // Prince Albert legacy 03300 Concrete
    ...extractBody(parsedDocs[1].book), // UH 04 20 00 Masonry
    ...extractBody(parsedDocs[2].book), // UH 07 14 13 Waterproofing
  ]
    .map((s) => ({
      code: s.normalizedCode,
      rawHeader: s.normalizedCode.startsWith('00 ')
        ? `DOCUMENT ${s.normalizedCode}`
        : `SECTION ${s.normalizedCode}`,
      title: sanitizeForWinAnsi(s.title),
      paragraphs: s.paragraphs.map(sanitizeForWinAnsi).filter(Boolean),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const addendumSections = baseSections.map((s) => ({
    ...s,
    paragraphs: [...s.paragraphs],
  }));

  // Plant 5 concrete ground-truth edits across the real sections:
  // (1) Concrete PSI/mil modification in UH 03 30 00
  const concreteIdx = addendumSections
    .find((s) => s.code === '03 30 00')!
    .paragraphs.findIndex((p) => /testing laboratory retained by the Contractor/i.test(p));
  assert.ok(concreteIdx !== -1);
  addendumSections.find((s) => s.code === '03 30 00')!.paragraphs[concreteIdx] +=
    ' Minimum 28-day compressive strength shall be 5000 psi with 20 mil vapor retarder.';

  // (2) Masonry curing time change in UH 04 20 00
  const masonryIdx = addendumSections
    .find((s) => s.code === '04 20 00')!
    .paragraphs.findIndex((p) => /\bat least 12 hours\b/i.test(p));
  assert.ok(masonryIdx !== -1);
  addendumSections.find((s) => s.code === '04 20 00')!.paragraphs[masonryIdx] =
    addendumSections
      .find((s) => s.code === '04 20 00')!
      .paragraphs[masonryIdx].replace(/\bat least 12 hours\b/i, 'not less than 24 hours');

  // (3) Hyphenated 60-psi -> 100-psi upgrade in UH 07 14 13
  const wpIdx = addendumSections
    .find((s) => s.code === '07 14 13')!
    .paragraphs.findIndex((p) => /\b60-psi\b/i.test(p));
  assert.ok(wpIdx !== -1);
  addendumSections.find((s) => s.code === '07 14 13')!.paragraphs[wpIdx] =
    addendumSections
      .find((s) => s.code === '07 14 13')!
      .paragraphs[wpIdx].replace(/\b60-psi\b/i, '100-psi');

  // (4) Delete 01 24 00 Schedule of Values
  const delIdx = addendumSections.findIndex((s) => s.code === '01 24 00');
  assert.ok(delIdx !== -1);
  addendumSections.splice(delIdx, 1);

  // (5) Renumber 01 31 19 -> 01 31 20 Project Meetings
  const renSec = addendumSections.find((s) => s.code === '01 31 19');
  assert.ok(renSec);
  renSec.code = '01 31 20';
  renSec.rawHeader = 'SECTION 01 31 20';
  addendumSections.sort((a, b) => a.code.localeCompare(b.code));

  const [basePdfBytes, addendumPdfBytes] = await Promise.all([
    renderSectionsPdf(baseSections, '5-PDF CORPUS BASE SET', 'ISSUED FOR BID'),
    renderSectionsPdf(addendumSections, '5-PDF CORPUS ADDENDUM 01', 'ADDENDUM 01'),
  ]);

  const [baseParsed, addendumParsed] = await Promise.all([
    parsePdfWithPipeline(basePdfBytes, 'Corpus5_Base.pdf'),
    parsePdfWithPipeline(addendumPdfBytes, 'Corpus5_Addendum01.pdf'),
  ]);
  totalPagesParsed += baseParsed.book.pageCount + addendumParsed.book.pageCount;
  totalParseMs += baseParsed.parseMs + addendumParsed.parseMs;

  const plantedDiffStart = performance.now();
  const plantedDiff = compareParsedBooks(baseParsed.book, addendumParsed.book);
  const plantedDiffMs = Math.round(performance.now() - plantedDiffStart);

  const expectedChanged = new Set(['03 30 00', '04 20 00', '07 14 13', '01 24 00', '01 31 20']);
  const edit03 = plantedDiff.results.find((r) => r.sectionCode === '03 30 00');
  const edit04 = plantedDiff.results.find((r) => r.sectionCode === '04 20 00');
  const edit07 = plantedDiff.results.find((r) => r.sectionCode === '07 14 13');
  const editDel = plantedDiff.results.find((r) => r.sectionCode === '01 24 00');
  const editRen = plantedDiff.results.find((r) => r.sectionCode === '01 31 20');

  const editHits = [
    edit03?.status === 'modified' && edit03.riskFlags.some((f) => f.includes('5000 psi')),
    edit04?.status === 'modified' && edit04.riskFlags.some((f) => f.includes('24 hours')),
    edit07?.status === 'modified' && edit07.riskFlags.some((f) => f.includes('100-psi')),
    editDel?.status === 'deleted',
    editRen?.renumberedFrom === '01 31 19',
  ].filter(Boolean).length;

  const plantedMissedEdits = 5 - editHits;
  const plantedFalsePositives = plantedDiff.results.filter(
    (r) => !expectedChanged.has(r.sectionCode) && r.status !== 'unchanged'
  ).length;

  const totalFalsePositives =
    parserFalsePositiveSplits + verbatimShiftFalsePositives + plantedFalsePositives;
  const totalMissedEdits = parserMissedSections + plantedMissedEdits;
  const parsePagesPerSec = Math.round((totalPagesParsed / Math.max(1, totalParseMs)) * 1000);

  const performanceReport = {
    pdfsEvaluated: parsedDocs.length,
    totalPagesParsed,
    totalParseMs,
    parsePagesPerSec,
    totalDiffMs: verbatimShiftDiffMs + plantedDiffMs,
    verbatimShiftSectionsChecked,
    totalFalsePositives,
    totalMissedEdits,
    perPdf: parsedDocs.map((d) => ({
      file: d.spec.file,
      label: d.spec.label,
      pages: d.book.pageCount,
      parseMs: d.parseMs,
      pagesPerSec: Math.round((d.book.pageCount / Math.max(1, d.parseMs)) * 1000),
      sectionsDetected: d.book.sections.filter((s) => s.normalizedCode !== '00 01 00').length,
      strippedNoiseLines: d.book.strippedLineCount ?? 0,
    })),
  };

  console.info('[SpecDelta 5-PDF Real Corpus Benchmark Report]', JSON.stringify(performanceReport, null, 2));

  assert.equal(totalFalsePositives, 0);
  assert.equal(totalMissedEdits, 0);
  assert.ok(parsePagesPerSec > 0);
});
