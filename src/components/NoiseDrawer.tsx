import { X } from 'lucide-react';
import type { NoiseFilterConfig, ParseDiagnostics } from '../types/spec';

interface NoiseDrawerProps {
  diagnostics: ParseDiagnostics;
  noiseConfig: NoiseFilterConfig;
  isProcessing: boolean;
  onReparse: (nextConfig: NoiseFilterConfig) => void;
  onClose: () => void;
}

export function NoiseDrawer({
  diagnostics,
  noiseConfig,
  isProcessing,
  onReparse,
  onClose,
}: NoiseDrawerProps) {
  const totalLines =
    (diagnostics.oldStrippedLineCount ?? 0) + (diagnostics.newStrippedLineCount ?? 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Auto-Stripped Running Headers, Footers &amp; Section Page Stamps
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Removed {totalLines} edge-margin line{totalLines === 1 ? '' : 's'} · Active policy: top/bottom{' '}
            {Math.round(noiseConfig.edgeMarginPct * 100)}% margins recurring on &gt;
            {Math.round(noiseConfig.minRecurrencePct * 100)}% of pages or matching CSI page stamps
            {(diagnostics.outlineHintsUsed ?? 0) > 0
              ? ` · ${diagnostics.outlineHintsUsed} PDF outline TOC fallback hints applied`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stripped noise drawer"
          className="text-slate-500 hover:text-slate-900 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Configurable Sensitivity Controls */}
      <div className="flex flex-wrap items-center gap-4 pt-1 pb-2 border-b border-slate-100 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-medium">Margin Zone:</span>
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
            {[0.05, 0.1, 0.15].map((val) => (
              <button
                key={val}
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  onReparse({
                    ...noiseConfig,
                    edgeMarginPct: val,
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                  Math.abs(noiseConfig.edgeMarginPct - val) < 0.001
                    ? 'bg-white text-[#1E40AF] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {Math.round(val * 100)}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-600 font-medium">Page Recurrence:</span>
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
            {[0.3, 0.4, 0.6].map((val) => (
              <button
                key={val}
                type="button"
                disabled={isProcessing}
                onClick={() =>
                  onReparse({
                    ...noiseConfig,
                    minRecurrencePct: val,
                  })
                }
                className={`px-2.5 py-1 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                  Math.abs(noiseConfig.minRecurrencePct - val) < 0.001
                    ? 'bg-white text-[#1E40AF] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                &gt;{Math.round(val * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            label: `Baseline (${diagnostics.oldFileName}) · ${diagnostics.oldStrippedLineCount ?? 0} lines`,
            items: diagnostics.oldStrippedPatterns,
          },
          {
            label: `Addendum (${diagnostics.newFileName}) · ${diagnostics.newStrippedLineCount ?? 0} lines`,
            items: diagnostics.newStrippedPatterns,
          },
        ].map((col) => (
          <div key={col.label} className="border border-slate-200 rounded-md overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 border-b border-slate-200 tabular-nums">
              {col.label}
            </div>
            {col.items.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">No repeating edge noise detected.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {col.items.map((item, i) => (
                  <li key={i} className="px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <span className="font-mono text-slate-800 truncate">{item.sample}</span>
                    <span className="text-slate-500 shrink-0 tabular-nums">
                      {item.zone} · {item.frequencyPct}% ({item.pageHits}/{item.totalPages} pp)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
