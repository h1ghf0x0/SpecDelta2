import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectDeltaRiskFlags } from '../src/utils/csiDictionary.ts';
import { isSectionPageStamp, stripHeadersAndFooters } from '../src/utils/noiseFilter.ts';
import { buildCsvString, buildXlsxBytes } from '../src/utils/ooxmlBuilder.ts';
import {
  assemblePageLinesFromSpans,
  chunkIntoCsiSections,
} from '../src/utils/pdfSectionParser.ts';
import { generateSampleProjectManuals } from '../src/utils/sampleSpecGenerator.ts';
import { compareParsedBooks, computeWordDiff } from '../src/utils/specDiffEngine.ts';
import { DEFAULT_NOISE_CONFIG, type SingleSpecParseOutput } from '../src/types/spec.ts';

interface ParsedWithRawPages {
  book: SingleSpecParseOutput;
  rawPageTexts: string[];
  parseMs: number;
}

async function parsePdfWithRealPipeline(
  bytes: Uint8Array,
  fileName: string
): Promise<ParsedWithRawPages> {
  const start = performance.now();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const rawLines = [];
  const rawPageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const { lines } = assemblePageLinesFromSpans(textContent.items, pageNum, viewport.height);
    rawLines.push(...lines);
    rawPageTexts.push(lines.map((l) => l.text).join('\n'));
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
    parseMs,
  };
}

function countPageByPageDifferences(oldPages: string[], newPages: string[]): {
  comparedPages: number;
  changedPages: number;
} {
  const maxPages = Math.max(oldPages.length, newPages.length);
  let changedPages = 0;
  for (let i = 0; i < maxPages; i++) {
    if ((oldPages[i] ?? '') !== (newPages[i] ?? '')) {
      changedPages++;
    }
  }
  return { comparedPages: maxPages, changedPages };
}

interface ScaleSectionSpec {
  code: string;
  headerOverride?: string;
  title: string;
  pagesTarget: number;
  paragraphs: string[];
}

async function renderLargeScaleManual(
  sections: ScaleSectionSpec[],
  projectHeader: string,
  issueStamp: string,
  titleCaseFooter: boolean
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 54;

  const pagesMeta: Array<{ code: string; title: string; lines: Array<{ text: string; bold: boolean }> }> = [];

  for (const sec of sections) {
    const fillerLines: Array<{ text: string; bold: boolean }> = [
      { text: `${sec.headerOverride ?? `SECTION ${sec.code}`} - ${sec.title}`, bold: true },
      { text: 'PART 1 GENERAL', bold: true },
    ];

    sec.paragraphs.forEach((p, idx) => {
      fillerLines.push({ text: `${idx + 1}.1 ${p}`, bold: false });
    });

    // Pad each section across target page count with realistic numbered specification clauses
    const linesPerPage = 32;
    const desiredTotalLines = sec.pagesTarget * linesPerPage;
    let clauseNum = sec.paragraphs.length + 1;
    while (fillerLines.length < desiredTotalLines) {
      fillerLines.push({
        text: `${clauseNum}.1 EXECUTION STANDARD: Coordinate field tolerances, submittals, and shop drawings for ${sec.title.toLowerCase()} in accordance with applicable ASTM and ANSI standards.`,
        bold: false,
      });
      clauseNum++;
    }

    for (let offset = 0; offset < fillerLines.length; offset += linesPerPage) {
      pagesMeta.push({
        code: sec.code,
        title: sec.title,
        lines: fillerLines.slice(offset, offset + linesPerPage),
      });
    }
  }

  const totalPages = pagesMeta.length;
  pagesMeta.forEach((meta, idx) => {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const pageNum = idx + 1;

    page.drawText(projectHeader, { x: marginX, y: pageHeight - 36, size: 8.5, font: bold, color: rgb(0.25, 0.3, 0.38) });
    page.drawText(issueStamp, { x: pageWidth - marginX - 180, y: pageHeight - 36, size: 8.5, font, color: rgb(0.25, 0.3, 0.38) });

    let y = pageHeight - 88;
    for (const item of meta.lines) {
      page.drawText(item.text.slice(0, 92), {
        x: marginX,
        y,
        size: 9.5,
        font: item.bold ? bold : font,
        color: rgb(0.08, 0.1, 0.16),
      });
      y -= 18;
    }

    const footerLabel = titleCaseFooter
      ? `${meta.title.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())} ${meta.code.replace(/\s+/g, '')} - ${pageNum}`
      : `${meta.code} - ${pageNum}`;
    page.drawText(footerLabel, { x: marginX, y: 34, size: 8.5, font, color: rgb(0.35, 0.4, 0.48) });
    page.drawText(`Page ${pageNum} of ${totalPages}`, { x: pageWidth - marginX - 72, y: 34, size: 8.5, font, color: rgb(0.35, 0.4, 0.48) });
  });

  return pdfDoc.save();
}

