import DiffMatchPatch from 'diff-match-patch';
import {
  computeSectionRiskMetrics,
  detectDeltaRiskFlags,
  detectRiskFlags,
  extractContextRiskMatch,
  extractParagraphDeltaChips,
  findRiskMatchInToken,
  getDivisionTitle,
} from './csiDictionary';
import {
  buildPatchedParagraphText,
  findMatchingBaselineParagraphIndex,
  parseNarrativeAddendumDirectives,
  type NarrativeDirective,
} from './narrativeAddendumParser';
import type {
  ChangedParagraph,
  ComparisonMode,
  CsiSection,
  DiffRunOutput,
  DiffSectionResult,
  ResolvedComparisonMode,
  SingleSpecParseOutput,
  WordDiffToken,
} from '../types/spec';

function normalizeSubstantiveKey(text: string): string {
  let out = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // Fold thousands commas inside numbers ("4,000" -> "4000")
  let prev: string;
  do {
    prev = out;
    out = out.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');
  } while (out !== prev);
  return out.toLowerCase();
}

export function computeWordDiff(oldText: string, newText: string): {
  tokens: WordDiffToken[];
  addedWords: number;
  deletedWords: number;
} {
  const dmp = new DiffMatchPatch();
  const wordArray: string[] = [];
  const wordToChar = new Map<string, string>();
  let nextCharCode = 0x100;

  const tokenizeToChars = (text: string): string => {
    const parts = text.match(/(\S+|\s+)/g) ?? [];
    let encoded = '';
    for (const part of parts) {
      let ch = wordToChar.get(part);
      if (!ch) {
        ch = String.fromCharCode(nextCharCode++);
        wordToChar.set(part, ch);
        wordArray.push(part);
      }
      encoded += ch;
    }
    return encoded;
  };

  const chars1 = tokenizeToChars(oldText);
  const chars2 = tokenizeToChars(newText);
  const rawDiffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_cleanupSemantic(rawDiffs);

  // Build raw token list and fold formatting-only (-1, +1) pairs (case or number commas like 4000 vs 4,000)
  const rawTokens: WordDiffToken[] = [];
  for (const [op, encoded] of rawDiffs) {
    let chunkText = '';
    for (let i = 0; i < encoded.length; i++) {
      const idx = encoded.charCodeAt(i) - 0x100;
      chunkText += wordArray[idx] ?? '';
    }
    if (!chunkText) continue;
    rawTokens.push({ op: op as -1 | 0 | 1, text: chunkText });
  }

  const tokens: WordDiffToken[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const curr = rawTokens[i];
    const next = rawTokens[i + 1];
    if (
      curr.op === -1 &&
      next &&
      next.op === 1 &&
      normalizeSubstantiveKey(curr.text) === normalizeSubstantiveKey(next.text)
    ) {
      tokens.push({ op: 0, text: next.text });
      i++;
      continue;
    }
    tokens.push(curr);
  }

  let addedWords = 0;
  let deletedWords = 0;
  for (const tok of tokens) {
    const wordCount = (tok.text.match(/\S+/g) ?? []).length;
    if (tok.op === 1) addedWords += wordCount;
    if (tok.op === -1) deletedWords += wordCount;
  }

  // Second pass: sliding context window around changed tokens so "3,000" + " psi" highlights properly
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.op === 0 || !tok.text.trim()) continue;

    let prevCtx = '';
    for (let p = i - 1; p >= 0 && prevCtx.length < 32; p--) {
      if (tokens[p].op === 0 || tokens[p].op === tok.op) {
        prevCtx = tokens[p].text + prevCtx;
      }
    }
    if (prevCtx.length > 32) prevCtx = prevCtx.slice(-32);

    let nextCtx = '';
    for (let n = i + 1; n < tokens.length && nextCtx.length < 32; n++) {
      if (tokens[n].op === 0 || tokens[n].op === tok.op) {
        nextCtx += tokens[n].text;
      }
    }
    if (nextCtx.length > 32) nextCtx = nextCtx.slice(0, 32);

    tok.riskMatch = extractContextRiskMatch(prevCtx, tok.text, nextCtx);
  }

  return { tokens, addedWords, deletedWords };
}

