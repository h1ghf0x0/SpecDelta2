import type { MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AppRoute } from '../types/spec';

interface EmptyWorkbenchGuideProps {
  onNavigate: (route: AppRoute) => void;
}

export function EmptyWorkbenchGuide({ onNavigate }: EmptyWorkbenchGuideProps) {
  const handleLink = (e: MouseEvent<HTMLAnchorElement>, route: AppRoute) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      onNavigate(route);
    }
  };

  return (
    <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Numbered Drafting Mechanism Ledger */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          <div className="px-6 py-4 bg-slate-50/60 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              How SpecDelta Eliminates Bid-Day False Positives
            </h2>
            <span className="text-xs font-mono text-slate-500">3-Stage Local Pipeline</span>
          </div>

          <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
            <span className="font-mono text-xs font-semibold text-[#1E40AF] shrink-0 pt-0.5 tabular-nums">
              01.
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Coordinate Header &amp; Footer Noise Stripping
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Reads X/Y text positions inside a dedicated Web Worker, detects repeating edge lines and CSI section page stamps like{' '}
                <span className="font-mono text-xs text-slate-800">08 71 00 - 4</span> in top/bottom 10% margins, and strips them before diffing.
              </p>
            </div>
          </div>

          <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
            <span className="font-mono text-xs font-semibold text-[#1E40AF] shrink-0 pt-0.5 tabular-nums">
              02.
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                CSI MasterFormat Alignment &amp; Bookmark Fallback
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Normalizes inconsistent section codes (<span className="font-mono text-xs text-slate-800">08 71 00</span> vs. <span className="font-mono text-xs text-slate-800">08 7100</span> vs. <span className="font-mono text-xs text-slate-800">08710</span>), falls back to PDF outline bookmarks on schedule pages, and heals hyphenated line wraps.
              </p>
            </div>
          </div>

          <div className="p-6 flex flex-col sm:flex-row sm:items-start gap-4">
            <span className="font-mono text-xs font-semibold text-[#1E40AF] shrink-0 pt-0.5 tabular-nums">
              03.
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Delta-Scoped Money &amp; Risk Highlighter
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Surfaces changed tolerances (<span className="font-mono text-xs text-slate-800">PSI</span>, <span className="font-mono text-xs text-slate-800">mil</span>, <span className="font-mono text-xs text-slate-800">gauge</span>), modal shifts (<span className="font-mono text-xs text-slate-800">shall → may</span>), warranties, and liability transfers (<span className="font-mono text-xs text-slate-800">furnish and install</span> vs. <span className="font-mono text-xs text-slate-800">install only</span>) with 1-click Excel export.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Dedicated CSI Spec Book Splitter + Proof Benchmarks */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="text-xs font-mono text-slate-500">Companion Utility · Division Slicer</div>
            <h2 className="font-display text-xl font-bold text-slate-900 leading-snug text-balance">
              Only bidding one trade? Extract your CSI Division before comparing.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Use the free CSI MasterFormat Spec Book Splitter to slice Division 03, 08, 23, or 26 out of an 800-page GC Project Manual into a standalone PDF—without uploading a single byte.
            </p>

            <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  ±10% / &gt;40%
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Configurable margin &amp; header strip
                </div>
              </div>
              <div>
                <div className="font-mono text-lg font-bold text-[#1E40AF] tabular-nums">
                  Local Worker
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Off-thread Web Worker PDF parsing
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="/split-spec-book"
              onClick={(e) => handleLink(e, '/split-spec-book')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] drafting-transition whitespace-nowrap shrink-0"
            >
              Open Spec Book Splitter
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="/benchmark"
              onClick={(e) => handleLink(e, '/benchmark')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 drafting-transition whitespace-nowrap shrink-0"
            >
              View Sample Benchmark
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
