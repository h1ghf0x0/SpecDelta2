import type { AppRoute } from '../types/spec';

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface BenchmarkRow {
  metric: string;
  bluebeam: string;
  llmChat: string;
  specDelta: string;
}

export interface SeoPageConfig {
  route: AppRoute;
  category: 'Comparison' | 'Workflow Guide' | 'Benchmark' | 'Trade Guide' | 'Legal & Trust';
  divisionFilter?: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  headline: string;
  summary: string;
  heroImage: 'desk' | 'blueprint';
  heroImageAlt: string;
  keyGotchas: Array<{ title: string; detail: string }>;
  howToSteps: Array<{ step: string; description: string }>;
  benchmarkTable?: BenchmarkRow[];
  faqs: SeoFaqItem[];
  ctaLabel: string;
  ctaTarget: AppRoute;
}

export const SEO_PAGES: Record<Exclude<AppRoute, '/' | '/split-spec-book'>, SeoPageConfig> = {
  '/vs-bluebeam': {
    route: '/vs-bluebeam',
    category: 'Comparison',
    metaTitle: 'Bluebeam Compare Documents Alternative for Spec Books | SpecDelta',
    metaDescription:
      'Stop Bluebeam Revu from flagging 200+ pages red after a 2-line addendum shift. Compare Project Manuals by CSI section locally in your browser.',
    eyebrow: 'Comparison · Bluebeam Revu vs. SpecDelta',
    headline: 'Why Bluebeam Compare Documents Breaks on 600-Page Spec Books',
    summary:
      'Bluebeam Revu compares PDFs visually page-by-page. When an architect adds three lines in Division 01 or concrete mixes in Division 03, every downstream paragraph shifts onto the next page—causing Bluebeam to highlight hundreds of unchanged pages in red.',
    heroImage: 'desk',
    heroImageAlt: 'Commercial construction Project Manual binder open beside architectural scale on drafting desk',
    keyGotchas: [
      {
        title: '01. The Page-Shift Domino Effect',
        detail:
          'Visual overlay and page-locked diffing treat page 142 in the Permit Set as equivalent to page 142 in Addendum 1. A single inserted paragraph offsets every subsequent page boundary.',
      },
      {
        title: '02. Repeating Architect Headers & Footers',
        detail:
          'Updated issue stamps (e.g., "ADDENDUM 01 - AUG 14, 2026") and shifted section page numbers ("08 71 00 - 4") trigger false-positive changes on every single sheet unless manually masked.',
      },
      {
        title: '03. Inconsistent CSI Numbering',
        detail:
          'Architects frequently mix spacing between revisions (SECTION 08 71 00 vs. SECTION 08 7100 vs. 08710). Section-aware normalization aligns them automatically.',
      },
    ],
    howToSteps: [
      {
        step: 'Load Original Bid Set & Addendum PDF',
        description:
          'Drop both Project Manuals into SpecDelta. All parsing runs locally inside a browser Web Worker—your NDA bid specs never leave your workstation.',
      },
      {
        step: 'Auto-Strip Headers, Footers & Page Numbers',
        description:
          'SpecDelta inspects text Y-coordinates, identifies repeating lines in the top and bottom 10% across >40% of pages, and strips them before comparison.',
      },
      {
        step: 'Export a Clean CSI Change Log to Excel',
        description:
          'Review word-level Myers diffs section-by-section with Money & Risk highlights (PSI, mil, allowances, by Owner) and export directly to .xlsx.',
      },
    ],
    benchmarkTable: [
      {
        metric: 'Alignment Unit',
        bluebeam: 'Page-by-page visual overlay',
        llmChat: 'Raw prompt token window',
        specDelta: 'Normalized CSI section code & title',
      },
      {
        metric: 'Header / Footer Handling',
        bluebeam: 'Included unless masked manually',
        llmChat: 'Passed in raw extracted text',
        specDelta: 'Auto-stripped via edge-margin & stamp rules',
      },
      {
        metric: 'Data Privacy / Processing',
        bluebeam: 'Local desktop executable',
        llmChat: 'Uploads document text to cloud chat',
        specDelta: 'Browser Web Worker (opt-in Gemini brief)',
      },
      {
        metric: 'Primary Deliverable',
        bluebeam: 'Redline PDF markup pages',
        llmChat: 'Free-form chat summary',
        specDelta: 'Structured .xlsx Change Log + Print Redline',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta replace Bluebeam Revu for drawing takeoffs?',
        answer:
          'No. Bluebeam Revu remains the industry standard for 2D plan takeoffs and visual drawing overlays. SpecDelta is built specifically for multi-hundred-page text Project Manuals where page-by-page visual comparison breaks.',
      },
      {
        question: 'How does SpecDelta handle text pushed across a page break?',
        answer:
          'SpecDelta strips repeating headers and footers first, stitches each CSI section into continuous normalized paragraphs across page breaks, and diffs section-to-section rather than page-to-page.',
      },
      {
        question: 'Do my confidential bid specifications get uploaded to a server?',
        answer:
          'Never by default. PDF extraction, noise stripping, CSI chunking, Myers diffing, and Excel export run locally in your browser. Only an explicit opt-in click on the Gemini Scope Brief sends isolated changed paragraphs.',
      },
    ],
    ctaLabel: 'Test on Built-In Sample Spec',
    ctaTarget: '/',
  },

  '/acrobat-alternative': {
    route: '/acrobat-alternative',
    category: 'Comparison',
    metaTitle: 'Adobe Acrobat Compare PDF Alternative for Project Manuals | SpecDelta',
    metaDescription:
      'Why Adobe Acrobat Compare Files stalls on 500-page construction specs—and how CSI section alignment gives estimators an instant Excel Change Log.',
    eyebrow: 'Comparison · Adobe Acrobat Alternative',
    headline: 'Adobe Acrobat Compare PDF Alternative for Construction Project Manuals',
    summary:
      'Adobe Acrobat Pro Compare Files was built for 10-page legal contracts, not 800-page CSI MasterFormat Project Manuals. SpecDelta chunks specifications by CSI division so estimators review only their trade scope.',
    heroImage: 'blueprint',
    heroImageAlt: 'Architectural floor plan and door hardware schedule blueprints on drafting table',
    keyGotchas: [
      {
        title: '01. Memory Spikes & Unfiltered Noise',
        detail:
          'Acrobat attempts to render and compare every running header, footer, and blank back-of-section page, slowing down on large bid sets.',
      },
      {
        title: '02. No CSI Division Filtering',
        detail:
          'Electrical or roofing subcontractors do not want to scroll through 400 pages of architectural finishes to verify two modified paragraphs in Division 26 or 07.',
      },
      {
        title: '03. No Estimator Risk Flagging',
        detail:
          'Acrobat marks a changed comma with the same visual weight as changing 4000 PSI concrete to 5000 PSI or shifting hardware from Furnish & Install to Install Only.',
      },
    ],
    howToSteps: [
      {
        step: 'Drop Original and Revised Project Manuals',
        description:
          'Open SpecDelta in any modern browser—no Acrobat license or desktop install required.',
      },
      {
        step: 'Filter by Your CSI Division',
        description:
          'Narrow the results tree to Division 03, 08, 23, 26, or any specific trade section in one click.',
      },
      {
        step: 'Download Excel Change Log or Clean Redline',
        description:
          'Send a concise tabular change log to your project manager or subcontractor pricing team before bid closing.',
      },
    ],
    faqs: [
      {
        question: 'Can subcontractors split out just their CSI Division from a GC Project Manual?',
        answer:
          'Yes. Use the built-in CSI Spec Book Splitter to extract only the pages belonging to your Division or selected sections into a clean standalone PDF.',
      },
      {
        question: 'Does SpecDelta export to Excel without manual copy-pasting?',
        answer:
          'Yes. Click Excel (.xlsx) in the workbench to download a structured spreadsheet with CSI Division, Section #, Title, Status, Old Text, New Text, and Risk Keyword Flags.',
      },
    ],
    ctaLabel: 'Open Spec Diff Checker',
    ctaTarget: '/',
  },

  '/unclouded-addenda': {
    route: '/unclouded-addenda',
    category: 'Workflow Guide',
    metaTitle: 'How to Catch Unclouded Addendum Changes & Silent Reverts | SpecDelta',
    metaDescription:
      'Detect silent spec edits, deleted CSI sections, and unclouded addendum changes in re-issued Project Manuals without relying on architect narratives.',
    eyebrow: 'Estimator Guide · Addendum Risk Control',
    headline: 'How to Catch Unclouded Addendum Changes in a Re-Issued Spec Book',
    summary:
      'Addendum cover narratives routinely omit subtle edits—such as silently deleting a masonry section, bumping membrane thickness from 60 mil to 80 mil, or reverting an Addendum 1 substitution in Addendum 2.',
    heroImage: 'desk',
    heroImageAlt: 'Open specification binder showing numbered construction specification clauses',
    keyGotchas: [
      {
        title: '01. Narrative vs. Actual Text Mismatches',
        detail:
          'Design teams sometimes summarize "Updated Division 08 hardware" while quietly shifting card reader furnish-and-install responsibility between Division 08 and Division 28.',
      },
      {
        title: '02. Silent Section Deletions & Additions',
        detail:
          'When an architect deletes Section 04 22 00 or inserts Section 13 31 00 without a prominent cloud, page-diff tools scramble every section after it.',
      },
      {
        title: '03. Tolerance & Warranty Creep',
        detail:
          'Single-word changes like "15-year NDL" to "20-year NDL" or "65,000 AIC" to "85,000 AIC" can add tens of thousands of dollars on bid day.',
      },
    ],
    howToSteps: [
      {
        step: 'Run Full-Book Section Alignment',
        description:
          'Never rely solely on the Addendum narrative sheet. Always run the complete re-issued manual against the base Permit/Bid Set.',
      },
      {
        step: 'Filter Results by Money & Risk Flags',
        description:
          'Toggle the Risk-Flagged filter to inspect every edit involving PSI, mil, gauge, AIC, warranty terms, allowances, or "by Owner" language first.',
      },
      {
        step: 'Audit Stripped Headers & Footers',
        description:
          'Open the Stripped Noise inspector to confirm no legitimate spec lines were hidden alongside project footers.',
      },
    ],
    faqs: [
      {
        question: 'How does SpecDelta flag Money & Risk keywords?',
        answer:
          'SpecDelta runs a deterministic regex scanner on every modified token—no AI required—highlighting PSI/MPa, mil/gauge/mm tolerances, hour fire ratings, warranties, dollar allowances, alternates, and scope-transfer phrases like "install only" or "by owner".',
      },
      {
        question: 'What if the architect changed section numbering formatting between addenda?',
        answer:
          'SpecDelta normalizes SECTION 08 71 00, SECTION 08 7100, and legacy 08710 codes into a canonical 6-digit CSI key before matching.',
      },
    ],
    ctaLabel: 'Audit an Addendum Now',
    ctaTarget: '/',
  },

  '/benchmark': {
    route: '/benchmark',
    category: 'Benchmark',
    metaTitle: 'Benchmark: Real & Held-Out Project Manual Corpus Results | SpecDelta',
    metaDescription:
      'Measured counts and Clopper-Pearson 95% confidence intervals across 10 real corpus PDFs (227p), 11 held-out public manuals (6,315p), and a 603-page stress run.',
    eyebrow: 'Benchmark Study · Real Corpus (227p) & Held-Out Public Manuals (6,315p)',
    headline: 'Measured Accuracy, Counts & Confidence Intervals Across Real Project Manuals',
    summary:
      'Reproducible measurements with exact Clopper-Pearson 95% confidence intervals (statsCi.ts) across three suites: (1) npm run benchmark:real on 10 public PDFs (227 pages: 21/21 CSI sections detected, 0/20 verbatim shift false positives, 12/12 edits caught [95% CI 73.5–100%; 0/12 misses, <= 22.1% one-sided upper bound]); (2) npm run benchmark:heldout on 11 unseen public manuals totaling 6,315 pages (230/234 bookmark-grounded CSI sections matched [98.3%, 95% CI 95.7–99.5%], 6/637 unseen verbatim-shift false positives [0.9%, 95% CI 0.3–2.0%], 0/111 false positives on the full 1,046-page Dover NH volume, and 22/23 held-out planted edits caught [95.7%, 95% CI 78.1–99.9%]); and (3) our 603-page stress run (2.9s total, 24/24 shifted sections unchanged). Scanned raster sheets without OCR are flagged with No-OCR warnings rather than silently diffed.',
    heroImage: 'desk',
    heroImageAlt: 'Specification benchmark desk setup with Project Manual and structural sheets',
    keyGotchas: [
      {
        title: '01. Held-Out Unseen Manuals (5,269 Pages + 1,046p Dover Vol. 1)',
        detail:
          'Evaluated unmodified on 10 unseen U.S. public manuals (637 CSI sections, 28 scanned pages flagged): 230/234 bookmark-grounded CSI sections matched across 6 outlined manuals (98.3%, 95% CI 95.7–99.5%; 4/234 missed), 6/637 verbatim shift false positives (0.9%, 95% CI 0.3–2.0%, all in 09_cmich_pm.pdf), and 0/111 shift false positives on full 1,046-page Dover NH (<= 2.7% one-sided upper bound).',
      },
      {
        title: '02. Tuned 10-PDF Corpus & Clopper-Pearson Intervals',
        detail:
          'On the 227-page corpus (benchmarks/real_corpus_results.json): 21/21 CSI sections detected (0/21 false splits & 0/21 misses, <= 13.3% 95% upper bound), 0/20 verbatim shift false positives across 210 shifted pages (<= 13.9% upper bound vs. 217/217 raw pages), and 12/12 edits caught (95% CI 73.5–100%; 0/12 misses, <= 22.1% upper bound).',
      },
      {
        title: '03. Held-Out Planted Edits & Stress Throughput',
        detail:
          'Across 23 controlled edits injected into 40 sampled unseen sections from all 10 held-out manuals: 22/23 edits caught (95.7%, 95% CI 78.1–99.9%; 1/23 missed where 00 01 07 folded into front matter), 20/21 risk flags matched (95.2%), and 1/19 unchanged false positive (5.3%). On the 603-page stress fixture, parse + diff completed in 2.9s (211 pages/sec).',
      },
    ],
    howToSteps: [
      {
        step: 'Reproduce the Held-Out 6,315-Page Benchmark',
        description:
          'Run npm run benchmark:heldout to download and SHA-256 verify all 11 public manuals listed in benchmarks/heldout/NOTICE.md and regenerate benchmarks/heldout_results.json.',
      },
      {
        step: 'Audit the Committed 227-Page Real Corpus',
        description:
          'All 10 baseline PDFs live in benchmarks/corpus/. Run npm run benchmark:real to regenerate benchmarks/real_corpus_results.json with Clopper-Pearson 95% intervals.',
      },
      {
        step: 'Verify Live in the Browser & Export Redlines',
        description:
          'Click "Load Sample Spec" in SpecDelta to test the 15-page fixture locally, inspect any No-OCR page banners, and export the .xlsx Change Log for estimator sign-off.',
      },
    ],
    benchmarkTable: [
      {
        metric: 'Held-Out Bookmark CSI Recall (6 Outlined Manuals)',
        bluebeam: 'Manual bookmark / page navigation',
        llmChat: 'Unstructured context chunking',
        specDelta: '230/234 matched (98.3% · 95% CI 95.7–99.5%)',
      },
      {
        metric: 'Held-Out Verbatim Shift (5,269 Unseen Pages)',
        bluebeam: 'Page-by-page overlay (5,249/5,279 pages shifted)',
        llmChat: 'Full text re-prompted',
        specDelta: '6/637 false positives (0.9% · 95% CI 0.3–2.0%)',
      },
      {
        metric: 'Full 1,046-Page Dover NH Verbatim Shift',
        bluebeam: 'Page-by-page overlay (1,047/1,047 pages)',
        llmChat: 'Context-window truncation risk',
        specDelta: '0/111 false positives (<= 2.7% 95% upper bound)',
      },
      {
        metric: 'Held-Out Planted Edits (40 Unseen Sections)',
        bluebeam: 'Visual redline review required',
        llmChat: 'Probabilistic summary',
        specDelta: '22/23 caught (95.7% · 95% CI 78.1–99.9%)',
      },
      {
        metric: 'Tuned 10-PDF Real Corpus (227p / 12 Edits)',
        bluebeam: 'Visual redline review required',
        llmChat: 'Probabilistic summary',
        specDelta: '12/12 caught (95% CI 73.5–100% · <= 22.1% miss bound)',
      },
      {
        metric: '603-Page Multi-Division Stress Throughput',
        bluebeam: 'Local desktop render per page',
        llmChat: 'Context-window truncation risk',
        specDelta: '2.9s total (211 pages/sec) · 24/24 shifted unchanged',
      },
    ],
    faqs: [
      {
        question: 'Why report Clopper-Pearson confidence intervals instead of only percentages?',
        answer:
          'Small sample counts like 12/12 edits caught have wide uncertainty (95% CI 73.5–100%; 0/12 misses corresponds to a 95% one-sided upper bound of 22.1%). Reporting exact Clopper-Pearson binomial intervals from src/utils/statsCi.ts alongside the larger 6,315-page held-out run keeps every claim grounded in sample size.',
      },
      {
        question: 'Were any regexes or parser rules tuned on the 11 held-out manuals?',
        answer:
          'No. scripts/heldoutCorpusBenchmark.ts runs the unmodified production parser, noise stripper, and Myers diff engine on the 11 SHA-256-verified public PDFs in benchmarks/heldout/NOTICE.md and reports every miss and false positive directly into benchmarks/heldout_results.json.',
      },
    ],
    ctaLabel: 'Run the Sample Benchmark Live',
    ctaTarget: '/',
  },

  '/compare-division-03-concrete-specs': {
    route: '/compare-division-03-concrete-specs',
    category: 'Trade Guide',
    divisionFilter: '03',
    metaTitle: 'Compare Division 03 Concrete Specs & Addenda | SpecDelta',
    metaDescription:
      'Catch PSI upgrades, fly ash SCM limits, vapor retarder mil thickness, and curing spec edits in CSI Division 03 Project Manuals.',
    eyebrow: 'CSI Trade Guide · Division 03 Concrete',
    headline: 'Comparing Division 03 Concrete Specifications Across Addenda',
    summary:
      'Concrete subcontractors lose margin when addenda quietly increase 28-day compressive strength, tighten water-cementitious ratios, or upgrade under-slab vapor retarders from 15 mil to 20 mil.',
    heroImage: 'blueprint',
    heroImageAlt: 'Structural concrete drawings and specification schedules',
    keyGotchas: [
      {
        title: '01. Compressive Strength & SCM Ratios',
        detail:
          'Watch for 4000 PSI bumped to 5000 PSI, lowered w/cm ratios (0.45 → 0.40), or mandated Class F fly ash / slag percentages affecting ready-mix pricing.',
      },
      {
        title: '02. Vapor Retarder Mil Thickness',
        detail:
          'ASTM E1745 Class A upgrades from 10 mil or 15 mil to 20 mil poly sheeting substantially change material and taped-seam labor costs.',
      },
      {
        title: '03. Hot & Cold Weather Concreting Triggers',
        detail:
          'Added ACI 305R / 306R clauses mandating chilled water, ice, or heated enclosures shift seasonal general conditions risk onto the concrete sub.',
      },
    ],
    howToSteps: [
      {
        step: 'Filter Diffs to Division 03',
        description: 'Run your Project Manual comparison and filter the left tree to Division 03 — Concrete.',
      },
      {
        step: 'Check Tolerance & Unit Highlights',
        description: 'Review amber-flagged PSI, mil, and ACI ratio changes without wading through administrative Division 01 pages.',
      },
      {
        step: 'Split Division 03 for Your Field Team',
        description: 'Need a clean PDF of just Division 03? Use the Spec Splitter to extract Concrete sections in two seconds.',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta highlight PSI and mil changes automatically?',
        answer:
          'Yes. Any modified diff containing PSI, ksi, MPa, mil, gauge, or percentage values is automatically flagged in amber and tagged in the Excel Change Log.',
      },
    ],
    ctaLabel: 'Compare Division 03 Specs',
    ctaTarget: '/',
  },

  '/compare-division-07-thermal-moisture-specs': {
    route: '/compare-division-07-thermal-moisture-specs',
    category: 'Trade Guide',
    divisionFilter: '07',
    metaTitle: 'Compare Division 07 Roofing & Waterproofing Specs | SpecDelta',
    metaDescription:
      'Spot TPO/EPDM membrane mil changes, wind uplift ratings, R-value shifts, and 20-year NDL warranty edits in CSI Division 07.',
    eyebrow: 'CSI Trade Guide · Division 07 Thermal & Moisture',
    headline: 'Comparing Division 07 Roofing, Waterproofing & Insulation Specs',
    summary:
      'Division 07 addenda frequently alter membrane mil thickness, wind-speed warranty thresholds, and No Dollar Limit (NDL) terms—changes that immediately invalidate early supplier quotes.',
    heroImage: 'desk',
    heroImageAlt: 'Construction specification manual opened to thermal and moisture protection sections',
    keyGotchas: [
      {
        title: '01. Membrane Thickness & Fastening Density',
        detail:
          'A silent bump from 60 mil to 80 mil TPO or from mechanically attached to fully adhered shifts both material and adhesive labor dramatically.',
      },
      {
        title: '02. NDL Warranty Duration & Wind Speed',
        detail:
          'Upgrading a 15-year 72 mph warranty to a 20-year 90 mph NDL warranty requires manufacturer-inspected perimeter enhancements.',
      },
    ],
    howToSteps: [
      {
        step: 'Upload Base Spec & Addendum',
        description: 'Compare full Project Manuals locally without splitting files beforehand.',
      },
      {
        step: 'Isolate Division 07 Changes',
        description: 'Select Division 07 in the filter bar and export changed paragraphs for your roofing manufacturer rep.',
      },
    ],
    faqs: [
      {
        question: 'Can I extract just Division 07 from an 800-page GC spec book?',
        answer:
          'Yes. Open the Spec Splitter tool, select Division 07 — Thermal and Moisture Protection, and download a standalone PDF for your distributor.',
      },
    ],
    ctaLabel: 'Split or Compare Division 07',
    ctaTarget: '/split-spec-book',
  },

  '/compare-division-08-doors-hardware-specs': {
    route: '/compare-division-08-doors-hardware-specs',
    category: 'Trade Guide',
    divisionFilter: '08',
    metaTitle: 'Compare Division 08 Doors & Hardware Specs | SpecDelta',
    metaDescription:
      'Track hardware set changes, UL 10C fire ratings, no-substitution clauses, and card reader scope moving between Div 08 and Div 28.',
    eyebrow: 'CSI Trade Guide · Division 08 Openings',
    headline: 'Comparing Division 08 Doors, Frames & Hardware Specifications',
    summary:
      'Division 08 is notorious for late addendum scope ping-pong—electrified locksets, card readers, and power supplies shifting between Division 08 Hardware and Division 28 Security, plus "or equal" clauses turning into "no substitutions."',
    heroImage: 'blueprint',
    heroImageAlt: 'Door and hardware schedule blueprint with architectural scale',
    keyGotchas: [
      {
        title: '01. Furnish & Install vs. Install Only Scope Shifts',
        detail:
          'Addenda routinely shift electrified strikes or card readers to "Install only; furnished by Owner security integrator"—completely altering hardware supply pricing.',
      },
      {
        title: '02. Division 08 vs. Division 28 Cross-References',
        detail:
          'Power supplies, door position switches, and conduit rough-ins frequently migrate between 08 71 00 and 28 13 00 without clear narrative notes.',
      },
      {
        title: '03. Inconsistent Section Numbering (08 71 00 vs. 08 7100)',
        detail:
          'Door hardware consultants often export hardware schedules using legacy 08710 or 08 7100 spacing. SpecDelta normalizes every variant automatically.',
      },
    ],
    howToSteps: [
      {
        step: 'Run Section-Aware Diff',
        description: 'SpecDelta aligns 08 71 00 and 08 7100 seamlessly and exposes exact word-level substitutions.',
      },
      {
        step: 'Review Scope-Liability Highlights',
        description: 'Look for amber flags on "install only", "by owner", "no substitutions", and "UL 10C" fire rating edits.',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta match SECTION 08 71 00 against SECTION 08 7100?',
        answer:
          'Yes. SpecDelta normalizes all 5-digit and 6-digit CSI formatting differences so hardware sections always align cleanly.',
      },
    ],
    ctaLabel: 'Compare Division 08 Specs',
    ctaTarget: '/',
  },

  '/compare-division-09-finishes-specs': {
    route: '/compare-division-09-finishes-specs',
    category: 'Trade Guide',
    divisionFilter: '09',
    metaTitle: 'Compare Division 09 Finishes & Drywall Specs | SpecDelta',
    metaDescription:
      'Catch metal stud gauge upgrades, gypsum fire/STC rating changes, and Level 5 finish edits across CSI Division 09 addenda.',
    eyebrow: 'CSI Trade Guide · Division 09 Finishes',
    headline: 'Comparing Division 09 Framing, Gypsum Board & Finishes Specs',
    summary:
      'Small edits in Division 09—such as upgrading framing from 20 gauge to 18 gauge equivalent, adding Level 5 skim coats, or raising STC acoustic ratings—multiply across tens of thousands of square feet.',
    heroImage: 'desk',
    heroImageAlt: 'Project Manual open to Section 09 29 00 Gypsum Board specifications',
    keyGotchas: [
      {
        title: '01. Stud Gauge & Deflection Limits',
        detail:
          'Watch for L/240 changing to L/360 or minimum mil thickness increases on interior non-load-bearing framing.',
      },
      {
        title: '02. Finish Levels & Moisture Tolerances',
        detail:
          'Changes to concrete slab RH% moisture limits or flooring adhesive specs create hidden floor-prep contingencies.',
      },
    ],
    howToSteps: [
      {
        step: 'Split Division 09 or Run Full Diff',
        description: 'Isolate all 09 XX XX sections in seconds and export modified clauses straight to Excel.',
      },
    ],
    faqs: [
      {
        question: 'Can painting or drywall subs export only their Division 09 sections?',
        answer:
          'Yes. Use the CSI Spec Book Splitter to pick individual sections like 09 29 00 and 09 91 00 into a single focused PDF.',
      },
    ],
    ctaLabel: 'Split Division 09 Spec Book',
    ctaTarget: '/split-spec-book',
  },

  '/compare-division-23-hvac-specs': {
    route: '/compare-division-23-hvac-specs',
    category: 'Trade Guide',
    divisionFilter: '23',
    metaTitle: 'Compare Division 23 HVAC & BAS Specs | SpecDelta',
    metaDescription:
      'Track TAB tolerances, BAS controls integration, and basis-of-design equipment changes in CSI Division 23 mechanical specifications.',
    eyebrow: 'CSI Trade Guide · Division 23 HVAC',
    headline: 'Comparing Division 23 Mechanical, HVAC & Controls Specifications',
    summary:
      'Mechanical packages often sit late in 700-page Project Manuals—right where Bluebeam page-shift noise hits hardest. SpecDelta isolates genuine Division 23 changes across BAS controls, TAB tolerances, and equipment schedules.',
    heroImage: 'blueprint',
    heroImageAlt: 'Mechanical and architectural coordination blueprints on drafting table',
    keyGotchas: [
      {
        title: '01. BAS Controls & Commissioning Scope',
        detail:
          'Addenda often shift BMS integration points, BacNet gateways, or commissioning authority testing hours onto the mechanical contractor.',
      },
      {
        title: '02. TAB Balancing Tolerances & Sheet Metal Gauge',
        detail:
          'Tightened CFM tolerances or SMACNA pressure-class upgrades impact ductwork fabrication and balancing man-hours.',
      },
    ],
    howToSteps: [
      {
        step: 'Verify Zero Page-Shift False Positives',
        description:
          'Even when Divisions 01–09 push Division 23 back by 15 pages, SpecDelta ignores page numbers and compares Section 23 XX XX directly.',
      },
      {
        step: 'Share Clean Redline Print with Vendors',
        description: 'Print or save a clean HTML-to-PDF redline showing only changed HVAC paragraphs.',
      },
    ],
    faqs: [
      {
        question: 'Why does Bluebeam always turn Division 23 red when Division 03 changes?',
        answer:
          'Because Division 23 sits near the back of the Project Manual. Any page growth in earlier divisions shifts every Division 23 page number, breaking page-locked visual comparisons.',
      },
    ],
    ctaLabel: 'Compare Division 23 Specs',
    ctaTarget: '/',
  },

  '/compare-division-26-electrical-specs': {
    route: '/compare-division-26-electrical-specs',
    category: 'Trade Guide',
    divisionFilter: '26',
    metaTitle: 'Compare Division 26 Electrical & Switchgear Specs | SpecDelta',
    metaDescription:
      'Catch switchgear AIC rating hikes, copper vs. aluminum bus edits, manufacturer substitutions, and temporary generator tap requirements in Div 26.',
    eyebrow: 'CSI Trade Guide · Division 26 Electrical',
    headline: 'Comparing Division 26 Electrical & Switchgear Specifications',
    summary:
      'Electrical addenda frequently adjust fault-current AIC ratings, bus plating, approved switchgear manufacturers, and temporary power contingencies for long-lead equipment—all buried deep in the back of the manual.',
    heroImage: 'desk',
    heroImageAlt: 'Commercial Project Manual and drafting tools for electrical specification review',
    keyGotchas: [
      {
        title: '01. AIC Interrupting Ratings & Bus Material',
        detail:
          'Bumping a main switchboard from 65,000 AIC to 85,000 AIC or switching silver-plated to tin-plated copper alters gear pricing and lead times immediately.',
      },
      {
        title: '02. Temporary Generator & Lead-Time Clauses',
        detail:
          'Addenda increasingly insert 28-week lead-time triggers requiring temporary 800A tap boxes or rental generators at the electrical contractor’s cost.',
      },
    ],
    howToSteps: [
      {
        step: 'Compare Bid Set vs. Addendum Locally',
        description: 'Filter straight to Division 26 to inspect switchgear, panelboard, and feeder edits.',
      },
      {
        step: 'Generate Optional Cost & Scope Impact Brief',
        description: 'Toggle the opt-in AI Scope Brief on isolated Division 26 diffs for an instant bid-day risk checklist.',
      },
    ],
    faqs: [
      {
        question: 'Can I isolate Division 26 and Division 28 together?',
        answer:
          'Yes. Both the Diff Checker and CSI Spec Book Splitter let you inspect and extract Division 26 Electrical alongside Division 28 Electronic Safety and Security.',
      },
    ],
    ctaLabel: 'Compare Division 26 Specs',
    ctaTarget: '/',
  },

  '/privacy': {
    route: '/privacy',
    category: 'Legal & Trust',
    metaTitle: 'Privacy & Local Processing Policy | SpecDelta',
    metaDescription:
      'How SpecDelta processes Project Manual PDFs locally in browser Web Workers, stores review checkboxes in localStorage, and handles optional Google Gemini requests.',
    eyebrow: 'Privacy & Architecture Disclosure',
    headline: 'How SpecDelta Handles Your Project Manuals & Optional AI Requests',
    summary:
      'PDF extraction, header/footer stripping, CSI section alignment, word diffing, and Excel/CSV/PDF exports execute locally inside your browser Web Worker. Full Project Manual PDFs are never uploaded to SpecDelta servers.',
    heroImage: 'desk',
    heroImageAlt: 'Specification desk representing local browser PDF processing',
    keyGotchas: [
      {
        title: '01. Local Web Worker PDF Parsing',
        detail:
          'Uploaded PDF bytes remain in browser memory inside an isolated Web Worker. No copies are transmitted to or stored on a backend database.',
      },
      {
        title: '02. Browser Review Persistence (localStorage)',
        detail:
          'Section "Reviewed" checkboxes are saved only in your browser localStorage keyed by a content hash of the parsed CSI sections so multi-hour bid reviews survive refreshes without cross-project collisions. Clear browser site data anytime to reset.',
      },
      {
        title: '03. Explicit Opt-In Google Gemini Scope Brief',
        detail:
          'Clicking "Generate 5-Bullet Gemini Brief" is strictly optional and transmits only the top risk-ranked changed paragraph excerpts (capped at 25 sections) to Google Gemini via /api/scope-brief.',
      },
    ],
    howToSteps: [
      {
        step: 'Keep Confidential Specs 100% Local',
        description:
          'Leave the Opt-In Gemini Brief closed on NDA projects; deterministic diffing, Money & Risk highlighting, and Excel exports work offline once loaded.',
      },
      {
        step: 'Inspect Exact Transmission Scope Before Clicking',
        description:
          'When you open the Gemini Brief panel, SpecDelta displays the exact section count and character budget before sending any excerpt.',
      },
    ],
    faqs: [
      {
        question: 'Does SpecDelta retain any PDF text or diffs on a server?',
        answer:
          'No. SpecDelta has no user database or file storage. The optional /api/scope-brief route processes the compact changed-paragraph payload in memory and applies IP rate limiting to prevent abuse.',
      },
    ],
    ctaLabel: 'Return to Spec Diff Checker',
    ctaTarget: '/',
  },

  '/terms': {
    route: '/terms',
    category: 'Legal & Trust',
    metaTitle: 'Terms of Use & Estimator Verification Standard | SpecDelta',
    metaDescription:
      'Terms of use and bid-day verification disclaimer for SpecDelta Project Manual diffing and CSI PDF splitting.',
    eyebrow: 'Terms of Use · Bid-Day Verification',
    headline: 'Terms of Use & Estimator Verification Disclaimer',
    summary:
      'SpecDelta is an automated pre-construction triage and PDF splitting aid designed to accelerate addendum review. It does not replace professional estimator verification against signed contract documents.',
    heroImage: 'blueprint',
    heroImageAlt: 'Construction specifications and drawings for bid-day verification',
    keyGotchas: [
      {
        title: '01. Verify Scope & Pricing Against Signed Addenda',
        detail:
          'PDF text streams vary widely across authoring tools. Always verify material tolerances, allowances, warranties, and contractual directives directly against the architect’s signed Addendum PDF before submitting a bid.',
      },
      {
        title: '02. Scanned or Non-OCR Pages Require Manual Review',
        detail:
          'SpecDelta detects raster-image pages with <30 extractable characters and surfaces per-section warnings, because SpecDelta does not perform optical character recognition (OCR).',
      },
      {
        title: '03. Provided As-Is Without Warranty',
        detail:
          'SpecDelta is provided "as is" under the MIT License without express or implied warranties of completeness or fitness for a particular bid submission.',
      },
    ],
    howToSteps: [
      {
        step: 'Check Parse Coverage & Scanned-Page Warnings',
        description:
          'Confirm the extracted CSI section count and inspect any raster-page overlap notices shown in the workbench.',
      },
      {
        step: 'Audit Stripped Headers & Footers',
        description:
          'Open the Stripped Noise drawer if a specification uses unusual edge-margin formatting.',
      },
    ],
    faqs: [
      {
        question: 'Who is responsible for final bid accuracy?',
        answer:
          'The estimating team and contractor submitting the bid remain solely responsible for verifying all contract requirements against the official bidding documents.',
      },
    ],
    ctaLabel: 'Open Spec Diff Checker',
    ctaTarget: '/',
  },
};

export const TRADE_GUIDE_ROUTES: Array<{ route: AppRoute; code: string; label: string }> = [
  { route: '/compare-division-03-concrete-specs', code: '03', label: 'Concrete' },
  { route: '/compare-division-07-thermal-moisture-specs', code: '07', label: 'Thermal & Moisture' },
  { route: '/compare-division-08-doors-hardware-specs', code: '08', label: 'Doors & Hardware' },
  { route: '/compare-division-09-finishes-specs', code: '09', label: 'Finishes' },
  { route: '/compare-division-23-hvac-specs', code: '23', label: 'HVAC' },
  { route: '/compare-division-26-electrical-specs', code: '26', label: 'Electrical' },
];
