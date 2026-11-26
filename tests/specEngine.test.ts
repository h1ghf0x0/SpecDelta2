import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  detectDeltaRiskFlags,
  detectRiskFlags,
  extractParagraphDeltaChips,
  normalizeCsiCode,
} from '../src/utils/csiDictionary';
import { isSectionPageStamp, stripHeadersAndFooters } from '../src/utils/noiseFilter';
import { buildCsvString, buildXlsxBytes } from '../src/utils/ooxmlBuilder';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
  matchCsiHeader,
} from '../src/utils/pdfSectionParser';
import { generateSampleProjectManuals } from '../src/utils/sampleSpecGenerator';
import {
  compareParsedBooks,
  computeSpecContentHash,
  computeWordDiff,
} from '../src/utils/specDiffEngine';
import { buildChangeLogRows, getOverlappingScannedPages } from '../src/utils/exporters';
import { clopperPearsonStats } from '../src/utils/statsCi';
import { DEFAULT_NOISE_CONFIG, type SingleSpecParseOutput } from '../src/types/spec';

test('normalizeCsiCode aligns 6-digit, compact, legacy 5-digit, and subsection formats', () => {
  assert.equal(normalizeCsiCode('SECTION 08 71 00'), '08 71 00');
  assert.equal(normalizeCsiCode('08 7100'), '08 71 00');
  assert.equal(normalizeCsiCode('087100'), '08 71 00');
  assert.equal(normalizeCsiCode('08710'), '08 71 00');
  assert.equal(normalizeCsiCode('13 31 00.13'), '13 31 00.13');
});

test('computeWordDiff assigns context-window riskMatch for split numeric tolerances', () => {
  const { tokens, addedWords, deletedWords } = computeWordDiff(
    'Concrete compressive strength shall be minimum 3,000 psi at 28 days.',
    'Concrete compressive strength shall be minimum 4,000 psi at 28 days.'
  );
  assert.equal(addedWords, 1);
  assert.equal(deletedWords, 1);

  const deletedNum = tokens.find((t) => t.op === -1 && t.text.includes('3,000'));
  const addedNum = tokens.find((t) => t.op === 1 && t.text.includes('4,000'));
  assert.equal(deletedNum?.riskMatch, 'Tolerance / Unit');
  assert.equal(addedNum?.riskMatch, 'Tolerance / Unit');
});

