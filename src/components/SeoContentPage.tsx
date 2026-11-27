import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { SEO_PAGES } from '../data/seoContent';
import { TRADE_GUIDE_ROUTES } from '../data/seoRoutesMeta';
import type { AppRoute } from '../types/spec';

interface SeoContentPageProps {
  route: Exclude<AppRoute, '/' | '/split-spec-book'>;
  onNavigate: (route: AppRoute, divisionCode?: string) => void;
  onRunSampleDiff: (divisionCode?: string) => void;
}

function SpecIllustration({ variant, label }: { variant: 'desk' | 'blueprint'; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="w-full h-full min-h-[240px] bg-slate-900 text-slate-100 p-5 flex flex-col justify-between select-none"
    >
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span>{variant === 'desk' ? 'CSI SPEC LEDGER' : 'DRAWING & SCHEDULE VIEW'}</span>
        <span className="text-amber-400">{variant === 'desk' ? 'ADDENDUM DELTA' : 'SECTION SYNC'}</span>
      </div>
      <svg viewBox="0 0 360 150" className="w-full h-auto my-2" aria-hidden="true">
        <defs>
          <pattern id="grid" width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M 18 0 L 0 0 0 18" fill="none" stroke="#1E293B" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="360" height="150" rx="6" fill="url(#grid)" stroke="#334155" strokeWidth="1" />
        {variant === 'desk' ? (
          <>
            <rect x="20" y="20" width="145" height="110" rx="4" fill="#0F172A" stroke="#475569" />
            <rect x="30" y="32" width="70" height="7" rx="2" fill="#3B82F6" />
            <rect x="30" y="48" width="120" height="5" rx="2" fill="#334155" />
            <rect x="30" y="60" width="95" height="5" rx="2" fill="#EF4444" opacity="0.8" />
            <rect x="30" y="72" width="115" height="5" rx="2" fill="#334155" />
            <rect x="30" y="88" width="105" height="5" rx="2" fill="#334155" />
            <rect x="30" y="100" width="80" height="5" rx="2" fill="#F59E0B" opacity="0.85" />
            <rect x="195" y="20" width="145" height="110" rx="4" fill="#0F172A" stroke="#2563EB" />
            <rect x="205" y="32" width="76" height="7" rx="2" fill="#60A5FA" />
            <rect x="205" y="48" width="120" height="5" rx="2" fill="#334155" />
            <rect x="205" y="60" width="102" height="5" rx="2" fill="#10B981" opacity="0.9" />
            <rect x="205" y="72" width="115" height="5" rx="2" fill="#334155" />
            <rect x="205" y="88" width="105" height="5" rx="2" fill="#334155" />
            <rect x="205" y="100" width="92" height="5" rx="2" fill="#F59E0B" opacity="0.9" />
            <path d="M170 62 L190 62" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="3 2" />
            <path d="M170 102 L190 102" stroke="#F59E0B" strokeWidth="1.5" />
          </>
        ) : (
          <>
            <rect x="22" y="18" width="316" height="114" rx="4" fill="#0F172A" stroke="#3B82F6" opacity="0.9" />
            <line x1="22" y1="42" x2="338" y2="42" stroke="#1E3A8A" strokeWidth="1" />
            <line x1="120" y1="42" x2="120" y2="132" stroke="#1E3A8A" strokeWidth="1" />
            <line x1="230" y1="42" x2="230" y2="132" stroke="#1E3A8A" strokeWidth="1" />
            <rect x="34" y="26" width="95" height="8" rx="2" fill="#60A5FA" />
            <rect x="34" y="54" width="72" height="6" rx="2" fill="#475569" />
            <rect x="34" y="70" width="60" height="6" rx="2" fill="#475569" />
            <rect x="34" y="86" width="68" height="6" rx="2" fill="#F59E0B" />
            <rect x="134" y="54" width="82" height="6" rx="2" fill="#EF4444" opacity="0.85" />
            <rect x="134" y="70" width="74" height="6" rx="2" fill="#10B981" opacity="0.9" />
            <rect x="134" y="86" width="64" height="6" rx="2" fill="#475569" />
            <rect x="244" y="54" width="78" height="6" rx="2" fill="#3B82F6" />
            <rect x="244" y="70" width="66" height="6" rx="2" fill="#F59E0B" />
            <rect x="244" y="86" width="72" height="6" rx="2" fill="#10B981" />
          </>
        )}
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span>03 30 00 · 08 71 00 · 26 24 13</span>
        <span className="text-emerald-400">LOCAL WORKER PARSED</span>
      </div>
    </div>
  );
}

