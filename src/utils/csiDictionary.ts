export const CSI_DIVISIONS: Record<string, string> = {
  '00': 'Procurement & Contracting Requirements',
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics, and Composites',
  '07': 'Thermal and Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'Heating, Ventilating, and Air Conditioning (HVAC)',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety and Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
  '48': 'Electrical Power Generation',
};

export function getDivisionTitle(divCode: string): string {
  return CSI_DIVISIONS[divCode] ?? `Division ${divCode}`;
}

/**
 * Normalizes inconsistent CSI section codes:
 *  - "08 71 00" -> "08 71 00"
 *  - "08 7100"  -> "08 71 00"
 *  - "087100"   -> "08 71 00"
 *  - "08710"    -> "08 71 00" (legacy 5-digit MasterFormat '95)
 *  - "13 31 00.13" -> "13 31 00.13"
 */
export function normalizeCsiCode(raw: string): string {
  const cleaned = raw.trim().replace(/^SECTION\s+/i, '');
  const subSplit = cleaned.split('.');
  const mainDigits = subSplit[0].replace(/\D/g, '');
  const suffix = subSplit[1] ? `.${subSplit[1].replace(/\D/g, '').slice(0, 2).padEnd(2, '0')}` : '';

  if (mainDigits.length === 6) {
    return `${mainDigits.slice(0, 2)} ${mainDigits.slice(2, 4)} ${mainDigits.slice(4, 6)}${suffix}`;
  }
  if (mainDigits.length === 5) {
    return `${mainDigits.slice(0, 2)} ${mainDigits.slice(2, 4)} ${mainDigits.slice(4, 5)}0${suffix}`;
  }
  return cleaned;
}

export interface RiskPattern {
  label: string;
  category: 'Tolerance / Unit' | 'Scope / Liability' | 'Cost / Allowance';
  regex: RegExp;
}

/**
 * Note: Bare modal verbs ("shall", "must", "may", "should") are intentionally omitted here so
 * background boilerplate never inflates risk flags on typo fixes or calendar dates ("May 14").
 * Modal directive shifts are surfaced strictly on changed tokens via extractDirectiveDelta().
 */
export const RISK_PATTERNS: RiskPattern[] = [
  {
    label: 'PSI / Strength / AIC',
    category: 'Tolerance / Unit',
    regex: /\b\d[\d,]*(?:\.\d+)?[-\s]*(?:psi|ksi|mpa|k?aic)\b/gi,
  },
  {
    label: 'Thickness / Gauge / Mil',
    category: 'Tolerance / Unit',
    regex: /\b\d+(?:\.\d+)?[-\s]*(?:mil|mils|mm|cm|ga|gauge|in\.|inch|inches)\b/gi,
  },
  {
    label: 'Fire / Time Rating',
    category: 'Tolerance / Unit',
    regex: /\b\d+(?:\.\d+)?[-\s]?(?:hr|hour|hours|min|minute|minutes|year|years|yr|yrs)\b/gi,
  },
  {
    label: 'Threshold / Limit',
    category: 'Tolerance / Unit',
    regex: /\b(?:minimum|not\s+less\s+than|at\s+least|maximum|not\s+exceeding|not\s+to\s+exceed|no\s+more\s+than)\b/gi,
  },
  {
    label: 'Currency / Percentage',
    category: 'Cost / Allowance',
    regex: /(?:\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d+(?:\.\d+)?%)/gi,
  },
  {
    label: 'Furnish & Install / By Owner',
    category: 'Scope / Liability',
    regex: /\b(?:furnish\s+and\s+install|furnish\s+only|install\s+only|by\s+owner|owner[- ]furnished|contractor[- ]installed|ofci|cfci)\b/gi,
  },
  {
    label: 'Warranty / Indemnification',
    category: 'Scope / Liability',
    regex: /\b(?:warranty|warranties|guaranteed?|ndl|liquidated\s+damages|retainage)\b/gi,
  },
  {
    label: 'Allowance / Alternate',
    category: 'Cost / Allowance',
    regex: /\b(?:allowance|allowances|alternate|alternates|unit\s+price|add\s+alternate|deduct)\b/gi,
  },
  {
    label: 'Substitution / Basis of Design',
    category: 'Scope / Liability',
    regex: /\b(?:basis\s+of\s+design|approved\s+equal|or\s+equal|no\s+substitutions?|sole\s+source)\b/gi,
  },
  {
    label: 'Contractual Exclusion',
    category: 'Scope / Liability',
    regex: /\b(?:shall\s+not|may\s+not|delete|deleted|omitted|excluded|mandatory|prohibited)\b/gi,
  },
];