test('risk dictionary & delta chips catch threshold and modal directive shifts without false positives', () => {
  const oldPara = 'Contractor shall provide not less than 15 mil vapor retarder by Owner.';
  const newPara = 'Contractor may provide not exceeding 20 mil vapor retarder furnish and install.';
  const { tokens } = computeWordDiff(oldPara, newPara);
  const deltaFlags = detectDeltaRiskFlags(tokens, oldPara, newPara);
  assert.ok(deltaFlags.some((f) => f.includes('Threshold / Limit')));
  assert.ok(deltaFlags.some((f) => f === 'Directive: shall → may'));

  const chips = extractParagraphDeltaChips(oldPara, newPara);
  assert.ok(chips.some((c) => c === 'Gauge / Mil: 15 mil → 20 mil'));
  assert.ok(chips.some((c) => c === 'Directive: shall → may'));
  assert.ok(chips.some((c) => c === 'Threshold: not less than → not exceeding'));

  // Regression 1: Typo fix inside a "shall" + "minimum" boilerplate paragraph must NOT trigger risk flags
  const typoOld = 'Contractor shall submit shop drawigns within minimum 14 days.';
  const typoNew = 'Contractor shall submit shop drawings within minimum 14 days.';
  const typoDiff = computeWordDiff(typoOld, typoNew);
  assert.deepEqual(detectDeltaRiskFlags(typoDiff.tokens, typoOld, typoNew), []);
  assert.deepEqual(extractParagraphDeltaChips(typoOld, typoNew), []);

  // Regression 2: Capitalized month "May" in calendar dates must NOT match modal directive "may"
  const dateOld = 'Bid date extended to May 14, 2026.';
  const dateNew = 'Bid date extended to May 21, 2026.';
  const dateDiff = computeWordDiff(dateOld, dateNew);
  assert.deepEqual(detectDeltaRiskFlags(dateDiff.tokens, dateOld, dateNew), []);
  assert.equal(detectRiskFlags(dateNew).length, 0);

  // Regression 3: Added, removed, and multi-modal deletion without positional mismatch
  const modalAddedDiff = computeWordDiff(
    'Subcontractor to provide submittals within 14 days.',
    'Subcontractor shall provide submittals within 14 days.'
  );
  assert.ok(
    detectDeltaRiskFlags(
      modalAddedDiff.tokens,
      'Subcontractor to provide submittals within 14 days.',
      'Subcontractor shall provide submittals within 14 days.'
    ).includes('Directive added: shall')
  );

  const modalRemovedDiff = computeWordDiff(
    'Subcontractor shall provide submittals within 14 days.',
    'Subcontractor to provide submittals within 14 days.'
  );
  assert.ok(
    detectDeltaRiskFlags(
      modalRemovedDiff.tokens,
      'Subcontractor shall provide submittals within 14 days.',
      'Subcontractor to provide submittals within 14 days.'
    ).includes('Directive removed: shall')
  );

  const twoModalsOld = 'Contractor shall submit samples and Architect may inspect mockups.';
  const twoModalsNew = 'Contractor to submit samples and Architect may inspect mockups.';
  const twoModalsDiff = computeWordDiff(twoModalsOld, twoModalsNew);
  const twoModalFlags = detectDeltaRiskFlags(twoModalsDiff.tokens, twoModalsOld, twoModalsNew);
  assert.ok(twoModalFlags.includes('Directive removed: shall'));
  assert.ok(!twoModalFlags.includes('Directive: shall → may'));

  // Regression 4: Hyphenated engineering units ("60-psi" -> "100-psi", "15-mil" -> "20-mil")
  const hyphenOld = 'Type VII, 60-psi minimum compressive strength with 15-mil vapor retarder.';
  const hyphenNew = 'Type VII, 100-psi not less than compressive strength with 20-mil vapor retarder.';
  const hyphenDiff = computeWordDiff(hyphenOld, hyphenNew);
  const hyphenFlags = detectDeltaRiskFlags(hyphenDiff.tokens, hyphenOld, hyphenNew);
  const hyphenChips = extractParagraphDeltaChips(hyphenOld, hyphenNew);
  assert.ok(hyphenFlags.some((f) => f.includes('100-psi')));
  assert.ok(hyphenFlags.some((f) => f.includes('20-mil')));
  assert.ok(hyphenChips.includes('Strength: 60-psi → 100-psi'));
  assert.ok(hyphenChips.includes('Gauge / Mil: 15-mil → 20-mil'));
});

test('matchCsiHeader and chunkIntoCsiSections handle DOCUMENT headers, cross-references, and TOC pages', () => {
  const docMatch = matchCsiHeader('DOCUMENT 000105 - LIST OF CONSULTANTS');
  assert.equal(docMatch?.normalizedCode, '00 01 05');
  assert.equal(docMatch?.title, 'LIST OF CONSULTANTS');
  assert.equal(docMatch?.isExplicit, true);

  // Reject quoted cross-reference and wrapped prose cross-reference splits
  assert.equal(
    matchCsiHeader('01 31 00 - "Project Management and Coordination."'),
    null
  );
  assert.equal(
    matchCsiHeader('Section 096500 - Resilient', 'Refer to'),
    null
  );
  assert.equal(
    matchCsiHeader(
      'Section 012400 – SCHEDULE OF VALUES: Allocation of portions of the Work as line items in',
      '1. Section 011100 – SUMMARY OF WORK: Hours of work. 2.'
    ),
    null
  );

  // Suppress dense TOC pages (>= 5 CSI lines) while keeping real specification sections intact
  const lines = [
    { page: 1, yPct: 0.15, text: 'TABLE OF CONTENTS' },
    { page: 1, yPct: 0.20, text: '01 11 00 SUMMARY OF WORK' },
    { page: 1, yPct: 0.25, text: '01 22 00 UNIT PRICES' },
    { page: 1, yPct: 0.30, text: '01 24 00 SCHEDULE OF VALUES' },
    { page: 1, yPct: 0.35, text: '01 31 00 PROJECT MANAGEMENT AND COORDINATION' },
    { page: 1, yPct: 0.40, text: '01 33 00 SUBMITTAL PROCEDURES' },
    { page: 2, yPct: 0.15, text: 'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE Page 1 of 5' },
    { page: 2, yPct: 0.25, text: 'PART 1 GENERAL' },
    { page: 2, yPct: 0.32, text: '1.1 Concrete strength shall be minimum 4,000 psi.' },
  ];
  const { sections } = chunkIntoCsiSections(lines, 2, new Map());
  assert.deepEqual(
    sections.map((s) => s.normalizedCode),
    ['00 01 00', '03 30 00']
  );
  assert.equal(sections[1].title, 'CAST-IN-PLACE CONCRETE');
});

