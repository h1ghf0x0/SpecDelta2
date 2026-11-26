import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { stripHeadersAndFooters } from '../src/utils/noiseFilter.ts';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
} from '../src/utils/pdfSectionParser.ts';
import { compareParsedBooks } from '../src/utils/specDiffEngine.ts';
import { clopperPearsonStats } from '../src/utils/statsCi.ts';
import {
  DEFAULT_NOISE_CONFIG,
  type CsiSection,
  type SingleSpecParseOutput,
} from '../src/types/spec.ts';

interface CorpusManifestEntry {
  file: string;
  institution: string;
  sourceUrl: string;
  documentType: 'single-section-spec' | 'multi-section-manual' | 'toc-document';
  expectedSections: string[];
  notes: string;
}

const CORPUS_MANIFEST: CorpusManifestEntry[] = [
  {
    file: '01_uh_033000.pdf',
    institution: 'University of Houston',
    sourceUrl:
      'https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/div-03/03-30-00.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['03 30 00'],
    notes: '50-page Division 03 Cast-in-Place Concrete master spec with running headers/footers.',
  },
  {
    file: '02_uh_012100.pdf',
    institution: 'University of Houston',
    sourceUrl:
      'https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/div-01/01-21-00.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['01 21 00'],
    notes: '5-page Division 01 Allowances spec using compact 01 2100 section numbering.',
  },
  {
    file: '03_uh_042000.pdf',
    institution: 'University of Houston',
    sourceUrl:
      'https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/div-04/04-20-00.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['04 20 00'],
    notes: '33-page Unit Masonry spec with quoted inline CSI cross-references.',
  },
  {
    file: '04_uh_053123.pdf',
    institution: 'University of Houston',
    sourceUrl:
      'https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/div-05/05-31-23.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['05 31 23'],
    notes: '7-page Steel Roof Decking master spec.',
  },
  {
    file: '05_uh_071413.pdf',
    institution: 'University of Houston',
    sourceUrl:
      'https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/div-07/07-14-13.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['07 14 13'],
    notes: '10-page Hot Fluid-Applied Rubberized Asphalt Waterproofing spec.',
  },
  {
    file: '06_prince_albert_03300.pdf',
    institution: 'City of Prince Albert (Saskatchewan)',
    sourceUrl:
      'https://www.citypa.ca/en/building-and-development/resources/Documents/Specifications/03300_-_Cast-In-Place_Concrete.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['03 30 00'],
    notes: '5-page municipal spec using legacy 5-digit CSI code (03300) and inline Page X of Y.',
  },
  {
    file: '07_scott_twp_033000.pdf',
    institution: 'Scott Township (PA)',
    sourceUrl:
      'https://scotttownshipsta.com/wp-content/uploads/2025/05/03-30-00-Cast-In-Place-Concrete.pdf',
    documentType: 'single-section-spec',
    expectedSections: ['03 30 00'],
    notes: '4-page encrypted-metadata municipal spec with DIVISION 3 banner.',
  },
  {
    file: '08_nh_dover_div00_01_100p.pdf',
    institution: 'City of Dover, NH (HMFH Architects — Dover HS & CTC Conformed Set Vol. 1)',
    sourceUrl:
      'https://www.dover.nh.gov/Assets/government/city-operations/2document/school-building-committee/Volume%201%20Div%200-14%20Specifications.pdf',
    documentType: 'multi-section-manual',
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
    notes:
      'First 100 consecutive pages extracted losslessly from 1,046-page Project Manual (cover, DOCUMENT 000105/000107, 6-page TOC, 12 Division 01 sections, wrapped cross-refs, submittal forms).',
  },
  {
    file: '09_uccs_addendum_toc.pdf',
    institution: 'University of Colorado Colorado Springs (UCCS)',
    sourceUrl:
      'https://vcaf.uccs.edu/sites/g/files/kjihxj1611/files/inline-files/01%20Proj%20Manual%20Cover%20%26%20TOC%20-%20Add%20%232_21280702.pdf',
    documentType: 'toc-document',
    expectedSections: [],
    notes: '5-page Addendum #2 Table of Contents listing 120+ CSI sections (TOC suppression test).',
  },
  {
    file: '10_nmsu_project_manual_toc.pdf',
    institution: 'New Mexico State University (NMSU)',
    sourceUrl:
      'https://af.nmsu.edu/_files/docs/Project_Manual_Table_of_Contents_2018_V2.pdf',
    documentType: 'toc-document',
    expectedSections: [],
    notes: '8-page Project Manual Table of Contents listing 170+ CSI sections (TOC suppression test).',
  },
];

