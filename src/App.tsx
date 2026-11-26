import { lazy, Suspense, useEffect, useState } from 'react';
import { DiffWorkbench } from './components/DiffWorkbench';
import { Footer } from './components/Footer';
import { TopNav } from './components/TopNav';
import { SEO_ROUTE_META, VALID_APP_ROUTES } from './data/seoRoutesMeta';
import type { AppRoute } from './types/spec';

const SpecSplitter = lazy(() =>
  import('./components/SpecSplitter').then((mod) => ({ default: mod.SpecSplitter }))
);
const SeoContentPage = lazy(() =>
  import('./components/SeoContentPage').then((mod) => ({ default: mod.SeoContentPage }))
);

function normalizeRoute(pathname: string): AppRoute | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return VALID_APP_ROUTES.has(clean as AppRoute) ? (clean as AppRoute) : null;
}

async function updateDocumentSeo(route: AppRoute | null) {
  const baseMeta = route
    ? SEO_ROUTE_META[route]
    : {
        title: 'Page Not Found (404) | SpecDelta',
        description: 'The requested SpecDelta page could not be found.',
      };

  const title = baseMeta.title;
  const description = baseMeta.description;
  const robotsContent = route === null ? 'noindex, nofollow' : 'index, follow';

  const schemas: unknown[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SpecDelta',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
      description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ];

  if (route === '/split-spec-book') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to Split a Construction Project Manual by CSI Division',
      step: [
        {
          '@type': 'HowToStep',
          name: 'Load Project Manual PDF',
          text: 'Drop your full GC Project Manual PDF into the browser splitter.',
        },
        {
          '@type': 'HowToStep',
          name: 'Select CSI Divisions or Sections',
          text: 'Check only the CSI MasterFormat divisions or sections you are bidding.',
        },
        {
          '@type': 'HowToStep',
          name: 'Download Extracted PDF',
          text: 'Click Download Extracted PDF to save a sliced PDF in seconds.',
        },
      ],
    });
  } else if (route !== null && route !== '/') {
    const { SEO_PAGES } = await import('./data/seoContent');
    if (route in SEO_PAGES) {
      const cfg = SEO_PAGES[route];
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: cfg.faqs.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.answer,
          },
        })),
      });
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: cfg.headline,
        step: cfg.howToSteps.map((s) => ({
          '@type': 'HowToStep',
          name: s.step,
          text: s.description,
        })),
      });
    }
  }

  document.title = title;
  const setMeta = (selector: string, content: string) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('content', content);
  };
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);

  const canonicalHref = route ? `${window.location.origin}${route}` : '';
  let canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalHref) {
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonicalHref);

    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', canonicalHref);
  } else if (canonicalEl) {
    canonicalEl.remove();
  }

  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    document.head.appendChild(robotsMeta);
  }
  robotsMeta.setAttribute('content', robotsContent);

  const schemaScript = document.getElementById('specdelta-schema');
  if (schemaScript) {
    schemaScript.textContent = JSON.stringify(schemas);
  }
}

function RouteFallback() {
  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 py-16">
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-600">
        Loading view...
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute | null>(() =>
    normalizeRoute(window.location.pathname)
  );
  const [divisionPreset, setDivisionPreset] = useState<string>('all');
  const [sampleRequestCount, setSampleRequestCount] = useState<number>(0);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    void updateDocumentSeo(route);
  }, [route]);

  const navigate = (nextRoute: AppRoute, divisionCode?: string) => {
    if (divisionCode) {
      setDivisionPreset(divisionCode);
    } else if (nextRoute === '/') {
      setDivisionPreset('all');
    }
    if (window.location.pathname !== nextRoute || window.location.search) {
      window.history.pushState({}, '', nextRoute);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleLoadSampleFromAnywhere = (divisionCode?: string) => {
    if (divisionCode) {
      setDivisionPreset(divisionCode);
    }
    if (route !== '/') {
      window.history.pushState({}, '', '/');
      setRoute('/');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    setSampleRequestCount((c) => c + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#0F172A]">
      <TopNav
        currentRoute={route}
        onNavigate={(r) => navigate(r)}
        onLoadSample={() => handleLoadSampleFromAnywhere()}
        isBusy={isBusy}
      />

      <main className="flex-1">
        {route === null ? (
          <section className="max-w-[1380px] mx-auto px-4 sm:px-6 py-20">
            <div className="max-w-xl bg-white border border-slate-200 rounded-lg p-8 space-y-4">
              <div className="font-mono text-xs font-semibold text-[#B91C1C]">
                HTTP 404 · Route Not Found
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                That SpecDelta page does not exist.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Check the URL path or return directly to the Spec Diff Checker or CSI Spec Book Splitter.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href="/"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      navigate('/');
                    }
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E40AF] rounded-md hover:bg-[#1E3A8A] transition-colors"
                >
                  Open Spec Diff Checker
                </a>
                <a
                  href="/split-spec-book"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      navigate('/split-spec-book');
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Open CSI Spec Splitter
                </a>
              </div>
            </div>
          </section>
        ) : route === '/' ? (
          <DiffWorkbench
            onNavigate={(r) => navigate(r)}
            externalSampleRequest={sampleRequestCount}
            initialDivisionFilter={divisionPreset}
            onBusyChange={setIsBusy}
          />
        ) : route === '/split-spec-book' ? (
          <Suspense fallback={<RouteFallback />}>
            <SpecSplitter onNavigateWithDivision={(r, div) => navigate(r, div)} />
          </Suspense>
        ) : (
          <Suspense fallback={<RouteFallback />}>
            <SeoContentPage
              route={route}
              onNavigate={(r, div) => navigate(r, div)}
              onRunSampleDiff={(div) => handleLoadSampleFromAnywhere(div)}
            />
          </Suspense>
        )}
      </main>

      <Footer onNavigate={(r) => navigate(r)} />
    </div>
  );
}
