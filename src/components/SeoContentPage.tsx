import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { SEO_PAGES, TRADE_GUIDE_ROUTES } from '../data/seoContent';
import type { AppRoute } from '../types/spec';

interface SeoContentPageProps {
  route: Exclude<AppRoute, '/' | '/split-spec-book'>;
  onNavigate: (route: AppRoute, divisionCode?: string) => void;
  onRunSampleDiff: (divisionCode?: string) => void;
}

const IMAGE_PATHS = {
  desk: '/src/assets/images/spec_manual_desk_1795647963117.jpg',
  blueprint: '/src/assets/images/construction_blueprint_detail_1795647962949.jpg',
};

export function SeoContentPage({ route, onNavigate, onRunSampleDiff }: SeoContentPageProps) {
  const page = SEO_PAGES[route];
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [imgError, setImgError] = useState(false);

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
              <div className="h-full min-h-[240px] rounded-lg border border-slate-200 bg-white overflow-hidden">
                {!imgError ? (
                  <img
                    src={IMAGE_PATHS[page.heroImage]}
                    alt={page.heroImageAlt}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full min-h-[240px] bg-gradient-to-br from-slate-100 to-blue-50 flex flex-col items-center justify-center p-6 text-center">
                    <FileSpreadsheet className="w-8 h-8 text-[#1E40AF] mb-2" />
                    <div className="text-sm font-semibold text-slate-800">{page.eyebrow}</div>
                  </div>
                )}
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
