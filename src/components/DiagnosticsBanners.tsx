import {
  AlertTriangle,
  Download,
  Eye,
  FileSpreadsheet,
  Info,
  Printer,
  Sparkles,
} from 'lucide-react';
import { AiScopeBriefPanel } from './AiScopeBriefPanel';
import { NoiseDrawer } from './NoiseDrawer';
import type { DiffCounts, StatusFilter } from './workbenchTypes';
import type {
  AppRoute,
  ComparisonMode,
  DiffRunOutput,
  DiffSectionResult,
  NoiseFilterConfig,
  ScopeBriefResponse,
} from '../types/spec';

interface DiagnosticsBannersProps {
  diffOutput: DiffRunOutput;
  counts: DiffCounts;
  reviewedChangedCount: number;
  isReparsingNoise: boolean;
  showAllScannedPages: boolean;
  onToggleShowAllScannedPages: () => void;
  showNoiseDrawer: boolean;
  onToggleNoiseDrawer: () => void;
  noiseConfig: NoiseFilterConfig;
  isProcessing: boolean;
  onReparseWithNoiseConfig: (nextConfig: NoiseFilterConfig) => void;
  aiBriefEnabled: boolean;
  onToggleAiBrief: () => void;
  changedPayloadEstimate: {
    sectionsCount: number;
    cappedSectionsCount: number;
    cappedCharCount: number;
  };
  aiBriefLoading: boolean;
  aiBriefNotice: string | null;
  aiBriefError: string | null;
  aiBrief: ScopeBriefResponse | null;
  onGenerateAiBrief: () => void;
  allChangedSections: DiffSectionResult[];
  filteredChangedSections: DiffSectionResult[];
  reviewedCodes: Set<string>;
  topRiskSections: DiffSectionResult[];
  activeSectionCode: string | null;
  onSelectSection: (sectionCode: string, filter?: StatusFilter) => void;
  onChangeComparisonMode: (mode: ComparisonMode) => void;
  onResetReviewed: () => void;
  onNavigate: (route: AppRoute) => void;
}