interface ParsedRealPdf {
  book: SingleSpecParseOutput;
  rawPageTexts: string[];
  extractableChars: number;
  parseMs: number;
}

async function parseRealPdfBuffer(
  bytes: Uint8Array,
  fileName: string
): Promise<ParsedRealPdf> {
  const start = performance.now();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const rawLines = [];
  const rawPageTexts: string[] = [];
  let extractableChars = 0;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const { lines, pageChars } = assemblePageLinesFromSpans(
      textContent.items,
      pageNum,
      viewport.height
    );
    rawLines.push(...lines);
    rawPageTexts.push(lines.map((l) => l.text).join('\n'));
    extractableChars += pageChars;
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
    rawPageTexts,
    extractableChars,
    parseMs,
  };
}

function countPageByPageDifferences(oldPages: string[], newPages: string[]): {
  comparedPages: number;
  changedPages: number;
} {
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
    if (!line) {
      line = w;
    } else if (line.length + 1 + w.length <= maxChars) {
      line += ' ' + w;
    } else {
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
    const secRows: Array<{ text: string; bold: boolean }> = [
      {
        text: sanitizeForWinAnsi(`${sec.rawHeader ?? `SECTION ${sec.code}`} - ${sec.title}`),
        bold: true,
      },
    ];
    for (const para of sec.paragraphs) {
      const wrapped = wrapText(para, 90);
      for (const w of wrapped) {
        secRows.push({ text: w, bold: false });
      }
    }
    for (let i = 0; i < secRows.length; i += linesPerPage) {
      pageRows.push({
        code: sec.code,
        title: sec.title,
        rows: secRows.slice(i, i + linesPerPage),
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
      color: rgb(0.22, 0.27, 0.35),
    });
    page.drawText(sanitizeForWinAnsi(issueStamp), {
      x: pageWidth - marginX - 165,
      y: pageHeight - 36,
      size: 8.5,
      font,
      color: rgb(0.22, 0.27, 0.35),
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

    const titleCaseTitle = pg.title
      .toLowerCase()
      .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
    page.drawText(
      sanitizeForWinAnsi(`${titleCaseTitle.slice(0, 42)} ${pg.code.replace(/\s+/g, '')} - ${pageNum}`),
      {
        x: marginX,
        y: 34,
        size: 8.5,
        font,
        color: rgb(0.32, 0.38, 0.46),
      }
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

interface PlantedEditSpec {
  id: string;
  sectionCode: string;
  type: 'modified' | 'deleted' | 'added' | 'renumbered';
  renumberedTo?: string;
  expectedRiskFlagSubstring?: string;
  apply: (sections: Array<{ code: string; rawHeader?: string; title: string; paragraphs: string[] }>) => void;
}

function replaceFirstMatchingClause(
  paragraphs: string[],
  search: RegExp,
  replacement: (orig: string) => string
): boolean {
  for (let i = 0; i < paragraphs.length; i++) {
    if (search.test(paragraphs[i])) {
      paragraphs[i] = replacement(paragraphs[i]);
      return true;
    }
  }
  return false;
}

async function main() {
  const suiteStart = performance.now();
  const corpusDir = path.resolve(process.cwd(), 'benchmarks', 'corpus');

  // =========================================================================
  // SUITE 1: Real Institutional PDF Parser Audit (10 real PDFs, 227 pages)
  // =========================================================================
  const parsedMap = new Map<string, ParsedRealPdf>();
  const parserResults = [];

  let totalRealPages = 0;
  let totalExtractableChars = 0;
  let totalStrippedLines = 0;
  let totalExpectedSections = 0;
  let totalDetectedCsiSections = 0;
  let totalParserFalsePositives = 0;
  let totalParserMisses = 0;

  for (const entry of CORPUS_MANIFEST) {
    const filePath = path.join(corpusDir, entry.file);
    const bytes = fs.readFileSync(filePath);
    const parsed = await parseRealPdfBuffer(bytes, entry.file);
    parsedMap.set(entry.file, parsed);

    const detectedCodes = parsed.book.sections
      .filter((s) => s.normalizedCode !== '00 01 00')
      .map((s) => s.normalizedCode);
    const expectedSet = new Set(entry.expectedSections);
    const detectedSet = new Set(detectedCodes);

    const falsePositives = detectedCodes.filter((c) => !expectedSet.has(c));
    const misses = entry.expectedSections.filter((c) => !detectedSet.has(c));

    totalRealPages += parsed.book.pageCount;
    totalExtractableChars += parsed.extractableChars;
    totalStrippedLines += parsed.book.strippedLineCount ?? 0;
    totalExpectedSections += entry.expectedSections.length;
    totalDetectedCsiSections += detectedCodes.length;
    totalParserFalsePositives += falsePositives.length;
    totalParserMisses += misses.length;

    parserResults.push({
      file: entry.file,
      institution: entry.institution,
      sourceUrl: entry.sourceUrl,
      documentType: entry.documentType,
      pages: parsed.book.pageCount,
      extractableChars: parsed.extractableChars,
      parseMs: parsed.parseMs,
      strippedLines: parsed.book.strippedLineCount ?? 0,
      expectedSections: entry.expectedSections,
      detectedSections: detectedCodes,
      falsePositiveSplits: falsePositives,
      missedSections: misses,
      notes: entry.notes,
    });
  }

  // =========================================================================
  // SUITE 2: Verbatim Real-PDF +1 Page-Shift Diff Audit (Zero Edits)
  // Tests 7 unencrypted real PDFs copied verbatim via pdf-lib with an inserted
  // Addendum 01 cover notice page (+1 page shift across every real section).
  // (07_scott_twp_033000.pdf uses an encrypted PDF stream so pdf-lib cannot copy
  // raw decrypted pages verbatim; it is audited in Suite 1 and Suite 3.)
  // =========================================================================
  const verbatimShiftTargets = CORPUS_MANIFEST.filter(
    (m) => m.documentType !== 'toc-document' && m.file !== '07_scott_twp_033000.pdf'
  );
  const verbatimShiftResults = [];
  let verbatimShiftSectionsChecked = 0;
  let verbatimShiftFalsePositives = 0;
  let verbatimShiftTotalPagesShifted = 0;
  let verbatimBaselineChangedPages = 0;
  let verbatimBaselineComparedPages = 0;

  for (const entry of verbatimShiftTargets) {
    const origParsed = parsedMap.get(entry.file)!;
    const origBytes = fs.readFileSync(path.join(corpusDir, entry.file));
    const srcPdf = await PDFDocument.load(origBytes);
    const shiftedPdf = await PDFDocument.create();

    const coverPage = shiftedPdf.addPage([612, 792]);
    const boldFont = await shiftedPdf.embedFont(StandardFonts.HelveticaBold);
    const regFont = await shiftedPdf.embedFont(StandardFonts.Helvetica);
    coverPage.drawText('DOCUMENT 00 00 10 - ADDENDUM 01 COVER NOTICE', {
      x: 54,
      y: 720,
      size: 12,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    coverPage.drawText('Zero-edit re-pagination verification cover sheet.', {
      x: 54,
      y: 696,
      size: 10,
      font: regFont,
      color: rgb(0.1, 0.1, 0.1),
    });

    const copiedPages = await shiftedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    for (const pg of copiedPages) {
      shiftedPdf.addPage(pg);
    }

    const shiftedBytes = await shiftedPdf.save();
    const shiftedParsed = await parseRealPdfBuffer(shiftedBytes, `shifted_${entry.file}`);
    const diff = compareParsedBooks(origParsed.book, shiftedParsed.book);

    const auditedSections = diff.results.filter(
      (r) => r.sectionCode !== '00 00 10' && r.sectionCode !== '00 01 00'
    );
    const fps = auditedSections.filter((r) => r.status !== 'unchanged');
    const pageBaseline = countPageByPageDifferences(
      origParsed.rawPageTexts,
      shiftedParsed.rawPageTexts
    );

    verbatimShiftSectionsChecked += auditedSections.length;
    verbatimShiftFalsePositives += fps.length;
    verbatimShiftTotalPagesShifted += origParsed.book.pageCount;
    verbatimBaselineChangedPages += pageBaseline.changedPages;
    verbatimBaselineComparedPages += pageBaseline.comparedPages;

    verbatimShiftResults.push({
      file: entry.file,
      origPages: origParsed.book.pageCount,
      shiftedPages: shiftedParsed.book.pageCount,
      sectionsChecked: auditedSections.length,
      sectionFalsePositives: fps.length,
      pageBaselineChangedPages: pageBaseline.changedPages,
      pageBaselineTotalPages: pageBaseline.comparedPages,
    });
  }

  // =========================================================================
  // SUITE 3: Consolidated Real-Paragraph Manual Diff + Ground-Truth Planted Edits
  // Assembles a unified multi-division manual from ALL 8 real spec-body PDFs'
  // actual extracted CSI paragraphs (plus distinct secondary concrete sections
  // 03 30 01 / 03 30 02 so Prince Albert 03300 and Scott Twp 033000 are both included),
  // injects 12 documented addendum edits across 12 sections while leaving
  // remaining sections untouched & shifted, re-renders Base and Addendum PDFs,
  // re-parses via pdfjs-dist, and computes actual miss rate & false-positive rate.
  // =========================================================================
  const extractSections = (file: string, overrideCode?: string): CsiSection[] => {
    const parsed = parsedMap.get(file)!;
    return parsed.book.sections
      .filter((s) => s.normalizedCode !== '00 01 00')
      .map((s) => ({
        ...s,
        normalizedCode: overrideCode ?? s.normalizedCode,
      }));
  };

  const assembledSourceSections = [
    ...extractSections('08_nh_dover_div00_01_100p.pdf'),
    ...extractSections('02_uh_012100.pdf'),
    ...extractSections('01_uh_033000.pdf'),
    ...extractSections('06_prince_albert_03300.pdf', '03 30 01'),
    ...extractSections('07_scott_twp_033000.pdf', '03 30 02'),
    ...extractSections('03_uh_042000.pdf'),
    ...extractSections('04_uh_053123.pdf'),
    ...extractSections('05_uh_071413.pdf'),
  ];

  // Clean each extracted section into normalized WinAnsi paragraphs (preserving 100% real spec prose)
  const baseSectionsForDiff = assembledSourceSections
    .map((s) => ({
      code: s.normalizedCode,
      rawHeader: s.normalizedCode.startsWith('00 ')
        ? `DOCUMENT ${s.normalizedCode}`
        : `SECTION ${s.normalizedCode}`,
      title: sanitizeForWinAnsi(s.title),
      paragraphs: s.paragraphs.map(sanitizeForWinAnsi).filter(Boolean),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const addendumSectionsForDiff = baseSectionsForDiff.map((s) => ({
    ...s,
    paragraphs: [...s.paragraphs],
  }));

  const plantedEdits: PlantedEditSpec[] = [
    {
      id: 'E01_011100_owner_responsibility',
      sectionCode: '01 11 00',
      type: 'modified',
      expectedRiskFlagSubstring: 'Directive',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '01 11 00')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\bOwner will remove furnishings\b/i,
          (orig) =>
            orig
              .replace(/\bOwner will remove furnishings\b/i, 'Contractor shall remove and store furnishings')
              .replace(/\bOwner Responsibility\b/i, 'Contractor Responsibility')
        );
        if (!ok) throw new Error('Failed to plant edit E01');
      },
    },
    {
      id: 'E02_012100_allowance_days_and_directive',
      sectionCode: '01 21 00',
      type: 'modified',
      expectedRiskFlagSubstring: 'Directive',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '01 21 00')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /proposals for each allowance/i,
          (orig) => `${orig} Minimum $45,000 contingency allowance shall be included.`
        );
        if (!ok) throw new Error('Failed to plant edit E02');
      },
    },
    {
      id: 'E03_012400_deleted_section',
      sectionCode: '01 24 00',
      type: 'deleted',
      apply: (secs) => {
        const idx = secs.findIndex((s) => s.code === '01 24 00');
        if (idx === -1) throw new Error('Failed to plant edit E03');
        secs.splice(idx, 1);
      },
    },
    {
      id: 'E04_012500_added_section',
      sectionCode: '01 25 00',
      type: 'added',
      apply: (secs) => {
        secs.push({
          code: '01 25 00',
          rawHeader: 'SECTION 01 25 00',
          title: 'SUBSTITUTION PROCEDURES',
          paragraphs: [
            '1.1 SUMMARY: Substitution requests shall be submitted minimum 10 business days prior to bid closing; no substitutions permitted after award.',
          ],
        });
      },
    },
    {
      id: 'E05_013119_renumbered_to_013120',
      sectionCode: '01 31 19',
      type: 'renumbered',
      renumberedTo: '01 31 20',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '01 31 19');
        if (!sec) throw new Error('Failed to plant edit E05');
        sec.code = '01 31 20';
        sec.rawHeader = 'SECTION 01 31 20';
      },
    },
    {
      id: 'E06_013300_submittal_stamp_area',
      sectionCode: '01 33 00',
      type: 'modified',
      expectedRiskFlagSubstring: 'Directive',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '01 33 00')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\b80 square inches\b/i,
          (orig) => orig.replace(/\b80 square inches\b/i, '100 square inches').replace(/\bshall contain\b/i, 'may omit')
        );
        if (!ok) throw new Error('Failed to plant edit E06');
      },
    },
    {
      id: 'E07_033000_uh_concrete_psi_upgrade',
      sectionCode: '03 30 00',
      type: 'modified',
      expectedRiskFlagSubstring: 'PSI / Strength / AIC',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '03 30 00')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /testing laboratory retained by the Contractor/i,
          (orig) => `${orig} Minimum 28-day compressive strength shall be 5000 psi with 20 mil vapor retarder.`
        );
        if (!ok) throw new Error('Failed to plant edit E07');
      },
    },
    {
      id: 'E08_033001_prince_albert_lump_sum',
      sectionCode: '03 30 01',
      type: 'modified',
      expectedRiskFlagSubstring: 'Currency / Percentage',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '03 30 01')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\blump sum bid\b/i,
          (orig) => orig.replace(/\blump sum bid\b/i, 'unit price allowance ($18,500) furnished by Owner')
        );
        if (!ok) throw new Error('Failed to plant edit E08');
      },
    },
    {
      id: 'E09_033002_scott_twp_concrete_warranty',
      sectionCode: '03 30 02',
      type: 'modified',
      expectedRiskFlagSubstring: 'Warranty',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '03 30 02')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\breplacing or restoring all concrete damaged\b/i,
          (orig) => `${orig} Provide 5-year warranty on all repaired slabs at 4500 psi minimum.`
        );
        if (!ok) throw new Error('Failed to plant edit E09');
      },
    },
    {
      id: 'E10_042000_uh_masonry_curing_hours',
      sectionCode: '04 20 00',
      type: 'modified',
      expectedRiskFlagSubstring: 'Fire / Time Rating',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '04 20 00')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\bat least 12 hours\b/i,
          (orig) => orig.replace(/\bat least 12 hours\b/i, 'not less than 24 hours')
        );
        if (!ok) throw new Error('Failed to plant edit E10');
      },
    },
    {
      id: 'E11_053123_uh_steel_deck_scope',
      sectionCode: '05 31 23',
      type: 'modified',
      expectedRiskFlagSubstring: 'Furnish & Install / By Owner',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '05 31 23')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\bprovide all labor and equipment\b/i,
          (orig) =>
            orig.replace(
              /\bprovide all labor and equipment\b/i,
              'install only Owner-furnished steel decking and provide 18 gauge closure strips'
            )
        );
        if (!ok) throw new Error('Failed to plant edit E11');
      },
    },
    {
      id: 'E12_071413_uh_waterproofing_psi_upgrade',
      sectionCode: '07 14 13',
      type: 'modified',
      expectedRiskFlagSubstring: 'PSI / Strength / AIC',
      apply: (secs) => {
        const sec = secs.find((s) => s.code === '07 14 13')!;
        const ok = replaceFirstMatchingClause(
          sec.paragraphs,
          /\b60-psi\b/i,
          (orig) => orig.replace(/\b60-psi\b/i, '100-psi').replace(/\bminimum compressive\b/i, 'not less than compressive')
        );
        if (!ok) throw new Error('Failed to plant edit E12');
      },
    },
  ];

  for (const edit of plantedEdits) {
    edit.apply(addendumSectionsForDiff);
  }
  addendumSectionsForDiff.sort((a, b) => a.code.localeCompare(b.code));

  const [consolidatedBaseBytes, consolidatedAddendumBytes] = await Promise.all([
    renderExtractedSectionsToPdf(
      baseSectionsForDiff,
      'REAL CORPUS CONSOLIDATED MANUAL — BASE SET',
      'ISSUED FOR BID'
    ),
    renderExtractedSectionsToPdf(
      addendumSectionsForDiff,
      'REAL CORPUS CONSOLIDATED MANUAL — ADDENDUM 01',
      'ADDENDUM 01'
    ),
  ]);

  const [consolidatedBaseParsed, consolidatedAddendumParsed] = await Promise.all([
    parseRealPdfBuffer(consolidatedBaseBytes, 'RealCorpus_Consolidated_Base.pdf'),
    parseRealPdfBuffer(consolidatedAddendumBytes, 'RealCorpus_Consolidated_Addendum01.pdf'),
  ]);

  const consolidatedDiffStart = performance.now();
  const consolidatedDiff = compareParsedBooks(
    consolidatedBaseParsed.book,
    consolidatedAddendumParsed.book
  );
  const consolidatedDiffMs = Math.round(performance.now() - consolidatedDiffStart);

  const expectedChangedMap = new Map<string, PlantedEditSpec>();
  for (const edit of plantedEdits) {
    expectedChangedMap.set(edit.renumberedTo ?? edit.sectionCode, edit);
  }

  let plantedHits = 0;
  let plantedMisses = 0;
  let plantedRiskFlagHits = 0;
  let plantedRiskFlagExpected = 0;
  const plantedOutcomes = [];

  for (const edit of plantedEdits) {
    const targetCode = edit.renumberedTo ?? edit.sectionCode;
    const result = consolidatedDiff.results.find((r) => r.sectionCode === targetCode);

    let hit = false;
    if (edit.type === 'deleted') {
      hit = result?.status === 'deleted';
    } else if (edit.type === 'added') {
      hit = result?.status === 'added';
    } else if (edit.type === 'renumbered') {
      hit = Boolean(result && result.renumberedFrom === edit.sectionCode);
    } else {
      hit = Boolean(result && result.status === 'modified' && result.changedParagraphs.length > 0);
    }

    if (hit) plantedHits++;
    else plantedMisses++;

    let riskHit: boolean | null = null;
    if (edit.expectedRiskFlagSubstring) {
      plantedRiskFlagExpected++;
      riskHit = Boolean(
        result?.riskFlags.some((f) =>
          f.toLowerCase().includes(edit.expectedRiskFlagSubstring!.toLowerCase())
        )
      );
      if (riskHit) plantedRiskFlagHits++;
    }

    plantedOutcomes.push({
      id: edit.id,
      sectionCode: targetCode,
      expectedType: edit.type,
      detectedStatus: result?.status ?? 'missing',
      renumberedFrom: result?.renumberedFrom ?? null,
      changedParagraphsCount: result?.changedParagraphs.length ?? 0,
      riskFlags: result?.riskFlags ?? [],
      detected: hit,
      riskFlagMatched: riskHit,
    });
  }

  const unchangedSectionsAudited = consolidatedDiff.results.filter(
    (r) => !expectedChangedMap.has(r.sectionCode)
  );
  const consolidatedSectionFalsePositives = unchangedSectionsAudited.filter(
    (r) => r.status !== 'unchanged'
  );
  const consolidatedPageBaseline = countPageByPageDifferences(
    consolidatedBaseParsed.rawPageTexts,
    consolidatedAddendumParsed.rawPageTexts
  );

  // Aggregate metrics
  const parserFalsePositiveRatePct =
    totalDetectedCsiSections > 0
      ? Math.round((totalParserFalsePositives / totalDetectedCsiSections) * 1000) / 10
      : 0;
  const parserMissRatePct =
    totalExpectedSections > 0
      ? Math.round((totalParserMisses / totalExpectedSections) * 1000) / 10
      : 0;

  const verbatimDiffFalsePositiveRatePct =
    verbatimShiftSectionsChecked > 0
      ? Math.round((verbatimShiftFalsePositives / verbatimShiftSectionsChecked) * 1000) / 10
      : 0;

  const consolidatedFalsePositiveRatePct =
    unchangedSectionsAudited.length > 0
      ? Math.round(
          (consolidatedSectionFalsePositives.length / unchangedSectionsAudited.length) * 1000
        ) / 10
      : 0;
  const plantedEditMissRatePct =
    plantedEdits.length > 0
      ? Math.round((plantedMisses / plantedEdits.length) * 1000) / 10
      : 0;

  const rssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    totalDurationMs: Math.round(performance.now() - suiteStart),
    peakRssMb: rssMb,
    corpusOverview: {
      pdfCount: CORPUS_MANIFEST.length,
      specBodyPdfCount: 8,
      tocTrapPdfCount: 2,
      totalRealPages,
      totalExtractableChars,
      totalStrippedNoiseLines: totalStrippedLines,
      totalExpectedCsiSections: totalExpectedSections,
    },
    summaryRates: {
      parserSectionSplitFalsePositiveRatePct: parserFalsePositiveRatePct,
      parserSectionMissRatePct: parserMissRatePct,
      verbatimPageShiftDiffFalsePositiveRatePct: verbatimDiffFalsePositiveRatePct,
      consolidatedManualFalsePositiveRatePct: consolidatedFalsePositiveRatePct,
      plantedRealEditMissRatePct: plantedEditMissRatePct,
      plantedRealEditRecallPct:
        Math.round((plantedHits / plantedEdits.length) * 1000) / 10,
      plantedRiskFlagRecallPct:
        Math.round((plantedRiskFlagHits / plantedRiskFlagExpected) * 1000) / 10,
      verbatimPageBaselineFlaggedPct: Math.round(
        (verbatimBaselineChangedPages / Math.max(1, verbatimBaselineComparedPages)) * 100
      ),
      consolidatedPageBaselineFlaggedPct: Math.round(
        (consolidatedPageBaseline.changedPages /
          Math.max(1, consolidatedPageBaseline.comparedPages)) *
          100
      ),
    },
    confidenceIntervals: {
      parserSectionSplitFalsePositives: clopperPearsonStats(
        totalParserFalsePositives,
        totalDetectedCsiSections
      ),
      parserSectionMisses: clopperPearsonStats(totalParserMisses, totalExpectedSections),
      verbatimPageShiftFalsePositives: clopperPearsonStats(
        verbatimShiftFalsePositives,
        verbatimShiftSectionsChecked
      ),
      consolidatedUnchangedFalsePositives: clopperPearsonStats(
        consolidatedSectionFalsePositives.length,
        unchangedSectionsAudited.length
      ),
      plantedRealEditsCaught: clopperPearsonStats(plantedHits, plantedEdits.length),
      plantedRealEditsMissed: clopperPearsonStats(plantedMisses, plantedEdits.length),
      plantedRiskFlagsMatched: clopperPearsonStats(plantedRiskFlagHits, plantedRiskFlagExpected),
    },
    suite1_realPdfParserAudit: {
      expectedSections: totalExpectedSections,
      detectedSections: totalDetectedCsiSections,
      falsePositiveSplits: totalParserFalsePositives,
      missedSections: totalParserMisses,
      falsePositiveRatePct: parserFalsePositiveRatePct,
      missRatePct: parserMissRatePct,
      perDocument: parserResults,
    },
    suite2_verbatimRealPdfPageShift: {
      documentsTested: verbatimShiftTargets.length,
      totalOriginalPagesShifted: verbatimShiftTotalPagesShifted,
      sectionsChecked: verbatimShiftSectionsChecked,
      sectionFalsePositives: verbatimShiftFalsePositives,
      sectionFalsePositiveRatePct: verbatimDiffFalsePositiveRatePct,
      pageByPageBaselineChangedPages: verbatimBaselineChangedPages,
      pageByPageBaselineTotalPages: verbatimBaselineComparedPages,
      perDocument: verbatimShiftResults,
    },
    suite3_consolidatedRealManualPlantedEdits: {
      basePages: consolidatedBaseParsed.book.pageCount,
      addendumPages: consolidatedAddendumParsed.book.pageCount,
      baseParagraphsTotal: baseSectionsForDiff.reduce((s, x) => s + x.paragraphs.length, 0),
      diffMs: consolidatedDiffMs,
      totalSectionsCompared: consolidatedDiff.results.length,
      unchangedSectionsExpected: unchangedSectionsAudited.length,
      falsePositiveSections: consolidatedSectionFalsePositives.map((r) => ({
        sectionCode: r.sectionCode,
        status: r.status,
      })),
      falsePositiveSectionCount: consolidatedSectionFalsePositives.length,
      falsePositiveRatePct: consolidatedFalsePositiveRatePct,
      plantedEditsTotal: plantedEdits.length,
      plantedEditsDetected: plantedHits,
      plantedEditsMissed: plantedMisses,
      missRatePct: plantedEditMissRatePct,
      riskFlagsExpected: plantedRiskFlagExpected,
      riskFlagsMatched: plantedRiskFlagHits,
      pageByPageRawDiffBaseline: {
        changedPages: consolidatedPageBaseline.changedPages,
        totalPages: consolidatedPageBaseline.comparedPages,
        flaggedPagePct: Math.round(
          (consolidatedPageBaseline.changedPages /
            Math.max(1, consolidatedPageBaseline.comparedPages)) *
            100
        ),
      },
      outcomes: plantedOutcomes,
    },
  };

  const outPath = path.resolve(process.cwd(), 'benchmarks', 'real_corpus_results.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`Real-corpus benchmark results written to ${outPath}`);
  console.log(
    JSON.stringify(
      {
        corpus: report.corpusOverview,
        summaryRates: report.summaryRates,
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