export function SeoContentPage({ route, onNavigate, onRunSampleDiff }: SeoContentPageProps) {
  const page = SEO_PAGES[route];
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const isTradeGuide = page.category === 'Trade Guide';
  const isComparison = page.category === 'Comparison' || page.category === 'Workflow Guide';

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Editorial Hero */}
      <section className="blueprint-grid border-b border-slate-200">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-10 lg:py-14">
          {isTradeGuide && (
            <div className="mb-6 flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-md w-fit">
              {TRADE_GUIDE_ROUTES.map((t) => (
                <a
                  key={t.route}
                  href={t.route}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      onNavigate(t.route);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    route === t.route
                      ? 'bg-[#1E40AF] text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Div {t.code} · {t.label}
                </a>
              ))}
            </div>
          )}

          {isComparison && (
            <div className="mb-6 flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-md w-fit">
              {(
                [
                  { r: '/vs-bluebeam', label: 'vs Bluebeam Revu' },
                  { r: '/acrobat-alternative', label: 'Adobe Acrobat Alternative' },
                  { r: '/unclouded-addenda', label: 'Unclouded Addenda' },
                  { r: '/benchmark', label: 'Benchmark Fixture' },
                ] as Array<{ r: AppRoute; label: string }>
              ).map((tab) => (
                <a
                  key={tab.r}
                  href={tab.r}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      onNavigate(tab.r);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    route === tab.r
                      ? 'bg-[#1E40AF] text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </a>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="text-xs font-medium text-slate-600 mb-2">{page.eyebrow}</div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 leading-[1.14] text-balance">
                {page.headline}
              </h1>
              <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-2xl">
                {page.summary}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {page.ctaTarget === '/split-spec-book' || page.category === 'Legal & Trust' ? (
                  <a
                    href={page.ctaTarget}
                    onClick={(e) => {
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                        e.preventDefault();
                        onNavigate(page.ctaTarget);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors whitespace-nowrap shrink-0"
                  >
                    {page.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRunSampleDiff(page.divisionFilter)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {page.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <a
                  href="/split-spec-book"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      onNavigate('/split-spec-book');
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Open CSI Spec Splitter
                </a>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[240px] rounded-lg border border-slate-200 bg-slate-900 overflow-hidden">
                <SpecIllustration variant={page.heroImage} label={page.heroImageAlt} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real-World Estimator Traps */}
      <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-6">
            Key Specification Risks & Estimator Traps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {page.keyGotchas.map((item) => (
              <div key={item.title} className="bg-white border border-slate-200 rounded-lg p-6">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Benchmark Comparison Table (when present) */}
        {page.benchmarkTable && (
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 mb-5">
              Side-by-Side Comparison Matrix
            </h2>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                    <th className="py-3 px-4">Evaluation Metric</th>
                    <th className="py-3 px-4">Bluebeam Revu Compare</th>
                    <th className="py-3 px-4">Cloud LLM Chat</th>
                    <th className="py-3 px-4 text-[#1E40AF]">SpecDelta (Local CSI Engine)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {page.benchmarkTable.map((row) => (
                    <tr key={row.metric} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-medium text-slate-900">{row.metric}</td>
                      <td className="py-3.5 px-4 text-slate-600">{row.bluebeam}</td>
                      <td className="py-3.5 px-4 text-slate-600">{row.llmChat}</td>
                      <td className="py-3.5 px-4 font-semibold text-[#1E40AF] tabular-nums">
                        {row.specDelta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* How-To Workflow Steps */}
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-5">
            Bid-Day Verification Workflow
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {page.howToSteps.map((s, idx) => (
              <div key={s.step} className="bg-white border border-slate-200 rounded-lg p-6">
                <div className="font-mono text-xs font-semibold text-[#1E40AF] mb-2 tabular-nums">
                  Step {String(idx + 1).padStart(2, '0')}
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900">{s.step}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive FAQ Accordion */}
        <div className="max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-5">
            Frequently Asked Questions
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {page.faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={faq.question}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-semibold text-slate-900">{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
