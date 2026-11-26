export type AppRoute =
  | '/'
  | '/split-spec-book'
  | '/vs-bluebeam'
  | '/acrobat-alternative'
  | '/unclouded-addenda'
  | '/benchmark'
  | '/compare-division-03-concrete-specs'
  | '/compare-division-07-thermal-moisture-specs'
  | '/compare-division-08-doors-hardware-specs'
  | '/compare-division-09-finishes-specs'
  | '/compare-division-23-hvac-specs'
  | '/compare-division-26-electrical-specs'
  | '/privacy'
  | '/terms';

export type DiffStatus = 'modified' | 'added' | 'deleted' | 'unchanged';

export interface StrippedPattern {
  pattern: string;
  sample: string;
  frequencyPct: number;
  pageHits: number;
  totalPages: number;
  zone: 'header' | 'footer';
}

export interface CsiSection {
  id: string;
  rawCode: string;
  normalizedCode: string;
  division: string;
  divisionTitle: string;
  title: string;
  startPage: number;
  endPage: number;
  text: string;
  paragraphs: string[];
}

export interface WordDiffToken {
  op: -1 | 0 | 1; // -1 deleted, 0 equal, 1 added
  text: string;
  riskMatch?: string;
}

export interface ChangedParagraph {
  paragraphIndex: number;
  oldText: string;
  newText: string;
  contextBefore: string;
  contextAfter: string;
  tokens: WordDiffToken[];
  riskFlags: string[];
  deltaChips?: string[];
}

export interface DiffSectionResult {
  sectionCode: string;
  oldRawCode: string | null;
  newRawCode: string | null;
  division: string;
  divisionTitle: string;
  title: string;
  status: DiffStatus;
  oldPageRange: string;
  newPageRange: string;
  changedParagraphs: ChangedParagraph[];
  fullTokens?: WordDiffToken[];
  fullOldText: string;
  fullNewText: string;
  riskFlags: string[];
  addedWords: number;
  deletedWords: number;
  spacingNormalized: boolean;
  renumberedFrom?: string;
}

export interface NoiseFilterConfig {
  edgeMarginPct: number; // e.g., 0.10 = top 10% and bottom 10%
  minRecurrencePct: number; // e.g., 0.40 = >40% of pages
}

export const DEFAULT_NOISE_CONFIG: NoiseFilterConfig = {
  edgeMarginPct: 0.1,
  minRecurrencePct: 0.4,
};

export interface ParseDiagnostics {
  oldFileName: string;
  newFileName: string;
  oldPageCount: number;
  newPageCount: number;
  oldSectionCount: number;
  newSectionCount: number;
  oldStrippedPatterns: StrippedPattern[];
  newStrippedPatterns: StrippedPattern[];
  oldStrippedLineCount?: number;
  newStrippedLineCount?: number;
  oldContentHash?: string;
  newContentHash?: string;
  parseTimeMs: number;
  scannedWarning: boolean;
  oldScannedPages?: number[];
  newScannedPages?: number[];
  oldMostlyScanned?: boolean;
  newMostlyScanned?: boolean;
  outlineHintsUsed?: number;
  appliedNoiseConfig?: NoiseFilterConfig;
  renumberedCount?: number;
}

export interface DiffRunOutput {
  results: DiffSectionResult[];
  diagnostics: ParseDiagnostics;
}

export interface SingleSpecParseOutput {
  fileName: string;
  pageCount: number;
  sections: CsiSection[];
  strippedPatterns: StrippedPattern[];
  strippedLineCount?: number;
  parseTimeMs: number;
  scannedWarning: boolean;
  scannedPages?: number[];
  isMostlyScanned?: boolean;
  outlineHintsUsed?: number;
  appliedNoiseConfig?: NoiseFilterConfig;
}

export interface WorkerProgress {
  stage: 'loading' | 'extracting' | 'stripping' | 'chunking' | 'diffing' | 'complete';
  percent: number;
  detail: string;
}

export interface ScopeBriefBullet {
  sectionCode: string;
  impactCategory: string;
  headline: string;
  detail: string;
}

export interface ScopeBriefResponse {
  executiveSummary: string;
  bullets: ScopeBriefBullet[];
  sectionsSentCount?: number;
  totalChangedSections?: number;
}
