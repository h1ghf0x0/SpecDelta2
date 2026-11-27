# SpecDelta

Section-aware construction specification diff checker and CSI MasterFormat Project Manual PDF splitter for commercial estimators.

## Key Capabilities

- **Section-Aligned Project Manual Diffing (Conformed, Partial & Narrative Addenda)**: Extracts PDF text coordinates in dedicated Web Workers (with 2-column & schedule table linearization), normalizes inconsistent CSI codes (`08 71 00`, `08 7100`, `08710`), heals hyphenated line wraps, and folds formatting-only edits (`4000 psi` vs. `4,000 psi`, casing). Auto-detects **Full Conformed Sets**, **Partial Reissues** (marking unmentioned baseline sections as `Not Reissued` instead of falsely deleted), and **Narrative Addenda** (`Item 3: Section 08 71 00, 2.3.A, delete X, add Y` patched directly against the baseline).
- **Coordinate & Stamp Noise Stripping**: Automatically strips recurring top/bottom edge headers and footers as well as section-scoped running page stamps (e.g., `CAST-IN-PLACE CONCRETE 033000 - 5`, `08 71 00 - DOOR HARDWARE - Page 4 of 12`) with an inspectable drawer, visible stripped-line counts, and configurable sensitivity.
- **Severity-Weighted Delta Risk Scanner**: Flags numeric tolerances (`PSI`, `mil`, `gauge`, `AIC`), electrical ratings (`20A`, `480V`, `5 HP`, `kVA`), HVAC/envelope specs (`400 CFM`, `U-0.30`, `SHGC 0.25`, `R-30`), structural loads/dimensions (`100 psf`, `2 ft`, `3 in.`), referenced standards (`ASTM`, `UL`, `NFPA`, `ASHRAE`), manufacturer/basis-of-design swaps, allowances, warranties, modal directive shifts (`shall` vs. `may`), and scope-responsibility phrases (`furnish and install`, `by owner`) strictly across changed tokens with `Critical`/`High`/`Medium` severity ranking.
- **CSI Spec Book Splitter**: Extract selected CSI MasterFormat divisions or sections out of large Project Manuals into standalone PDFs locally in the browser.
- **Bid-Day Export & Review Persistence**: Tracks per-section `Reviewed` status in `localStorage` keyed by parsed CSI content hash, exports full or filtered change logs via a zero-dependency pure-TypeScript OOXML `.xlsx` builder, UTF-8 RFC-4180 CSV, and clean print redlines.
- **Optional Google Gemini Scope Brief**: Strictly opt-in; sends only the top risk-ranked changed paragraphs (capped at 25 sections) to `POST /api/scope-brief` with schema validation, per-IP rate limiting, and configurable `SCOPE_BRIEF_DAILY_CAP`.

## Local Development

```bash
npm install
npm test
npm run benchmark
npm run benchmark:real
npm run benchmark:heldout
npm run benchmark:sealed
npm run lint
npm run dev
```

> **Benchmark Note**: Bookmark section recall is measured against real public PDF outlines, while edit-detection accuracy (`benchmark:real`, `benchmark:heldout`, `benchmark:sealed`) uses **synthetic planted clause edits** inserted into real public manuals to establish deterministic ground truth (no human-annotated real project addendum ground-truth corpus is included yet).

