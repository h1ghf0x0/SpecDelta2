import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  List,
} from 'lucide-react';
import { RedlineTokenRenderer, type DiffViewMode } from './RedlineTokenRenderer';
import { getOverlappingScannedPages } from './workbenchTypes';
import type { DiffSectionResult } from '../types/spec';

interface SectionDiffInspectorProps {
  activeSection: DiffSectionResult | null;
  filteredCount: number;
  riskSectionCount: number;
  unreviewedChangedCount: number;
  oldScannedPages?: number[];
  newScannedPages?: number[];
  isReviewed: boolean;
  onToggleReviewed: (sectionCode: string) => void;
  diffViewMode: DiffViewMode;
  onChangeDiffViewMode: (mode: DiffViewMode) => void;
  showFullSection: boolean;
  onToggleShowFullSection: () => void;
  onStepSection: (delta: -1 | 1) => void;
  onJumpToNextMatching: (kind: 'risk' | 'unreviewed') => void;
}

export function SectionDiffInspector({
  activeSection,
  filteredCount,
  riskSectionCount,
  unreviewedChangedCount,
  oldScannedPages,
  newScannedPages,
  isReviewed,
  onToggleReviewed,
  diffViewMode,
  onChangeDiffViewMode,
  showFullSection,
  onToggleShowFullSection,
  onStepSection,
  onJumpToNextMatching,
}: SectionDiffInspectorProps) {
  const isStatic =
    !activeSection ||
    activeSection.status === 'unchanged' ||
    activeSection.status === 'not-reissued';

  const oldOverlapping = activeSection
    ? getOverlappingScannedPages(activeSection.oldPageRange, oldScannedPages)
    : [];
  const newOverlapping = activeSection
    ? getOverlappingScannedPages(activeSection.newPageRange, newScannedPages)
    : [];

  return (
    <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
      {!activeSection ? (
        <div className="p-10 text-center text-sm text-slate-500">
          Select a CSI section from the left tree to inspect changes.
        </div>
      ) : (
        <div>
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="font-mono font-semibold text-[#1E40AF] tabular-nums">
                    Div {activeSection.division}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeSection.divisionTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Old pp. {activeSection.oldPageRange} →{' '}
                    {activeSection.status === 'not-reissued'
                      ? 'Not reissued'
                      : `New pp. ${activeSection.newPageRange}`}
                  </span>
                  {activeSection.narrativeApplied && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-semibold text-[#1E40AF]">
                        Narrative Patch ({activeSection.narrativeItemRefs?.join(', ')})
                      </span>
                    </>
                  )}
                  {activeSection.renumberedFrom && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#1E40AF] font-medium font-mono tabular-nums">
                        Renumbered ({activeSection.renumberedFrom} → {activeSection.sectionCode})
                      </span>
                    </>
                  )}
                  {activeSection.spacingNormalized && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-700 font-medium">
                        Aligned ({activeSection.oldRawCode} ↔ {activeSection.newRawCode})
                      </span>
                    </>
                  )}
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  <span className="font-mono mr-2 tabular-nums">{activeSection.sectionCode}</span>
                  {activeSection.title}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {filteredCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {filteredCount > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => onStepSection(-1)}
                          title="Previous section (p)"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Prev (p)
                        </button>
                        <button
                          type="button"
                          onClick={() => onStepSection(1)}
                          title="Next section (n)"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          Next (n)
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {riskSectionCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onJumpToNextMatching('risk')}
                        title="Next risk-flagged section (r)"
                        className="px-2 py-1.5 text-xs font-medium text-[#B45309] bg-amber-50/70 border border-amber-200 rounded-md hover:bg-amber-100/70 cursor-pointer"
                      >
                        Risk (r)
                      </button>
                    )}
                    {unreviewedChangedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onJumpToNextMatching('unreviewed')}
                        title="Next unreviewed changed section (u)"
                        className="px-2 py-1.5 text-xs font-medium text-[#1E40AF] bg-blue-50/70 border border-blue-200 rounded-md hover:bg-blue-100/70 cursor-pointer"
                      >
                        Unreviewed (u)
                      </button>
                    )}
                  </div>
                )}

                {!isStatic && (
                  <>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isReviewed}
                        onChange={() => onToggleReviewed(activeSection.sectionCode)}
                        className="accent-[#15803D] cursor-pointer"
                      />
                      <span className={isReviewed ? 'text-[#15803D] font-semibold' : 'text-slate-700'}>
                        Reviewed
                      </span>
                    </label>

                    <div
                      className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md"
                      role="group"
                      aria-label="Diff view mode"
                    >
                      <button
                        type="button"
                        aria-pressed={diffViewMode === 'inline'}
                        onClick={() => onChangeDiffViewMode('inline')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 ${
                          diffViewMode === 'inline'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        Inline Redline
                      </button>
                      <button
                        type="button"
                        aria-pressed={diffViewMode === 'side-by-side'}
                        onClick={() => onChangeDiffViewMode('side-by-side')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 ${
                          diffViewMode === 'side-by-side'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Columns2 className="w-3.5 h-3.5" />
                        Side-by-Side
                      </button>
                    </div>

                    <button
                      type="button"
                      aria-expanded={showFullSection}
                      onClick={onToggleShowFullSection}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 drafting-transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {showFullSection ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          Show Changed Blocks Only
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          Show Full Section Redline
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {activeSection.riskFlags.length > 0 && !isStatic && (
              <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-900">
                <span
                  className={`font-semibold inline-flex items-center gap-1 ${
                    activeSection.riskSeverity === 'critical' ? 'text-[#B91C1C]' : 'text-[#B45309]'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {activeSection.riskSeverity
                    ? `${activeSection.riskSeverity.toUpperCase()} Risk Flags:`
                    : 'Money & Risk Flags:'}
                </span>
                {activeSection.riskFlags.map((flag, idx) => (
                  <span key={idx} className="font-mono text-[11px]">
                    {flag}
                    {idx < activeSection.riskFlags.length - 1 ? ' ·' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 space-y-5">
            {(oldOverlapping.length > 0 || newOverlapping.length > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950 font-mono tabular-nums flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <span>
                  Raster / scanned sheet(s) without OCR text skipped inside this section range (
                  {oldOverlapping.length > 0 ? `Baseline pp. ${oldOverlapping.join(', ')}` : ''}
                  {oldOverlapping.length > 0 && newOverlapping.length > 0 ? ' · ' : ''}
                  {newOverlapping.length > 0 ? `Addendum pp. ${newOverlapping.join(', ')}` : ''}
                  ) — verify skipped sheets manually.
                </span>
              </div>
            )}

            {activeSection.status === 'not-reissued' ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Not Reissued in Addendum — Preserved Unchanged from Baseline
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Section <span className="font-mono">{activeSection.sectionCode}</span> (Baseline pp.{' '}
                    <span className="font-mono tabular-nums">{activeSection.oldPageRange}</span>) was not reissued in this partial/narrative addendum and has no narrative edit instructions targeting it.
                  </p>
                </div>
              </div>
            ) : activeSection.status === 'unchanged' ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {activeSection.renumberedFrom
                      ? `Renumbered (${activeSection.renumberedFrom} → ${activeSection.sectionCode}) · No Differences in Extracted Text`
                      : 'No Differences in Extracted Text'}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Across page shift{' '}
                    <span className="font-mono tabular-nums">{activeSection.oldPageRange}</span> →{' '}
                    <span className="font-mono tabular-nums">{activeSection.newPageRange}</span>,
                    SpecDelta stripped repeating headers/footers and found no differences in extracted text.
                  </p>
                </div>
              </div>
            ) : showFullSection ? (
              <div className="space-y-4">
                <div className="text-xs font-medium text-slate-500">
                  Full Section Context with Redlines (
                  {activeSection.status === 'deleted'
                    ? 'Baseline Removed'
                    : activeSection.status === 'added'
                    ? 'Addendum Added'
                    : activeSection.narrativeApplied
                    ? 'Narrative Patched Blocks'
                    : 'Inline / Side-by-Side Diff'}
                  )
                </div>
                {activeSection.fullTokens && activeSection.fullTokens.length > 0 ? (
                  <div className="border border-slate-200 rounded-md p-4 bg-white whitespace-pre-wrap">
                    <RedlineTokenRenderer tokens={activeSection.fullTokens} mode={diffViewMode} />
                  </div>
                ) : (
                  <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-md p-4">
                    <div className="text-xs text-amber-800 mb-2">
                      {activeSection.narrativeApplied
                        ? 'Narrative addendum patched specific paragraphs; showing resulting changed clauses:'
                        : 'Full-section token diff bypassed (>80,000 characters); showing raw normalized section text:'}
                    </div>
                    {activeSection.status === 'deleted'
                      ? activeSection.fullOldText
                      : activeSection.fullNewText}
                  </div>
                )}
              </div>
            ) : (
              activeSection.changedParagraphs.map((para, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-slate-600 tabular-nums">
                        Change Block {idx + 1} of {activeSection.changedParagraphs.length}
                      </span>
                      {para.narrativeSource && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-xs border border-blue-200 bg-blue-50 text-[11px] font-mono font-semibold text-[#1E40AF]">
                          {para.narrativeSource}
                        </span>
                      )}
                      {para.deltaChips &&
                        para.deltaChips.map((chip) => (
                          <span
                            key={chip}
                            className="inline-flex items-center px-2 py-0.5 rounded-xs border border-amber-300 bg-amber-50/80 text-[11px] font-mono font-semibold text-amber-950 tabular-nums"
                          >
                            {chip}
                          </span>
                        ))}
                    </div>
                    {para.riskFlags.length > 0 && (
                      <span className="text-[#B45309] font-medium">
                        {para.riskFlags.join(' · ')}
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3 text-sm leading-relaxed">
                    {para.contextBefore && (
                      <p className="text-xs text-slate-500 leading-relaxed">{para.contextBefore}</p>
                    )}

                    <RedlineTokenRenderer tokens={para.tokens} mode={diffViewMode} />

                    {para.contextAfter && (
                      <p className="text-xs text-slate-500 leading-relaxed">{para.contextAfter}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
