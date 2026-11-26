# SpecDelta

Section-aware construction specification diff checker and CSI MasterFormat Project Manual PDF splitter for commercial estimators.

## Key Capabilities

- **Section-Aligned Project Manual Diffing**: Extracts PDF text coordinates in dedicated Web Workers, normalizes inconsistent CSI codes (`08 71 00`, `08 7100`, `08710`), heals hyphenated line wraps, and diffs CSI section-to-section so page shifts do not trigger false positives.
- **Coordinate & Stamp Noise Stripping**: Automatically strips recurring top/bottom edge headers and footers as well as section-scoped running page stamps (e.g., `CAST-IN-PLACE CONCRETE 033000 - 5`, `08 71 00 - DOOR HARDWARE - Page 4 of 12`) with an inspectable drawer, visible stripped-line counts, and configurable sensitivity.
- **Delta-Only Money & Risk Scanner**: Flags numeric tolerances (`PSI`, `mil`, `gauge`, `AIC`), thresholds (`minimum`, `not less than`, `not exceeding`), modal directive shifts (`shall` vs. `may`), allowances, warranties, and scope-responsibility phrases (`furnish and install`, `by owner`) strictly across changed tokens.
- **CSI Spec Book Splitter**: Extract selected CSI MasterFormat divisions or sections out of large Project Manuals into standalone PDFs locally in the browser.
- **Bid-Day Export & Review Persistence**: Tracks per-section `Reviewed` status in `localStorage` keyed by parsed CSI content hash, exports full or filtered change logs via a zero-dependency pure-TypeScript OOXML `.xlsx` builder, UTF-8 RFC-4180 CSV, and clean print redlines.
- **Optional Google Gemini Scope Brief**: Strictly opt-in; sends only the top risk-ranked changed paragraphs (capped at 25 sections) to `POST /api/scope-brief` with IP-based rate limiting.

## Local Development

```bash
npm install
npm test
npm run benchmark
npm run benchmark:real
npm run benchmark:heldout
npm run lint
npm run dev
```

- `npm run benchmark` executes the 15-page sample fixture and a 603-page multi-division stress test (`2.9s` parse + diff, `211` pages/sec, `24/24` shifted sections unchanged), writing structured metrics to `benchmarks/results.json`.
- `npm run benchmark:real` runs 10 public institutional specification & Project Manual PDFs (`benchmarks/corpus/`, `227` pages, `534,924` extractable characters across University of Houston, City of Dover NH, City of Prince Albert, Scott Township PA, UCCS, and NMSU) through the full pipeline and computes exact Clopper-Pearson 95% intervals (`src/utils/statsCi.ts`) in `benchmarks/real_corpus_results.json`: `21/21` expected CSI sections detected (`0/21` false-positive splits and `0/21` misses, 95% one-sided upper bound `<= 13.3%`), `0/20` verbatim page-shift false positives across `210` shifted pages (95% one-sided upper bound `<= 13.9%`, vs. `217/217` raw pages changed), `12/12` planted real-clause edits caught (`95% CI 73.5–100%`; `0/12` misses, 95% one-sided upper bound `<= 22.1%`), `9/9` risk flags matched (`95% CI 66.4–100%`), and `0/9` unchanged false positives (95% one-sided upper bound `<= 28.3%`).
- `npm run benchmark:heldout` downloads (gitignored) and SHA-256 verifies the 11 held-out PDFs in `benchmarks/heldout/NOTICE.md` (`6,315` total pages), running SpecDelta's unmodified parser and diff engine and writing counts + Clopper-Pearson intervals to `benchmarks/heldout_results.json`:
  - **Full 1,046-page Dover NH Conformed Set (`dover_vol1_full.pdf`)**: `111` CSI sections parsed (`79` pages/sec, `2,845` noise lines stripped) with `0/111` verbatim page-shift false positives (95% one-sided upper bound `<= 2.7%`; two-sided `95% CI 0.0–3.3%`) vs. `1,047/1,047` raw pages changed.
  - **10 Unseen Project Manuals (`5,269` pages, `11,842,169` chars, `28` scanned pages flagged, `637` CSI sections detected)**: `230/234` bookmark-grounded CSI sections matched across 6 bookmarked manuals (`98.3%`, `95% CI 95.7–99.5%`; `4/234` missed), `6/637` verbatim page-shift false positives (`0.9%`, `95% CI 0.3–2.0%`; all 6 in `09_cmich_pm.pdf`) vs. `5,249/5,279` raw pages changed, and across 40 sampled unseen sections (`23` planted edits): `22/23` edits caught (`95.7%`, `95% CI 78.1–99.9%`; `1/23` missed), `20/21` risk flags matched (`95.2%`, `95% CI 76.2–99.9%`), and `1/19` unchanged false positive (`5.3%`, `95% CI 0.1–26.0%`).

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` if you want to enable the optional `POST /api/scope-brief` endpoint.

## Verification & Disclaimer

SpecDelta is an automated pre-construction diffing aid and does not perform OCR on scanned raster pages. Always verify pricing-critical tolerances, warranties, and scope terms against the signed Addendum PDF.