export function detectRiskFlags(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of RISK_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      const sample = matches[0].trim();
      found.add(`${pattern.label}: ${sample}`);
    }
  }
  return Array.from(found);
}

/**
 * Matches lowercase modal directives ("shall", "must", "may", "should", "shall not", "may not")
 * while ignoring capitalized calendar months such as "May 14, 2026".
 */
function extractModalDirectives(text: string): string[] {
  const re = /\b(shall\s+not|may\s+not|shall|must|may|should)\b/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push(match[1].toLowerCase());
  }
  return out;
}

export function extractDirectiveDelta(oldText: string, newText: string): string | null {
  if (!oldText || !newText) return null;
  const oldDirectives = extractModalDirectives(oldText);
  const newDirectives = extractModalDirectives(newText);
  if (oldDirectives.length === 0 && newDirectives.length === 0) return null;

  const oldCounts = new Map<string, number>();
  const newCounts = new Map<string, number>();
  for (const d of oldDirectives) oldCounts.set(d, (oldCounts.get(d) ?? 0) + 1);
  for (const d of newDirectives) newCounts.set(d, (newCounts.get(d) ?? 0) + 1);

  const removed: string[] = [];
  const added: string[] = [];

  for (const [modal, count] of oldCounts.entries()) {
    const diff = count - (newCounts.get(modal) ?? 0);
    for (let i = 0; i < diff; i++) removed.push(modal);
  }
  for (const [modal, count] of newCounts.entries()) {
    const diff = count - (oldCounts.get(modal) ?? 0);
    for (let i = 0; i < diff; i++) added.push(modal);
  }

  if (removed.length === 0 && added.length === 0) return null;
  if (removed.length > 0 && added.length > 0) {
    return `Directive: ${removed[0]} → ${added[0]}`;
  }
  if (added.length > 0) {
    return `Directive added: ${added[0]}`;
  }
  return `Directive removed: ${removed[0]}`;
}

/**
 * Evaluates risk flags strictly from changed diff spans (never unchanged background sentences)
 * plus any modal directive shift detected between old and new text.
 */
export function detectDeltaRiskFlags(
  tokens: Array<{ op: -1 | 0 | 1; text: string; riskMatch?: string }>,
  oldText: string,
  newText: string
): string[] {
  const found = new Set<string>();

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

    const combined = `${prevCtx}${tok.text}${nextCtx}`;
    const tokStart = prevCtx.length;
    const tokEnd = tokStart + tok.text.length;

    for (const pattern of RISK_PATTERNS) {
      const re = new RegExp(pattern.regex.source, 'gi');
      let match: RegExpExecArray | null;
      while ((match = re.exec(combined)) !== null) {
        const mStart = match.index;
        const mEnd = mStart + match[0].length;
        if (mStart < tokEnd && mEnd > tokStart) {
          found.add(`${pattern.label}: ${match[0].trim()}`);
          break;
        }
        if (match[0].length === 0) break;
      }
    }
  }

  const directiveDelta = extractDirectiveDelta(oldText, newText);
  if (directiveDelta) {
    found.add(directiveDelta);
  }

  return Array.from(found);
}

export function findRiskMatchInToken(tokenText: string): string | undefined {
  for (const pattern of RISK_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(tokenText)) {
      return pattern.category;
    }
  }
  return undefined;
}

/**
 * Evaluates risk patterns across a sliding window around a changed token so multi-word
 * phrases like "3,000" + " psi" or "furnish" + " and install" still highlight the changed token.
 */
