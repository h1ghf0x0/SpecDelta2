import type { AppRoute } from '../types/spec.ts';

export interface RouteSeoMeta {
  title: string;
  description: string;
  h1: string;
  summary: string;
}

export const SEO_ROUTE_META: Record<AppRoute, RouteSeoMeta> = {
  '/': {
    title: 'SpecDelta – Section-Aware Construction Spec Diff & CSI Splitter',
    description:
      'Compare 600-page Project Manuals and Addenda locally in your browser by CSI section—no page-shift false positives, instant Excel redlines, and CSI PDF splitting.',
    h1: 'Section-Aware Construction Spec Diff Checker',
    summary:
      'Compare original Project Manuals and Addenda locally in your browser by CSI MasterFormat section, auto-strip headers and footers, flag tolerance and scope changes, and export clean Excel (.xlsx) change logs.',
  },
  '/split-spec-book': {
    title: 'Free CSI MasterFormat Spec Book Splitter | SpecDelta',
    description:
      'Upload an 800-page construction Project Manual PDF and extract only your CSI Division or sections into a clean standalone PDF locally in your browser.',
    h1: 'CSI MasterFormat Spec Book PDF Splitter',
    summary:
      'Select individual CSI MasterFormat divisions or sections from a full Project Manual PDF and download a clean standalone PDF locally in your browser.',
  },
  '/vs-bluebeam': {
    title: 'Bluebeam Compare Documents Alternative for Spec Books | SpecDelta',
    description:
      'Stop Bluebeam Revu from flagging 200+ pages red after a 2-line addendum shift. Compare Project Manuals by CSI section locally in your browser.',
    h1: 'Why Bluebeam Compare Documents Breaks on 600-Page Spec Books',
    summary:
      'Bluebeam Revu compares PDFs page-by-page. SpecDelta aligns Project Manuals by normalized CSI section so page shifts do not trigger false positives.',
  },
  '/acrobat-alternative': {
    title: 'Adobe Acrobat Compare PDF Alternative for Project Manuals | SpecDelta',
    description:
      'Why Adobe Acrobat Compare Files stalls on 500-page construction specs—and how CSI section alignment gives estimators an instant Excel Change Log.',
    h1: 'Adobe Acrobat Compare PDF Alternative for Construction Project Manuals',
    summary:
      'Filter 500+ page construction Project Manuals by CSI division, skip boilerplate header/footer noise, and export structured Excel redlines locally.',
  },
  '/unclouded-addenda': {
    title: 'How to Catch Unclouded Addendum Changes & Silent Reverts | SpecDelta',
    description:
      'Detect silent spec edits, deleted CSI sections, and unclouded addendum changes in re-issued Project Manuals without relying on architect narratives.',
    h1: 'How to Catch Unclouded Addendum Changes in a Re-Issued Spec Book',
    summary:
      'Audit re-issued Project Manuals end-to-end to catch silent section deletions, tolerance creep, and narrative mismatches with deterministic word-level diffs.',
  },
  '/benchmark': {
    title: 'Benchmark: Real & Held-Out Project Manual Corpus Results | SpecDelta',
    description:
      'Measured counts and Clopper-Pearson 95% confidence intervals across 10 real corpus PDFs (227p), 11 held-out public manuals (6,315p), and a 603-page stress run.',
    h1: 'Measured Accuracy, Counts & Confidence Intervals Across Real Project Manuals',
    summary:
      'Reproducible measurements with Clopper-Pearson 95% intervals across 10 real corpus PDFs (227p: 12/12 edits caught [95% CI 73.5–100%], 0/20 shift false positives), 11 held-out public manuals (6,315p: 230/234 bookmarked CSI sections matched [98.3%], 6/637 unseen shift false positives [0.9%], 22/23 held-out edits caught [95.7%]), and our 603-page stress run.',
  },
  '/compare-division-03-concrete-specs': {
    title: 'Compare Division 03 Concrete Specs & Addenda | SpecDelta',
    description:
      'Catch PSI upgrades, fly ash SCM limits, vapor retarder mil thickness, and curing spec edits in CSI Division 03 Project Manuals.',
    h1: 'Comparing Division 03 Concrete Specifications Across Addenda',
    summary:
      'Spot 28-day PSI compressive strength hikes, w/cm ratio tightening, and ASTM E1745 vapor retarder mil changes in Division 03 concrete sections.',
  },
  '/compare-division-07-thermal-moisture-specs': {
    title: 'Compare Division 07 Roofing & Waterproofing Specs | SpecDelta',
    description:
      'Spot TPO/EPDM membrane mil changes, wind uplift ratings, R-value shifts, and 20-year NDL warranty edits in CSI Division 07.',
    h1: 'Comparing Division 07 Roofing, Waterproofing & Insulation Specs',
    summary:
      'Isolate membrane mil upgrades, wind-speed warranty thresholds, and NDL duration shifts across Division 07 Project Manual addenda.',
  },
  '/compare-division-08-doors-hardware-specs': {
    title: 'Compare Division 08 Doors & Hardware Specs | SpecDelta',
    description:
      'Track hardware set changes, UL 10C fire ratings, no-substitution clauses, and card reader scope moving between Div 08 and Div 28.',
    h1: 'Comparing Division 08 Doors, Frames & Hardware Specifications',
    summary:
      'Normalize 08 71 00 vs. 08 7100 section numbering and detect furnish-and-install vs. install-only scope shifts in Division 08.',
  },
  '/compare-division-09-finishes-specs': {
    title: 'Compare Division 09 Finishes & Drywall Specs | SpecDelta',
    description:
      'Catch metal stud gauge upgrades, gypsum fire/STC rating changes, and Level 5 finish edits across CSI Division 09 addenda.',
    h1: 'Comparing Division 09 Framing, Gypsum Board & Finishes Specs',
    summary:
      'Detect framing gauge upgrades, L/240 to L/360 deflection changes, Level 5 skim coat requirements, and slab moisture tolerance edits in Division 09.',
  },
  '/compare-division-23-hvac-specs': {
    title: 'Compare Division 23 HVAC & BAS Specs | SpecDelta',
    description:
      'Track TAB tolerances, BAS controls integration, and basis-of-design equipment changes in CSI Division 23 mechanical specifications.',
    h1: 'Comparing Division 23 Mechanical, HVAC & Controls Specifications',
    summary:
      'Eliminate page-shift false positives at the back of the Project Manual and isolate genuine Division 23 BAS, TAB, and equipment edits.',
  },
  '/compare-division-26-electrical-specs': {
    title: 'Compare Division 26 Electrical & Switchgear Specs | SpecDelta',
    description:
      'Catch switchgear AIC rating hikes, copper vs. aluminum bus edits, manufacturer substitutions, and temporary generator tap requirements in Div 26.',
    h1: 'Comparing Division 26 Electrical & Switchgear Specifications',
    summary:
      'Surface main switchboard AIC rating increases, copper busbar changes, and temporary generator clauses buried in Division 26 addenda.',
  },
  '/privacy': {
    title: 'Privacy & Local Processing Policy | SpecDelta',
    description:
      'How SpecDelta processes Project Manual PDFs locally in browser Web Workers, stores review checkboxes in localStorage, and handles optional Google Gemini requests.',
    h1: 'How SpecDelta Handles Your Project Manuals & Optional AI Requests',
    summary:
      'PDF extraction, noise stripping, CSI section alignment, Myers diffing, and Excel/CSV/PDF exports run locally inside your browser Web Worker without uploading files.',
  },
  '/terms': {
    title: 'Terms of Use & Estimator Verification Standard | SpecDelta',
    description:
      'Terms of use and bid-day verification disclaimer for SpecDelta Project Manual diffing and CSI PDF splitting.',
    h1: 'Terms of Use & Estimator Verification Disclaimer',
    summary:
      'SpecDelta accelerates pre-construction addendum triage and CSI PDF splitting; estimators remain responsible for verifying pricing-critical requirements against signed contract documents.',
  },
};

export const VALID_APP_ROUTES = new Set<AppRoute>(Object.keys(SEO_ROUTE_META) as AppRoute[]);
