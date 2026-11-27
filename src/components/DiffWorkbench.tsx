import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { compareParsedBooks } from '../utils/specDiffEngine';
import { DiagnosticsBanners } from './DiagnosticsBanners';
import { DiffPrintReport } from './DiffPrintReport';
import { EmptyWorkbenchGuide } from './EmptyWorkbenchGuide';
import type { DiffViewMode } from './RedlineTokenRenderer';
import { SectionDiffInspector } from './SectionDiffInspector';
import { SectionListRail } from './SectionListRail';
import { UploadHeroSection } from './UploadHeroSection';
import {
  EMPTY_SLOT,
  formatBytes,
  type DiffCounts,
  type FileSlotState,
  type FileUploadProgress,
  type StatusFilter,
} from './workbenchTypes';
import {
  DEFAULT_NOISE_CONFIG,
  type AppRoute,
  type ComparisonMode,
  type DiffRunOutput,
  type DiffSectionResult,
  type NoiseFilterConfig,
  type ScopeBriefResponse,
  type SingleSpecParseOutput,
  type WorkerProgress,
} from '../types/spec';

interface DiffWorkbenchProps {
  onNavigate: (route: AppRoute) => void;
  externalSampleRequest: number;
  initialDivisionFilter?: string;
  onBusyChange?: (busy: boolean) => void;
}

function getReviewStorageKey(
  oldContentHash: string | undefined,
  newContentHash: string | undefined,
  oldFileName: string,
  oldPageCount: number,
  newFileName: string,
  newPageCount: number
): string {
  if (oldContentHash && newContentHash) {
    return `specdelta:reviewed:v2:${oldContentHash}::${newContentHash}`;
  }
  return `specdelta:reviewed:${oldFileName}:${oldPageCount}::${newFileName}:${newPageCount}`;
}

function readInitialQueryParams() {
  if (typeof window === 'undefined') {
    return {
      section: null as string | null,
      filter: 'changed' as StatusFilter,
      div: 'all',
      sort: 'risk' as 'risk' | 'csi',
      mode: 'auto' as ComparisonMode,
    };
  }
  const params = new URLSearchParams(window.location.search);
  const rawFilter = params.get('filter');
  const validFilters: StatusFilter[] = [
    'all',
    'changed',
    'modified',
    'added',
    'deleted',
    'unchanged',
    'not-reissued',
    'risk',
  ];
  const filter = validFilters.includes(rawFilter as StatusFilter)
    ? (rawFilter as StatusFilter)
    : 'changed';
  const rawSort = params.get('sort');
  const sort: 'risk' | 'csi' = rawSort === 'csi' ? 'csi' : 'risk';
  const rawMode = params.get('mode');
  const mode: ComparisonMode =
    rawMode === 'partial' || rawMode === 'conformed' ? rawMode : 'auto';
  const div = params.get('div') || 'all';
  const section = params.get('section') || null;
  return { section, filter, div, sort, mode };
}

function isStaticStatus(sec: DiffSectionResult): boolean {
  return sec.status === 'unchanged' || sec.status === 'not-reissued';
}

function compareSectionsByRiskPriority(a: DiffSectionResult, b: DiffSectionResult): number {
  const aChanged = !isStaticStatus(a) ? 1 : 0;
  const bChanged = !isStaticStatus(b) ? 1 : 0;
  if (aChanged !== bChanged) return bChanged - aChanged;

  const aScore = !isStaticStatus(a) ? (a.riskScore ?? a.riskFlags.length * 5) : 0;
  const bScore = !isStaticStatus(b) ? (b.riskScore ?? b.riskFlags.length * 5) : 0;
  if (aScore !== bScore) return bScore - aScore;

  const aRisk = !isStaticStatus(a) ? a.riskFlags.length : 0;
  const bRisk = !isStaticStatus(b) ? b.riskFlags.length : 0;
  if (aRisk !== bRisk) return bRisk - aRisk;

  const aChurn = a.addedWords + a.deletedWords;
  const bChurn = b.addedWords + b.deletedWords;
  if (aChurn !== bChurn) return bChurn - aChurn;

  return a.sectionCode.localeCompare(b.sectionCode);
}