test('stripHeadersAndFooters removes stamps cleanly while preserving bottom-margin spec prose', () => {
  assert.equal(isSectionPageStamp('CAST-IN-PLACE CONCRETE 033000 - 5'), true);
  assert.equal(isSectionPageStamp('Cast-in-Place Concrete 033000 - 5'), true);
  assert.equal(isSectionPageStamp('Cast-in-Place Concrete 033000 - 5 Page 12 of 303'), true);
  assert.equal(isSectionPageStamp('Cast-In-Place Concrete 03 30 00 - Page 5 of 12'), true);
  assert.equal(isSectionPageStamp('08 71 00 - DOOR HARDWARE - Page 4 of 12'), true);
  assert.equal(isSectionPageStamp('SECTION 03 30 00 - CAST-IN-PLACE CONCRETE'), false);
  assert.equal(isSectionPageStamp('1.02 SUBMITTALS'), false);
  assert.equal(isSectionPageStamp('Warranty period shall be 5 years. See page 12.'), false);
  assert.equal(isSectionPageStamp('Refer to Section 03 30 00 Page 5'), false);
  assert.equal(isSectionPageStamp('Submit samples per 03 30 00 - 5'), false);

  const lines = [
    { page: 1, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 1, yPct: 0.25, text: 'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE' },
    { page: 1, yPct: 0.94, text: 'Cast-in-Place Concrete 033000 - 5' },
    { page: 2, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 2, yPct: 0.30, text: '1.02 SUBMITTALS' },
    { page: 2, yPct: 0.91, text: 'Submit samples per 03 30 00 - 5' },
    { page: 2, yPct: 0.92, text: 'Warranty period shall be 5 years. See page 12.' },
    { page: 2, yPct: 0.93, text: 'Refer to Section 03 30 00 Page 5' },
    { page: 2, yPct: 0.96, text: 'CAST-IN-PLACE CONCRETE 033000 - 6' },
    { page: 3, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 3, yPct: 0.40, text: 'Provide 4,000 psi concrete.' },
    { page: 3, yPct: 0.94, text: '08 71 00 - DOOR HARDWARE - Page 4 of 12' },
    { page: 4, yPct: 0.04, text: 'ACME MEDICAL CENTER - BID SET' },
    { page: 4, yPct: 0.94, text: 'SECTION 26 24 13 - PAGE 2' },
  ];

  const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
    lines,
    4,
    DEFAULT_NOISE_CONFIG
  );
  assert.equal(strippedLineCount, 8);
  assert.deepEqual(
    cleanLines.map((l) => l.text),
    [
      'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE',
      '1.02 SUBMITTALS',
      'Submit samples per 03 30 00 - 5',
      'Warranty period shall be 5 years. See page 12.',
      'Refer to Section 03 30 00 Page 5',
      'Provide 4,000 psi concrete.',
    ]
  );
  assert.ok(strippedPatterns.some((p) => p.sample.includes('033000 - 5')));
});

