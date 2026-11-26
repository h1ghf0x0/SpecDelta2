import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  List,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { compareParsedBooks } from '../utils/specDiffEngine';
import { AiScopeBriefPanel } from './AiScopeBriefPanel';
import { DiffPrintReport } from './DiffPrintReport';
import { EmptyWorkbenchGuide } from './EmptyWorkbenchGuide';
import { HeroRedlineSpecimen } from './HeroRedlineSpecimen';
import { NoiseDrawer } from './NoiseDrawer';
import { RedlineTokenRenderer, type DiffViewMode } from './RedlineTokenRenderer';
import {
  DEFAULT_NOISE_CONFIG,
  type AppRoute,
  type DiffRunOutput,
  type DiffSectionResult,
  type DiffStatus,
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

interface FileSlotState {
  fileName: string;
  fileSize: number;
  buffer: ArrayBuffer | null;
  status: 'idle' | 'parsing' | 'ready' | 'error';
  progress: WorkerProgress | null;
  parsed: SingleSpecParseOutput | null;
  error: string | null;
}

const EMPTY_SLOT: FileSlotState = {
  fileName: '',
  fileSize: 0,
  buffer: null,
  status: 'idle',
  progress: null,
  parsed: null,
  error: null,
};

interface FileUploadProgress {
  side: 'old' | 'new';
  fileName: string;
  fileSize: number;
  status: 'reading' | 'parsing' | 'ready' | 'error';
  stage: WorkerProgress['stage'] | 'reading';
  percent: number;
  detail: string;
}

type StatusFilter = 'all' | 'changed' | DiffStatus | 'risk';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getOverlappingScannedPages(
  pageRangeStr: string,
  scannedPages?: number[]
): number[] {
  if (!scannedPages || scannedPages.length === 0 || !pageRangeStr || pageRangeStr === '—') {
    return [];
  }
  const parts = pageRangeStr
    .split(/[–-]/)
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return [];
  const start = parts[0];
  const end = parts[parts.length - 1];
  return scannedPages.filter((p) => p >= start && p <= end);
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
    'risk',
  ];
  const filter = validFilters.includes(rawFilter as StatusFilter)
    ? (rawFilter as StatusFilter)
    : 'changed';
  const rawSort = params.get('sort');
  const sort: 'risk' | 'csi' = rawSort === 'csi' ? 'csi' : 'risk';
  const div = params.get('div') || 'all';
  const section = params.get('section') || null;
  return { section, filter, div, sort };
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

  // Opt-in Google Gemini Scope Brief state
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
    const qs = params.toString();
    const nextUrl = qs ? `/?${qs}` : '/';
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [diffOutput, selectedCode, statusFilter, divisionFilter, sortBy]);

  // Yield to paint 100% worker state before running section-to-section Myers diff
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
        const output = compareParsedBooks(oldParsed, newParsed);
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
        const changed = output.results.filter((r) => r.status !== 'unchanged');
        const topRisk = [...changed]
          .filter((r) => r.riskFlags.length > 0)
          .sort(
            (a, b) =>
              b.riskFlags.length - a.riskFlags.length ||
              b.addedWords + b.deletedWords - (a.addedWords + a.deletedWords) ||
              a.sectionCode.localeCompare(b.sectionCode)
          )[0];
        const firstTarget = topRisk ?? changed[0] ?? output.results[0] ?? null;
        setSelectedCode((prev) =>
          prev && output.results.some((r) => r.sectionCode === prev)
            ? prev
            : firstTarget
            ? firstTarget.sectionCode
            : null
        );
        if (!skipScrollOnNextDiffRef.current) {
          setStatusFilter((prev) =>
            changed.length > 0 ? prev : 'all'
          );
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
  }, [oldSlot.status, oldSlot.parsed, newSlot.status, newSlot.parsed]);

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

    // Terminate any previous worker on this specific slot
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
      // Wait for diff effect if both slots ready; otherwise clear spinner immediately
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
      const output = compareParsedBooks(oldSlot.parsed, newSlot.parsed);
      setDiffOutput(output);
    }
  };

  const availableDivisions = useMemo(() => {
    if (!diffOutput) return [];
    const map = new Map<string, string>();
    for (const r of diffOutput.results) {
      if (!map.has(r.division)) map.set(r.division, r.divisionTitle);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [diffOutput]);

  const counts = useMemo(() => {
    if (!diffOutput) {
      return { total: 0, modified: 0, added: 0, deleted: 0, unchanged: 0, risk: 0, changed: 0 };
    }
    let modified = 0;
    let added = 0;
    let deleted = 0;
    let unchanged = 0;
    let risk = 0;
    for (const r of diffOutput.results) {
      if (r.status === 'modified') modified++;
      else if (r.status === 'added') added++;
      else if (r.status === 'deleted') deleted++;
      else unchanged++;
      if (r.riskFlags.length > 0 && r.status !== 'unchanged') risk++;
    }
    return {
      total: diffOutput.results.length,
      modified,
      added,
      deleted,
      unchanged,
      risk,
      changed: modified + added + deleted,
    };
  }, [diffOutput]);

  const filteredSections = useMemo(() => {
    if (!diffOutput) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = diffOutput.results.filter((r) => {
      if (divisionFilter !== 'all' && r.division !== divisionFilter) return false;
      if (statusFilter === 'changed' && r.status === 'unchanged') return false;
      if (statusFilter === 'modified' && r.status !== 'modified') return false;
      if (statusFilter === 'added' && r.status !== 'added') return false;
      if (statusFilter === 'deleted' && r.status !== 'deleted') return false;
      if (statusFilter === 'unchanged' && r.status !== 'unchanged') return false;
      if (statusFilter === 'risk' && (r.riskFlags.length === 0 || r.status === 'unchanged')) return false;
      if (q) {
        const hay = `${r.sectionCode} ${r.renumberedFrom ?? ''} ${r.title} ${r.divisionTitle} ${r.riskFlags.join(' ')} ${r.fullNewText} ${r.fullOldText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'csi') {
      return [...list].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
    }

    return [...list].sort((a, b) => {
      const aChanged = a.status !== 'unchanged' ? 1 : 0;
      const bChanged = b.status !== 'unchanged' ? 1 : 0;
      if (aChanged !== bChanged) return bChanged - aChanged;

      const aRisk = a.status !== 'unchanged' ? a.riskFlags.length : 0;
      const bRisk = b.status !== 'unchanged' ? b.riskFlags.length : 0;
      if (aRisk !== bRisk) return bRisk - aRisk;

      const aChurn = a.addedWords + a.deletedWords;
      const bChurn = b.addedWords + b.deletedWords;
      if (aChurn !== bChurn) return bChurn - aChurn;

      return a.sectionCode.localeCompare(b.sectionCode);
    });
  }, [diffOutput, divisionFilter, statusFilter, searchQuery, sortBy]);

  const topRiskSections = useMemo(() => {
    if (!diffOutput) return [];
    return diffOutput.results
      .filter((r) => r.status !== 'unchanged' && r.riskFlags.length > 0)
      .sort(
        (a, b) =>
          b.riskFlags.length - a.riskFlags.length ||
          b.addedWords + b.deletedWords - (a.addedWords + a.deletedWords) ||
          a.sectionCode.localeCompare(b.sectionCode)
      )
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
      (r) => r.status !== 'unchanged' || Boolean(r.renumberedFrom)
    );
    if (sortBy === 'csi') {
      return [...list].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
    }
    return [...list].sort((a, b) => {
      const aRisk = a.status !== 'unchanged' ? a.riskFlags.length : 0;
      const bRisk = b.status !== 'unchanged' ? b.riskFlags.length : 0;
      if (aRisk !== bRisk) return bRisk - aRisk;
      const aChurn = a.addedWords + a.deletedWords;
      const bChurn = b.addedWords + b.deletedWords;
      if (aChurn !== bChurn) return bChurn - aChurn;
      return a.sectionCode.localeCompare(b.sectionCode);
    });
  }, [diffOutput, sortBy]);

  const filteredChangedSections = useMemo(
    () =>
      filteredSections.filter(
        (r) => r.status !== 'unchanged' || Boolean(r.renumberedFrom)
      ),
    [filteredSections]
  );

  const reviewedChangedCount = useMemo(() => {
    if (!diffOutput) return 0;
    let count = 0;
    for (const r of diffOutput.results) {
      if (r.status !== 'unchanged' && reviewedCodes.has(r.sectionCode)) {
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

  const toggleReviewed = useCallback(
    (sectionCode: string) => {
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
    },
    []
  );

  const activeIndex = useMemo(() => {
    if (!activeSection) return -1;
    return filteredSections.findIndex(
      (s) => s.sectionCode === activeSection.sectionCode
    );
  }, [filteredSections, activeSection]);

  const stepSection = useCallback(
    (delta: -1 | 1) => {
      if (filteredSections.length === 0) return;
      const currentIdx = activeIndex >= 0 ? activeIndex : 0;
      const nextIdx =
        (currentIdx + delta + filteredSections.length) % filteredSections.length;
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
          ? sec.status !== 'unchanged' && sec.riskFlags.length > 0
          : sec.status !== 'unchanged' && !reviewedCodes.has(sec.sectionCode);

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

      // Fall back across all changed sections if current filter excludes matches
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

  // Keyboard navigation: 'n' (next), 'p' (prev), 'r' (next risk), 'u' (next unreviewed)
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
    const changed = diffOutput.results.filter((r) => r.status !== 'unchanged');
    const ranked = [...changed].sort(
      (a, b) =>
        b.riskFlags.length - a.riskFlags.length ||
        b.addedWords + b.deletedWords - (a.addedWords + a.deletedWords) ||
        a.sectionCode.localeCompare(b.sectionCode)
    );
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
    const changedSections = diffOutput.results.filter((r) => r.status !== 'unchanged');
    if (changedSections.length === 0) return;

    // Rank and cap client-side so only what Gemini analyzes leaves the browser
    const ranked = [...changedSections].sort(
      (a, b) =>
        b.riskFlags.length - a.riskFlags.length ||
        b.addedWords + b.deletedWords - (a.addedWords + a.deletedWords) ||
        b.changedParagraphs.length - a.changedParagraphs.length ||
        a.sectionCode.localeCompare(b.sectionCode)
    );

    const buildPayload = (maxSections: number, maxParas: number, maxChars: number) =>
      JSON.stringify({
        totalChangedCount: changedSections.length,
        sections: ranked.slice(0, maxSections).map((s) => ({
          sectionCode: s.sectionCode,
          division: `${s.division} - ${s.divisionTitle}`,
          title: s.title,
          status: s.status,
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

  const renderSlotCard = (
    side: 'old' | 'new',
    slot: FileSlotState,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => {
    const isOld = side === 'old';
    const slotLabel = isOld
      ? '01. Baseline Specification'
      : '02. Revised Specification / Addendum';
    const emptyTitle = isOld
      ? 'Drop Original Project Manual PDF'
      : 'Drop Addendum or Re-Issued Manual PDF';
    const emptySub = isOld
      ? 'Issued For Bid / Permit Set · Click or drag .pdf'
      : 'Addendum 1, 2, 3 or Conformed Set · Click or drag .pdf';

    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFilesPick(e.dataTransfer.files, side);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
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
                {slot.status === 'error' && (
                  <span className="text-red-700">{slot.error}</span>
                )}
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
                    cancelSlotWorker(side);
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

        {/* Inline per-file Web Worker progress bar & stage status */}
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

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Screen Workspace */}
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

        {/* Compact Collapsed File Bar once Diff Output is Active */}
        {diffOutput && !heroExpanded ? (
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
                  onClick={handleSwapSlots}
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
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1 tabular-nums">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                  {sentToGeminiInfo
                    ? `Local parse · Sent ${sentToGeminiInfo.sectionsSent} of ${sentToGeminiInfo.totalChanged} changed sections to Google Gemini`
                    : 'Local only — specs on device'}
                </span>
                <button
                  type="button"
                  onClick={() => setHeroExpanded(true)}
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
                    onClick={() => setErrorMsg(null)}
                    className="text-red-700 hover:text-red-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : (
          /* Hero / Asymmetric Drafting Desk Split */
          <section className="blueprint-grid border-b border-slate-200">
            <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-9 lg:py-11">
              {diffOutput && (
                <div className="mb-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setHeroExpanded(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                    Collapse Upload Panel
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
                {/* Left Column: Value Proposition + Dual Dropzones */}
                <div className="lg:col-span-6 flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 mb-2.5">
                      <span>Section-Aware Diff Engine</span>
                      <span aria-hidden="true">·</span>
                      <span>CSI MasterFormat Alignment</span>
                      <span aria-hidden="true">·</span>
                      <span>Header &amp; Footer Noise Filtering</span>
                    </div>
                    <h1
                      className="font-display font-bold tracking-tight text-slate-900 leading-[1.1] text-balance"
                      style={{ fontSize: 'clamp(1.95rem, 3.1vw, 2.75rem)' }}
                    >
                      Compare 600-Page Project Manuals by CSI Section—Not Page Number
                    </h1>
                    <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                      Stop visual page-overlay diffs from flagging hundreds of shifted pages when an addendum moves paragraphs across page breaks. SpecDelta parses PDFs locally in a Web Worker, strips repeating headers, and surfaces money and risk shifts cleanly.
                    </p>
                  </div>

                  {/* Dual PDF Dropzones with Immediate Per-File Worker Parsing */}
                  <div className="grid grid-cols-1 gap-3">
                    {renderSlotCard('old', oldSlot, oldInputRef)}
                    {renderSlotCard('new', newSlot, newInputRef)}
                  </div>
                </div>

                {/* Right Column: Live Engine Redline Specimen */}
                <div className="lg:col-span-6">
                  <HeroRedlineSpecimen
                    onLoadSample={() => void handleLoadSample()}
                    isProcessing={isProcessing}
                  />
                </div>
              </div>

              {/* Active Per-File Worker Progress Tracker */}
              {(isProcessing || Object.values(fileProgressMap).some((entry) => entry?.status === 'parsing' || entry?.status === 'reading')) && (
                <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                    <span>
                      {isDiffing
                        ? 'Aligning CSI MasterFormat sections and running Myers word diff...'
                        : 'Processing Project Manual PDFs in local Web Workers'}
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {Object.keys(fileProgressMap).length} file{Object.keys(fileProgressMap).length === 1 ? '' : 's'}
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

              {/* State-Aware Privacy Assurance + Action Row */}
              <div className="mt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-3.5 py-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                  {sentToGeminiInfo ? (
                    <span>
                      <strong className="font-semibold text-slate-900">
                        Local PDF Parsing · Sent {sentToGeminiInfo.sectionsSent} of {sentToGeminiInfo.totalChanged} Changed Sections to Google Gemini.
                      </strong>{' '}
                      Full Project Manual PDFs remained in your browser.
                    </span>
                  ) : (
                    <span>
                      <strong className="font-semibold text-slate-900">
                        Local Only — Parsed in Browser Web Workers.
                      </strong>{' '}
                      Your specs stay on device unless you opt into the Google Gemini brief.
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {oldSlot.status === 'ready' && newSlot.status === 'ready' && (
                    <>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleSwapSlots}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Swap Baseline ↔ Addendum
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleRerunDiff}
                        className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Re-Run Comparison
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleLoadSample()}
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#1E40AF] bg-white border border-[#1E40AF]/30 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isGeneratingSample ? 'Building Sample PDFs...' : 'Load Sample Project Manual'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadSamplePdfs()}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Sample PDFs
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between gap-3 text-sm text-red-900">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMsg(null)}
                    className="text-red-700 hover:text-red-900 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Main Workbench or Asymmetric Empty-State Ledger */}
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
                    Comparison Blocked: Missing OCR Text Layer in Uploaded PDF
                  </h2>
                  <p className="text-sm text-amber-950/90 leading-relaxed">
                    To prevent false &ldquo;Deleted Section&rdquo; or &ldquo;New Section&rdquo; alerts across an entire Project Manual, SpecDelta blocks comparisons when either PDF is primarily scanned raster images without embedded text.
                  </p>
                  <ul className="text-xs font-mono text-amber-950 space-y-1 pt-1 tabular-nums">
                    {diffOutput.diagnostics.oldMostlyScanned && (
                      <li>
                        • Baseline: {diffOutput.diagnostics.oldFileName} —{' '}
                        {diffOutput.diagnostics.oldScannedPages?.length ?? diffOutput.diagnostics.oldPageCount} of{' '}
                        {diffOutput.diagnostics.oldPageCount} pages had &lt;30 extractable characters
                      </li>
                    )}
                    {diffOutput.diagnostics.newMostlyScanned && (
                      <li>
                        • Addendum: {diffOutput.diagnostics.newFileName} —{' '}
                        {diffOutput.diagnostics.newScannedPages?.length ?? diffOutput.diagnostics.newPageCount} of{' '}
                        {diffOutput.diagnostics.newPageCount} pages had &lt;30 extractable characters
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
            {isReparsingNoise && (
              <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-2.5 text-xs font-medium text-[#1E40AF]">
                Re-parsing PDFs with updated header/footer noise thresholds — previous results dimmed until update completes...
              </div>
            )}

            {diffOutput.diagnostics.scannedWarning && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3 text-sm text-amber-950">
                <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="font-semibold">
                    Scanned / raster sheets skipped (no OCR text layer — verify skipped pages manually against signed PDF):
                  </div>
                  <div className="text-xs font-mono space-y-1 tabular-nums">
                    {(diffOutput.diagnostics.oldScannedPages?.length ?? 0) > 0 && (
                      <div>
                        Baseline ({diffOutput.diagnostics.oldFileName}):{' '}
                        {diffOutput.diagnostics.oldScannedPages!.length} page(s) skipped — pp.{' '}
                        {(showAllScannedPages
                          ? diffOutput.diagnostics.oldScannedPages!
                          : diffOutput.diagnostics.oldScannedPages!.slice(0, 8)
                        ).join(', ')}
                        {!showAllScannedPages &&
                        diffOutput.diagnostics.oldScannedPages!.length > 8
                          ? ` ... (+${diffOutput.diagnostics.oldScannedPages!.length - 8} more)`
                          : ''}
                      </div>
                    )}
                    {(diffOutput.diagnostics.newScannedPages?.length ?? 0) > 0 && (
                      <div>
                        Addendum ({diffOutput.diagnostics.newFileName}):{' '}
                        {diffOutput.diagnostics.newScannedPages!.length} page(s) skipped — pp.{' '}
                        {(showAllScannedPages
                          ? diffOutput.diagnostics.newScannedPages!
                          : diffOutput.diagnostics.newScannedPages!.slice(0, 8)
                        ).join(', ')}
                        {!showAllScannedPages &&
                        diffOutput.diagnostics.newScannedPages!.length > 8
                          ? ` ... (+${diffOutput.diagnostics.newScannedPages!.length - 8} more)`
                          : ''}
                      </div>
                    )}
                  </div>
                  {((diffOutput.diagnostics.oldScannedPages?.length ?? 0) > 8 ||
                    (diffOutput.diagnostics.newScannedPages?.length ?? 0) > 8) && (
                    <button
                      type="button"
                      onClick={() => setShowAllScannedPages((prev) => !prev)}
                      className="text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 cursor-pointer"
                    >
                      {showAllScannedPages
                        ? 'Collapse skipped page list'
                        : 'Show all skipped page numbers'}
                    </button>
                  )}
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
                <div className="text-xs text-slate-500">Deleted Sections</div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#B91C1C] tabular-nums">
                  {counts.deleted}
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
                <span className="font-mono">
                  Old: {diffOutput.diagnostics.oldPageCount} pp.
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  New: {diffOutput.diagnostics.newPageCount} pp.
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  Parse: {(diffOutput.diagnostics.parseTimeMs / 1000).toFixed(2)}s
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setShowNoiseDrawer((prev) => !prev)}
                  className="text-[#1E40AF] font-medium hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Stripped Noise:{' '}
                  <span>
                    {(diffOutput.diagnostics.oldStrippedLineCount ?? 0) +
                      (diffOutput.diagnostics.newStrippedLineCount ?? 0)}{' '}
                    lines (
                    {diffOutput.diagnostics.oldStrippedPatterns.length +
                      diffOutput.diagnostics.newStrippedPatterns.length}{' '}
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
                          oldFileName: diffOutput.diagnostics.oldFileName,
                          newFileName: diffOutput.diagnostics.newFileName,
                          oldScannedPages: diffOutput.diagnostics.oldScannedPages,
                          newScannedPages: diffOutput.diagnostics.newScannedPages,
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
                            oldFileName: diffOutput.diagnostics.oldFileName,
                            newFileName: diffOutput.diagnostics.newFileName,
                            oldScannedPages: diffOutput.diagnostics.oldScannedPages,
                            newScannedPages: diffOutput.diagnostics.newScannedPages,
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
                          oldFileName: diffOutput.diagnostics.oldFileName,
                          newFileName: diffOutput.diagnostics.newFileName,
                          oldScannedPages: diffOutput.diagnostics.oldScannedPages,
                          newScannedPages: diffOutput.diagnostics.newScannedPages,
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
                  onClick={() => setAiBriefEnabled((prev) => !prev)}
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
                  Parse coverage: {diffOutput.diagnostics.oldSectionCount} CSI sections ({diffOutput.diagnostics.oldPageCount} pp.) vs. {diffOutput.diagnostics.newSectionCount} CSI sections ({diffOutput.diagnostics.newPageCount} pp.)
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
                    onClick={() => {
                      setReviewedCodes(new Set());
                      setLiveAnnouncement('Cleared saved review checkmarks for this pair.');
                    }}
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

            {/* Stripped Noise Inspector & Threshold Tuning Drawer */}
            {showNoiseDrawer && (
              <NoiseDrawer
                diagnostics={diffOutput.diagnostics}
                noiseConfig={noiseConfig}
                isProcessing={isProcessing}
                onReparse={handleReparseWithNoiseConfig}
                onClose={() => setShowNoiseDrawer(false)}
              />
            )}

            {/* Opt-In Google Gemini Cost & Scope Impact Brief */}
            {aiBriefEnabled && (
              <AiScopeBriefPanel
                sectionsCount={changedPayloadEstimate.sectionsCount}
                cappedSectionsCount={changedPayloadEstimate.cappedSectionsCount}
                cappedCharCount={changedPayloadEstimate.cappedCharCount}
                loading={aiBriefLoading}
                notice={aiBriefNotice}
                error={aiBriefError}
                brief={aiBrief}
                onGenerate={() => void handleGenerateAiBrief()}
              />
            )}

            {/* Bid-Day Risk Triage Quick-Jump Strip */}
            {(topRiskSections.length > 0 || (diffOutput.diagnostics.renumberedCount ?? 0) > 0) && (
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
                      onClick={() => {
                        setStatusFilter('changed');
                        setDivisionFilter('all');
                        setSelectedCode(sec.sectionCode);
                        setShowFullSection(false);
                      }}
                      className={`inline-flex items-center gap-1.5 font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                        activeSection?.sectionCode === sec.sectionCode
                          ? 'text-[#1E40AF] underline underline-offset-4'
                          : 'text-slate-700 hover:text-[#1E40AF]'
                      }`}
                    >
                      <span className="font-mono font-semibold tabular-nums">{sec.sectionCode}</span>
                      <span className="text-slate-500">·</span>
                      <span className="truncate max-w-[180px]">{sec.title}</span>
                      <span className="font-mono text-[#B45309] tabular-nums">
                        ({sec.riskFlags.length} risk)
                      </span>
                    </button>
                  ))}
                </div>
                {(diffOutput.diagnostics.renumberedCount ?? 0) > 0 && (
                  <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                    {diffOutput.diagnostics.renumberedCount} renumbered section
                    {diffOutput.diagnostics.renumberedCount === 1 ? '' : 's'} matched by title
                  </span>
                )}
              </div>
            )}

            {/* Split-Pane Diff Workbench */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Rail: Filterable CSI Section List */}
              <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="p-3.5 border-b border-slate-200 space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search CSI code, keyword, PSI..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#1E40AF]"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      value={divisionFilter}
                      onChange={(e) => setDivisionFilter(e.target.value)}
                      aria-label="Filter by CSI Division"
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#1E40AF]"
                    >
                      <option value="all">All CSI Divisions ({counts.total})</option>
                      {availableDivisions.map(([div, divTitle]) => (
                        <option key={div} value={div}>
                          Div {div} — {divTitle}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-md">
                    {(
                      [
                        { id: 'changed', label: `Changed (${counts.changed})` },
                        { id: 'risk', label: `Risk (${counts.risk})` },
                        { id: 'all', label: `All (${counts.total})` },
                        { id: 'unchanged', label: `Unchanged (${counts.unchanged})` },
                      ] as Array<{ id: StatusFilter; label: string }>
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded drafting-transition cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                          statusFilter === tab.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-500 font-medium">Order:</span>
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                      <button
                        type="button"
                        onClick={() => setSortBy('risk')}
                        className={`px-2 py-0.5 rounded font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                          sortBy === 'risk'
                            ? 'bg-white text-[#1E40AF] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Risk Priority
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy('csi')}
                        className={`px-2 py-0.5 rounded font-medium drafting-transition cursor-pointer whitespace-nowrap ${
                          sortBy === 'csi'
                            ? 'bg-white text-[#1E40AF] shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        CSI Order
                      </button>
                    </div>
                  </div>
                  <div className="pt-1 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                    Keys: n next · p prev · r next risk · u next unreviewed
                  </div>
                </div>

                <div role="status" aria-live="polite" className="sr-only">
                  {liveAnnouncement}
                </div>

                <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
                  {filteredSections.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No sections match the active filter.
                    </div>
                  ) : (
                    filteredSections.map((sec) => {
                      const isSelected = activeSection?.sectionCode === sec.sectionCode;
                      const isReviewed = reviewedCodes.has(sec.sectionCode);
                      const secScanOverlap =
                        getOverlappingScannedPages(
                          sec.oldPageRange,
                          diffOutput.diagnostics.oldScannedPages
                        ).length > 0 ||
                        getOverlappingScannedPages(
                          sec.newPageRange,
                          diffOutput.diagnostics.newScannedPages
                        ).length > 0;
                      return (
                        <button
                          key={sec.sectionCode}
                          type="button"
                          onClick={() => {
                            setSelectedCode(sec.sectionCode);
                            setShowFullSection(false);
                            announceSection(sec);
                          }}
                          className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {sec.sectionCode}
                              {isReviewed && (
                                <Check
                                  className="w-3.5 h-3.5 text-[#15803D]"
                                  aria-label="Reviewed"
                                />
                              )}
                            </span>
                            <span
                              className={`text-[11px] font-semibold uppercase tracking-wide ${
                                sec.status === 'modified'
                                  ? 'text-[#1E40AF]'
                                  : sec.status === 'added'
                                  ? 'text-[#15803D]'
                                  : sec.status === 'deleted'
                                  ? 'text-[#B91C1C]'
                                  : 'text-slate-500'
                              }`}
                            >
                              {sec.status === 'added'
                                ? 'New Section'
                                : sec.status === 'deleted'
                                ? 'Deleted Section'
                                : sec.status === 'modified'
                                ? 'Modified'
                                : 'Unchanged'}
                            </span>
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-800 truncate">
                            {sec.title}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                            <span>
                              pp. {sec.oldPageRange} → {sec.newPageRange}
                            </span>
                            {sec.renumberedFrom && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono text-[#1E40AF]">
                                  was {sec.renumberedFrom}
                                </span>
                              </>
                            )}
                            {sec.status !== 'unchanged' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">
                                  +{sec.addedWords} / -{sec.deletedWords} words
                                </span>
                              </>
                            )}
                            {sec.riskFlags.length > 0 && sec.status !== 'unchanged' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#B45309] font-medium">
                                  {sec.riskFlags.length} Risk
                                </span>
                              </>
                            )}
                            {secScanOverlap && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-800 font-medium">
                                  No-OCR Sheet
                                </span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              {/* Right Inspector: Word-Level Redline Diff */}
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
                              Old pp. {activeSection.oldPageRange} → New pp. {activeSection.newPageRange}
                            </span>
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
                          {filteredSections.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              {filteredSections.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => stepSection(-1)}
                                    title="Previous section (p)"
                                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                                  >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Prev (p)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => stepSection(1)}
                                    title="Next section (n)"
                                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                                  >
                                    Next (n)
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {counts.risk > 0 && (
                                <button
                                  type="button"
                                  onClick={() => jumpToNextMatching('risk')}
                                  title="Next risk-flagged section (r)"
                                  className="px-2 py-1.5 text-xs font-medium text-[#B45309] bg-amber-50/70 border border-amber-200 rounded-md hover:bg-amber-100/70 cursor-pointer"
                                >
                                  Risk (r)
                                </button>
                              )}
                              {counts.changed > reviewedChangedCount && (
                                <button
                                  type="button"
                                  onClick={() => jumpToNextMatching('unreviewed')}
                                  title="Next unreviewed changed section (u)"
                                  className="px-2 py-1.5 text-xs font-medium text-[#1E40AF] bg-blue-50/70 border border-blue-200 rounded-md hover:bg-blue-100/70 cursor-pointer"
                                >
                                  Unreviewed (u)
                                </button>
                              )}
                            </div>
                          )}

                          {activeSection.status !== 'unchanged' && (
                            <>
                              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={reviewedCodes.has(activeSection.sectionCode)}
                                  onChange={() => toggleReviewed(activeSection.sectionCode)}
                                  className="accent-[#15803D] cursor-pointer"
                                />
                                <span
                                  className={
                                    reviewedCodes.has(activeSection.sectionCode)
                                      ? 'text-[#15803D] font-semibold'
                                      : 'text-slate-700'
                                  }
                                >
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
                                  onClick={() => setDiffViewMode('inline')}
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
                                  onClick={() => setDiffViewMode('side-by-side')}
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
                                onClick={() => setShowFullSection((prev) => !prev)}
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

                      {activeSection.riskFlags.length > 0 && activeSection.status !== 'unchanged' && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-900">
                          <span className="font-semibold text-[#B45309] inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Money & Risk Flags:
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
                      {(() => {
                        const oldOverlapping = getOverlappingScannedPages(
                          activeSection.oldPageRange,
                          diffOutput.diagnostics.oldScannedPages
                        );
                        const newOverlapping = getOverlappingScannedPages(
                          activeSection.newPageRange,
                          diffOutput.diagnostics.newScannedPages
                        );
                        if (oldOverlapping.length === 0 && newOverlapping.length === 0) {
                          return null;
                        }
                        return (
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
                        );
                      })()}
                      {activeSection.status === 'unchanged' ? (
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
                              <span className="font-mono tabular-nums">{activeSection.oldPageRange}</span>{' '}
                              →{' '}
                              <span className="font-mono tabular-nums">{activeSection.newPageRange}</span>,
                              SpecDelta stripped repeating headers/footers and found no differences in extracted text.
                            </p>
                          </div>
                        </div>
                      ) : showFullSection ? (
                        <div className="space-y-4">
                          <div className="text-xs font-medium text-slate-500">
                            Full Section Context with Redlines ({activeSection.status === 'deleted' ? 'Baseline Removed' : activeSection.status === 'added' ? 'Addendum Added' : 'Inline / Side-by-Side Diff'})
                          </div>
                          {activeSection.fullTokens && activeSection.fullTokens.length > 0 ? (
                            <div className="border border-slate-200 rounded-md p-4 bg-white whitespace-pre-wrap">
                              <RedlineTokenRenderer
                                tokens={activeSection.fullTokens}
                                mode={diffViewMode}
                              />
                            </div>
                          ) : (
                            <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-md p-4">
                              <div className="text-xs text-amber-800 mb-2">
                                Full-section token diff bypassed (&gt;80,000 characters); showing raw normalized section text:
                              </div>
                              {activeSection.status === 'deleted'
                                ? activeSection.fullOldText
                                : activeSection.fullNewText}
                            </div>
                          )}
                        </div>
                      ) : (
                        activeSection.changedParagraphs.map((para, idx) => (
                          <div
                            key={idx}
                            className="border border-slate-200 rounded-lg overflow-hidden"
                          >
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-slate-600 tabular-nums">
                                  Change Block {idx + 1} of {activeSection.changedParagraphs.length}
                                </span>
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
                                <p className="text-xs text-slate-500 leading-relaxed">
                                  {para.contextBefore}
                                </p>
                              )}

                              <RedlineTokenRenderer
                                tokens={para.tokens}
                                mode={diffViewMode}
                              />

                              {para.contextAfter && (
                                <p className="text-xs text-slate-500 leading-relaxed">
                                  {para.contextAfter}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Print-Only Clean Redline Report (HTML-to-PDF) */}
      {diffOutput && !diffOutput.diagnostics.oldMostlyScanned && !diffOutput.diagnostics.newMostlyScanned && (
        <DiffPrintReport
          diagnostics={diffOutput.diagnostics}
          allChangedSections={allChangedSections}
          reviewedCodes={reviewedCodes}
        />
      )}
    </div>
  );
}
