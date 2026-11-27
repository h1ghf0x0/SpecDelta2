import { Check, Filter, Search } from 'lucide-react';
import {
  getOverlappingScannedPages,
  type DiffCounts,
  type StatusFilter,
} from './workbenchTypes';
import type { DiffSectionResult } from '../types/spec';

interface SectionListRailProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  divisionFilter: string;
  onDivisionFilterChange: (div: string) => void;
  availableDivisions: Array<[string, string]>;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  sortBy: 'risk' | 'csi';
  onSortByChange: (sort: 'risk' | 'csi') => void;
  counts: DiffCounts;
  filteredSections: DiffSectionResult[];
  activeSectionCode: string | null;
  reviewedCodes: Set<string>;
  oldScannedPages?: number[];
  newScannedPages?: number[];
  liveAnnouncement: string;
  onSelectSection: (sec: DiffSectionResult) => void;
}

export function SectionListRail({
  searchQuery,
  onSearchChange,
  divisionFilter,
  onDivisionFilterChange,
  availableDivisions,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  counts,
  filteredSections,
  activeSectionCode,
  reviewedCodes,
  oldScannedPages,
  newScannedPages,
  liveAnnouncement,
  onSelectSection,
}: SectionListRailProps) {
  const statusTabs: Array<{ id: StatusFilter; label: string }> = [
    { id: 'changed', label: `Changed (${counts.changed})` },
    { id: 'risk', label: `Risk (${counts.risk})` },
    { id: 'all', label: `All (${counts.total})` },
    { id: 'unchanged', label: `Unchanged (${counts.unchanged})` },
  ];
  if (counts.notReissued > 0) {
    statusTabs.push({ id: 'not-reissued', label: `Not Reissued (${counts.notReissued})` });
  }

  return (
    <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="p-3.5 border-b border-slate-200 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search specification sections"
            placeholder="Search CSI code, keyword, PSI..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-[#1E40AF]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            value={divisionFilter}
            onChange={(e) => onDivisionFilterChange(e.target.value)}
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

        <div
          className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-md"
          role="group"
          aria-label="Filter sections by status"
        >
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={statusFilter === tab.id}
              onClick={() => onStatusFilterChange(tab.id)}
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
          <div
            className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md"
            role="group"
            aria-label="Sort sections"
          >
            <button
              type="button"
              aria-pressed={sortBy === 'risk'}
              onClick={() => onSortByChange('risk')}
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
              aria-pressed={sortBy === 'csi'}
              onClick={() => onSortByChange('csi')}
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
            const isSelected = activeSectionCode === sec.sectionCode;
            const isReviewed = reviewedCodes.has(sec.sectionCode);
            const isStatic = sec.status === 'unchanged' || sec.status === 'not-reissued';
            const secScanOverlap =
              getOverlappingScannedPages(sec.oldPageRange, oldScannedPages).length > 0 ||
              getOverlappingScannedPages(sec.newPageRange, newScannedPages).length > 0;

            return (
              <button
                key={sec.sectionCode}
                type="button"
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelectSection(sec)}
                className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                  isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                    {sec.sectionCode}
                    {isReviewed && (
                      <Check className="w-3.5 h-3.5 text-[#15803D]" aria-label="Reviewed" />
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
                      ? sec.narrativeApplied
                        ? 'Narrative Patch'
                        : 'Modified'
                      : sec.status === 'not-reissued'
                      ? 'Not Reissued'
                      : 'Unchanged'}
                  </span>
                </div>
                <div className="mt-1 text-xs font-medium text-slate-800 truncate">{sec.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                  <span>
                    {sec.status === 'not-reissued'
                      ? `Base pp. ${sec.oldPageRange} · Not reissued`
                      : `pp. ${sec.oldPageRange} → ${sec.newPageRange}`}
                  </span>
                  {sec.renumberedFrom && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[#1E40AF]">was {sec.renumberedFrom}</span>
                    </>
                  )}
                  {!isStatic && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        +{sec.addedWords} / -{sec.deletedWords} words
                      </span>
                    </>
                  )}
                  {sec.riskFlags.length > 0 && !isStatic && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-medium ${
                          sec.riskSeverity === 'critical' ? 'text-[#B91C1C]' : 'text-[#B45309]'
                        }`}
                      >
                        {sec.riskSeverity ? `${sec.riskSeverity.toUpperCase()} · ` : ''}
                        {sec.riskFlags.length} Risk
                      </span>
                    </>
                  )}
                  {secScanOverlap && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-800 font-medium">No-OCR Sheet</span>
                    </>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