test('compareParsedBooks aligns shifted sections, differentiates content hashes, and blocks scanned books', () => {
  const oldBook: SingleSpecParseOutput = {
    fileName: 'Base.pdf',
    pageCount: 10,
    parseTimeMs: 40,
    scannedWarning: false,
    strippedPatterns: [],
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 03 30 00',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 4,
        text: 'Minimum concrete strength shall be 3,000 psi.',
        paragraphs: ['Minimum concrete strength shall be 3,000 psi.'],
      },
      {
        id: '23 05 93__1',
        rawCode: 'SECTION 23 05 93',
        normalizedCode: '23 05 93',
        division: '23',
        divisionTitle: 'Heating, Ventilating, and Air Conditioning (HVAC)',
        title: 'TESTING, ADJUSTING, AND BALANCING FOR HVAC',
        startPage: 5,
        endPage: 8,
        text: 'Balance air diffusers within plus or minus 10%.',
        paragraphs: ['Balance air diffusers within plus or minus 10%.'],
      },
      {
        id: '08 71 00__2',
        rawCode: 'SECTION 08 71 00',
        normalizedCode: '08 71 00',
        division: '08',
        divisionTitle: 'Openings',
        title: 'DOOR HARDWARE',
        startPage: 9,
        endPage: 10,
        text: 'Furnish and install electrified locksets.',
        paragraphs: ['Furnish and install electrified locksets.'],
      },
    ],
  };

  const newBook: SingleSpecParseOutput = {
    fileName: 'Addendum1.pdf',
    pageCount: 12,
    parseTimeMs: 45,
    scannedWarning: false,
    strippedPatterns: [],
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 033000',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 6,
        text: 'Minimum concrete strength shall be 4,000 psi.',
        paragraphs: ['Minimum concrete strength shall be 4,000 psi.'],
      },
      {
        id: '23 05 93__1',
        rawCode: 'SECTION 23 05 93',
        normalizedCode: '23 05 93',
        division: '23',
        divisionTitle: 'Heating, Ventilating, and Air Conditioning (HVAC)',
        title: 'TESTING, ADJUSTING, AND BALANCING FOR HVAC',
        startPage: 7,
        endPage: 10,
        text: 'Balance air diffusers within plus or minus 10%.',
        paragraphs: ['Balance air diffusers within plus or minus 10%.'],
      },
      {
        id: '08 71 13__2',
        rawCode: 'SECTION 08 71 13',
        normalizedCode: '08 71 13',
        division: '08',
        divisionTitle: 'Openings',
        title: 'DOOR HARDWARE',
        startPage: 11,
        endPage: 12,
        text: 'Furnish and install electrified locksets.',
        paragraphs: ['Furnish and install electrified locksets.'],
      },
    ],
  };

  assert.notEqual(
    computeSpecContentHash(oldBook.sections),
    computeSpecContentHash(newBook.sections)
  );

  const diff = compareParsedBooks(oldBook, newBook);
  const concrete = diff.results.find((r) => r.sectionCode === '03 30 00');
  const hvac = diff.results.find((r) => r.sectionCode === '23 05 93');
  const renumbered = diff.results.find((r) => r.sectionCode === '08 71 13');

  assert.equal(concrete?.status, 'modified');
  assert.equal(hvac?.status, 'unchanged');
  assert.equal(renumbered?.renumberedFrom, '08 71 00');
  assert.equal(diff.diagnostics.renumberedCount, 1);
  assert.equal(diff.diagnostics.oldContentHash, computeSpecContentHash(oldBook.sections));

  const scannedNew: SingleSpecParseOutput = {
    ...newBook,
    isMostlyScanned: true,
    scannedPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
  const blocked = compareParsedBooks(oldBook, scannedNew);
  assert.equal(blocked.results.length, 0);
  assert.equal(blocked.diagnostics.newMostlyScanned, true);
});

test('pure-TS OOXML builder produces a valid ZIP/XLSX package and RFC-4180 CSV', () => {
  const xlsx = buildXlsxBytes(
    ['CSI Code', 'Section Title', 'Notes'],
    [['03 30 00', 'Concrete & "Vapor" <Retarder>', '4000 PSI -> 5000 PSI']],
    [14, 32, 40],
    'Spec Diff Log'
  );

  // Verify ZIP local file header signature (PK\x03\x04)
  assert.equal(xlsx[0], 0x50);
  assert.equal(xlsx[1], 0x4b);
  assert.equal(xlsx[2], 0x03);
  assert.equal(xlsx[3], 0x04);

  const rawText = Buffer.from(xlsx).toString('utf8');
  assert.ok(rawText.includes('[Content_Types].xml'));
  assert.ok(rawText.includes('xl/workbook.xml'));
  assert.ok(rawText.includes('xl/worksheets/sheet1.xml'));
  assert.ok(rawText.includes('Concrete &amp; &quot;Vapor&quot; &lt;Retarder&gt;'));

  const csv = buildCsvString(
    ['CSI Code', 'Delta', 'Tolerance', 'Deduct', 'Formula'],
    [
      [
        '03 30 00',
        '4,000 PSI, "Class A"',
        '+/- 1/8 inch tolerance',
        '-5% deduct alternate',
        '=HYPERLINK("https://example.com","x")',
      ],
    ]
  );
  assert.equal(
    csv,
    'CSI Code,Delta,Tolerance,Deduct,Formula\r\n03 30 00,"4,000 PSI, ""Class A""",\'+/- 1/8 inch tolerance,\'-5% deduct alternate,"\'=HYPERLINK(""https://example.com"",""x"")"'
  );
});

