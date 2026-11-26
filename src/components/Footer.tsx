import type { MouseEvent } from 'react';
import { TRADE_GUIDE_ROUTES } from '../data/seoContent';
import type { AppRoute } from '../types/spec';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const handleLink = (e: MouseEvent<HTMLAnchorElement>, route: AppRoute) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      onNavigate(route);
    }
  };

  return (
    <footer className="no-print border-t border-slate-200 bg-white mt-16">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <a
              href="/"
              onClick={(e) => handleLink(e, '/')}
              className="inline-block font-display text-base font-bold tracking-tight text-slate-900 hover:text-[#1E40AF] transition-colors"
            >
              SpecDelta
            </a>
            <p className="text-sm text-slate-600 leading-relaxed max-w-xs">
              Section-aware Project Manual diffing and CSI MasterFormat splitting built for commercial estimators. Runs locally in your browser.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide mb-3">
              Core Tools
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a
                  href="/"
                  onClick={(e) => handleLink(e, '/')}
                  className="hover:text-[#1E40AF] transition-colors"
                >
                  Spec Diff Checker
                </a>
              </li>
              <li>
                <a
                  href="/split-spec-book"
                  onClick={(e) => handleLink(e, '/split-spec-book')}
                  className="hover:text-[#1E40AF] transition-colors"
                >
                  CSI Spec Book Splitter
                </a>
              </li>
              <li>
                <a
                  href="/benchmark"
                  onClick={(e) => handleLink(e, '/benchmark')}
                  className="hover:text-[#1E40AF] transition-colors"
                >
                  Synthetic Spec Benchmark
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide mb-3">
              Workflow Comparisons
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <a
                  href="/vs-bluebeam"
                  onClick={(e) => handleLink(e, '/vs-bluebeam')}
                  className="hover:text-[#1E40AF] transition-colors"
                >
                  Bluebeam Compare Alternative
                </a>
              </li>
              <li>
                <a
                  href="/acrobat-alternative"
                  onClick={(e) => handleLink(e, '/acrobat-alternative')}
                  className="hover:text-[#1E40AF] transition-colors"
                >
                  Adobe Acrobat Alternative
                </a>
              </li>
              <li>
                <a
                  href="/unclouded-addenda"
                  onClick={(e) => handleLink(e, '/unclouded-addenda')}
                  className="hover:text-[#1E40AF] transition-colors"
                >
                  Unclouded Addendum Guide
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-900 tracking-wide mb-3">
              CSI Trade Guides
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              {TRADE_GUIDE_ROUTES.map((trade) => (
                <li key={trade.route}>
                  <a
                    href={trade.route}
                    onClick={(e) => handleLink(e, trade.route)}
                    className="hover:text-[#1E40AF] transition-colors"
                  >
                    <span className="font-mono text-xs text-slate-500 mr-1.5 tabular-nums">
                      Div {trade.code}
                    </span>
                    {trade.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span>SpecDelta</span>
            <span aria-hidden="true">·</span>
            <span>Client-Side Web Worker PDF Engine</span>
            <span aria-hidden="true">·</span>
            <span>No Server PDF Storage</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/privacy"
              onClick={(e) => handleLink(e, '/privacy')}
              className="hover:text-[#1E40AF] transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleLink(e, '/terms')}
              className="hover:text-[#1E40AF] transition-colors"
            >
              Terms &amp; Verification
            </a>
            <a
              href="mailto:support@specdelta.app"
              className="hover:text-[#1E40AF] transition-colors"
            >
              support@specdelta.app
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
