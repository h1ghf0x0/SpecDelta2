import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  FileText,
  Scissors,
  ShieldCheck,
  Square,
  Upload,
} from 'lucide-react';
import { slicePdfBySections } from '../utils/exporters';
import { generateSampleProjectManuals } from '../utils/sampleSpecGenerator';
import { parsePdfInWorker } from '../utils/specWorkerClient';
import type { AppRoute, SingleSpecParseOutput, WorkerProgress } from '../types/spec';

interface SpecSplitterProps {
  onNavigateWithDivision: (route: AppRoute, divisionCode?: string) => void;
}

export function SpecSplitter({ onNavigateWithDivision }: SpecSplitterProps) {
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [parseOutput, setParseOutput] = useState<SingleSpecParseOutput | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cancelRef.current?.();
    };
  }, []);

  const parseBuffer = async (buffer: ArrayBuffer, fileName: string) => {
    cancelRef.current?.();
    setErrorMsg(null);
    setExportNotice(null);
    setIsParsing(true);
    setProgress({ stage: 'loading', percent: 3, detail: `Dispatching ${fileName} to pdf-parser.worker...` });

    const { promise, cancel } = parsePdfInWorker(buffer, fileName, (p) => setProgress(p));
    cancelRef.current = cancel;

    try {
      const result = await promise;
      setPdfBuffer(buffer);
      setParseOutput(result);
      const defaultDiv =
        result.sections.find((s) => s.division !== '00' && s.division !== '01')?.division ??
        result.sections[0]?.division;
      const initialIds = new Set(
        result.sections.filter((s) => s.division === defaultDiv).map((s) => s.id)
      );
      setSelectedIds(initialIds);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse Project Manual PDF.');
    } finally {
      setIsParsing(false);
      cancelRef.current = null;
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Please select a valid .pdf Project Manual.');
      return;
    }
    const buffer = await file.arrayBuffer();
    await parseBuffer(buffer, file.name);
  };

  const handleLoadSample = async () => {
    setIsParsing(true);
    setProgress({ stage: 'loading', percent: 4, detail: 'Building sample Project Manual PDF...' });
    try {
      const sample = await generateSampleProjectManuals();
      const buf = sample.oldBytes.buffer.slice(
        sample.oldBytes.byteOffset,
        sample.oldBytes.byteOffset + sample.oldBytes.byteLength
      ) as ArrayBuffer;
      await parseBuffer(buf, sample.oldFileName);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sample manual.');
      setIsParsing(false);
    }
  };

  const divisions = useMemo(() => {
    if (!parseOutput) return [];
    const map = new Map<
      string,
      { code: string; title: string; sectionIds: string[]; pageCount: number }
    >();
    for (const sec of parseOutput.sections) {
      const pages = Math.max(1, sec.endPage - sec.startPage + 1);
      const existing = map.get(sec.division);
      if (existing) {
        existing.sectionIds.push(sec.id);
        existing.pageCount += pages;
      } else {
        map.set(sec.division, {
          code: sec.division,
          title: sec.divisionTitle,
          sectionIds: [sec.id],
          pageCount: pages,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [parseOutput]);

  const selectedSections = useMemo(() => {
    if (!parseOutput) return [];
    return parseOutput.sections.filter((s) => selectedIds.has(s.id));
  }, [parseOutput, selectedIds]);

  const selectedUniquePagesCount = useMemo(() => {
    const pages = new Set<number>();
    for (const sec of selectedSections) {
      for (let p = sec.startPage; p <= sec.endPage; p++) pages.add(p);
    }
    return pages.size;
  }, [selectedSections]);

  const toggleSection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDivision = (sectionIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = sectionIds.every((id) => next.has(id));
      for (const id of sectionIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleDownloadSplitPdf = async () => {
    if (!pdfBuffer || !parseOutput || selectedSections.length === 0) return;
    setIsExporting(true);
    setExportNotice(null);
    try {
      const divTags = Array.from(new Set(selectedSections.map((s) => `Div${s.division}`))).slice(0, 3);
      const baseName = parseOutput.fileName.replace(/\.pdf$/i, '');
      const outName = `${baseName}_${divTags.join('_')}_Extract.pdf`;
      const result = await slicePdfBySections(pdfBuffer, selectedSections, outName);
      setExportNotice(`Downloaded ${outName} (${result.pageCount} pages extracted locally).`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF extraction failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const primarySelectedDivision = selectedSections[0]?.division;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <section className="blueprint-grid border-b border-slate-200">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-10 lg:py-12">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 mb-3">
              <span>Free CSI MasterFormat Tool</span>
              <span aria-hidden="true">·</span>
              <span>Client-Side PDF Slicing</span>
              <span aria-hidden="true">·</span>
              <span>Instant Division Download</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
              CSI MasterFormat Spec Book Splitter
            </h1>
            <p className="mt-3 text-base text-slate-600 leading-relaxed max-w-2xl">
              Received an 800-page GC Project Manual when you only bid 3 sections? Drop the PDF below to automatically index every CSI Division inside our Web Worker and download a clean PDF of just your scope.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFileChange(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className="lg:col-span-8 bg-white border border-dashed border-slate-300 hover:border-[#1E40AF] rounded-lg p-5 flex items-center justify-between gap-4 cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  void handleFileChange(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[#1E40AF] shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {parseOutput ? parseOutput.fileName : 'Drop Full Project Manual PDF to Split'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {parseOutput
                      ? `${parseOutput.pageCount} pages · ${parseOutput.sections.length} CSI sections indexed in ${(parseOutput.parseTimeMs / 1000).toFixed(2)}s`
                      : 'Click or drag .pdf · Runs 100% locally in your browser'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-[#1E40AF] whitespace-nowrap shrink-0">
                Browse PDF
              </span>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={isParsing}
                onClick={() => void handleLoadSample()}
                className="w-full px-4 py-3 text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer"
              >
                Load Sample Project Manual
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-600 px-1">
                <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                <span>100% Private — PDF slicing runs locally on your device.</span>
              </div>
            </div>
          </div>

          {isParsing && progress && (
            <div className="mt-5 bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                <span>{progress.detail}</span>
                <span className="font-mono tabular-nums text-[#1E40AF]">{progress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1E40AF] transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mt-5 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </section>

      {parseOutput && (
        <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 tabular-nums">
                {selectedSections.length} CSI sections selected · {selectedUniquePagesCount} pages ready to extract
              </div>
              {exportNotice && (
                <div className="text-xs font-medium text-[#15803D]">{exportNotice}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isExporting || selectedSections.length === 0}
                onClick={() => void handleDownloadSplitPdf()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Scissors className="w-4 h-4" />
                {isExporting ? 'Extracting PDF...' : 'Download Extracted PDF'}
              </button>

              <button
                type="button"
                onClick={() => onNavigateWithDivision('/', primarySelectedDivision)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#1E40AF] bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Compare against Addendum 1
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">Select by CSI Division</span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(new Set(parseOutput.sections.map((s) => s.id)))
                    }
                    className="text-[#1E40AF] hover:underline cursor-pointer"
                  >
                    All
                  </button>
                  <span aria-hidden="true" className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-600 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {divisions.map((div) => {
                  const allSelected = div.sectionIds.every((id) => selectedIds.has(id));
                  const someSelected =
                    !allSelected && div.sectionIds.some((id) => selectedIds.has(id));
                  return (
                    <button
                      key={div.code}
                      type="button"
                      onClick={() => toggleDivision(div.sectionIds)}
                      className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {allSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#1E40AF] shrink-0" />
                        ) : (
                          <Square
                            className={`w-4 h-4 shrink-0 ${
                              someSelected ? 'text-[#1E40AF]' : 'text-slate-400'
                            }`}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            <span className="font-mono mr-1.5 tabular-nums">Div {div.code}</span>
                            {div.title}
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {div.sectionIds.length} sections · ~{div.pageCount} pages
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Individual CSI MasterFormat Sections
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {parseOutput.sections.length} sections found
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-white">
                      <th className="py-2.5 px-4 w-10">Pick</th>
                      <th className="py-2.5 px-3">Section #</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3 text-right">Pages</th>
                      <th className="py-2.5 px-4 text-right">Length</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {parseOutput.sections.map((sec) => {
                      const checked = selectedIds.has(sec.id);
                      const len = Math.max(1, sec.endPage - sec.startPage + 1);
                      return (
                        <tr
                          key={sec.id}
                          onClick={() => toggleSection(sec.id)}
                          className={`cursor-pointer transition-colors ${
                            checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-4">
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-[#1E40AF]" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                            {sec.normalizedCode}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">
                            {sec.title}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 text-right whitespace-nowrap tabular-nums">
                            {sec.startPage === sec.endPage
                              ? `p. ${sec.startPage}`
                              : `pp. ${sec.startPage}–${sec.endPage}`}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-500 text-right whitespace-nowrap tabular-nums">
                            {len} {len === 1 ? 'pg' : 'pp'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-[#1E40AF] shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Got an Addendum? Compare your Division {primarySelectedDivision ?? '08'} sections against Addendum 1 in 5 seconds
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Launch the SpecDelta Diff Checker pre-filtered to your trade division and catch unclouded changes instantly.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateWithDivision('/', primarySelectedDivision)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Compare Division {primarySelectedDivision ?? '08'} Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