async function parseRealPdfBytesWithProductionPipeline(
  bytes: Uint8Array,
  fileName: string
): Promise<SingleSpecParseOutput> {
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
    const { lines } = assemblePageLinesFromSpans(textContent.items, pageNum, viewport.height);
    rawLines.push(...lines);
  }

  const { cleanLines, strippedPatterns, strippedLineCount } = stripHeadersAndFooters(
    rawLines,
    doc.numPages,
    DEFAULT_NOISE_CONFIG
  );
  const { sections } = chunkIntoCsiSections(cleanLines, doc.numPages, new Map());

  return {
    fileName,
    pageCount: doc.numPages,
    parseTimeMs: 10,
    scannedWarning: false,
    strippedPatterns,
    strippedLineCount,
    sections,
  };
}

test('end-to-end PDF binary parsing pipeline handles generated sample Project Manuals', async () => {
  const { oldBytes, newBytes, oldFileName, newFileName } = await generateSampleProjectManuals();
  const [oldBook, newBook] = await Promise.all([
    parseRealPdfBytesWithProductionPipeline(oldBytes, oldFileName),
    parseRealPdfBytesWithProductionPipeline(newBytes, newFileName),
  ]);

  assert.ok((oldBook.strippedLineCount ?? 0) > 0, 'Expected real headers/footers stripped from old PDF');
  assert.ok((newBook.strippedLineCount ?? 0) > 0, 'Expected real headers/footers stripped from new PDF');

  const diff = compareParsedBooks(oldBook, newBook);

  const concrete = diff.results.find((r) => r.sectionCode === '03 30 00');
  const masonry = diff.results.find((r) => r.sectionCode === '04 22 00');
  const hardware = diff.results.find((r) => r.sectionCode === '08 71 00');
  const canopy = diff.results.find((r) => r.sectionCode === '13 31 00');
  const hvac = diff.results.find((r) => r.sectionCode === '23 05 93');

  assert.equal(concrete?.status, 'modified');
  assert.ok(
    concrete?.changedParagraphs.some((p) =>
      p.deltaChips?.includes('Strength: 4000 PSI → 5000 PSI')
    )
  );
  assert.ok(
    concrete?.changedParagraphs.some((p) =>
      p.deltaChips?.includes('Gauge / Mil: 15 mil → 20 mil')
    )
  );

  assert.equal(masonry?.status, 'deleted');
  assert.equal(canopy?.status, 'added');

  assert.equal(hardware?.status, 'modified');
  assert.equal(hardware?.spacingNormalized, true);

  assert.equal(hvac?.status, 'unchanged');
  assert.notEqual(hvac?.oldPageRange, hvac?.newPageRange);
});

test('partial scanned pages propagate into diagnostics and change log export rows', () => {
  const oldBook: SingleSpecParseOutput = {
    fileName: 'Base_PartialScan.pdf',
    pageCount: 10,
    parseTimeMs: 25,
    scannedWarning: true,
    isMostlyScanned: false,
    scannedPages: [2, 3],
    strippedPatterns: [],
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 03 30 00',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 4,
        text: 'Minimum 4,000 psi.',
        paragraphs: ['Minimum 4,000 psi.'],
      },
    ],
  };

  const newBook: SingleSpecParseOutput = {
    fileName: 'Addendum_PartialScan.pdf',
    pageCount: 10,
    parseTimeMs: 25,
    scannedWarning: true,
    isMostlyScanned: false,
    scannedPages: [4],
    strippedPatterns: [],
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 03 30 00',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 5,
        text: 'Minimum 5,000 psi.',
        paragraphs: ['Minimum 5,000 psi.'],
      },
    ],
  };

  const diff = compareParsedBooks(oldBook, newBook);
  assert.equal(diff.diagnostics.scannedWarning, true);
  assert.deepEqual(diff.diagnostics.oldScannedPages, [2, 3]);
  assert.deepEqual(diff.diagnostics.newScannedPages, [4]);
  assert.deepEqual(getOverlappingScannedPages('1-4', diff.diagnostics.oldScannedPages), [2, 3]);

  const rows = buildChangeLogRows(diff.results, new Set(['03 30 00']), {
    oldFileName: diff.diagnostics.oldFileName,
    newFileName: diff.diagnostics.newFileName,
    oldScannedPages: diff.diagnostics.oldScannedPages,
    newScannedPages: diff.diagnostics.newScannedPages,
  });

  assert.equal(rows[0][1], 'NO-OCR PAGES');
  assert.ok(rows[0][10].includes('pp. 2, 3'));
  assert.ok(rows[0][10].includes('pp. 4'));
  assert.equal(rows[1][10], 'Old pp. 2, 3 (no OCR); New pp. 4 (no OCR)');
});

