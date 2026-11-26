import type { NoiseFilterConfig, StrippedPattern } from '../types/spec';

export interface RawPageLine {
  page: number;
  yPct: number;
  text: string;
}

export function normalizeForNoisePattern(line: string): string {
  return line
    .trim()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isStandalonePageNumber(line: string): boolean {
  const t = line.trim();
  return (
    /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(t) ||
    /^\d{2}\s*\d{2}\s*\d{2}\s*[-–—]\s*\d{1,4}$/.test(t)
  );
}

/**
 * Strictly matches short, non-sentence section-scoped running headers/footers
 * containing a CSI MasterFormat code or SECTION/DIVISION prefix paired with a page indicator
 * (e.g., "CAST-IN-PLACE CONCRETE 033000 - 5", "08 71 00 - DOOR HARDWARE - Page 4 of 12",
 * "SECTION 26 24 13 - PAGE 2", "DIVISION 03 - 14").
 * Rejects prose sentences (e.g., "Warranty period shall be 5 years. See page 12") so body
 * specification text in lower page margins is never silently dropped.
 */
export function isSectionPageStamp(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 96) return false;
  const wordCount = t.split(/\s+/).filter((w) => !/^[-–—|•]+$/.test(w)).length;
  if (wordCount > 15) return false;

  // Reject prose sentences (semicolons, question/exclamation marks, or sentence periods)
  if (/[;?!]/.test(t)) return false;
  if (/[a-z]\.\s+[A-Za-z]/.test(t) || /\.$/.test(t)) return false;
  if (/^(?:refer\s+to|see|per|comply|pursuant|under|in\s+accordance|submit|provide|for\s+more|note)\b/i.test(t)) {
    return false;
  }

  // Pattern A: <Title or SECTION> <CSI Code> - [Page] <Num> [Page X of Y] (e.g. "Cast-in-Place Concrete 033000 - 5 Page 12 of 303")
  const titleThenCsiPage =
    /^(?:SECTION\s+)?[A-Z0-9][A-Z0-9\s,&/()-]{1,55}?\s+\d{2}\s*\d{2}\s*\d{2}(?:\.\d{2})?\s*(?:[-–—|•]\s*|\s+)(?:PAGE\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?(?:\s*(?:[-–—|•]\s*|\s+)PAGE\s+\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?)?$/i;
  if (titleThenCsiPage.test(t)) return true;

  // Pattern B: [SECTION] <CSI Code> [Title] - [Page] <Num> [Page X of Y] (e.g. "08 71 00 - DOOR HARDWARE - Page 4 of 12")
  const csiThenPage =
    /^(?:SECTION\s+)?\d{2}\s*\d{2}\s*\d{2}(?:\.\d{2})?(?:\s*[-–—:]\s*[A-Za-z0-9\s,&/()-]{2,48})?\s*(?:[-–—|•]\s*|\s+)(?:PAGE\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?(?:\s*(?:[-–—|•]\s*|\s+)PAGE\s+\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?)?$/i;
  if (csiThenPage.test(t)) return true;

  // Pattern C: Division / Addendum stamp with explicit page number
  const divPage =
    /^(?:DIVISION\s+\d{1,2}|ADDENDUM\s+(?:NO\.?\s*)?\d+)\b.{0,45}?(?:[-–—|•]\s*|\s+)(?:PAGE\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
  if (divPage.test(t)) return true;

  return false;
}

export function stripHeadersAndFooters(
  lines: RawPageLine[],
  pageCount: number,
  noiseConfig: NoiseFilterConfig
): { cleanLines: RawPageLine[]; strippedPatterns: StrippedPattern[]; strippedLineCount: number } {
  const topThreshold = noiseConfig.edgeMarginPct;
  const bottomThreshold = 1 - noiseConfig.edgeMarginPct;
  const minRecurrence = noiseConfig.minRecurrencePct;

  const patternMap = new Map<
    string,
    { pages: Set<number>; sample: string; zone: 'header' | 'footer'; isStamp: boolean }
  >();

  for (const line of lines) {
    const zone =
      line.yPct <= topThreshold ? 'header' : line.yPct >= bottomThreshold ? 'footer' : null;
    if (!zone) continue;

    const norm = normalizeForNoisePattern(line.text);
    if (!norm) continue;

    const isStamp = isStandalonePageNumber(line.text) || isSectionPageStamp(line.text);
    const entry = patternMap.get(norm);
    if (entry) {
      entry.pages.add(line.page);
      if (isStamp) entry.isStamp = true;
    } else {
      patternMap.set(norm, {
        pages: new Set([line.page]),
        sample: line.text,
        zone,
        isStamp,
      });
    }
  }

  const noiseSet = new Set<string>();
  const strippedPatterns: StrippedPattern[] = [];

  for (const [pattern, info] of patternMap.entries()) {
    const freqPct = Math.round((info.pages.size / Math.max(1, pageCount)) * 100);
    const thresholdMet = pageCount >= 3 ? info.pages.size / pageCount > minRecurrence : false;
    if (thresholdMet || info.isStamp) {
      noiseSet.add(pattern);
      strippedPatterns.push({
        pattern,
        sample: info.sample,
        frequencyPct: freqPct,
        pageHits: info.pages.size,
        totalPages: pageCount,
        zone: info.zone,
      });
    }
  }

  const cleanLines = lines.filter((line) => {
    const inEdgeZone = line.yPct <= topThreshold || line.yPct >= bottomThreshold;
    if (inEdgeZone) {
      const norm = normalizeForNoisePattern(line.text);
      if (
        noiseSet.has(norm) ||
        isStandalonePageNumber(line.text) ||
        isSectionPageStamp(line.text)
      ) {
        return false;
      }
    }
    return true;
  });

  strippedPatterns.sort((a, b) => b.frequencyPct - a.frequencyPct || b.pageHits - a.pageHits);
  return {
    cleanLines,
    strippedPatterns,
    strippedLineCount: lines.length - cleanLines.length,
  };
}
