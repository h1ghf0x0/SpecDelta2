import DiffMatchPatch from 'diff-match-patch';
import {
  detectDeltaRiskFlags,
  detectRiskFlags,
  extractContextRiskMatch,
  extractParagraphDeltaChips,
  findRiskMatchInToken,
  getDivisionTitle,
} from './csiDictionary';
import type {
  ChangedParagraph,
  CsiSection,
  DiffRunOutput,
  DiffSectionResult,
  SingleSpecParseOutput,
  WordDiffToken,
} from '../types/spec';

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

  const tokens: WordDiffToken[] = [];
  let addedWords = 0;
  let deletedWords = 0;

  for (const [op, encoded] of rawDiffs) {
    let chunkText = '';
    for (let i = 0; i < encoded.length; i++) {
      const idx = encoded.charCodeAt(i) - 0x100;
      chunkText += wordArray[idx] ?? '';
    }
    if (!chunkText) continue;

    const wordCount = (chunkText.match(/\S+/g) ?? []).length;
    if (op === 1) addedWords += wordCount;
    if (op === -1) deletedWords += wordCount;

    tokens.push({
      op: op as -1 | 0 | 1,
      text: chunkText,
    });
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
  const normA = a.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const normB = b.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
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
  oldItems: string[],
  newItems: string[]
): Array<{ oldText: string; newText: string }> {
  const usedNew = new Set<number>();
  const paired: Array<{ oldText: string; newText: string; newIdx: number | null }> = [];

  for (let i = 0; i < oldItems.length; i++) {
    const oldT = oldItems[i];
    let bestIdx = -1;
    let bestScore = 0;

    for (let j = 0; j < newItems.length; j++) {
      if (usedNew.has(j)) continue;
      const score = paragraphWordSimilarity(oldT, newItems[j]);
      if (score >= 0.45 && score > bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      usedNew.add(bestIdx);
      paired.push({ oldText: oldT, newText: newItems[bestIdx], newIdx: bestIdx });
    } else {
      paired.push({ oldText: oldT, newText: '', newIdx: null });
    }
  }

  // Insert unmatched pure additions in relative order
  const output: Array<{ oldText: string; newText: string }> = [];
  let nextNewToEmit = 0;

  for (const item of paired) {
    if (item.newIdx !== null) {
      while (nextNewToEmit < item.newIdx) {
        if (!usedNew.has(nextNewToEmit)) {
          output.push({ oldText: '', newText: newItems[nextNewToEmit] });
        }
        nextNewToEmit++;
      }
      if (nextNewToEmit === item.newIdx) nextNewToEmit++;
    }
    output.push({ oldText: item.oldText, newText: item.newText });
  }

  while (nextNewToEmit < newItems.length) {
    if (!usedNew.has(nextNewToEmit)) {
      output.push({ oldText: '', newText: newItems[nextNewToEmit] });
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
  const lineArray: string[] = [];
  const lineToChar = new Map<string, string>();
  let codePoint = 0x100;

  const encodeParagraphs = (paras: string[]): string => {
    let encoded = '';
    for (const p of paras) {
      const norm = p.replace(/\s+/g, ' ').trim();
      let ch = lineToChar.get(norm);
      if (!ch) {
        ch = String.fromCharCode(codePoint++);
        lineToChar.set(norm, ch);
        lineArray.push(norm);
      }
      encoded += ch;
    }
    return encoded;
  };

  const c1 = encodeParagraphs(oldParas);
  const c2 = encodeParagraphs(newParas);
  const paraDiffs = dmp.diff_main(c1, c2, false);

  const changedParagraphs: ChangedParagraph[] = [];
  let totalAdded = 0;
  let totalDeleted = 0;

  let newCursor = 0;
  for (let i = 0; i < paraDiffs.length; i++) {
    const [op, data] = paraDiffs[i];
    const items: string[] = [];
    for (let k = 0; k < data.length; k++) {
      items.push(lineArray[data.charCodeAt(k) - 0x100] ?? '');
    }

    if (op === 0) {
      newCursor += items.length;
      continue;
    }

    if (op === -1 && i + 1 < paraDiffs.length && paraDiffs[i + 1][0] === 1) {
      const nextData = paraDiffs[i + 1][1];
      const nextItems: string[] = [];
      for (let k = 0; k < nextData.length; k++) {
        nextItems.push(lineArray[nextData.charCodeAt(k) - 0x100] ?? '');
      }

      const simPairs = pairChangedParagraphsBySimilarity(items, nextItems);
      let newOffset = 0;

      for (const pair of simPairs) {
        const oldT = pair.oldText;
        const newT = pair.newText;
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

      newCursor += nextItems.length;
      i++;
      continue;
    }

    if (op === -1) {
      for (let m = 0; m < items.length; m++) {
        const oldT = items[m];
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
    } else if (op === 1) {
      for (let m = 0; m < items.length; m++) {
        const newT = items[m];
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
      newCursor += items.length;
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

function areTitlesEquivalent(
  oldSec: CsiSection,
  newSec: CsiSection
): boolean {
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
    addedWords,
    deletedWords,
    spacingNormalized,
    renumberedFrom,
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

export function compareParsedBooks(
  oldBook: SingleSpecParseOutput,
  newBook: SingleSpecParseOutput
): DiffRunOutput {
  const diffStart = performance.now();

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
      },
    };
  }

  const oldMap = new Map<string, CsiSection>();
  for (const sec of oldBook.sections) oldMap.set(sec.normalizedCode, sec);

  const newMap = new Map<string, CsiSection>();
  for (const sec of newBook.sections) newMap.set(sec.normalizedCode, sec);

  const results: DiffSectionResult[] = [];
  const unmatchedOld: CsiSection[] = [];
  const unmatchedNew: CsiSection[] = [];

  // Pass 1: Exact normalized CSI code matches
  for (const [code, oldSec] of oldMap.entries()) {
    const newSec = newMap.get(code);
    if (newSec) {
      results.push(buildPairedSectionResult(oldSec, newSec));
    } else {
      unmatchedOld.push(oldSec);
    }
  }
  for (const [code, newSec] of newMap.entries()) {
    if (!oldMap.has(code)) {
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

  // Pass 3: Remaining truly added or deleted sections
  for (const newSec of unmatchedNew) {
    if (matchedNewCodes.has(newSec.normalizedCode)) continue;
    const division = newSec.division;
    const divisionTitle = getDivisionTitle(division);
    const addedWords = (newSec.text.match(/\S+/g) ?? []).length;
    const riskFlags = detectRiskFlags(newSec.text);
    const tokens: WordDiffToken[] = [{ op: 1, text: newSec.text, riskMatch: findRiskMatchInToken(newSec.text) }];
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
      addedWords,
      deletedWords: 0,
      spacingNormalized: false,
    });
  }

  for (const oldSec of unmatchedOld) {
    if (matchedOldCodes.has(oldSec.normalizedCode)) continue;
    const division = oldSec.division;
    const divisionTitle = getDivisionTitle(division);
    const deletedWords = (oldSec.text.match(/\S+/g) ?? []).length;
    const riskFlags = detectRiskFlags(oldSec.text);
    const tokens: WordDiffToken[] = [{ op: -1, text: oldSec.text, riskMatch: findRiskMatchInToken(oldSec.text) }];
    results.push({
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
      addedWords: 0,
      deletedWords,
      spacingNormalized: false,
    });
  }

  results.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

  const diffElapsedMs = Math.round(performance.now() - diffStart);
  const totalParseMs = Math.max(oldBook.parseTimeMs, newBook.parseTimeMs) + diffElapsedMs;

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
      appliedNoiseConfig: newBook.appliedNoiseConfig ?? oldBook.appliedNoiseConfig,
      renumberedCount,
    },
  };
}