function paragraphWordSimilarity(a: string, b: string): number {
  const normA = normalizeSubstantiveKey(a)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const normB = normalizeSubstantiveKey(b)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (normA.length === 0 || normB.length === 0) return 0;

  const setA = new Set(normA);
  const setB = new Set(normB);
  let overlap = 0;
  for (const w of setA) {
    if (setB.has(w)) overlap++;
  }
  const jaccard = overlap / (setA.size + setB.size - overlap);
  const containment = overlap / Math.min(setA.size, setB.size);
  return Math.max(jaccard, containment * 0.85);
}

function pairChangedParagraphsBySimilarity(
  oldItems: Array<{ raw: string; key: string }>,
  newItems: Array<{ raw: string; key: string }>
): Array<{ oldText: string; newText: string }> {
  const usedNew = new Set<number>();
  const paired: Array<{ oldText: string; newText: string; newIdx: number | null }> = [];

  for (let i = 0; i < oldItems.length; i++) {
    const oldItem = oldItems[i];
    let bestIdx = -1;
    let bestScore = 0;

    for (let j = 0; j < newItems.length; j++) {
      if (usedNew.has(j)) continue;
      const score = paragraphWordSimilarity(oldItem.key, newItems[j].key);
      if (score >= 0.45 && score > bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      usedNew.add(bestIdx);
      paired.push({ oldText: oldItem.raw, newText: newItems[bestIdx].raw, newIdx: bestIdx });
    } else {
      paired.push({ oldText: oldItem.raw, newText: '', newIdx: null });
    }
  }

  const output: Array<{ oldText: string; newText: string }> = [];
  let nextNewToEmit = 0;

  for (const item of paired) {
    if (item.newIdx !== null) {
      while (nextNewToEmit < item.newIdx) {
        if (!usedNew.has(nextNewToEmit)) {
          output.push({ oldText: '', newText: newItems[nextNewToEmit].raw });
        }
        nextNewToEmit++;
      }
      if (nextNewToEmit === item.newIdx) nextNewToEmit++;
    }
    output.push({ oldText: item.oldText, newText: item.newText });
  }

  while (nextNewToEmit < newItems.length) {
    if (!usedNew.has(nextNewToEmit)) {
      output.push({ oldText: '', newText: newItems[nextNewToEmit].raw });
    }
    nextNewToEmit++;
  }

  return output;
}

function diffSectionParagraphs(oldParas: string[], newParas: string[]): {
  changedParagraphs: ChangedParagraph[];
  addedWords: number;
  deletedWords: number;
} {
  const dmp = new DiffMatchPatch();
  const lineArray: Array<{ raw: string; key: string }> = [];
  const keyToChar = new Map<string, string>();
  let codePoint = 0x100;

  const encodeParagraphs = (paras: string[]): { encoded: string; items: Array<{ raw: string; key: string }> } => {
    let encoded = '';
    const items: Array<{ raw: string; key: string }> = [];
    for (const p of paras) {
      const raw = p.replace(/\s+/g, ' ').trim();
      const key = normalizeSubstantiveKey(raw);
      let ch = keyToChar.get(key);
      if (!ch) {
        ch = String.fromCharCode(codePoint++);
        keyToChar.set(key, ch);
        lineArray.push({ raw, key });
      }
      items.push({ raw, key });
      encoded += ch;
    }
    return { encoded, items };
  };

  const enc1 = encodeParagraphs(oldParas);
  const enc2 = encodeParagraphs(newParas);
  const paraDiffs = dmp.diff_main(enc1.encoded, enc2.encoded, false);

  const changedParagraphs: ChangedParagraph[] = [];
  let totalAdded = 0;
  let totalDeleted = 0;

  let oldCursor = 0;
  let newCursor = 0;
  for (let i = 0; i < paraDiffs.length; i++) {
    const [op, data] = paraDiffs[i];
    const len = data.length;

    if (op === 0) {
      oldCursor += len;
      newCursor += len;
      continue;
    }

    if (op === -1 && i + 1 < paraDiffs.length && paraDiffs[i + 1][0] === 1) {
      const nextLen = paraDiffs[i + 1][1].length;
      const oldItems = enc1.items.slice(oldCursor, oldCursor + len);
      const nextItems = enc2.items.slice(newCursor, newCursor + nextLen);

      const simPairs = pairChangedParagraphsBySimilarity(oldItems, nextItems);
      let newOffset = 0;

      for (const pair of simPairs) {
        const oldT = pair.oldText;
        const newT = pair.newText;
        if (normalizeSubstantiveKey(oldT) === normalizeSubstantiveKey(newT)) {
          if (newT) newOffset++;
          continue;
        }
        const { tokens, addedWords, deletedWords } = computeWordDiff(oldT, newT);
        totalAdded += addedWords;
        totalDeleted += deletedWords;
        const riskFlags = detectDeltaRiskFlags(tokens, oldT, newT);
        const deltaChips = extractParagraphDeltaChips(oldT, newT);
        const ctxIdx = Math.min(Math.max(0, newCursor + newOffset), Math.max(0, newParas.length - 1));
        changedParagraphs.push({
          paragraphIndex: newCursor + newOffset,
          oldText: oldT,
          newText: newT,
          contextBefore: newT ? newParas[Math.max(0, ctxIdx - 1)] ?? '' : newParas[Math.max(0, newCursor - 1)] ?? '',
          contextAfter: newT ? newParas[ctxIdx + 1] ?? '' : newParas[newCursor] ?? '',
          tokens,
          riskFlags,
          deltaChips,
        });
        if (newT) newOffset++;
      }

      oldCursor += len;
      newCursor += nextLen;
      i++;
      continue;
    }

    if (op === -1) {
      const oldItems = enc1.items.slice(oldCursor, oldCursor + len);
      for (let m = 0; m < oldItems.length; m++) {
        const oldT = oldItems[m].raw;
        const { tokens, deletedWords } = computeWordDiff(oldT, '');
        totalDeleted += deletedWords;
        changedParagraphs.push({
          paragraphIndex: newCursor,
          oldText: oldT,
          newText: '',
          contextBefore: newParas[Math.max(0, newCursor - 1)] ?? '',
          contextAfter: newParas[newCursor] ?? '',
          tokens,
          riskFlags: detectRiskFlags(oldT),
          deltaChips: [],
        });
      }
      oldCursor += len;
    } else if (op === 1) {
      const newItems = enc2.items.slice(newCursor, newCursor + len);
      for (let m = 0; m < newItems.length; m++) {
        const newT = newItems[m].raw;
        const { tokens, addedWords } = computeWordDiff('', newT);
        totalAdded += addedWords;
        changedParagraphs.push({
          paragraphIndex: newCursor + m,
          oldText: '',
          newText: newT,
          contextBefore: newParas[Math.max(0, newCursor + m - 1)] ?? '',
          contextAfter: newParas[newCursor + m + 1] ?? '',
          tokens,
          riskFlags: detectRiskFlags(newT),
          deltaChips: [],
        });
      }
      newCursor += len;
    }
  }

  return { changedParagraphs, addedWords: totalAdded, deletedWords: totalDeleted };
}

function normalizeTitleForMatch(title: string): string {
  return title
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areTitlesEquivalent(oldSec: CsiSection, newSec: CsiSection): boolean {
  const normA = normalizeTitleForMatch(oldSec.title);
  const normB = normalizeTitleForMatch(newSec.title);
  if (
    !normA ||
    !normB ||
    normA.length < 5 ||
    normA === 'UNTITLED SECTION' ||
    normA === 'PROJECT MANUAL FRONT MATTER' ||
    normA === 'UNCATEGORIZED SPECIFICATION DOCUMENT'
  ) {
    return false;
  }
  if (normA === normB) return true;

  if (oldSec.division === newSec.division) {
    const wordsA = new Set(normA.split(' ').filter((w) => w.length > 1));
    const wordsB = new Set(normB.split(' ').filter((w) => w.length > 1));
    if (wordsA.size >= 2 && wordsB.size >= 2) {
      let overlap = 0;
      for (const w of wordsA) {
        if (wordsB.has(w)) overlap++;
      }
      const union = wordsA.size + wordsB.size - overlap;
      if (union > 0 && overlap / union >= 0.8) return true;
    }
  }
  return false;
}

function buildPairedSectionResult(
  oldSec: CsiSection,
  newSec: CsiSection,
  renumberedFrom?: string
): DiffSectionResult {
  const division = newSec.division;
  const divisionTitle = getDivisionTitle(division);
  const spacingNormalized =
    !renumberedFrom &&
    oldSec.rawCode.replace(/^SECTION\s+/i, '').trim() !==
      newSec.rawCode.replace(/^SECTION\s+/i, '').trim();

  const { changedParagraphs, addedWords, deletedWords } = diffSectionParagraphs(
    oldSec.paragraphs,
    newSec.paragraphs
  );

  const status = changedParagraphs.length === 0 ? 'unchanged' : 'modified';
  const riskFlags = Array.from(new Set(changedParagraphs.flatMap((p) => p.riskFlags)));
  const { riskSeverity, riskScore } = computeSectionRiskMetrics(riskFlags);

  let fullTokens: WordDiffToken[] | undefined;
  if (status === 'modified' && oldSec.text.length + newSec.text.length <= 80000) {
    fullTokens = computeWordDiff(oldSec.text, newSec.text).tokens;
  }

  return {
    sectionCode: newSec.normalizedCode,
    oldRawCode: oldSec.rawCode,
    newRawCode: newSec.rawCode,
    division,
    divisionTitle,
    title: newSec.title !== 'Untitled Section' ? newSec.title : oldSec.title,
    status,
    oldPageRange:
      oldSec.startPage === oldSec.endPage
        ? `${oldSec.startPage}`
        : `${oldSec.startPage}–${oldSec.endPage}`,
    newPageRange:
      newSec.startPage === newSec.endPage
        ? `${newSec.startPage}`
        : `${newSec.startPage}–${newSec.endPage}`,
    changedParagraphs,
    fullTokens,
    fullOldText: oldSec.text,
    fullNewText: newSec.text,
    riskFlags,
    riskSeverity,
    riskScore,
    addedWords,
    deletedWords,
    spacingNormalized,
    renumberedFrom,
  };
}

function buildDeletedSectionResult(oldSec: CsiSection): DiffSectionResult {
  const division = oldSec.division;
  const divisionTitle = getDivisionTitle(division);
  const deletedWords = (oldSec.text.match(/\S+/g) ?? []).length;
  const riskFlags = detectRiskFlags(oldSec.text);
  const { riskSeverity, riskScore } = computeSectionRiskMetrics(riskFlags);
  const tokens: WordDiffToken[] = [
    { op: -1, text: oldSec.text, riskMatch: findRiskMatchInToken(oldSec.text) },
  ];
  return {
    sectionCode: oldSec.normalizedCode,
    oldRawCode: oldSec.rawCode,
    newRawCode: null,
    division,
    divisionTitle,
    title: oldSec.title,
    status: 'deleted',
    oldPageRange: `${oldSec.startPage}–${oldSec.endPage}`,
    newPageRange: '—',
    changedParagraphs: oldSec.paragraphs.map((p, idx) => ({
      paragraphIndex: idx,
      oldText: p,
      newText: '',
      contextBefore: '',
      contextAfter: '',
      tokens: [{ op: -1, text: p, riskMatch: findRiskMatchInToken(p) }],
      riskFlags: detectRiskFlags(p),
      deltaChips: [],
    })),
    fullTokens: tokens,
    fullOldText: oldSec.text,
    fullNewText: '',
    riskFlags,
    riskSeverity,
    riskScore,
    addedWords: 0,
    deletedWords,
    spacingNormalized: false,
  };
}

function buildNotReissuedSectionResult(oldSec: CsiSection): DiffSectionResult {
  return {
    sectionCode: oldSec.normalizedCode,
    oldRawCode: oldSec.rawCode,
    newRawCode: null,
    division: oldSec.division,
    divisionTitle: getDivisionTitle(oldSec.division),
    title: oldSec.title,
    status: 'not-reissued',
    oldPageRange:
      oldSec.startPage === oldSec.endPage
        ? `${oldSec.startPage}`
        : `${oldSec.startPage}–${oldSec.endPage}`,
    newPageRange: 'Not reissued',
    changedParagraphs: [],
    fullOldText: oldSec.text,
    fullNewText: oldSec.text,
    riskFlags: [],
    riskScore: 0,
    addedWords: 0,
    deletedWords: 0,
    spacingNormalized: false,
  };
}

function buildNarrativePatchedSectionResult(
  oldSec: CsiSection,
  directives: NarrativeDirective[],
  addendumFileLabel: string
): DiffSectionResult {
  if (directives.some((d) => d.action === 'delete-section')) {
    const deleted = buildDeletedSectionResult(oldSec);
    deleted.narrativeApplied = true;
    deleted.narrativeItemRefs = directives.map((d) => d.itemLabel);
    return deleted;
  }

  const changedParagraphs: ChangedParagraph[] = [];
  let addedWords = 0;
  let deletedWords = 0;

  for (const dir of directives) {
    const matchIdx = findMatchingBaselineParagraphIndex(oldSec.paragraphs, dir);
    const oldPara = matchIdx >= 0 ? oldSec.paragraphs[matchIdx] : null;
    const { oldText, newText } = buildPatchedParagraphText(oldPara, dir);
    const diff = computeWordDiff(oldText, newText);
    addedWords += diff.addedWords;
    deletedWords += diff.deletedWords;
    const riskFlags = detectDeltaRiskFlags(diff.tokens, oldText, newText);
    const deltaChips = extractParagraphDeltaChips(oldText, newText);

    changedParagraphs.push({
      paragraphIndex: matchIdx >= 0 ? matchIdx : changedParagraphs.length,
      oldText,
      newText,
      contextBefore: matchIdx > 0 ? oldSec.paragraphs[matchIdx - 1] ?? '' : '',
      contextAfter:
        matchIdx >= 0 && matchIdx + 1 < oldSec.paragraphs.length
          ? oldSec.paragraphs[matchIdx + 1] ?? ''
          : '',
      tokens: diff.tokens,
      riskFlags,
      deltaChips,
      narrativeSource: `${dir.itemLabel}${dir.paragraphRef ? ` · ${dir.paragraphRef}` : ''}`,
    });
  }

  const riskFlags = Array.from(new Set(changedParagraphs.flatMap((p) => p.riskFlags)));
  const { riskSeverity, riskScore } = computeSectionRiskMetrics(riskFlags);

  return {
    sectionCode: oldSec.normalizedCode,
    oldRawCode: oldSec.rawCode,
    newRawCode: `Narrative (${directives.map((d) => d.itemLabel).join(', ')})`,
    division: oldSec.division,
    divisionTitle: getDivisionTitle(oldSec.division),
    title: oldSec.title,
    status: 'modified',
    oldPageRange:
      oldSec.startPage === oldSec.endPage
        ? `${oldSec.startPage}`
        : `${oldSec.startPage}–${oldSec.endPage}`,
    newPageRange: addendumFileLabel,
    changedParagraphs,
    fullOldText: oldSec.text,
    fullNewText: changedParagraphs.map((p) => p.newText).join('\n\n'),
    riskFlags,
    riskSeverity,
    riskScore,
    addedWords,
    deletedWords,
    spacingNormalized: false,
    narrativeApplied: true,
    narrativeItemRefs: directives.map((d) => d.itemLabel),
  };
}

export function computeSpecContentHash(sections: CsiSection[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + ((i & 0xff) << 3);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
  };
  for (const sec of sections) {
    feed(sec.normalizedCode);
    feed('|');
    feed(sec.title);
    feed('|');
    feed(sec.text);
    feed('\n');
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export interface CompareOptions {
  mode?: ComparisonMode;
}

export function compareParsedBooks(
  oldBook: SingleSpecParseOutput,
  newBook: SingleSpecParseOutput,
  options?: CompareOptions
): DiffRunOutput {
  const diffStart = performance.now();
  const requestedMode: ComparisonMode = options?.mode ?? 'auto';

  const oldContentHash = computeSpecContentHash(oldBook.sections);
  const newContentHash = computeSpecContentHash(newBook.sections);
  const oldMostlyScanned = Boolean(oldBook.isMostlyScanned);
  const newMostlyScanned = Boolean(newBook.isMostlyScanned);

  if (oldMostlyScanned || newMostlyScanned) {
    return {
      results: [],
      diagnostics: {
        oldFileName: oldBook.fileName,
        newFileName: newBook.fileName,
        oldPageCount: oldBook.pageCount,
        newPageCount: newBook.pageCount,
        oldSectionCount: oldBook.sections.length,
        newSectionCount: newBook.sections.length,
        oldStrippedPatterns: oldBook.strippedPatterns,
        newStrippedPatterns: newBook.strippedPatterns,
        oldStrippedLineCount: oldBook.strippedLineCount ?? 0,
        newStrippedLineCount: newBook.strippedLineCount ?? 0,
        oldContentHash,
        newContentHash,
        parseTimeMs: Math.max(oldBook.parseTimeMs, newBook.parseTimeMs),
        scannedWarning: true,
        oldScannedPages: oldBook.scannedPages ?? [],
        newScannedPages: newBook.scannedPages ?? [],
        oldMostlyScanned,
        newMostlyScanned,
        outlineHintsUsed: (oldBook.outlineHintsUsed ?? 0) + (newBook.outlineHintsUsed ?? 0),
        appliedNoiseConfig: newBook.appliedNoiseConfig ?? oldBook.appliedNoiseConfig,
        renumberedCount: 0,
        requestedMode,
      },
    };
  }

  const oldMap = new Map<string, CsiSection>();
  for (const sec of oldBook.sections) oldMap.set(sec.normalizedCode, sec);

  const newMap = new Map<string, CsiSection>();
  for (const sec of newBook.sections) newMap.set(sec.normalizedCode, sec);

  const isFrontOrUncat = (code: string) => code === '00 01 00' || code === '00 00 00';
  const oldBodyCount = oldBook.sections.filter((s) => !isFrontOrUncat(s.normalizedCode)).length;
  const newBodySections = newBook.sections.filter((s) => !isFrontOrUncat(s.normalizedCode));
  const newBodyCount = newBodySections.length;

  let matchedBodyCount = 0;
  for (const oldSec of oldBook.sections) {
    if (!isFrontOrUncat(oldSec.normalizedCode) && newMap.has(oldSec.normalizedCode)) {
      matchedBodyCount++;
    }
  }

  const narrativeDirectives = parseNarrativeAddendumDirectives(newBook.sections);
  const directivesByCode = new Map<string, NarrativeDirective[]>();
  for (const dir of narrativeDirectives) {
    const list = directivesByCode.get(dir.targetSectionCode) ?? [];
    list.push(dir);
    directivesByCode.set(dir.targetSectionCode, list);
  }

  const frontMatterNewText = newBook.sections
    .filter((s) => isFrontOrUncat(s.normalizedCode))
    .map((s) => s.text)
    .join(' ');
  const hasExplicitAddendumCue = /\b(?:addendum|partial|narrative|reissu)/i.test(
    `${newBook.fileName} ${frontMatterNewText.slice(0, 600)}`
  );

  let resolvedMode: ResolvedComparisonMode = 'conformed';
  if (requestedMode === 'conformed') {
    resolvedMode = 'conformed';
  } else if (requestedMode === 'partial') {
    resolvedMode =
      narrativeDirectives.length > 0 && newBodyCount === 0
        ? 'narrative-addendum'
        : 'partial-reissue';
  } else {
    // Auto-detect partial or narrative addendum
    if (
      narrativeDirectives.length > 0 &&
      (newBodyCount <= Math.floor(oldBodyCount * 0.5) ||
        matchedBodyCount <= Math.floor(oldBodyCount * 0.5))
    ) {
      resolvedMode = 'narrative-addendum';
    } else if (
      oldBodyCount >= 2 &&
      newBodyCount > 0 &&
      newBodyCount < oldBodyCount &&
      matchedBodyCount < oldBodyCount &&
      (newBodyCount <= Math.floor(oldBodyCount * 0.5) ||
        (newBodyCount <= Math.floor(oldBodyCount * 0.75) &&
          oldBodyCount - matchedBodyCount >= 2 &&
          hasExplicitAddendumCue))
    ) {
      resolvedMode = 'partial-reissue';
    }
  }

  const isPartialOrNarrative = resolvedMode !== 'conformed';

  const results: DiffSectionResult[] = [];
  const unmatchedOld: CsiSection[] = [];
  const unmatchedNew: CsiSection[] = [];

  // Pass 1: Exact normalized CSI code matches
  for (const [code, oldSec] of oldMap.entries()) {
    const newSec = newMap.get(code);
    if (newSec) {
      // If both books only matched 00 01 00 Front Matter in a narrative addendum, skip emitting Front Matter noise if narrative directives handled sections
      if (
        resolvedMode === 'narrative-addendum' &&
        isFrontOrUncat(code) &&
        narrativeDirectives.length > 0
      ) {
        continue;
      }
      results.push(buildPairedSectionResult(oldSec, newSec));
    } else {
      unmatchedOld.push(oldSec);
    }
  }
  for (const [code, newSec] of newMap.entries()) {
    if (!oldMap.has(code)) {
      // In narrative-addendum mode, don't emit the raw 00 01 00 / 00 00 00 directive sheet as an "Added Section"
      if (
        isPartialOrNarrative &&
        isFrontOrUncat(code) &&
        narrativeDirectives.length > 0
      ) {
        continue;
      }
      unmatchedNew.push(newSec);
    }
  }

  // Pass 2: Match renumbered or relocated sections by normalized title & division similarity
  const matchedOldCodes = new Set<string>();
  const matchedNewCodes = new Set<string>();
  let renumberedCount = 0;

  for (const oldSec of unmatchedOld) {
    const candidate = unmatchedNew.find(
      (n) => !matchedNewCodes.has(n.normalizedCode) && areTitlesEquivalent(oldSec, n)
    );
    if (candidate) {
      matchedOldCodes.add(oldSec.normalizedCode);
      matchedNewCodes.add(candidate.normalizedCode);
      renumberedCount++;
      results.push(buildPairedSectionResult(oldSec, candidate, oldSec.normalizedCode));
    }
  }

  // Pass 3: Remaining truly added sections
  for (const newSec of unmatchedNew) {
    if (matchedNewCodes.has(newSec.normalizedCode)) continue;
    const division = newSec.division;
    const divisionTitle = getDivisionTitle(division);
    const addedWords = (newSec.text.match(/\S+/g) ?? []).length;
    const riskFlags = detectRiskFlags(newSec.text);
    const { riskSeverity, riskScore } = computeSectionRiskMetrics(riskFlags);
    const tokens: WordDiffToken[] = [
      { op: 1, text: newSec.text, riskMatch: findRiskMatchInToken(newSec.text) },
    ];
    results.push({
      sectionCode: newSec.normalizedCode,
      oldRawCode: null,
      newRawCode: newSec.rawCode,
      division,
      divisionTitle,
      title: newSec.title,
      status: 'added',
      oldPageRange: '—',
      newPageRange: `${newSec.startPage}–${newSec.endPage}`,
      changedParagraphs: newSec.paragraphs.map((p, idx) => ({
        paragraphIndex: idx,
        oldText: '',
        newText: p,
        contextBefore: '',
        contextAfter: '',
        tokens: [{ op: 1, text: p, riskMatch: findRiskMatchInToken(p) }],
        riskFlags: detectRiskFlags(p),
        deltaChips: [],
      })),
      fullTokens: tokens,
      fullOldText: '',
      fullNewText: newSec.text,
      riskFlags,
      riskSeverity,
      riskScore,
      addedWords,
      deletedWords: 0,
      spacingNormalized: false,
    });
  }

  // Pass 4: Unmatched baseline sections — apply narrative directives, mark not-reissued (partial), or deleted (conformed)
  let notReissuedCount = 0;
  let narrativeMatchedSectionCount = 0;
  const matchedDirectiveTargets = new Set<string>();

  for (const oldSec of unmatchedOld) {
    if (matchedOldCodes.has(oldSec.normalizedCode)) continue;

    const dirs = directivesByCode.get(oldSec.normalizedCode);
    if (isPartialOrNarrative && dirs && dirs.length > 0) {
      matchedDirectiveTargets.add(oldSec.normalizedCode);
      narrativeMatchedSectionCount++;
      results.push(
        buildNarrativePatchedSectionResult(oldSec, dirs, `Narrative (${newBook.fileName})`)
      );
      continue;
    }

    if (isPartialOrNarrative) {
      notReissuedCount++;
      results.push(buildNotReissuedSectionResult(oldSec));
      continue;
    }

    results.push(buildDeletedSectionResult(oldSec));
  }

  const narrativeUnmatchedDirectives = narrativeDirectives
    .filter((d) => !matchedDirectiveTargets.has(d.targetSectionCode) && !newMap.has(d.targetSectionCode))
    .map((d) => `${d.itemLabel}: Section ${d.targetSectionCode} — ${d.rawInstruction}`);

  results.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

  const diffElapsedMs = Math.round(performance.now() - diffStart);
  const totalParseMs = Math.max(oldBook.parseTimeMs, newBook.parseTimeMs) + diffElapsedMs;

  const oldOutlineBookmarkCount = oldBook.outlineBookmarkCount ?? 0;
  const newOutlineBookmarkCount = newBook.outlineBookmarkCount ?? 0;
  const bookmarkAsymmetryWarning =
    (oldOutlineBookmarkCount > 0) !== (newOutlineBookmarkCount > 0);

  return {
    results,
    diagnostics: {
      oldFileName: oldBook.fileName,
      newFileName: newBook.fileName,
      oldPageCount: oldBook.pageCount,
      newPageCount: newBook.pageCount,
      oldSectionCount: oldBook.sections.length,
      newSectionCount: newBook.sections.length,
      oldStrippedPatterns: oldBook.strippedPatterns,
      newStrippedPatterns: newBook.strippedPatterns,
      oldStrippedLineCount: oldBook.strippedLineCount ?? 0,
      newStrippedLineCount: newBook.strippedLineCount ?? 0,
      oldContentHash,
      newContentHash,
      parseTimeMs: totalParseMs,
      scannedWarning: oldBook.scannedWarning || newBook.scannedWarning,
      oldScannedPages: oldBook.scannedPages ?? [],
      newScannedPages: newBook.scannedPages ?? [],
      oldMostlyScanned: false,
      newMostlyScanned: false,
      outlineHintsUsed: (oldBook.outlineHintsUsed ?? 0) + (newBook.outlineHintsUsed ?? 0),
      oldOutlineBookmarkCount,
      newOutlineBookmarkCount,
      bookmarkAsymmetryWarning,
      appliedNoiseConfig: newBook.appliedNoiseConfig ?? oldBook.appliedNoiseConfig,
      renumberedCount,
      requestedMode,
      resolvedMode,
      notReissuedCount,
      narrativeDirectiveCount: narrativeDirectives.length,
      narrativeMatchedSectionCount,
      narrativeUnmatchedDirectives,
    },
  };
}