export function DiffWorkbench({
  onNavigate,
  externalSampleRequest,
  initialDivisionFilter = 'all',
  onBusyChange,
}: DiffWorkbenchProps) {
  const initialQuery = useMemo(() => readInitialQueryParams(), []);

  const [oldSlot, setOldSlot] = useState<FileSlotState>(EMPTY_SLOT);
  const [newSlot, setNewSlot] = useState<FileSlotState>(EMPTY_SLOT);
  const [fileProgressMap, setFileProgressMap] = useState<
    Partial<Record<'old' | 'new', FileUploadProgress>>
  >({});
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);
  const [isReparsingNoise, setIsReparsingNoise] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diffOutput, setDiffOutput] = useState<DiffRunOutput | null>(null);
  const [heroExpanded, setHeroExpanded] = useState(true);

  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(initialQuery.mode);
  const [selectedCode, setSelectedCode] = useState<string | null>(initialQuery.section);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialQuery.filter);
  const [divisionFilter, setDivisionFilter] = useState<string>(
    initialDivisionFilter !== 'all' ? initialDivisionFilter : initialQuery.div
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullSection, setShowFullSection] = useState(false);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('inline');
  const [sortBy, setSortBy] = useState<'risk' | 'csi'>(initialQuery.sort);
  const [showNoiseDrawer, setShowNoiseDrawer] = useState(false);
  const [noiseConfig, setNoiseConfig] = useState<NoiseFilterConfig>(DEFAULT_NOISE_CONFIG);
  const [reviewedCodes, setReviewedCodes] = useState<Set<string>>(() => new Set());
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [showAllScannedPages, setShowAllScannedPages] = useState(false);

  const [aiBriefEnabled, setAiBriefEnabled] = useState(false);
  const [aiBriefLoading, setAiBriefLoading] = useState(false);
  const [aiBriefError, setAiBriefError] = useState<string | null>(null);
  const [aiBriefNotice, setAiBriefNotice] = useState<string | null>(null);
  const [aiBrief, setAiBrief] = useState<ScopeBriefResponse | null>(null);
  const [sentToGeminiInfo, setSentToGeminiInfo] = useState<{
    sectionsSent: number;
    totalChanged: number;
  } | null>(null);

  const oldInputRef = useRef<HTMLInputElement | null>(null);
  const newInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const oldWorkerRef = useRef<Worker | null>(null);
  const newWorkerRef = useRef<Worker | null>(null);
  const oldGenRef = useRef(0);
  const newGenRef = useRef(0);
  const lastHandledSampleRef = useRef(0);
  const skipScrollOnNextDiffRef = useRef(false);

  const isProcessing =
    isGeneratingSample ||
    isDiffing ||
    oldSlot.status === 'parsing' ||
    newSlot.status === 'parsing';

  useEffect(() => {
    if (initialDivisionFilter && initialDivisionFilter !== 'all') {
      setDivisionFilter(initialDivisionFilter);
    }
  }, [initialDivisionFilter]);

  useEffect(() => {
    onBusyChange?.(isProcessing);
  }, [isProcessing, onBusyChange]);

  useEffect(() => {
    return () => {
      oldWorkerRef.current?.terminate();
      newWorkerRef.current?.terminate();
    };
  }, []);

  const activeReviewStorageKey = useMemo(() => {
    if (!diffOutput) return null;
    return getReviewStorageKey(
      diffOutput.diagnostics.oldContentHash,
      diffOutput.diagnostics.newContentHash,
      diffOutput.diagnostics.oldFileName,
      diffOutput.diagnostics.oldPageCount,
      diffOutput.diagnostics.newFileName,
      diffOutput.diagnostics.newPageCount
    );
  }, [diffOutput]);

  useEffect(() => {
    if (!activeReviewStorageKey) return;
    try {
      window.localStorage.setItem(
        activeReviewStorageKey,
        JSON.stringify(Array.from(reviewedCodes))
      );
    } catch {
      // Ignore storage quota or private-mode errors gracefully
    }
  }, [activeReviewStorageKey, reviewedCodes]);

  useEffect(() => {
    if (window.location.pathname !== '/' || !diffOutput) return;
    const params = new URLSearchParams();
    if (selectedCode) params.set('section', selectedCode);
    if (statusFilter !== 'changed') params.set('filter', statusFilter);
    if (divisionFilter !== 'all') params.set('div', divisionFilter);
    if (sortBy !== 'risk') params.set('sort', sortBy);
    if (comparisonMode !== 'auto') params.set('mode', comparisonMode);
    const qs = params.toString();
    const nextUrl = qs ? `/?${qs}` : '/';
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [diffOutput, selectedCode, statusFilter, divisionFilter, sortBy, comparisonMode]);

  // Run section-to-section diff whenever parsed inputs or comparisonMode change
  useEffect(() => {
    if (
      oldSlot.status === 'ready' &&
      oldSlot.parsed &&
      newSlot.status === 'ready' &&
      newSlot.parsed
    ) {
      const oldParsed = oldSlot.parsed;
      const newParsed = newSlot.parsed;
      setIsDiffing(true);
      const timerId = window.setTimeout(() => {
        const output = compareParsedBooks(oldParsed, newParsed, { mode: comparisonMode });
        const pairKey = getReviewStorageKey(
          output.diagnostics.oldContentHash,
          output.diagnostics.newContentHash,
          output.diagnostics.oldFileName,
          output.diagnostics.oldPageCount,
          output.diagnostics.newFileName,
          output.diagnostics.newPageCount
        );
        let restoredReviewed = new Set<string>();
        try {
          const savedRaw = window.localStorage.getItem(pairKey);
          if (savedRaw) {
            const parsedSaved = JSON.parse(savedRaw);
            if (Array.isArray(parsedSaved)) {
              const validCodes = new Set(output.results.map((r) => r.sectionCode));
              restoredReviewed = new Set(
                parsedSaved.filter(
                  (c): c is string => typeof c === 'string' && validCodes.has(c)
                )
              );
            }
          }
        } catch {
          restoredReviewed = new Set<string>();
        }
        setReviewedCodes((prev) =>
          skipScrollOnNextDiffRef.current && prev.size > 0 ? prev : restoredReviewed
        );

        setDiffOutput(output);
        const changed = output.results.filter((r) => !isStaticStatus(r));
        const topRisk = [...changed]
          .filter((r) => r.riskFlags.length > 0)
          .sort(compareSectionsByRiskPriority)[0];
        const firstTarget = topRisk ?? changed[0] ?? output.results[0] ?? null;
        setSelectedCode((prev) =>
          prev && output.results.some((r) => r.sectionCode === prev)
            ? prev
            : firstTarget
            ? firstTarget.sectionCode
            : null
        );
        if (!skipScrollOnNextDiffRef.current) {
          setStatusFilter((prev) => (changed.length > 0 ? prev : 'all'));
          setShowFullSection(false);
          setHeroExpanded(false);
          window.requestAnimationFrame(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
        skipScrollOnNextDiffRef.current = false;
        setIsReparsingNoise(false);
        setIsDiffing(false);
      }, 0);
      return () => window.clearTimeout(timerId);
    }
  }, [oldSlot.status, oldSlot.parsed, newSlot.status, newSlot.parsed, comparisonMode]);

  const cancelSlotWorker = (side: 'old' | 'new') => {
    const workerRef = side === 'old' ? oldWorkerRef : newWorkerRef;
    const genRef = side === 'old' ? oldGenRef : newGenRef;
    const setSlot = side === 'old' ? setOldSlot : setNewSlot;
    genRef.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setSlot(EMPTY_SLOT);
    setFileProgressMap((prev) => {
      const next = { ...prev };
      delete next[side];
      return next;
    });
  };

  const parseSlot = (
    side: 'old' | 'new',
    buffer: ArrayBuffer,
    fileName: string,
    fileSize: number,
    existingGen?: number,
    overrideConfig?: NoiseFilterConfig,
    options?: { preserveDiff?: boolean }
  ): Promise<void> => {
    const workerRef = side === 'old' ? oldWorkerRef : newWorkerRef;
    const genRef = side === 'old' ? oldGenRef : newGenRef;
    const setSlot = side === 'old' ? setOldSlot : setNewSlot;
    const activeNoiseConfig = overrideConfig ?? noiseConfig;
    const preserveDiff = Boolean(options?.preserveDiff);

    workerRef.current?.terminate();
    const myGen = existingGen ?? ++genRef.current;
    const requestId = `${side}_${myGen}`;

    setErrorMsg(null);
    if (!preserveDiff) {
      setDiffOutput(null);
      setAiBrief(null);
      setAiBriefError(null);
      setSentToGeminiInfo(null);
      setReviewedCodes(new Set());
    }

    const initialProgress: WorkerProgress = {
      stage: 'loading',
      percent: 3,
      detail: `Initializing Web Worker for ${fileName}...`,
    };

    setSlot({
      fileName,
      fileSize,
      buffer,
      status: 'parsing',
      progress: initialProgress,
      parsed: null,
      error: null,
    });
    setFileProgressMap((prev) => ({
      ...prev,
      [side]: {
        side,
        fileName,
        fileSize,
        status: 'parsing',
        stage: 'loading',
        percent: initialProgress.percent,
        detail: initialProgress.detail,
      },
    }));

    const worker = new Worker(new URL('../workers/pdf-parser.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    return new Promise<void>((resolve) => {
      worker.onmessage = (event: MessageEvent) => {
        if (genRef.current !== myGen) return;
        const msg = event.data;
        if (!msg || msg.requestId !== requestId) return;

        if (msg.type === 'progress') {
          const p = msg.payload as WorkerProgress;
          setSlot((prev) => ({ ...prev, progress: p }));
          setFileProgressMap((prev) => ({
            ...prev,
            [side]: {
              side,
              fileName,
              fileSize,
              status: 'parsing',
              stage: p.stage,
              percent: p.percent,
              detail: p.detail,
            },
          }));
        } else if (msg.type === 'complete') {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          const parsed = msg.payload as SingleSpecParseOutput;
          setSlot({
            fileName,
            fileSize,
            buffer,
            status: 'ready',
            progress: { stage: 'complete', percent: 100, detail: 'Parsed cleanly.' },
            parsed,
            error: null,
          });
          setFileProgressMap((prev) => ({
            ...prev,
            [side]: {
              side,
              fileName,
              fileSize,
              status: 'ready',
              stage: 'complete',
              percent: 100,
              detail: `${parsed.pageCount} pages · ${parsed.sections.length} CSI sections`,
            },
          }));
          resolve();
        } else if (msg.type === 'error') {
          worker.terminate();
          if (workerRef.current === worker) workerRef.current = null;
          const message = String(msg.payload || 'Unable to parse PDF.');
          setSlot({
            fileName,
            fileSize,
            buffer,
            status: 'error',
            progress: null,
            parsed: null,
            error: message,
          });
          setFileProgressMap((prev) => ({
            ...prev,
            [side]: {
              side,
              fileName,
              fileSize,
              status: 'error',
              stage: 'loading',
              percent: 0,
              detail: message,
            },
          }));
          setErrorMsg(message);
          resolve();
        }
      };

      worker.onerror = (err) => {
        if (genRef.current !== myGen) return;
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        const message = err.message || 'Web Worker execution error.';
        setSlot({
          fileName,
          fileSize,
          buffer,
          status: 'error',
          progress: null,
          parsed: null,
          error: message,
        });
        setFileProgressMap((prev) => ({
          ...prev,
          [side]: {
            side,
            fileName,
            fileSize,
            status: 'error',
            stage: 'loading',
            percent: 0,
            detail: message,
          },
        }));
        setErrorMsg(message);
        resolve();
      };

      const transferableCopy = buffer.slice(0);
      worker.postMessage(
        {
          type: 'parse-pdf',
          requestId,
          buffer: transferableCopy,
          fileName,
          noiseConfig: activeNoiseConfig,
        },
        [transferableCopy]
      );
    });
  };

  const handleReparseWithNoiseConfig = (nextConfig: NoiseFilterConfig) => {
    setNoiseConfig(nextConfig);
    skipScrollOnNextDiffRef.current = true;
    setIsReparsingNoise(true);
    const jobs: Array<Promise<void>> = [];
    if (oldSlot.buffer && oldSlot.fileName) {
      jobs.push(
        parseSlot('old', oldSlot.buffer, oldSlot.fileName, oldSlot.fileSize, undefined, nextConfig, {
          preserveDiff: true,
        })
      );
    }
    if (newSlot.buffer && newSlot.fileName) {
      jobs.push(
        parseSlot('new', newSlot.buffer, newSlot.fileName, newSlot.fileSize, undefined, nextConfig, {
          preserveDiff: true,
        })
      );
    }
    if (jobs.length === 0) {
      skipScrollOnNextDiffRef.current = false;
      setIsReparsingNoise(false);
      return;
    }
    void Promise.all(jobs).finally(() => {
      if (!(oldSlot.buffer && newSlot.buffer)) {
        setIsReparsingNoise(false);
      }
    });
  };

  const handleSwapSlots = () => {
    if (isProcessing) return;
    const prevOld = oldSlot;
    const prevNew = newSlot;
    setOldSlot(prevNew);
    setNewSlot(prevOld);
    setAiBrief(null);
    setAiBriefError(null);
    setAiBriefNotice(null);
    setSentToGeminiInfo(null);
    setFileProgressMap((prev) => ({
      old: prev.new ? { ...prev.new, side: 'old' } : undefined,
      new: prev.old ? { ...prev.old, side: 'new' } : undefined,
    }));
  };

  const handleLoadSample = async () => {
    setErrorMsg(null);
    setIsGeneratingSample(true);
    try {
      const { generateSampleProjectManuals } = await import('../utils/sampleSpecGenerator');
      const sample = await generateSampleProjectManuals();
      const oldBuf = sample.oldBytes.buffer.slice(
        sample.oldBytes.byteOffset,
        sample.oldBytes.byteOffset + sample.oldBytes.byteLength
      ) as ArrayBuffer;
      const newBuf = sample.newBytes.buffer.slice(
        sample.newBytes.byteOffset,
        sample.newBytes.byteOffset + sample.newBytes.byteLength
      ) as ArrayBuffer;

      setIsGeneratingSample(false);
      await Promise.all([
        parseSlot('old', oldBuf, sample.oldFileName, sample.oldBytes.byteLength),
        parseSlot('new', newBuf, sample.newFileName, sample.newBytes.byteLength),
      ]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate sample Project Manuals.');
      setIsGeneratingSample(false);
    }
  };

  useEffect(() => {
    if (externalSampleRequest > 0 && externalSampleRequest !== lastHandledSampleRef.current) {
      lastHandledSampleRef.current = externalSampleRequest;
      void handleLoadSample();
    }
  }, [externalSampleRequest]);

  const handleDownloadSamplePdfs = async () => {
    const [{ generateSampleProjectManuals }, { triggerBlobDownload }] = await Promise.all([
      import('../utils/sampleSpecGenerator'),
      import('../utils/exporters'),
    ]);
    const sample = await generateSampleProjectManuals();
    triggerBlobDownload(
      new Blob([sample.oldBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
      sample.oldFileName
    );
    setTimeout(() => {
      triggerBlobDownload(
        new Blob([sample.newBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
        sample.newFileName
      );
    }, 250);
  };

  const beginReadingFile = async (file: File, side: 'old' | 'new') => {
    const workerRef = side === 'old' ? oldWorkerRef : newWorkerRef;
    const genRef = side === 'old' ? oldGenRef : newGenRef;
    const setSlot = side === 'old' ? setOldSlot : setNewSlot;

    workerRef.current?.terminate();
    const myGen = ++genRef.current;

    setSlot({
      fileName: file.name,
      fileSize: file.size,
      buffer: null,
      status: 'parsing',
      progress: {
        stage: 'loading',
        percent: 1,
        detail: `Reading ${file.name} (${formatBytes(file.size)})...`,
      },
      parsed: null,
      error: null,
    });
    setFileProgressMap((prev) => ({
      ...prev,
      [side]: {
        side,
        fileName: file.name,
        fileSize: file.size,
        status: 'reading',
        stage: 'reading',
        percent: 1,
        detail: `Reading file bytes (${formatBytes(file.size)})...`,
      },
    }));

    const buffer = await file.arrayBuffer();
    if (genRef.current !== myGen) return;
    await parseSlot(side, buffer, file.name, file.size, myGen);
  };

  const handleFilesPick = async (fileList: FileList | null | undefined, side: 'old' | 'new') => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const invalid = files.find(
      (f) => f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')
    );
    if (invalid) {
      setErrorMsg(`"${invalid.name}" is not a valid .pdf Project Manual file.`);
      return;
    }

    if (files.length >= 2) {
      void Promise.all([
        beginReadingFile(files[0], 'old'),
        beginReadingFile(files[1], 'new'),
      ]);
      return;
    }

    void beginReadingFile(files[0], side);
  };

  const handleRerunDiff = () => {
    if (oldSlot.parsed && newSlot.parsed) {
      const output = compareParsedBooks(oldSlot.parsed, newSlot.parsed, { mode: comparisonMode });
      setDiffOutput(output);
    }
  };

  const handleChangeComparisonMode = (nextMode: ComparisonMode) => {
    skipScrollOnNextDiffRef.current = true;
    setComparisonMode(nextMode);
  };

  const availableDivisions = useMemo(() => {
    if (!diffOutput) return [];
    const map = new Map<string, string>();
    for (const r of diffOutput.results) {
      if (!map.has(r.division)) map.set(r.division, r.divisionTitle);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [diffOutput]);

  const counts: DiffCounts = useMemo(() => {
    if (!diffOutput) {
      return {
        total: 0,
        modified: 0,
        added: 0,
        deleted: 0,
        unchanged: 0,
        notReissued: 0,
        risk: 0,
        changed: 0,
      };
    }
    let modified = 0;
    let added = 0;
    let deleted = 0;
    let unchanged = 0;
    let notReissued = 0;
    let risk = 0;
    for (const r of diffOutput.results) {
      if (r.status === 'modified') modified++;
      else if (r.status === 'added') added++;
      else if (r.status === 'deleted') deleted++;
      else if (r.status === 'not-reissued') notReissued++;
      else unchanged++;
      if (r.riskFlags.length > 0 && !isStaticStatus(r)) risk++;
    }
    return {
      total: diffOutput.results.length,
      modified,
      added,
      deleted,
      unchanged,
      notReissued,
      risk,
      changed: modified + added + deleted,
    };
  }, [diffOutput]);

  const filteredSections = useMemo(() => {
    if (!diffOutput) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = diffOutput.results.filter((r) => {
      if (divisionFilter !== 'all' && r.division !== divisionFilter) return false;
      if (statusFilter === 'changed' && isStaticStatus(r)) return false;
      if (statusFilter === 'modified' && r.status !== 'modified') return false;
      if (statusFilter === 'added' && r.status !== 'added') return false;
      if (statusFilter === 'deleted' && r.status !== 'deleted') return false;
      if (statusFilter === 'unchanged' && r.status !== 'unchanged') return false;
      if (statusFilter === 'not-reissued' && r.status !== 'not-reissued') return false;
      if (statusFilter === 'risk' && (r.riskFlags.length === 0 || isStaticStatus(r))) return false;
      if (q) {
        const hay = `${r.sectionCode} ${r.renumberedFrom ?? ''} ${r.title} ${r.divisionTitle} ${r.riskFlags.join(' ')} ${r.fullNewText} ${r.fullOldText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'csi') {
      return [...list].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
    }

    return [...list].sort(compareSectionsByRiskPriority);
  }, [diffOutput, divisionFilter, statusFilter, searchQuery, sortBy]);

  const topRiskSections = useMemo(() => {
    if (!diffOutput) return [];
    return diffOutput.results
      .filter((r) => !isStaticStatus(r) && r.riskFlags.length > 0)
      .sort(compareSectionsByRiskPriority)
      .slice(0, 3);
  }, [diffOutput]);

  const activeSection: DiffSectionResult | null = useMemo(() => {
    if (!diffOutput) return null;
    return (
      filteredSections.find((s) => s.sectionCode === selectedCode) ??
      filteredSections[0] ??
      null
    );
  }, [diffOutput, filteredSections, selectedCode]);

  const allChangedSections = useMemo(() => {
    if (!diffOutput) return [];
    const list = diffOutput.results.filter(
      (r) => !isStaticStatus(r) || Boolean(r.renumberedFrom)
    );
    if (sortBy === 'csi') {
      return [...list].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
    }
    return [...list].sort(compareSectionsByRiskPriority);
  }, [diffOutput, sortBy]);

  const filteredChangedSections = useMemo(
    () =>
      filteredSections.filter(
        (r) => !isStaticStatus(r) || Boolean(r.renumberedFrom)
      ),
    [filteredSections]
  );

  const reviewedChangedCount = useMemo(() => {
    if (!diffOutput) return 0;
    let count = 0;
    for (const r of diffOutput.results) {
      if (!isStaticStatus(r) && reviewedCodes.has(r.sectionCode)) {
        count++;
      }
    }
    return count;
  }, [diffOutput, reviewedCodes]);

  const announceSection = useCallback(
    (sec: DiffSectionResult, extraPrefix?: string) => {
      const riskText =
        sec.riskFlags.length > 0
          ? `${sec.riskFlags.length} risk flag${sec.riskFlags.length === 1 ? '' : 's'}`
          : 'no risk flags';
      const revText = reviewedCodes.has(sec.sectionCode) ? 'Reviewed' : 'Unreviewed';
      setLiveAnnouncement(
        `${extraPrefix ? `${extraPrefix}: ` : ''}${sec.sectionCode} ${sec.title}, ${sec.status}, ${riskText}, ${revText}`
      );
    },
    [reviewedCodes]
  );

  const toggleReviewed = useCallback((sectionCode: string) => {
    setReviewedCodes((prev) => {
      const next = new Set(prev);
      const nowReviewed = !next.has(sectionCode);
      if (nowReviewed) next.add(sectionCode);
      else next.delete(sectionCode);
      setLiveAnnouncement(
        `${sectionCode} marked as ${nowReviewed ? 'reviewed' : 'unreviewed'}`
      );
      return next;
    });
  }, []);

  const activeIndex = useMemo(() => {
    if (!activeSection) return -1;
    return filteredSections.findIndex((s) => s.sectionCode === activeSection.sectionCode);
  }, [filteredSections, activeSection]);

  const stepSection = useCallback(
    (delta: -1 | 1) => {
      if (filteredSections.length === 0) return;
      const currentIdx = activeIndex >= 0 ? activeIndex : 0;
      const nextIdx = (currentIdx + delta + filteredSections.length) % filteredSections.length;
      const target = filteredSections[nextIdx];
      setSelectedCode(target.sectionCode);
      setShowFullSection(false);
      announceSection(target);
    },
    [filteredSections, activeIndex, announceSection]
  );

  const jumpToNextMatching = useCallback(
    (kind: 'risk' | 'unreviewed') => {
      const matches = (sec: DiffSectionResult) =>
        kind === 'risk'
          ? !isStaticStatus(sec) && sec.riskFlags.length > 0
          : !isStaticStatus(sec) && !reviewedCodes.has(sec.sectionCode);

      if (filteredSections.length > 0) {
        const startIdx = activeIndex >= 0 ? activeIndex + 1 : 0;
        for (let offset = 0; offset < filteredSections.length; offset++) {
          const cand = filteredSections[(startIdx + offset) % filteredSections.length];
          if (matches(cand)) {
            setSelectedCode(cand.sectionCode);
            setShowFullSection(false);
            announceSection(
              cand,
              kind === 'risk' ? 'Next risk section' : 'Next unreviewed section'
            );
            return;
          }
        }
      }

      const fallback = allChangedSections.find(matches);
      if (fallback) {
        setStatusFilter(kind === 'risk' ? 'risk' : 'changed');
        setDivisionFilter('all');
        setSearchQuery('');
        setSelectedCode(fallback.sectionCode);
        setShowFullSection(false);
        announceSection(
          fallback,
          kind === 'risk' ? 'Next risk section' : 'Next unreviewed section'
        );
        return;
      }

      setLiveAnnouncement(
        kind === 'risk'
          ? 'No risk-flagged sections found in this comparison.'
          : 'All changed sections have been reviewed.'
      );
    },
    [filteredSections, allChangedSections, activeIndex, reviewedCodes, announceSection]
  );

  useEffect(() => {
    if (!diffOutput) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        stepSection(1);
      } else if (key === 'p') {
        e.preventDefault();
        stepSection(-1);
      } else if (key === 'r') {
        e.preventDefault();
        jumpToNextMatching('risk');
      } else if (key === 'u') {
        e.preventDefault();
        jumpToNextMatching('unreviewed');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [diffOutput, stepSection, jumpToNextMatching]);

  const changedPayloadEstimate = useMemo(() => {
    if (!diffOutput) {
      return {
        sectionsCount: 0,
        cappedSectionsCount: 0,
        charCount: 0,
        cappedCharCount: 0,
      };
    }
    const changed = diffOutput.results.filter((r) => !isStaticStatus(r));
    const ranked = [...changed].sort(compareSectionsByRiskPriority);
    const charCount = changed.reduce(
      (sum, s) =>
        sum +
        s.changedParagraphs.reduce(
          (pSum, p) => pSum + p.oldText.length + p.newText.length,
          0
        ),
      0
    );
    const top25 = ranked.slice(0, 25);
    const cappedCharCount = top25.reduce(
      (sum, s) =>
        sum +
        s.changedParagraphs
          .slice(0, 8)
          .reduce(
            (pSum, p) =>
              pSum + Math.min(700, p.oldText.length) + Math.min(700, p.newText.length),
            0
          ),
      0
    );
    return {
      sectionsCount: changed.length,
      cappedSectionsCount: top25.length,
      charCount,
      cappedCharCount,
    };
  }, [diffOutput]);

  const handleGenerateAiBrief = async () => {
    if (!diffOutput) return;
    const changedSections = diffOutput.results.filter((r) => !isStaticStatus(r));
    if (changedSections.length === 0) return;

    const ranked = [...changedSections].sort(compareSectionsByRiskPriority);

    const buildPayload = (maxSections: number, maxParas: number, maxChars: number) =>
      JSON.stringify({
        totalChangedCount: changedSections.length,
        sections: ranked.slice(0, maxSections).map((s) => ({
          sectionCode: s.sectionCode,
          division: `${s.division} - ${s.divisionTitle}`,
          title: s.title,
          status: s.status as 'modified' | 'added' | 'deleted',
          changedParagraphs: s.changedParagraphs.slice(0, maxParas).map((p) => ({
            oldText: p.oldText.slice(0, maxChars),
            newText: p.newText.slice(0, maxChars),
            riskFlags: p.riskFlags,
          })),
        })),
      });

    let chosenSections = Math.min(25, ranked.length);
    let bodyString = buildPayload(chosenSections, 8, 700);
    let narrowedNotice: string | null = null;

    if (bodyString.length > 1_500_000) {
      for (const candidate of [15, 8, 4]) {
        const nextCount = Math.min(candidate, ranked.length);
        const nextBody = buildPayload(nextCount, 6, 500);
        if (nextBody.length <= 1_500_000 || candidate === 4) {
          chosenSections = nextCount;
          bodyString = nextBody;
          narrowedNotice = `Payload too large for all 25 sections — automatically narrowed to top ${chosenSections} risk-ranked sections.`;
          break;
        }
      }
    }

    setAiBriefLoading(true);
    setAiBriefError(null);
    setAiBriefNotice(narrowedNotice);
    try {
      const response = await fetch('/api/scope-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyString,
      });
      const rawText = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error(
            `Payload too large even after capping to top ${chosenSections} sections. Narrow filters to fewer sections and retry.`
          );
        }
        const serverErr =
          parsed && typeof parsed.error === 'string'
            ? parsed.error
            : rawText.slice(0, 200) || `Request failed with HTTP ${response.status}.`;
        throw new Error(serverErr);
      }

      if (!parsed) {
        throw new Error('Server returned an unexpected non-JSON response.');
      }

      const briefData = parsed as unknown as ScopeBriefResponse;
      setAiBrief(briefData);
      setSentToGeminiInfo({
        sectionsSent: briefData.sectionsSentCount ?? chosenSections,
        totalChanged: briefData.totalChangedSections ?? changedSections.length,
      });
    } catch (err: unknown) {
      setAiBriefError(
        err instanceof Error ? err.message : 'Unable to reach Google Gemini brief endpoint.'
      );
    } finally {
      setAiBriefLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="no-print">
        <input
          ref={oldInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFilesPick(e.target.files, 'old');
            e.target.value = '';
          }}
        />
        <input
          ref={newInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFilesPick(e.target.files, 'new');
            e.target.value = '';
          }}
        />

        <UploadHeroSection
          diffOutput={diffOutput}
          heroExpanded={heroExpanded}
          onSetHeroExpanded={setHeroExpanded}
          oldSlot={oldSlot}
          newSlot={newSlot}
          oldInputRef={oldInputRef}
          newInputRef={newInputRef}
          fileProgressMap={fileProgressMap}
          comparisonMode={comparisonMode}
          onChangeComparisonMode={handleChangeComparisonMode}
          isProcessing={isProcessing}
          isDiffing={isDiffing}
          isGeneratingSample={isGeneratingSample}
          errorMsg={errorMsg}
          onClearError={() => setErrorMsg(null)}
          sentToGeminiInfo={sentToGeminiInfo}
          onFilesPick={(files, side) => void handleFilesPick(files, side)}
          onCancelSlotWorker={cancelSlotWorker}
          onSwapSlots={handleSwapSlots}
          onRerunDiff={handleRerunDiff}
          onLoadSample={() => void handleLoadSample()}
          onDownloadSamplePdfs={() => void handleDownloadSamplePdfs()}
        />

        {!diffOutput ? (
          <EmptyWorkbenchGuide onNavigate={onNavigate} />
        ) : diffOutput.diagnostics.oldMostlyScanned || diffOutput.diagnostics.newMostlyScanned ? (
          <section
            ref={resultsRef}
            className="max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-5"
          >
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-[#B45309] shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h2 className="font-display text-lg font-bold text-amber-950">
                    Comparison Blocked: Scanned / Non-OCR PDF Detected
                  </h2>
                  <p className="text-sm text-amber-950/90 leading-relaxed">
                    SpecDelta does not run OCR on raster-image PDFs. To prevent false &ldquo;Deleted Section&rdquo; or &ldquo;New Section&rdquo; alerts, comparisons are blocked when either file is mostly scanned images. Run &ldquo;Scan &amp; OCR&rdquo; in Adobe Acrobat or &ldquo;OCR&rdquo; in Bluebeam Revu first, then re-drop the searchable PDF.
                  </p>
                  <ul className="text-xs font-mono text-amber-950 space-y-1 pt-1 tabular-nums">
                    {diffOutput.diagnostics.oldMostlyScanned && (
                      <li>
                        • Baseline: {diffOutput.diagnostics.oldFileName} —{' '}
                        {diffOutput.diagnostics.oldScannedPages?.length ?? diffOutput.diagnostics.oldPageCount}{' '}
                        of {diffOutput.diagnostics.oldPageCount} pages had &lt;30 extractable characters
                      </li>
                    )}
                    {diffOutput.diagnostics.newMostlyScanned && (
                      <li>
                        • Addendum: {diffOutput.diagnostics.newFileName} —{' '}
                        {diffOutput.diagnostics.newScannedPages?.length ?? diffOutput.diagnostics.newPageCount}{' '}
                        of {diffOutput.diagnostics.newPageCount} pages had &lt;30 extractable characters
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-amber-200/80">
                {diffOutput.diagnostics.oldMostlyScanned && (
                  <button
                    type="button"
                    onClick={() => oldInputRef.current?.click()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#B45309] hover:bg-[#92400E] rounded-md transition-colors cursor-pointer"
                  >
                    Replace Baseline PDF ({diffOutput.diagnostics.oldFileName})
                  </button>
                )}
                {diffOutput.diagnostics.newMostlyScanned && (
                  <button
                    type="button"
                    onClick={() => newInputRef.current?.click()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#B45309] hover:bg-[#92400E] rounded-md transition-colors cursor-pointer"
                  >
                    Replace Addendum PDF ({diffOutput.diagnostics.newFileName})
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSwapSlots}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-100/60 transition-colors cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Swap Baseline ↔ Addendum
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section
            ref={resultsRef}
            className={`max-w-[1380px] mx-auto px-4 sm:px-6 py-8 space-y-6 ${
              isReparsingNoise ? 'opacity-60 pointer-events-none transition-opacity' : ''
            }`}
          >
            <DiagnosticsBanners
              diffOutput={diffOutput}
              counts={counts}
              reviewedChangedCount={reviewedChangedCount}
              isReparsingNoise={isReparsingNoise}
              showAllScannedPages={showAllScannedPages}
              onToggleShowAllScannedPages={() => setShowAllScannedPages((prev) => !prev)}
              showNoiseDrawer={showNoiseDrawer}
              onToggleNoiseDrawer={() => setShowNoiseDrawer((prev) => !prev)}
              noiseConfig={noiseConfig}
              isProcessing={isProcessing}
              onReparseWithNoiseConfig={handleReparseWithNoiseConfig}
              aiBriefEnabled={aiBriefEnabled}
              onToggleAiBrief={() => setAiBriefEnabled((prev) => !prev)}
              changedPayloadEstimate={changedPayloadEstimate}
              aiBriefLoading={aiBriefLoading}
              aiBriefNotice={aiBriefNotice}
              aiBriefError={aiBriefError}
              aiBrief={aiBrief}
              onGenerateAiBrief={() => void handleGenerateAiBrief()}
              allChangedSections={allChangedSections}
              filteredChangedSections={filteredChangedSections}
              reviewedCodes={reviewedCodes}
              topRiskSections={topRiskSections}
              activeSectionCode={activeSection?.sectionCode ?? null}
              onSelectSection={(code, filter) => {
                if (filter) setStatusFilter(filter);
                setDivisionFilter('all');
                setSelectedCode(code);
                setShowFullSection(false);
              }}
              onChangeComparisonMode={handleChangeComparisonMode}
              onResetReviewed={() => {
                setReviewedCodes(new Set());
                setLiveAnnouncement('Cleared saved review checkmarks for this pair.');
              }}
              onNavigate={onNavigate}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <SectionListRail
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                divisionFilter={divisionFilter}
                onDivisionFilterChange={setDivisionFilter}
                availableDivisions={availableDivisions}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                counts={counts}
                filteredSections={filteredSections}
                activeSectionCode={activeSection?.sectionCode ?? null}
                reviewedCodes={reviewedCodes}
                oldScannedPages={diffOutput.diagnostics.oldScannedPages}
                newScannedPages={diffOutput.diagnostics.newScannedPages}
                liveAnnouncement={liveAnnouncement}
                onSelectSection={(sec) => {
                  setSelectedCode(sec.sectionCode);
                  setShowFullSection(false);
                  announceSection(sec);
                }}
              />

              <SectionDiffInspector
                activeSection={activeSection}
                filteredCount={filteredSections.length}
                riskSectionCount={counts.risk}
                unreviewedChangedCount={counts.changed - reviewedChangedCount}
                oldScannedPages={diffOutput.diagnostics.oldScannedPages}
                newScannedPages={diffOutput.diagnostics.newScannedPages}
                isReviewed={
                  activeSection ? reviewedCodes.has(activeSection.sectionCode) : false
                }
                onToggleReviewed={toggleReviewed}
                diffViewMode={diffViewMode}
                onChangeDiffViewMode={setDiffViewMode}
                showFullSection={showFullSection}
                onToggleShowFullSection={() => setShowFullSection((prev) => !prev)}
                onStepSection={stepSection}
                onJumpToNextMatching={jumpToNextMatching}
              />
            </div>
          </section>
        )}
      </div>

      {diffOutput &&
        !diffOutput.diagnostics.oldMostlyScanned &&
        !diffOutput.diagnostics.newMostlyScanned && (
          <DiffPrintReport
            diagnostics={diffOutput.diagnostics}
            allChangedSections={allChangedSections}
            reviewedCodes={reviewedCodes}
          />
        )}
    </div>
  );
}