export function DiagnosticsBanners({
  diffOutput,
  counts,
  reviewedChangedCount,
  isReparsingNoise,
  showAllScannedPages,
  onToggleShowAllScannedPages,
  showNoiseDrawer,
  onToggleNoiseDrawer,
  noiseConfig,
  isProcessing,
  onReparseWithNoiseConfig,
  aiBriefEnabled,
  onToggleAiBrief,
  changedPayloadEstimate,
  aiBriefLoading,
  aiBriefNotice,
  aiBriefError,
  aiBrief,
  onGenerateAiBrief,
  allChangedSections,
  filteredChangedSections,
  reviewedCodes,
  topRiskSections,
  activeSectionCode,
  onSelectSection,
  onChangeComparisonMode,
  onResetReviewed,
  onNavigate,
}: DiagnosticsBannersProps) {
  const { diagnostics } = diffOutput;
  const resolvedMode = diagnostics.resolvedMode ?? 'conformed';
  const isPartialOrNarrative = resolvedMode !== 'conformed';

  return (
    <>
      {isReparsingNoise && (
        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-2.5 text-xs font-medium text-[#1E40AF]">
          Re-parsing PDFs with updated header/footer noise thresholds — previous results dimmed until update completes...
        </div>
      )}

      {isPartialOrNarrative && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs text-slate-800">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#1E40AF] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-slate-900">
                {resolvedMode === 'narrative-addendum'
                  ? `Narrative Addendum Mode Active (${diagnostics.narrativeMatchedSectionCount ?? 0} baseline sections patched from ${diagnostics.narrativeDirectiveCount ?? 0} narrative items)`
                  : `Partial Reissue Mode Active (${diagnostics.notReissuedCount ?? 0} unmentioned baseline sections preserved as Not Reissued)`}
              </div>
              <p className="text-slate-600 leading-relaxed">
                Unmentioned sections from <span className="font-mono">{diagnostics.oldFileName}</span> are marked{' '}
                <span className="font-semibold">Not Reissued</span> instead of deleted so partial addenda don&apos;t generate false deletions.
              </p>
              {diagnostics.narrativeUnmatchedDirectives &&
                diagnostics.narrativeUnmatchedDirectives.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-200/80 text-amber-950 space-y-1">
                    <div className="font-semibold">
                      Unmatched narrative directives ({diagnostics.narrativeUnmatchedDirectives.length}) — verify manually:
                    </div>
                    <ul className="font-mono text-[11px] space-y-0.5 list-disc pl-4">
                      {diagnostics.narrativeUnmatchedDirectives.slice(0, 6).map((item, idx) => (
                        <li key={idx} className="truncate max-w-3xl">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChangeComparisonMode('conformed')}
            className="text-[11px] font-medium text-[#1E40AF] bg-white border border-blue-200 rounded px-2.5 py-1.5 hover:bg-blue-100/50 cursor-pointer whitespace-nowrap shrink-0 self-start"
          >
            Treat as Full Conformed Set
          </button>
        </div>
      )}

      {diagnostics.scannedWarning && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3 text-sm text-amber-950">
          <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="font-semibold">
              Scanned / raster sheets skipped (no OCR text layer — verify skipped pages manually against signed PDF):
            </div>
            <div className="text-xs font-mono space-y-1 tabular-nums">
              {(diagnostics.oldScannedPages?.length ?? 0) > 0 && (
                <div>
                  Baseline ({diagnostics.oldFileName}): {diagnostics.oldScannedPages!.length} page(s)
                  skipped — pp.{' '}
                  {(showAllScannedPages
                    ? diagnostics.oldScannedPages!
                    : diagnostics.oldScannedPages!.slice(0, 8)
                  ).join(', ')}
                  {!showAllScannedPages && diagnostics.oldScannedPages!.length > 8
                    ? ` ... (+${diagnostics.oldScannedPages!.length - 8} more)`
                    : ''}
                </div>
              )}
              {(diagnostics.newScannedPages?.length ?? 0) > 0 && (
                <div>
                  Addendum ({diagnostics.newFileName}): {diagnostics.newScannedPages!.length} page(s)
                  skipped — pp.{' '}
                  {(showAllScannedPages
                    ? diagnostics.newScannedPages!
                    : diagnostics.newScannedPages!.slice(0, 8)
                  ).join(', ')}
                  {!showAllScannedPages && diagnostics.newScannedPages!.length > 8
                    ? ` ... (+${diagnostics.newScannedPages!.length - 8} more)`
                    : ''}
                </div>
              )}
            </div>
            {((diagnostics.oldScannedPages?.length ?? 0) > 8 ||
              (diagnostics.newScannedPages?.length ?? 0) > 8) && (
              <button
                type="button"
                onClick={onToggleShowAllScannedPages}
                className="text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 cursor-pointer"
              >
                {showAllScannedPages ? 'Collapse skipped page list' : 'Show all skipped page numbers'}
              </button>
            )}
          </div>
        </div>
      )}

      {diagnostics.bookmarkAsymmetryWarning && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3.5 flex items-start gap-3 text-sm text-amber-950">
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1 text-xs leading-relaxed">
            <div className="font-semibold">
              Asymmetric PDF bookmarks detected ({diagnostics.oldOutlineBookmarkCount ?? 0} in
              Baseline vs. {diagnostics.newOutlineBookmarkCount ?? 0} in Addendum)
            </div>
            <div className="text-amber-900">
              Only one PDF includes embedded CSI outline bookmarks. Sections without standard{' '}
              <span className="font-mono">SECTION XX XX XX</span> headings may split in the bookmarked
              file and stay grouped under Front Matter (<span className="font-mono">00 01 00</span>) in
              the un-bookmarked file—verify any unexpected Added/Deleted sections against the PDF.
            </div>
          </div>
        </div>
      )}

      {/* Risk-First Connected Tabular KPI Ledger Strip */}
      <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden">
        <div className="p-4">
          <div className="text-xs text-slate-500">Money &amp; Risk Sections</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#B45309] tabular-nums">
            {counts.risk}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Modified</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#1E40AF] tabular-nums">
            {counts.modified}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">New Sections</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#15803D] tabular-nums">
            {counts.added}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">
            {counts.notReissued > 0 ? 'Not Reissued / Del' : 'Deleted Sections'}
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {counts.notReissued > 0 ? (
              <>
                <span className="text-slate-600">{counts.notReissued}</span>
                {counts.deleted > 0 && (
                  <span className="text-sm text-[#B91C1C] ml-1">/ {counts.deleted} del</span>
                )}
              </>
            ) : (
              <span className="text-[#B91C1C]">{counts.deleted}</span>
            )}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Changed / Total</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {counts.changed}
            <span className="text-sm font-normal text-slate-400 ml-1">/ {counts.total}</span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Reviewed</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {reviewedChangedCount}
            <span className="text-sm font-normal text-slate-400 ml-1">/ {counts.changed}</span>
          </div>
        </div>
      </div>

      {/* Action, Diagnostics & Explicit-Scope Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
          <span className="font-mono">Old: {diagnostics.oldPageCount} pp.</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">New: {diagnostics.newPageCount} pp.</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">Parse: {(diagnostics.parseTimeMs / 1000).toFixed(2)}s</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            aria-expanded={showNoiseDrawer}
            onClick={onToggleNoiseDrawer}
            className="text-[#1E40AF] font-medium hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            Stripped Noise:{' '}
            <span>
              {(diagnostics.oldStrippedLineCount ?? 0) + (diagnostics.newStrippedLineCount ?? 0)}{' '}
              lines (
              {diagnostics.oldStrippedPatterns.length + diagnostics.newStrippedPatterns.length}{' '}
              patterns)
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              void import('../utils/exporters').then(({ exportChangeLogToExcel }) =>
                exportChangeLogToExcel(
                  allChangedSections,
                  'SpecDelta_All_Changes',
                  reviewedCodes,
                  {
                    oldFileName: diagnostics.oldFileName,
                    newFileName: diagnostics.newFileName,
                    oldScannedPages: diagnostics.oldScannedPages,
                    newScannedPages: diagnostics.newScannedPages,
                  }
                )
              );
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export All Changes ({allChangedSections.length})
          </button>
          {filteredChangedSections.length < allChangedSections.length && (
            <button
              type="button"
              onClick={() => {
                void import('../utils/exporters').then(({ exportChangeLogToExcel }) =>
                  exportChangeLogToExcel(
                    filteredChangedSections,
                    'SpecDelta_Filtered_View',
                    reviewedCodes,
                    {
                      oldFileName: diagnostics.oldFileName,
                      newFileName: diagnostics.newFileName,
                      oldScannedPages: diagnostics.oldScannedPages,
                      newScannedPages: diagnostics.newScannedPages,
                    }
                  )
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1E40AF] bg-white border border-[#1E40AF]/30 rounded-md hover:bg-blue-50 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
            >
              Export Current View ({filteredChangedSections.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void import('../utils/exporters').then(({ exportChangeLogToCsv }) =>
                exportChangeLogToCsv(
                  allChangedSections,
                  'SpecDelta_All_Changes',
                  reviewedCodes,
                  {
                    oldFileName: diagnostics.oldFileName,
                    newFileName: diagnostics.newFileName,
                    oldScannedPages: diagnostics.oldScannedPages,
                    newScannedPages: diagnostics.newScannedPages,
                  }
                )
              );
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            All CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
          >
            <Printer className="w-3.5 h-3.5" />
            Print All ({allChangedSections.length})
          </button>
          <button
            type="button"
            aria-expanded={aiBriefEnabled}
            onClick={onToggleAiBrief}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              aiBriefEnabled
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#B45309]" />
            {aiBriefEnabled ? 'Hide Gemini Brief' : 'Opt-In Gemini Brief'}
          </button>
        </div>
      </div>

      {/* Parse Coverage & Bid-Day Verification Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums">
          <span className="font-mono font-semibold text-slate-800">
            Parse coverage: {diagnostics.oldSectionCount} CSI sections ({diagnostics.oldPageCount}{' '}
            pp.) vs. {diagnostics.newSectionCount} CSI sections ({diagnostics.newPageCount} pp.)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Automated diff aid — verify critical pricing, tolerances, and scope terms against the signed Addendum PDF.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {reviewedChangedCount > 0 && (
            <button
              type="button"
              onClick={onResetReviewed}
              className="text-slate-600 hover:text-[#B91C1C] underline underline-offset-2 cursor-pointer"
            >
              Reset reviewed ({reviewedChangedCount})
            </button>
          )}
          <a
            href="/terms"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                onNavigate('/terms');
              }
            }}
            className="text-[#1E40AF] font-medium hover:underline"
          >
            Verification standard
          </a>
        </div>
      </div>

      {showNoiseDrawer && (
        <NoiseDrawer
          diagnostics={diagnostics}
          noiseConfig={noiseConfig}
          isProcessing={isProcessing}
          onReparse={onReparseWithNoiseConfig}
          onClose={onToggleNoiseDrawer}
        />
      )}

      {aiBriefEnabled && (
        <AiScopeBriefPanel
          sectionsCount={changedPayloadEstimate.sectionsCount}
          cappedSectionsCount={changedPayloadEstimate.cappedSectionsCount}
          cappedCharCount={changedPayloadEstimate.cappedCharCount}
          loading={aiBriefLoading}
          notice={aiBriefNotice}
          error={aiBriefError}
          brief={aiBrief}
          onGenerate={onGenerateAiBrief}
        />
      )}

      {(topRiskSections.length > 0 || (diagnostics.renumberedCount ?? 0) > 0) && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="font-semibold text-[#B45309] inline-flex items-center gap-1.5 whitespace-nowrap">
              <AlertTriangle className="w-3.5 h-3.5" />
              Bid-Day Triage:
            </span>
            {topRiskSections.map((sec) => (
              <button
                key={sec.sectionCode}
                type="button"
                onClick={() => onSelectSection(sec.sectionCode, 'changed')}
                className={`inline-flex items-center gap-1.5 font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                  activeSectionCode === sec.sectionCode
                    ? 'text-[#1E40AF] underline underline-offset-4'
                    : 'text-slate-700 hover:text-[#1E40AF]'
                }`}
              >
                <span className="font-mono font-semibold tabular-nums">{sec.sectionCode}</span>
                <span className="text-slate-500">·</span>
                <span className="truncate max-w-[180px]">{sec.title}</span>
                <span className="font-mono text-[#B45309] tabular-nums">
                  ({sec.riskSeverity ? `${sec.riskSeverity} · ` : ''}
                  {sec.riskFlags.length} risk)
                </span>
              </button>
            ))}
          </div>
          {(diagnostics.renumberedCount ?? 0) > 0 && (
            <span className="font-mono text-[11px] text-slate-600 tabular-nums">
              {diagnostics.renumberedCount} renumbered section
              {diagnostics.renumberedCount === 1 ? '' : 's'} matched by title
            </span>
          )}
        </div>
      )}
    </>
  );
}