function build300PageStressPair(): { oldSections: ScaleSectionSpec[]; newSections: ScaleSectionSpec[] } {
  const catalog: Array<[string, string]> = [
    ['01 10 00', 'SUMMARY OF WORK'],
    ['01 21 00', 'ALLOWANCES'],
    ['01 33 00', 'SUBMITTAL PROCEDURES'],
    ['02 41 19', 'SELECTIVE DEMOLITION'],
    ['03 30 00', 'CAST-IN-PLACE CONCRETE'],
    ['04 22 00', 'CONCRETE UNIT MASONRY'],
    ['05 12 00', 'STRUCTURAL STEEL FRAMING'],
    ['05 50 00', 'METAL FABRICATIONS'],
    ['06 10 00', 'ROUGH CARPENTRY'],
    ['06 41 16', 'PLASTIC-LAMINATE-CLAD ARCHITECTURAL CABINETS'],
    ['07 21 00', 'THERMAL INSULATION'],
    ['07 54 23', 'THERMOPLASTIC POLYOLEFIN (TPO) ROOFING'],
    ['07 84 13', 'PENETRATION FIRESTOPPING'],
    ['07 92 00', 'JOINT SEALANTS'],
    ['08 11 13', 'HOLLOW METAL DOORS AND FRAMES'],
    ['08 71 00', 'DOOR HARDWARE'],
    ['08 80 00', 'GLAZING'],
    ['09 22 16', 'NON-STRUCTURAL METAL FRAMING'],
    ['09 29 00', 'GYPSUM BOARD'],
    ['09 51 13', 'ACOUSTICAL PANEL CEILINGS'],
    ['09 91 23', 'INTERIOR PAINTING'],
    ['10 28 00', 'TOILET, BATH, AND LAUNDRY ACCESSORIES'],
    ['14 21 00', 'ELECTRIC TRACTION ELEVATORS'],
    ['21 13 13', 'WET-PIPE SPRINKLER SYSTEMS'],
    ['22 11 16', 'DOMESTIC WATER PIPING'],
    ['23 05 93', 'TESTING, ADJUSTING, AND BALANCING FOR HVAC'],
    ['23 31 13', 'METAL DUCTS'],
    ['26 05 19', 'LOW-VOLTAGE ELECTRICAL POWER CONDUCTORS'],
    ['26 24 13', 'SWITCHBOARDS'],
    ['28 13 00', 'ACCESS CONTROL'],
  ];

  const basePara = 'Contractor shall furnish and install materials meeting minimum 4000 PSI and 15 mil tolerances.';

  const oldSections: ScaleSectionSpec[] = catalog.map(([code, title]) => ({
    code,
    title,
    pagesTarget: 10,
    paragraphs: [basePara],
  }));

  const newSections: ScaleSectionSpec[] = [];
  for (const [code, title] of catalog) {
    if (code === '04 22 00') {
      // Deleted section
      continue;
    }
    if (code === '03 30 00') {
      // +3 pages expansion + PSI/mil upgrade (shifts all 25+ downstream sections!)
      newSections.push({
        code,
        title,
        pagesTarget: 13,
        paragraphs: [
          'Contractor shall furnish and install materials meeting minimum 5000 PSI and 20 mil tolerances.',
        ],
      });
      continue;
    }
    if (code === '01 21 00') {
      newSections.push({
        code,
        title,
        pagesTarget: 10,
        paragraphs: [
          'Contractor shall furnish and install allowance items with a $65,000 lump sum allowance.',
        ],
      });
      continue;
    }
    if (code === '07 54 23') {
      newSections.push({
        code,
        title,
        pagesTarget: 10,
        paragraphs: [
          'Contractor shall provide a 20-year NDL warranty with 80 mil membrane thickness.',
        ],
      });
      continue;
    }
    if (code === '08 71 00') {
      // Renumbered from 08 71 00 to 08 71 13 + scope shift
      newSections.push({
        code: '08 71 13',
        title,
        pagesTarget: 10,
        paragraphs: [
          'Contractor shall install only materials furnished by Owner meeting minimum 4000 PSI and 15 mil tolerances.',
        ],
      });
      continue;
    }
    if (code === '26 24 13') {
      newSections.push({
        code,
        title,
        pagesTarget: 10,
        paragraphs: [
          'Switchboard rating shall achieve minimum 85,000 AIC interrupting rating, no substitutions permitted.',
        ],
      });
      continue;
    }
    newSections.push({ code, title, pagesTarget: 10, paragraphs: [basePara] });
  }

  // Added section in Division 13
  newSections.push({
    code: '13 31 00',
    title: 'TENSIONED FABRIC STRUCTURES',
    pagesTarget: 10,
    paragraphs: ['Design and install 115 mph rated architectural tensioned canopy structure.'],
  });
  newSections.sort((a, b) => a.code.localeCompare(b.code));

  return { oldSections, newSections };
}