export function extractContextRiskMatch(
  prevContext: string,
  tokenText: string,
  nextContext: string
): string | undefined {
  if (!tokenText.trim()) return undefined;
  const direct = findRiskMatchInToken(tokenText);
  if (direct) return direct;

  const combined = `${prevContext}${tokenText}${nextContext}`;
  const tokenStart = prevContext.length;
  const tokenEnd = tokenStart + tokenText.length;

  for (const pattern of RISK_PATTERNS) {
    const re = new RegExp(pattern.regex.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(combined)) !== null) {
      const mStart = match.index;
      const mEnd = mStart + match[0].length;
      if (mStart < tokenEnd && mEnd > tokenStart) {
        return pattern.category;
      }
      if (match[0].length === 0) break;
    }
  }
  return undefined;
}

const DELTA_UNIT_GROUPS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Strength', regex: /\b\d[\d,]*(?:\.\d+)?[-\s]*(?:psi|ksi|mpa)\b/gi },
  { label: 'Gauge / Mil', regex: /\b\d+(?:\.\d+)?[-\s]*(?:mil|mils|mm|ga|gauge)\b/gi },
  { label: 'Rating / Term', regex: /\b\d+(?:\.\d+)?[-\s]?(?:hr|hour|hours|year|years|yr|yrs)\b/gi },
  { label: 'Cost', regex: /(?:\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d+(?:\.\d+)?%)/gi },
  { label: 'AIC', regex: /\b\d[\d,]*[-\s]*(?:k?aic)\b/gi },
];

export function extractParagraphDeltaChips(oldText: string, newText: string): string[] {
  const chips: string[] = [];
  if (!oldText || !newText) return chips;

  for (const group of DELTA_UNIT_GROUPS) {
    const oldMatches = (oldText.match(new RegExp(group.regex.source, 'gi')) ?? []).map((s) =>
      s.replace(/\s+/g, ' ').trim()
    );
    const newMatches = (newText.match(new RegExp(group.regex.source, 'gi')) ?? []).map((s) =>
      s.replace(/\s+/g, ' ').trim()
    );
    if (oldMatches.length > 0 && newMatches.length > 0) {
      const firstDiffIdx = oldMatches.findIndex(
        (m, idx) => newMatches[idx] && m.toLowerCase() !== newMatches[idx].toLowerCase()
      );
      if (firstDiffIdx !== -1) {
        chips.push(`${group.label}: ${oldMatches[firstDiffIdx]} → ${newMatches[firstDiffIdx]}`);
      } else if (oldMatches[0].toLowerCase() !== newMatches[0].toLowerCase()) {
        chips.push(`${group.label}: ${oldMatches[0]} → ${newMatches[0]}`);
      }
    }
  }

  const scopeRe =
    /\b(furnish\s+and\s+install|furnish\s+only|install\s+only|by\s+owner|owner[- ]furnished|contractor[- ]installed)\b/i;
  const oldScope = oldText.match(scopeRe)?.[1];
  const newScope = newText.match(scopeRe)?.[1];
  if (oldScope && newScope && oldScope.toLowerCase() !== newScope.toLowerCase()) {
    chips.push(`Scope: ${oldScope} → ${newScope}`);
  }

  const directiveDelta = extractDirectiveDelta(oldText, newText);
  if (directiveDelta) {
    chips.push(directiveDelta);
  }

  const thresholdRe =
    /\b(minimum|not\s+less\s+than|at\s+least|maximum|not\s+exceeding|not\s+to\s+exceed|no\s+more\s+than)\b/gi;
  const oldThresh = (oldText.match(thresholdRe) ?? []).map((s) =>
    s.replace(/\s+/g, ' ').toLowerCase()
  );
  const newThresh = (newText.match(thresholdRe) ?? []).map((s) =>
    s.replace(/\s+/g, ' ').toLowerCase()
  );
  if (oldThresh.length > 0 && newThresh.length > 0) {
    const diffIdx = oldThresh.findIndex((t, idx) => newThresh[idx] && t !== newThresh[idx]);
    if (diffIdx !== -1) {
      chips.push(`Threshold: ${oldThresh[diffIdx]} → ${newThresh[diffIdx]}`);
    } else if (oldThresh[0] !== newThresh[0]) {
      chips.push(`Threshold: ${oldThresh[0]} → ${newThresh[0]}`);
    }
  }

  return chips.slice(0, 4);
}
