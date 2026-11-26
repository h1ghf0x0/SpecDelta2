import { useState, type MouseEvent } from 'react';
import { Menu, X } from 'lucide-react';
import type { AppRoute } from '../types/spec';

interface TopNavProps {
  currentRoute: AppRoute | null;
  onNavigate: (route: AppRoute) => void;
  onLoadSample: () => void;
  isBusy: boolean;
}

const NAV_ITEMS: Array<{ label: string; route: AppRoute; matchPrefixes?: AppRoute[] }> = [
  { label: 'Diff Checker', route: '/' },
  { label: 'Spec Splitter', route: '/split-spec-book' },
  {
    label: 'Trade Guides',
    route: '/compare-division-08-doors-hardware-specs',
    matchPrefixes: [
      '/compare-division-03-concrete-specs',
      '/compare-division-07-thermal-moisture-specs',
      '/compare-division-08-doors-hardware-specs',
      '/compare-division-09-finishes-specs',
      '/compare-division-23-hvac-specs',
      '/compare-division-26-electrical-specs',
    ],
  },
  {
    label: 'vs Bluebeam',
    route: '/vs-bluebeam',
    matchPrefixes: ['/vs-bluebeam', '/acrobat-alternative', '/unclouded-addenda'],
  },
  { label: 'Benchmark', route: '/benchmark' },
];

export function TopNav({ currentRoute, onNavigate, onLoadSample, isBusy }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (!currentRoute) return false;
    if (currentRoute === item.route) return true;
    return item.matchPrefixes?.includes(currentRoute) ?? false;
  };

  const handleLinkClick = (
    e: MouseEvent<HTMLAnchorElement>,
    route: AppRoute,
    closeMenu?: boolean
  ) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      onNavigate(route);
      if (closeMenu) setMobileOpen(false);
    }
  };

  return (
    <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1380px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, '/', true)}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-[#1E40AF] transition-colors"
        >
          SpecDelta
        </a>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <a
                key={item.route}
                href={item.route}
                onClick={(e) => handleLinkClick(e, item.route)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  active
                    ? 'text-[#1E40AF] border-[#1E40AF]'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              onLoadSample();
              setMobileOpen(false);
            }}
            className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Load Sample Spec
          </button>

          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.route}
              href={item.route}
              onClick={(e) => handleLinkClick(e, item.route, true)}
              className={`block w-full text-left px-3 py-2.5 rounded-md text-sm font-medium ${
                isActive(item)
                  ? 'bg-blue-50 text-[#1E40AF]'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </a>
          ))}
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              onLoadSample();
              setMobileOpen(false);
            }}
            className="w-full mt-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] disabled:opacity-50 cursor-pointer"
          >
            Load Sample Spec
          </button>
        </div>
      )}
    </header>
  );
}