test('clopperPearsonStats computes exact binomial confidence intervals and one-sided bounds', () => {
  const caught12 = clopperPearsonStats(12, 12);
  assert.equal(caught12.pointPct, 100);
  assert.deepEqual(caught12.ci95TwoSidedPct, [73.5, 100]);

  const missed12 = clopperPearsonStats(0, 12);
  assert.equal(missed12.pointPct, 0);
  assert.equal(missed12.oneSided95UpperPct, 22.1);
  assert.deepEqual(missed12.ci95TwoSidedPct, [0, 26.5]);

  const fp20 = clopperPearsonStats(0, 20);
  assert.equal(fp20.oneSided95UpperPct, 13.9);

  const fp21 = clopperPearsonStats(0, 21);
  assert.equal(fp21.oneSided95UpperPct, 13.3);
});

test('chunkIntoCsiSections preserves spec sections mentioning Table of Contents in body prose', () => {
  const lines = [
    { page: 1, yPct: 0.12, text: 'SECTION 01 29 00' },
    { page: 1, yPct: 0.16, text: 'PAYMENT PROCEDURES' },
    { page: 1, yPct: 0.22, text: 'PART 1 GENERAL' },
    { page: 1, yPct: 0.28, text: '1.01 FORMAT' },
    { page: 1, yPct: 0.34, text: 'C. Format: Utilize Table of Contents of this Project Manual.' },
    { page: 2, yPct: 0.12, text: 'SECTION 01 77 00 - CONTRACT CLOSEOUT' },
    { page: 2, yPct: 0.20, text: 'PART 1 - GENERAL' },
    { page: 2, yPct: 0.28, text: '1. Table of Contents' },
  ];

  const { sections } = chunkIntoCsiSections(lines, 2, new Map());
  assert.deepEqual(
    sections.map((s) => s.normalizedCode),
    ['01 29 00', '01 77 00']
  );
  assert.equal(sections[0].title, 'PAYMENT PROCEDURES');
  assert.equal(sections[1].title, 'CONTRACT CLOSEOUT');
});

test('compareParsedBooks sets bookmarkAsymmetryWarning only when one book has CSI outline bookmarks', () => {
  const makeBook = (fileName: string, outlineBookmarkCount: number): SingleSpecParseOutput => ({
    fileName,
    pageCount: 2,
    parseTimeMs: 10,
    scannedWarning: false,
    strippedPatterns: [],
    outlineBookmarkCount,
    sections: [
      {
        id: '03 30 00__0',
        rawCode: 'SECTION 03 30 00',
        normalizedCode: '03 30 00',
        division: '03',
        divisionTitle: 'Concrete',
        title: 'CAST-IN-PLACE CONCRETE',
        startPage: 1,
        endPage: 2,
        text: 'Minimum 4,000 psi.',
        paragraphs: ['Minimum 4,000 psi.'],
      },
    ],
  });

  const symZero = compareParsedBooks(makeBook('A.pdf', 0), makeBook('B.pdf', 0));
  assert.equal(symZero.diagnostics.bookmarkAsymmetryWarning, false);

  const symBoth = compareParsedBooks(makeBook('A.pdf', 12), makeBook('B.pdf', 14));
  assert.equal(symBoth.diagnostics.bookmarkAsymmetryWarning, false);

  const asym = compareParsedBooks(makeBook('A.pdf', 12), makeBook('B.pdf', 0));
  assert.equal(asym.diagnostics.bookmarkAsymmetryWarning, true);
  assert.equal(asym.diagnostics.oldOutlineBookmarkCount, 12);
  assert.equal(asym.diagnostics.newOutlineBookmarkCount, 0);
});