async function main() {
  const suiteStart = performance.now();

  // 1. Sample 16-page fixture benchmark
  const { oldBytes, newBytes, oldFileName, newFileName } = await generateSampleProjectManuals();
  const sampleOld = await parsePdfWithRealPipeline(oldBytes, oldFileName);
  const sampleNew = await parsePdfWithRealPipeline(newBytes, newFileName);

  const diffStartSample = performance.now();
  const sampleDiff = compareParsedBooks(sampleOld.book, sampleNew.book);
  const sampleDiffMs = Math.round(performance.now() - diffStartSample);

  const samplePageBaseline = countPageByPageDifferences(
    sampleOld.rawPageTexts,
    sampleNew.rawPageTexts
  );

  const xlsxSampleStart = performance.now();
  const sampleXlsx = buildXlsxBytes(
    ['CSI Code', 'Title', 'Status'],
    sampleDiff.results.map((r) => [r.sectionCode, r.title, r.status]),
    [14, 34, 14]
  );
  const sampleXlsxMs = Math.round(performance.now() - xlsxSampleStart);

  const sampleHvac = sampleDiff.results.find((r) => r.sectionCode === '23 05 93');
  const sampleExpectedChanged = new Set(['01 21 00', '03 30 00', '04 22 00', '07 54 23', '08 71 00', '13 31 00', '26 24 13']);
  const sampleActualChanged = new Set(
    sampleDiff.results.filter((r) => r.status !== 'unchanged').map((r) => r.sectionCode)
  );
  const sampleTruePositives = Array.from(sampleActualChanged).filter((c) => sampleExpectedChanged.has(c)).length;
  const sampleFalsePositives = Array.from(sampleActualChanged).filter((c) => !sampleExpectedChanged.has(c)).length;

  // 2. 300-page scale stress test
  const { oldSections, newSections } = build300PageStressPair();
  const [largeOldBytes, largeNewBytes] = await Promise.all([
    renderLargeScaleManual(oldSections, 'METRO GENERAL HOSPITAL — IFB', 'ISSUED FOR BID', false),
    renderLargeScaleManual(newSections, 'METRO GENERAL HOSPITAL — ADDENDUM 01', 'ADDENDUM 01', true),
  ]);

  const largeOld = await parsePdfWithRealPipeline(largeOldBytes, 'Metro_Hospital_300p_IFB.pdf');
  const largeNew = await parsePdfWithRealPipeline(largeNewBytes, 'Metro_Hospital_Addendum_01.pdf');

  const diffStartLarge = performance.now();
  const largeDiff = compareParsedBooks(largeOld.book, largeNew.book);
  const largeDiffMs = Math.round(performance.now() - diffStartLarge);

  const largePageBaseline = countPageByPageDifferences(largeOld.rawPageTexts, largeNew.rawPageTexts);

  const xlsxLargeStart = performance.now();
  const largeXlsx = buildXlsxBytes(
    ['CSI Code', 'Title', 'Status', 'Flags'],
    largeDiff.results.map((r) => [r.sectionCode, r.title, r.status, r.riskFlags.join('; ')]),
    [14, 34, 14, 36]
  );
  const largeXlsxMs = Math.round(performance.now() - xlsxLargeStart);

  const expectedChanged300 = new Set([
    '01 21 00',
    '03 30 00',
    '04 22 00',
    '07 54 23',
    '08 71 13', // renumbered from 08 71 00
    '13 31 00',
    '26 24 13',
  ]);
  const actualChanged300 = new Set(
    largeDiff.results.filter((r) => r.status !== 'unchanged').map((r) => r.sectionCode)
  );
  const largeTruePositives = Array.from(actualChanged300).filter((c) => expectedChanged300.has(c)).length;
  const largeFalsePositives = Array.from(actualChanged300).filter((c) => !expectedChanged300.has(c)).length;

  // 3. Adversarial edge-case probes
  const calendarDiff = computeWordDiff(
    'Bid date extended to May 14, 2026.',
    'Bid date extended to May 21, 2026.'
  );
  const typoDiff = computeWordDiff(
    'Contractor shall submit shop drawigns within minimum 14 days.',
    'Contractor shall submit shop drawings within minimum 14 days.'
  );
  const twoModalDiff = computeWordDiff(
    'Contractor shall submit samples and Architect may inspect mockups.',
    'Contractor to submit samples and Architect may inspect mockups.'
  );
  const twoModalFlags = detectDeltaRiskFlags(
    twoModalDiff.tokens,
    'Contractor shall submit samples and Architect may inspect mockups.',
    'Contractor to submit samples and Architect may inspect mockups.'
  );
  const csvSample = buildCsvString(
    ['Formula', 'Tolerance', 'Deduct'],
    [['=HYPERLINK("https://example.com","x")', '+/- 1/8 inch', '-5% deduct']]
  );

  const rssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

  const report = {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    totalBenchmarkDurationMs: Math.round(performance.now() - suiteStart),
    peakRssMb: rssMb,
    suites: {
      sample_fixture_15p: {
        oldPages: sampleOld.book.pageCount,
        newPages: sampleNew.book.pageCount,
        oldParseMs: sampleOld.parseMs,
        newParseMs: sampleNew.parseMs,
        diffMs: sampleDiffMs,
        xlsxExportMs: sampleXlsxMs,
        xlsxByteLength: sampleXlsx.byteLength,
        oldStrippedLines: sampleOld.book.strippedLineCount ?? 0,
        newStrippedLines: sampleNew.book.strippedLineCount ?? 0,
        sectionsMatched: sampleDiff.results.length,
        expectedChangedCount: expectedChangedChangedCount(sampleExpectedChanged),
        truePositives: sampleTruePositives,
        falsePositives: sampleFalsePositives,
        recall: sampleTruePositives / sampleExpectedChanged.size,
        shiftedSection230593Status: sampleHvac?.status ?? 'missing',
        shiftedSection230593Pages: `${sampleHvac?.oldPageRange} -> ${sampleHvac?.newPageRange}`,
        pageByPageRawDiffBaseline: {
          changedPages: samplePageBaseline.changedPages,
          totalPages: samplePageBaseline.comparedPages,
          flaggedPagePct: Math.round((samplePageBaseline.changedPages / samplePageBaseline.comparedPages) * 100),
        },
      },
      scale_stress_300p: {
        oldPages: largeOld.book.pageCount,
        newPages: largeNew.book.pageCount,
        totalPagesParsed: largeOld.book.pageCount + largeNew.book.pageCount,
        oldPdfSizeKb: Math.round(largeOldBytes.byteLength / 1024),
        newPdfSizeKb: Math.round(largeNewBytes.byteLength / 1024),
        oldParseMs: largeOld.parseMs,
        newParseMs: largeNew.parseMs,
        diffMs: largeDiffMs,
        totalPipelineMs: largeOld.parseMs + largeNew.parseMs + largeDiffMs,
        pagesPerSecond: Math.round(
          ((largeOld.book.pageCount + largeNew.book.pageCount) /
            Math.max(1, largeOld.parseMs + largeNew.parseMs)) *
            1000
        ),
        xlsxExportMs: largeXlsxMs,
        xlsxByteLength: largeXlsx.byteLength,
        oldStrippedLines: largeOld.book.strippedLineCount ?? 0,
        newStrippedLines: largeNew.book.strippedLineCount ?? 0,
        sectionsTotal: largeDiff.results.length,
        unchangedSectionsCorrect: largeDiff.results.filter(
          (r) => !expectedChanged300.has(r.sectionCode) && r.status === 'unchanged'
        ).length,
        expectedChangedCount: expectedChanged300.size,
        truePositives: largeTruePositives,
        falsePositives: largeFalsePositives,
        recall: largeTruePositives / expectedChanged300.size,
        renumberedCount: largeDiff.diagnostics.renumberedCount,
        pageByPageRawDiffBaseline: {
          changedPages: largePageBaseline.changedPages,
          totalPages: largePageBaseline.comparedPages,
          flaggedPagePct: Math.round((largePageBaseline.changedPages / largePageBaseline.comparedPages) * 100),
        },
      },
      adversarial_probes: {
        calendarMonthMayFalseFlags: detectDeltaRiskFlags(
          calendarDiff.tokens,
          'Bid date extended to May 14, 2026.',
          'Bid date extended to May 21, 2026.'
        ).length,
        typoInShallParagraphFalseFlags: detectDeltaRiskFlags(
          typoDiff.tokens,
          'Contractor shall submit shop drawigns within minimum 14 days.',
          'Contractor shall submit shop drawings within minimum 14 days.'
        ).length,
        multiModalDeletionDetected: twoModalFlags.includes('Directive removed: shall'),
        multiModalDeletionAvoidedFalseSwap: !twoModalFlags.includes('Directive: shall → may'),
        titleCaseFooterStripped: isSectionPageStamp('Cast-in-Place Concrete 033000 - 5'),
        proseCrossRefPreserved:
          !isSectionPageStamp('Refer to Section 03 30 00 Page 5') &&
          !isSectionPageStamp('Submit samples per 03 30 00 - 5') &&
          !isSectionPageStamp('Warranty period shall be 5 years. See page 12.'),
        csvFormulaInjectionGuarded:
          csvSample.includes("'=HYPERLINK") &&
          csvSample.includes("'+/- 1/8 inch") &&
          csvSample.includes("'-5% deduct"),
      },
    },
  };

  const outDir = path.resolve(process.cwd(), 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'results.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`Benchmark results written to ${outPath}`);
  console.log(
    JSON.stringify(
      {
        sample_15p: {
          pages: `${report.suites.sample_fixture_15p.oldPages}+${report.suites.sample_fixture_15p.newPages}`,
          totalMs:
            report.suites.sample_fixture_15p.oldParseMs +
            report.suites.sample_fixture_15p.newParseMs +
            report.suites.sample_fixture_15p.diffMs,
          recall: report.suites.sample_fixture_15p.recall,
          falsePositives: report.suites.sample_fixture_15p.falsePositives,
          pageBaselineChangedPages: `${samplePageBaseline.changedPages}/${samplePageBaseline.comparedPages}`,
        },
        scale_300p: {
          pages: `${report.suites.scale_stress_300p.oldPages}+${report.suites.scale_stress_300p.newPages}`,
          totalPipelineMs: report.suites.scale_stress_300p.totalPipelineMs,
          pagesPerSecond: report.suites.scale_stress_300p.pagesPerSecond,
          recall: report.suites.scale_stress_300p.recall,
          falsePositives: report.suites.scale_stress_300p.falsePositives,
          renumberedCount: report.suites.scale_stress_300p.renumberedCount,
          pageBaselineChangedPages: `${largePageBaseline.changedPages}/${largePageBaseline.comparedPages}`,
          peakRssMb: report.peakRssMb,
        },
      },
      null,
      2
    )
  );
}

function expectedChangedChangedCount(set: Set<string>): number {
  return set.size;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
