# Sealed Release Evaluation Corpus

This directory stores on-demand downloads (gitignored `*.pdf`) used by `npm run benchmark:sealed` (`scripts/sealedCorpusBenchmark.ts`) as a **sealed release-only test set** collected strictly *after* finalizing parser and diff fixes on `benchmarks/heldout/`.

No regexes, noise thresholds, or section parser heuristics were tuned against these documents.

## Source Manifest & Attribution

| File | Issuing Public Entity | Pages | SHA-256 Prefix | Source URL |
|---|---|---|---|---|
| `01_ncdot_clay_pm.pdf` | North Carolina Dept. of Transportation (NCDOT) | 468 | `7a45d2c2` | https://connect.ncdot.gov/letting/Division%2014%20Letting/01%2010%202017%20SPECIAL%20LETTING/13283.01%20Clay%20Co.%20Maint%20Project%20Manual%20Vol%201.pdf |
| `02_llnl_div01_pm.pdf` | Lawrence Livermore National Laboratory (LLNL) | 185 | `901244f3` | https://procurement.llnl.gov/sites/procurement/files/2025-09/Division%2001%20General%20Requirements%20for%20Construction.pdf |
| `03_maconbibb_specs.pdf` | Macon-Bibb County, Georgia | 180 | `bb6e391f` | https://www.maconbibb.us/wp-content/uploads/2020/05/Attachment-B-Specifications-1.pdf |
| `04_uoregon_div26.pdf` | University of Oregon (CPFM) | 42 | `2808e832` | https://cpfm.uoregon.edu/sites/default/files/_division_26_combined_123021.pdf |
| `05_ca_dgs_24235656.pdf` | California Dept. of General Services (Book II) | 764 | `b00024dc` | https://www.dgs.ca.gov/-/media/Divisions/OBAS/Plans-and-Specs/24-235656/2-142452--Project-Manual-Book-II.pdf |
| `06_osu_kelley_add1.pdf` | Oregon State University (Kelley Engineering Addendum 1) | 95 | `5d2a6a53` | https://bid.oregonstate.edu/opportunity/viewFile/48782/Kelley%20Engineering%202nd%20Floor%20Remodel%20ITB%202024-012757%20Addendum%201%20Exhibit%20G%20Specifications.pdf?1694037911 |

Running `npm run benchmark:sealed` downloads any missing files from the originating `.gov`/`.edu` URLs above (`1,734` total pages), verifies SHA-256 prefixes, and writes exact counts and Clopper-Pearson 95% confidence intervals to `benchmarks/sealed_results.json`.
