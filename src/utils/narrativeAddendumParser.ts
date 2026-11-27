import { normalizeCsiCode } from './csiDictionary';
import type { CsiSection } from '../types/spec';

export type NarrativeAction =
  | 'delete-section'
  | 'replace'
  | 'delete-text'
  | 'add-text'
  | 'modify';

export interface NarrativeDirective {
  targetSectionCode: string;
  itemLabel: string;
  paragraphRef?: string;
  action: NarrativeAction;
  deleteText?: string;
  addText?: string;
  rawInstruction: string;
}

const CSI_CODE_INLINE_RE =
  /\b(?:SECTION|DOCUMENT)?\s*(\d{2}\s+\d{2}\s+\d{2}(?:\.\d{2})?|\d{2}\s+\d{4}(?:\.\d{2})?|\d{5,6}(?:\.\d{2})?)\b/i;

const NARRATIVE_CUE_RE =
  /\b(?:item\s*(?:no\.?|#)?\s*\d+|ad\d*[-_#]?\d+|addendum\b|paragraph\b|para\.?\b|article\b|delete\b|omit\b|remove\b|add\b|insert\b|replace\b|revise\b|change\b|modify\b|substitute\b|in\s+its\s+entirety)\b/i;

const PARA_REF_RE =
  /\b(?:paragraph|para\.?|article|art\.?|clause)?\s*(\d+\.\d+(?:\.[A-Za-z0-9]+)*|[A-Z]\.\d+(?:\.\d+)?)\b/i;

function unquote(s: string): string {
  return s.trim().replace(/^["'“‘]+|["'”’.;,]+$/g, '').trim();
}

function extractDeleteAddClauses(text: string): {
  action: NarrativeAction;
  deleteText?: string;
  addText?: string;
} {
  // 1. Delete entire section
  if (
    /\b(?:delete|omit|remove)\s+(?:section|document)?\s*\d{2}[\s\d.]+\s*(?:in\s+its\s+entirety|completely|entire\s+section)?\s*[.;]?$/i.test(
      text.trim()
    ) ||
    /\b(?:delete|omit|remove)\s+(?:this\s+)?section\s+in\s+its\s+entirety\b/i.test(text)
  ) {
    return { action: 'delete-section' };
  }

  // 2. "delete X, add Y" / "delete X and add Y" / "omit X; insert Y"
  const delAddMatch = text.match(
    /\b(?:delete|omit|remove)\s+(?:the\s+(?:phrase|words?|text)\s+)?(["'“][^"'”]+["'”]|[^,;]+?)\s*[,;]\s*(?:and\s+)?(?:add|insert|substitute)\s+(?:the\s+(?:phrase|words?|text)\s+)?(["'“][^"'”]+["'”]|.+?)\.?$/i
  );
  if (delAddMatch) {
    return {
      action: 'replace',
      deleteText: unquote(delAddMatch[1]),
      addText: unquote(delAddMatch[2]),
    };
  }

  // 3. "replace X with Y" / "change X to Y" / "revise X to Y"
  const replaceWithMatch = text.match(
    /\b(?:replace|change|revise|modify|substitute)\s+(?:from\s+)?(["'“][^"'”]+["'”]|.+?)\s+(?:with|to|for)\s+(["'“][^"'”]+["'”]|.+?)\.?$/i
  );
  if (replaceWithMatch) {
    return {
      action: 'replace',
      deleteText: unquote(replaceWithMatch[1]),
      addText: unquote(replaceWithMatch[2]),
    };
  }

  // 4. "add ..." / "insert ..."
  const addOnlyMatch = text.match(
    /\b(?:add|insert)\s+(?:new\s+(?:paragraph|clause|subparagraph|text)\s*[:\-]?\s*)?(["'“][^"'”]+["'”]|.+?)\.?$/i
  );
  if (addOnlyMatch && !/\bdelete\b/i.test(text)) {
    return {
      action: 'add-text',
      addText: unquote(addOnlyMatch[1]),
    };
  }

  // 5. "delete ..." / "omit ..."
  const delOnlyMatch = text.match(
    /\b(?:delete|omit|remove)\s+(?:paragraph\s+\S+\s*[:\-]?\s*)?(["'“][^"'”]+["'”]|.+?)\.?$/i
  );
  if (delOnlyMatch) {
    return {
      action: 'delete-text',
      deleteText: unquote(delOnlyMatch[1]),
    };
  }

  return { action: 'modify' };
}

function isPlausibleCsiSection(code: string): boolean {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 5) return false;
  const div = parseInt(code.slice(0, 2), 10);
  return !Number.isNaN(div) && div >= 0 && div <= 49;
}

export function parseNarrativeAddendumDirectives(sections: CsiSection[]): NarrativeDirective[] {
  const directives: NarrativeDirective[] = [];
  const seenKeys = new Set<string>();

  for (const sec of sections) {
    const candidateBlocks =
      sec.paragraphs.length > 0
        ? sec.paragraphs
        : sec.text
            .split(/\n+/)
            .map((l) => l.trim())
            .filter(Boolean);

    let activeTargetCode: string | null =
      sec.normalizedCode !== '00 01 00' && sec.normalizedCode !== '00 00 00'
        ? sec.normalizedCode
        : null;

    for (let idx = 0; idx < candidateBlocks.length; idx++) {
      const rawBlock = candidateBlocks[idx].trim();
      if (!rawBlock) continue;

      const codeMatch = rawBlock.match(CSI_CODE_INLINE_RE);
      let resolvedCode: string | null = null;
      if (codeMatch) {
        const candidate = normalizeCsiCode(codeMatch[1]);
        if (isPlausibleCsiSection(candidate)) {
          resolvedCode = candidate;
          activeTargetCode = candidate;
        }
      } else if (activeTargetCode && NARRATIVE_CUE_RE.test(rawBlock)) {
        resolvedCode = activeTargetCode;
      }

      if (!resolvedCode) continue;

      // Only treat as narrative directive if explicit narrative/patch cue is present
      const hasNarrativeCue =
        NARRATIVE_CUE_RE.test(rawBlock) ||
        /\bitem\s*(?:no\.?|#)?\s*\d+/i.test(rawBlock) ||
        /^ad\d*[-_#]?\d+/i.test(rawBlock);

      if (!hasNarrativeCue) continue;

      // Avoid misclassifying normal "Refer to Section 08 71 00" prose inside a full section
      if (
        sec.normalizedCode !== '00 01 00' &&
        sec.normalizedCode !== '00 00 00' &&
        resolvedCode !== sec.normalizedCode &&
        !/\b(?:item\s*(?:no\.?|#)?\s*\d+|ad\d*[-_#]?\d+|delete\s+section|replace|change\b.+\bto\b|delete\b.+\badd\b)/i.test(
          rawBlock
        )
      ) {
        continue;
      }

      const itemMatch = rawBlock.match(
        /^((?:item\s*(?:no\.?|#)?\s*\d+|ad\d*[-_#]?\d+|\d+[.)]))\s*[:\-–—]?\s*/i
      );
      const itemLabel = itemMatch
        ? itemMatch[1].replace(/[.)]+$/, '').trim()
        : `Item ${directives.length + 1}`;

      const afterCode = codeMatch
        ? rawBlock.slice((codeMatch.index ?? 0) + codeMatch[0].length)
        : rawBlock;
      const afterParaMatch = afterCode.match(PARA_REF_RE);
      const paraMatch = afterParaMatch ?? rawBlock.match(PARA_REF_RE);
      const paragraphRef = paraMatch ? paraMatch[1] : undefined;

      const bodyStart = afterParaMatch
        ? (afterParaMatch.index ?? 0) + afterParaMatch[0].length
        : 0;
      const instructionFragment = (afterCode.slice(bodyStart) || afterCode || rawBlock)
        .replace(/^[,:\-–—\s]+/, '')
        .trim();

      const isWholeSectionDelete =
        /\b(?:delete|omit|remove)\s+(?:the\s+)?(?:entire\s+)?(?:(?:section|document)\s+\d[\d\s.]*(?:\s+in\s+its\s+entirety|\s+completely)?|(?:this\s+)?(?:section|document)\s+in\s+its\s+entirety)\s*[.;]?$/i.test(
          rawBlock
        ) ||
        (/\bin\s+its\s+entirety\b/i.test(rawBlock) &&
          /\b(?:delete|omit|remove)\b/i.test(rawBlock));

      const parsedAction = isWholeSectionDelete
        ? { action: 'delete-section' as const }
        : extractDeleteAddClauses(instructionFragment || rawBlock);

      const dedupeKey = `${resolvedCode}::${rawBlock.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      directives.push({
        targetSectionCode: resolvedCode,
        itemLabel,
        paragraphRef,
        action: parsedAction.action,
        deleteText: parsedAction.deleteText,
        addText: parsedAction.addText,
        rawInstruction: rawBlock,
      });
    }
  }

  return directives;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findMatchingBaselineParagraphIndex(
  paragraphs: string[],
  directive: NarrativeDirective
): number {
  if (paragraphs.length === 0) return -1;

  if (directive.deleteText) {
    const needle = directive.deleteText.toLowerCase().replace(/\s+/g, ' ').trim();
    const exactIdx = paragraphs.findIndex((p) =>
      p.toLowerCase().replace(/\s+/g, ' ').includes(needle)
    );
    if (exactIdx !== -1) return exactIdx;
  }

  if (directive.paragraphRef) {
    const refEsc = escapeRegExp(directive.paragraphRef);
    const refRe = new RegExp(`(?:^|\\s)${refEsc}(?:\\b|[.:\\s)])`, 'i');
    const directRefIdx = paragraphs.findIndex((p) => refRe.test(p));
    if (directRefIdx !== -1) return directRefIdx;

    // Fallback to parent numeric clause prefix (e.g. "2.3.A" -> "2.3")
    const parentRef = directive.paragraphRef.replace(/\.[A-Za-z0-9]+$/, '');
    if (parentRef && parentRef !== directive.paragraphRef) {
      const parentEsc = escapeRegExp(parentRef);
      const parentRe = new RegExp(`(?:^|\\s)${parentEsc}(?:\\b|[.:\\s)])`, 'i');
      const parentIdx = paragraphs.findIndex((p) => parentRe.test(p));
      if (parentIdx !== -1) return parentIdx;
    }
  }

  return -1;
}

export function buildPatchedParagraphText(
  oldPara: string | null,
  directive: NarrativeDirective
): { oldText: string; newText: string } {
  if (oldPara !== null) {
    if (directive.deleteText) {
      const flexiblePattern = escapeRegExp(directive.deleteText).replace(/\s+/g, '\\s+');
      const re = new RegExp(flexiblePattern, 'i');
      if (re.test(oldPara)) {
        const replacement = directive.addText ?? '';
        const patched = oldPara.replace(re, replacement).replace(/\s+/g, ' ').trim();
        return { oldText: oldPara, newText: patched };
      }
    }

    if (directive.action === 'add-text' && directive.addText) {
      return {
        oldText: oldPara,
        newText: `${oldPara} ${directive.addText}`.trim(),
      };
    }

    return {
      oldText: oldPara,
      newText: `${oldPara}\n[Addendum ${directive.itemLabel}: ${directive.rawInstruction}]`,
    };
  }

  // No exact baseline paragraph found — surface directive clearly against section context
  if (directive.deleteText && directive.addText) {
    return {
      oldText: `${directive.paragraphRef ? `${directive.paragraphRef}: ` : ''}${directive.deleteText}`,
      newText: `${directive.paragraphRef ? `${directive.paragraphRef}: ` : ''}${directive.addText}`,
    };
  }

  return {
    oldText: `Section ${directive.targetSectionCode}${directive.paragraphRef ? ` (${directive.paragraphRef})` : ''}`,
    newText: `[Addendum ${directive.itemLabel}] ${directive.rawInstruction}`,
  };
}
