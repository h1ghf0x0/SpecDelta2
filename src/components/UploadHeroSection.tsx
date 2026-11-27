import type { RefObject } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronUp,
  Download,
  FileText,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { HeroRedlineSpecimen } from './HeroRedlineSpecimen';
import {
  formatBytes,
  type FileSlotState,
  type FileUploadProgress,
} from './workbenchTypes';
import type { ComparisonMode, DiffRunOutput } from '../types/spec';

interface UploadHeroSectionProps {
  diffOutput: DiffRunOutput | null;
  heroExpanded: boolean;
  onSetHeroExpanded: (expanded: boolean) => void;
  oldSlot: FileSlotState;
  newSlot: FileSlotState;
  oldInputRef: RefObject<HTMLInputElement | null>;
  newInputRef: RefObject<HTMLInputElement | null>;
  fileProgressMap: Partial<Record<'old' | 'new', FileUploadProgress>>;
  comparisonMode: ComparisonMode;
  onChangeComparisonMode: (mode: ComparisonMode) => void;
  isProcessing: boolean;
  isDiffing: boolean;
  isGeneratingSample: boolean;
  errorMsg: string | null;
  onClearError: () => void;
  sentToGeminiInfo: { sectionsSent: number; totalChanged: number } | null;
  onFilesPick: (files: FileList | null | undefined, side: 'old' | 'new') => void;
  onCancelSlotWorker: (side: 'old' | 'new') => void;
  onSwapSlots: () => void;
  onRerunDiff: () => void;
  onLoadSample: () => void;
  onDownloadSamplePdfs: () => void;
}

const MODE_LABELS: Record<ComparisonMode, string> = {
  auto: 'Auto-Detect Addendum Type',
  partial: 'Partial / Narrative Addendum',
  conformed: 'Full Conformed Spec Book',
};

