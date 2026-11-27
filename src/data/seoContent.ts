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
    metaTitle: 'Bluebeam Compare Alternative for Spec Books | SpecDelta',
    metaDescription:
      'Stop page-by-page PDF compare from lighting up 200+ pages after a 2-line addendum shift. Compare Project Manuals by CSI section in your browser.',
    eyebrow: 'Comparison · Page-by-Page Overlays vs. SpecDelta',
    headline: 'Why Page-by-Page Compare Breaks When Spec Books Reflow',
    summary:
      'Visual PDF tools like Bluebeam Revu excel at 2D plan overlays, because drawing sheets stay fixed. When an architect adds three lines in Division 01 or concrete mixes in Division 03, every downstream paragraph shifts onto the next page—lighting up hundreds of unchanged spec pages red.',
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
          'Drop both Project Manuals (or a partial/narrative addendum) into SpecDelta. Local Web Worker parsing keeps full manuals in your browser unless you opt in to the AI brief.',
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
    headline: 'The Addendum Lists What Was Remembered. SpecDelta Shows What Changed.',
    summary:
      'An architect’s addendum narrative summarizes what the team remembered to call out—often missing quiet deletions, membrane thickness bumps from 60 mil to 80 mil, or scope swaps that hit your margin after award.',
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
    metaTitle: 'Accuracy on Real Project Manuals | SpecDelta',
    metaDescription:
      'Synthetic regression tests on public manuals: 58 of 59 sealed and 109 of 110 held-out planted edits caught; 0 of 244 sealed and 0 of 644 held-out sections falsely flagged when pages shifted.',
    eyebrow: 'Public-Manual Parsing & Synthetic Planted-Edit Regression Study (9,776 Pages)',
    headline: '58 of 59 Sealed & 109 of 110 Held-Out Planted Edits Caught. 0 False Page-Shift Alarms.',
    summary:
      'Evaluated on 6 untouched public manuals (1,734 pages) and 10 held-out manuals (5,269 pages): bookmark section recall is measured against each PDF’s own outline, while diff accuracy uses deterministic synthetic planted edits inserted into real clauses (no independent human-labeled real addendum corpus exists yet). Scanned sheets without a text layer aren’t OCR’d and are flagged for manual review.',
    heroImage: 'desk',
    heroImageAlt: 'Specification benchmark desk setup with Project Manual and structural sheets',
    keyGotchas: [
      {
        title: '01. Sealed 6-Manual Release Set (1,734 Pages — Never Tuned On)',
        detail:
          'Evaluated after finalizing all parser fixes across NCDOT, LLNL, Macon-Bibb GA, Univ. of Oregon, CA DGS Book II, and OSU Kelley Addendum 1 (244 CSI sections, 2 scanned pages flagged, 84 pages/sec): 41/41 bookmark-grounded sections matched (<= 7.0% miss upper bound), 0/244 symmetric verbatim shift false positives (<= 1.2% upper bound vs. 1,729/1,740 raw pages), 58/59 planted edits caught (98.3%, 95% CI 90.9–100%), and 0/27 unchanged false positives (<= 10.5% upper bound).',
      },
      {
        title: '02. Held-Out 11 Manuals (6,315p), Bookmark Asymmetry & 1,984p Memory Profile',
        detail:
          'Across 10 held-out manuals (5,269p, 644 CSI sections) + full 1,046p Dover NH: 233/234 bookmark sections matched (99.6%, 95% CI 97.6–100%; 1/234 OSU source typo 01 35 00 vs. 01300), 0/644 unseen & 0/111 Dover symmetric shift false positives (<= 0.5% / <= 2.7% upper bounds), and 6/318 false positives isolated strictly to asymmetric outlined-vs-unoutlined PDFs (flagged 6/6 times by bookmarkAsymmetryWarning). Parsing the 1,984-page UNT manual peaks at 540.4 MB RSS / 270.3 MB JS heap.',
      },
      {
        title: '03. 110 Held-Out Planted Edits & 10-PDF Baseline Corpus',
        detail:
          'Scaling held-out planted edits to 110 edits across 150 sampled sections tightened intervals to 109/110 caught (99.1%, 95% CI 95.0–100%; 1/110 missed on 13 30 00), 101/102 risk flags matched (99.0%), and 1/45 unchanged false positive (2.2% on 23 31 13). Baseline 227p corpus stays 21/21 sections, 0/20 shift false positives, 12/12 edits (95% CI 73.5–100%), and 0/10 unchanged false positives.',
      },
    ],
    howToSteps: [
      {
        step: 'Reproduce the Sealed 1,734-Page Release Set',
        description:
          'Run npm run benchmark:sealed to download and SHA-256 verify the 6 untouched public manuals in benchmarks/sealed/NOTICE.md and regenerate benchmarks/sealed_results.json.',
      },
      {
        step: 'Reproduce Held-Out 6,315-Page & 227-Page Benchmarks',
        description:
          'Run npm run benchmark:heldout and npm run benchmark:real to verify symmetric vs. asymmetric bookmark shift checks, 110 planted edits, and Clopper-Pearson 95% intervals.',
      },
      {
        step: 'Verify Live in the Browser & Export Redlines',
        description:
          'Click "Load Sample Spec" in SpecDelta to test locally, review any No-OCR or Asymmetric Bookmark banners, and export the .xlsx Change Log.',
      },
    ],
    benchmarkTable: [
      {
        metric: 'Sealed Release Set Bookmark Recall (1,734p / 6 Manuals)',
        bluebeam: 'Manual bookmark / page navigation',
        llmChat: 'Unstructured context chunking',
        specDelta: '41/41 matched (100% · 95% CI 91.4–100% · <= 7.0% miss bound)',
      },
      {
        metric: 'Sealed Release Set Symmetric Shift (244 Sections)',
        bluebeam: 'Page-by-page overlay (1,729/1,740 pages shifted)',
        llmChat: 'Full text re-prompted',
        specDelta: '0/244 false positives (<= 1.2% 95% upper bound)',
      },
      {
        metric: 'Sealed Release Set Planted Edits (59 Edits / 84 Sections)',
        bluebeam: 'Visual redline review required',
        llmChat: 'Probabilistic summary',
        specDelta: '58/59 caught (98.3% · 95% CI 90.9–100%)',
      },
      {
        metric: 'Held-Out Bookmark CSI Recall & Symmetric Shift (6,315p)',
        bluebeam: 'Manual navigation (6,296/6,326 pages shifted)',
        llmChat: 'Context-window truncation risk',
        specDelta: '233/234 recall (99.6%) · 0/644 unseen & 0/111 Dover shift FPs',
      },
      {
        metric: 'Held-Out Planted Edits (110 Edits / 150 Unseen Sections)',
        bluebeam: 'Visual redline review required',
        llmChat: 'Probabilistic summary',
        specDelta: '109/110 caught (99.1% · 95% CI 95.0–100%)',
      },
      {
        metric: 'Scale Footprint (1,984p UNT Manual & 603p Stress Fixture)',
        bluebeam: 'Desktop render per page',
        llmChat: 'Token limit exceeded',
        specDelta: '1,984p: 540.4 MB RSS / 270.3 MB heap · 603p: 2.8s (221 p/s)',
      },
    ],
    faqs: [
      {
        question: 'Why separate the held-out tuning validation from a sealed release set?',
        answer:
          'Once a defect (like the 3 prose Table-of-Contents suppressions found in held-out manuals) is diagnosed and fixed, those manuals become part of development tuning. Keeping the 6-manual, 1,734-page sealed set strictly untouched until all parser edits are complete gives an honest measure on unseen data.',
      },
      {
        question: 'Why does SpecDelta warn when only one PDF has CSI outline bookmarks?',
        answer:
          'In held-out testing on Central Michigan (09_cmich_pm.pdf), comparing an outlined PDF against a copy stripped of outlines caused 6/318 asymmetric false positives, whereas symmetric outlines produced 0/644. SpecDelta surfaces an Asymmetric PDF Bookmarks banner whenever only one file contains CSI outline bookmarks.',
      },
      {
        question: 'Why report Clopper-Pearson confidence intervals alongside counts?',
        answer:
          'Small counts like 12/12 edits caught have wide uncertainty (95% CI 73.5–100%; <= 22.1% one-sided miss upper bound). Tightening sample sizes to 110 held-out edits and 59 sealed edits shrinks intervals (95.0–100% and 90.9–100%) and reports every miss and false positive openly.',
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