- `npm run benchmark` executes the 15-page sample fixture and a 603-page multi-division stress test (`2.8s` parse + diff, `221` pages/sec, `24/24` shifted sections unchanged), writing structured metrics to `benchmarks/results.json`.
- `npm run benchmark:real` runs 10 public institutional specification & Project Manual PDFs (`benchmarks/corpus/`, `227` pages, `534,924` extractable characters across University of Houston, City of Dover NH, City of Prince Albert, Scott Township PA, UCCS, and NMSU) through the full pipeline and computes exact Clopper-Pearson 95% intervals (`src/utils/statsCi.ts`) in `benchmarks/real_corpus_results.json`: `21/21` expected CSI sections detected (`0/21` false-positive splits and `0/21` misses, 95% one-sided upper bound `<= 13.3%`), `0/20` verbatim page-shift false positives across `210` shifted pages (95% one-sided upper bound `<= 13.9%`, vs. `217/217` raw pages changed), `12/12` planted real-clause edits caught (`95% CI 73.5–100%`; `0/12` misses, 95% one-sided upper bound `<= 22.1%`), `9/9` risk flags matched (`95% CI 66.4–100%`), and `0/10` unchanged false positives (95% one-sided upper bound `<= 25.9%`).
- `npm run benchmark:heldout` downloads (gitignored) and SHA-256 verifies the 11 held-out PDFs in `benchmarks/heldout/NOTICE.md` (`6,315` total pages), running SpecDelta's parser and diff engine and writing counts + Clopper-Pearson intervals to `benchmarks/heldout_results.json`:
  - **Full 1,046-page Dover NH Conformed Set (`dover_vol1_full.pdf`)**: `111` CSI sections parsed (`79` pages/sec, `2,845` noise lines stripped) with `0/111` verbatim page-shift false positives (95% one-sided upper bound `<= 2.7%`; two-sided `95% CI 0.0–3.3%`) vs. `1,047/1,047` raw pages changed.
  - **10 Held-Out Project Manuals (`5,269` pages, `11,842,169` chars, `28` scanned pages flagged, `644` CSI sections detected)**: `233/234` bookmark-grounded CSI sections matched across 6 outlined manuals (`99.6%`, `95% CI 97.6–100%`; `1/234` missed where OSU's outline says `01 35 00` while the page text prints `SECTION 01300`), `0/644` **symmetric** verbatim page-shift false positives (95% one-sided upper bound `<= 0.5%`, vs. `5,249/5,279` raw pages changed), `6/318` false positives (`1.9%`, `95% CI 0.7–4.1%`; all in `09_cmich_pm.pdf`) when testing **asymmetric** bookmarked Baseline vs. un-bookmarked Addendum (`6/6` UI `bookmarkAsymmetryWarning` banners triggered), and across `150` sampled sections with `110` planted edits: `109/110` edits caught (`99.1%`, `95% CI 95.0–100%`; `1/110` missed on `13 30 00`), `101/102` risk flags matched (`99.0%`, `95% CI 94.7–100%`), and `1/45` unchanged false positive (`2.2%`, `95% CI 0.1–11.8%` on `23 31 13`).
  - **1,984-Page UNT Manual Memory Profile (`08_untsystem_pm.pdf`)**: Parsed cleanly in `25.9s` (`77` pages/sec) with per-page `page.cleanup()`, `loadingTask.destroy()`, and `disableFontFace: true` (`pdf-parser.worker.ts`), peaking at `540.4 MB` process RSS and `270.3 MB` JS heap (`1,052.5 MB` peak RSS across the full 11-manual batch run).
- `npm run benchmark:sealed` downloads and SHA-256 verifies 6 fresh public `.gov`/`.edu` Project Manuals in `benchmarks/sealed/NOTICE.md` (`1,734` total pages across NCDOT, LLNL, Macon-Bibb GA, Univ. of Oregon, CA DGS Book II, and OSU Kelley Engineering Addendum 1) **never used to tune any parser rule**: `41/41` bookmark-grounded CSI sections matched (`100%`, `95% CI 91.4–100%`; `0/41` misses, `<= 7.0%` upper bound), `0/244` symmetric verbatim shift false positives (`<= 1.2%` one-sided upper bound, vs. `1,729/1,740` raw pages changed), `58/59` planted edits caught (`98.3%`, `95% CI 90.9–100%`; `1/59` missed), `55/55` risk flags matched (`100%`, `95% CI 93.5–100%`), and `0/27` unchanged false positives (`<= 10.5%` one-sided upper bound) at `84` pages/sec (`728.9 MB` peak RSS).

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (and optionally `SCOPE_BRIEF_DAILY_CAP`) if you want to enable the optional `POST /api/scope-brief` endpoint.

## Verification & Disclaimer

SpecDelta is an automated pre-construction diffing aid and does not perform OCR on scanned raster pages. Always verify pricing-critical tolerances, warranties, and scope terms against the signed Addendum PDF.