export function UploadHeroSection({
  diffOutput,
  heroExpanded,
  onSetHeroExpanded,
  oldSlot,
  newSlot,
  oldInputRef,
  newInputRef,
  fileProgressMap,
  comparisonMode,
  onChangeComparisonMode,
  isProcessing,
  isDiffing,
  isGeneratingSample,
  errorMsg,
  onClearError,
  sentToGeminiInfo,
  onFilesPick,
  onCancelSlotWorker,
  onSwapSlots,
  onRerunDiff,
  onLoadSample,
  onDownloadSamplePdfs,
}: UploadHeroSectionProps) {
  const renderSlotCard = (
    side: 'old' | 'new',
    slot: FileSlotState,
    inputRef: RefObject<HTMLInputElement | null>
  ) => {
    const isOld = side === 'old';
    const slotLabel = isOld
      ? '01. Baseline Specification'
      : '02. Revised Specification / Addendum';
    const emptyTitle = isOld
      ? 'Drop Original Project Manual PDF'
      : 'Drop Re-Issued Manual, Partial Addendum, or Narrative PDF';
    const emptySub = isOld
      ? 'Issued For Bid / Permit Set · Click or drag .pdf'
      : 'Full Set, Partial Sections, or Narrative Items · Click or drag .pdf';

    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFilesPick(e.dataTransfer.files, side);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={slot.fileName ? `${slotLabel}: ${slot.fileName}` : `${slotLabel}: ${emptyTitle}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`group rounded-lg border bg-white p-4 drafting-transition cursor-pointer flex flex-col justify-between gap-2.5 ${
          slot.status === 'error'
            ? 'border-red-300'
            : slot.status === 'ready' || slot.status === 'parsing'
            ? 'border-[#1E40AF]/50 ring-1 ring-[#1E40AF]/15'
            : 'border-slate-300 border-dashed hover:border-[#1E40AF]'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700 group-hover:text-[#1E40AF]">
              {isOld ? <Upload className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500">{slotLabel}</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900 truncate">
                {slot.fileName || emptyTitle}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {slot.status === 'idle' && emptySub}
                {slot.status === 'parsing' && (slot.progress?.detail ?? 'Parsing in worker...')}
                {slot.status === 'ready' && slot.parsed && (
                  <>
                    {formatBytes(slot.fileSize)} · {slot.parsed.pageCount} pp. ·{' '}
                    {slot.parsed.sections.length} CSI sections ·{' '}
                    {slot.parsed.strippedPatterns.length} noise patterns stripped
                  </>
                )}
                {slot.status === 'error' && <span className="text-red-700">{slot.error}</span>}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {slot.status === 'parsing' && slot.progress && (
              <>
                <span className="font-mono text-xs font-semibold text-[#1E40AF] tabular-nums">
                  {slot.progress.percent}%
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelSlotWorker(side);
                  }}
                  aria-label={`Cancel parsing ${slot.fileName}`}
                  className="text-xs text-slate-500 hover:text-red-700 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </>
            )}
            {slot.status === 'ready' && (
              <span className="text-xs font-medium text-[#15803D]">Ready</span>
            )}
          </div>
        </div>

        {slot.status === 'parsing' && slot.progress && (
          <div className="space-y-1.5">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1E40AF] transition-all duration-150"
                style={{ width: `${slot.progress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
              <span className="capitalize">Stage: {slot.progress.stage}</span>
              <span>{formatBytes(slot.fileSize)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (diffOutput && !heroExpanded) {
    return (
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs min-w-0">
            <div className="inline-flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
              <span className="text-slate-500">Baseline:</span>
              <span className="font-mono font-semibold text-slate-900 truncate max-w-[200px]">
                {diffOutput.diagnostics.oldFileName}
              </span>
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={onSwapSlots}
              title="Swap Baseline and Addendum files"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded hover:bg-slate-200/70 disabled:opacity-50 drafting-transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Swap
            </button>

            <div className="inline-flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
              <span className="text-slate-500">Addendum:</span>
              <span className="font-mono font-semibold text-slate-900 truncate max-w-[200px]">
                {diffOutput.diagnostics.newFileName}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span>Mode:</span>
              <select
                value={comparisonMode}
                onChange={(e) => onChangeComparisonMode(e.target.value as ComparisonMode)}
                aria-label="Addendum comparison mode"
                className="text-[11px] font-medium bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:border-[#1E40AF]"
              >
                {(['auto', 'partial', 'conformed'] as const).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1 tabular-nums">
              <ShieldCheck className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
              {sentToGeminiInfo
                ? `Local PDF parsing · Sent ${sentToGeminiInfo.sectionsSent} of ${sentToGeminiInfo.totalChanged} changed sections to Gemini`
                : 'PDFs stay local (AI brief opt-in)'}
            </span>
            <button
              type="button"
              onClick={() => onSetHeroExpanded(true)}
              className="px-3 py-1.5 text-xs font-medium text-[#1E40AF] bg-white border border-[#1E40AF]/30 rounded-md hover:bg-blue-50 drafting-transition cursor-pointer whitespace-nowrap shrink-0"
            >
              Replace Files
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 pb-3">
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start justify-between gap-3 text-xs text-red-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={onClearError}
                className="text-red-700 hover:text-red-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="blueprint-grid border-b border-slate-200">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-9 lg:py-11">
        {diffOutput && (
          <div className="mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onSetHeroExpanded(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Collapse Upload Panel
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 mb-2.5">
                <span>Full Manuals, Partial Reissues &amp; Narrative Addenda</span>
                <span aria-hidden="true">·</span>
                <span>Section-by-Section CSI Comparison</span>
              </div>
              <h1
                className="font-display font-bold tracking-tight text-slate-900 leading-[1.1] text-balance"
                style={{ fontSize: 'clamp(1.95rem, 3.1vw, 2.75rem)' }}
              >
                Addendum just dropped? See what actually changed.
              </h1>
              <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                Drop in the original spec book and the addendum—whether it&apos;s a full conformed set, a few reissued sections, or a narrative item sheet. SpecDelta lines them up section by section and flags what hits your price instead of lighting up every shifted page.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="grid grid-cols-1 gap-3">
                {renderSlotCard('old', oldSlot, oldInputRef)}
                {renderSlotCard('new', newSlot, newInputRef)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <p className="text-[11px] text-slate-500">
                  Works on selectable-text PDFs. Scanned sheets without a text layer aren&apos;t OCR&apos;d and are flagged for manual check.
                </p>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 shrink-0">
                  <span>Mode:</span>
                  <select
                    value={comparisonMode}
                    onChange={(e) => onChangeComparisonMode(e.target.value as ComparisonMode)}
                    aria-label="Addendum comparison mode"
                    className="text-[11px] font-medium bg-white border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:border-[#1E40AF]"
                  >
                    {(['auto', 'partial', 'conformed'] as const).map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroRedlineSpecimen onLoadSample={onLoadSample} isProcessing={isProcessing} />
          </div>
        </div>

        {(isProcessing ||
          Object.values(fileProgressMap).some(
            (entry) => entry?.status === 'parsing' || entry?.status === 'reading'
          )) && (
          <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>
                {isDiffing
                  ? 'Matching CSI sections and highlighting price & scope changes...'
                  : 'Reading your Project Manual PDFs on your computer...'}
              </span>
              <span className="font-mono text-slate-500 tabular-nums">
                {Object.keys(fileProgressMap).length} file
                {Object.keys(fileProgressMap).length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(['old', 'new'] as const).map((side) => {
                const entry = fileProgressMap[side];
                if (!entry) return null;
                return (
                  <div
                    key={side}
                    className="border border-slate-200 rounded-md p-3 bg-slate-50/70 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-900 truncate">
                        {side === 'old' ? 'Baseline' : 'Addendum'} · {entry.fileName}
                      </span>
                      <span
                        className={`font-mono font-semibold tabular-nums shrink-0 ${
                          entry.status === 'ready'
                            ? 'text-[#15803D]'
                            : entry.status === 'error'
                            ? 'text-[#B91C1C]'
                            : 'text-[#1E40AF]'
                        }`}
                      >
                        {entry.percent}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-150 ${
                          entry.status === 'ready'
                            ? 'bg-[#15803D]'
                            : entry.status === 'error'
                            ? 'bg-[#B91C1C]'
                            : 'bg-[#1E40AF]'
                        }`}
                        style={{ width: `${entry.percent}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-600 truncate tabular-nums">
                      {entry.detail}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3.5 py-2.5">
            <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
            {sentToGeminiInfo ? (
              <span>
                <strong className="font-semibold text-slate-900">
                  Local PDF Parsing · Sent {sentToGeminiInfo.sectionsSent} of{' '}
                  {sentToGeminiInfo.totalChanged} Changed Sections to Google Gemini.
                </strong>{' '}
                Full Project Manual PDFs remained in your browser.
              </span>
            ) : (
              <span>
                <strong className="font-semibold text-slate-900">
                  Full Project Manuals stay in your browser by default.
                </strong>{' '}
                All parsing, diffing, and Excel exports run locally; only an explicit click on Opt-In Gemini Brief sends compact changed excerpts.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {oldSlot.status === 'ready' && newSlot.status === 'ready' && (
              <>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onSwapSlots}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Swap Baseline ↔ Addendum
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onRerunDiff}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Re-Run Comparison
                </button>
              </>
            )}
            <button
              type="button"
              disabled={isProcessing}
              onClick={onLoadSample}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#1E40AF] bg-white border border-[#1E40AF]/30 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isGeneratingSample ? 'Building Sample PDFs...' : 'Try a sample addendum'}
            </button>
            <button
              type="button"
              onClick={onDownloadSamplePdfs}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download Sample PDFs
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between gap-3 text-sm text-red-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={onClearError}
              className="text-red-700 hover:text-red-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
