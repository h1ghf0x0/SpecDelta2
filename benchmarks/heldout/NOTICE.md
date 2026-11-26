# Held-Out Multi-Section Corpus & Full-Scale Manual Attribution

This directory stores on-demand downloads (gitignored `*.pdf`) used by `npm run benchmark:heldout` (`scripts/heldoutCorpusBenchmark.ts`) to evaluate SpecDelta's unmodified parser and diff engine on:

1. **Full 1,046-page Dover NH Conformed Set Vol. 1** (`dover_vol1_full.pdf`) — scaling test replacing the 100-page excerpt with the complete 1,046-page specification volume.
2. **10 Unseen Multi-Section Public Project Manuals** (5,269 real digital pages total across 10 independent U.S. public agencies and universities) that were **never used to tune** SpecDelta's regexes, noise filters, or section parser.

PDF binaries are **not** committed to git (`benchmarks/heldout/*.pdf` is gitignored). Running `npm run benchmark:heldout` downloads any missing files directly from the originating public `.gov`/`.edu` URLs below, verifies SHA-256 checksums before execution, and writes verified counts and Clopper-Pearson 95% confidence intervals to `benchmarks/heldout_results.json`.

## Source Manifest & Attribution

| File | Issuing Public Entity | Pages | SHA-256 Prefix | Source URL |
|---|---|---|---|---|
| `dover_vol1_full.pdf` | City of Dover, NH (HMFH Architects) | 1,046 | `6f2e02c2` | https://www.dover.nh.gov/Assets/government/city-operations/public-education/high-school-project/drawings-specs/Specifications%20-%20VOL%201%20-DHS%20Conformed%20Set.pdf |
| `01_ca_dgs_pm.pdf` | California Dept. of General Services | 255 | `286c2bf1` | https://www.dgs.ca.gov/-/media/Divisions/OBAS/Plans-and-Specs/22-130586-PROJECT-MANUAL.pdf |
| `02_kenedy_tx_pm.pdf` | Kenedy County, Texas | 315 | `90fe0480` | https://www.kenedycountytx.gov/upload/page/4734/Election%20Office%20Addition%20-%20Project%20Manual.pdf |
| `03_santafe_nm_pm.pdf` | Santa Fe County, New Mexico | 457 | `de478035` | https://www.santafecountynm.gov/documents/solicitations/SFC222-11_PM_100%25_%283%29.pdf |
| `04_merced_college.pdf` | Merced Community College District | 127 | `20ebce06` | https://www.mccd.edu/wp-content/uploads/2024/03/02-121754_SPC_A.pdf |
| `05_redrocks_cc.pdf` | Red Rocks Community College | 345 | `1cfc1dec` | https://www.rrcc.edu/sites/default/files/2026-01/project_manual_upgrade_w_end_rtu_lakewood_campus.pdf |
| `06_humboldt_pm.pdf` | Cal Poly Humboldt | 143 | `0e35f6c8` | https://www.humboldt.edu/sites/default/files/strategic-business-services/2024-06/pw20-1-7-exhibitfprojectmanual1.pdf |
| `07_unlv_msl.pdf` | University of Nevada, Las Vegas (UNLV) | 674 | `9c44f59b` | https://www.unlv.edu/sites/default/files/page_files/182/Exhibit%20C2%20MSL%20Project%20Manual_0.pdf |
| `08_untsystem_pm.pdf` | University of North Texas System | 1,984 | `481675f0` | https://finance.untsystem.edu/sites/default/files/bid-documents/rfcsp763_26_1020er_project_manual.pdf |
| `09_cmich_pm.pdf` | Central Michigan University | 688 | `d0186011` | https://cdn.cmich.edu/sitefinity/documents/EDA-06-01-06375-CMURC-Bid-CD-Project-Manual-2023-05-23.pdf |
| `10_osu_docs.pdf` | Oregon State University | 281 | `0a582605` | https://admin.bid.oregonstate.edu/opportunity/viewFile/49190/Exhibit%207-Construction%20Documents.pdf?1735931451 |

All documents remain the property of their respective public institutions and authoring firms and are used strictly on-demand for reproducible benchmarking.
