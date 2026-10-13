# Visual revision validation — 2026-10-13

Complete for the four reported findings, with the browser and reconstruction
limitations below. These are worker-run checks, not independent certification.
This revision preserves the existing site, Passport rules, draw clock, wallet
context, ticket economics, contracts, ABI files and protected build configuration.

## Findings reproduced and corrected

| Finding | Reproduction | Correction and recheck |
| --- | --- | --- |
| `54487b…1c59` — plush fidelity | Read the old `blankTexture()`/ray-sphere renderer and compared the supplied photographs with its accepted export. Its material was a gradient/map multiplied by noise, and its rim/land read flat at draw size. | `web/src/PlushGlobe.tsx:9` retains the public paint API and per-kind/number resting caches. `web/src/plushModel.ts:63` builds a displaced cloth mesh with derived normals, raised land and a padded badge. The committed photo-derived albedo retains visible fibres, seams and contact shading. Rounded ink paths (`:147`) follow the curved badge. WebGL (`:194`) and software triangle rendering (`:313`) share the same mesh/material; silhouette fibres rotate with it. Inspected both fronts at 56px and 185px, the real mobile picker, draw stops and five rotation angles. Enlarged the badge, thickened ink and corrected the pink palette after the first comparison. See `plush-comparison.jpg`, `draw-stop.jpg`, `bonus-stop.jpg`. |
| `bf6c47…51a4` — too many type sizes | The pinned probe reproduced 9 recurring sizes at 390px and 10 at 1440px. | `web/src/styles.css:2` defines six roles: 12, 14, 18, 20, 28 and one display clamp (36–64px). The tagline, section headings, jackpot amounts, controls and small text use these roles. The final probe measures exactly six recurring sizes at both widths. |
| `4e7b93…894` — round kicker | The baseline probe flagged both “Demo round 42” pills above amounts. | `web/src/pages.tsx:81` folds the round into “ETH jackpot · Demo round 42” / the NFT equivalent. The separate pill is gone. Final probe: no kicker labels. |
| `9e0ea8…aa32` — mobile first screen | Inspected the baseline 390×844 screenshot: action visible, jackpots below the viewport. | Removed the duplicate hero kicker and wallet direction. `web/src/styles.css:3037` reduces the phone wordmark/hero spacing and photo container. At 390×844, the main-action row ends at y=467.02 and the first jackpot amount at y=810.69. Both are visible in `home-390.jpg`; the regression asserts these bounds. |

The full finding IDs and verdicts are in root `.imd-responses.json`.

## Material provenance and visual limits

The original ZIP was retrieved from the task's public Google Drive folder. It
contains the 1536×1024 brand board; existing reference WebPs remain unchanged.
One image edit reconstructed a blank fabric badge from those references. That
front is committed as `web/artwork/plush-source.webp`. The source is projected
onto a displaced 24,576-triangle cloth mesh; the unseen hemisphere continues
sampled felt and geographic applique. Country variants use the same material
and shape, with country-code ink. See `web/artwork/README.md` and
`web/scripts/plush-materials.py` for the reproducible material pipeline.

This is a photo-derived reconstruction, not a scan: fine fibre placement and
unseen rear geography are reconstructed, and the front is not pixel-identical
to the photograph. In the inspected renders, the revised fronts retain visible
fibres, curved seams, raised soft continent edges, contact shadows and a padded
cream rim; the old smooth/noise construction is removed. Visual comparison is
the evidence for that assessment. Tests only establish rendering behavior.

## Checks actually run

Dependencies were installed from the unchanged `web/package-lock.json` into a
temporary mirror under `/tmp/sorphera-check`; the shared read-only frontend
configuration and canonical ABIs were copied into `/tmp/frontend` for its tests.
No repository `node_modules`, package manifest, lockfile or build configuration
was changed. The resulting export was synchronized to root `dist/`, removing
obsolete hashed bundles and unused source-image copies.

| Command/check | Actual result |
| --- | --- |
| `npm ci --prefix /tmp/sorphera-check --cache /tmp/sorphera-npm-cache --no-audit --no-fund` | Pass, from the existing lockfile. An initial attempt with the default read-only npm cache failed; the temporary cache fixed it. |
| `npm run typecheck --prefix /tmp/sorphera-check` | Pass, TypeScript `tsc --noEmit`. |
| `npm run build --prefix /tmp/sorphera-check` | Pass, TypeScript + Vite production export; 1,105 modules transformed. Relative base and hash routing preserved. |
| `npm test --prefix /tmp/sorphera-check` | 46/46 pass. An initial mirror run lacked the canonical ABI test input; copying the unchanged ABI directory fixed the test environment, with no source fix needed. |
| `web/tests/browser.mjs` | 9 browser groups pass: both games' budget boundaries, review/confirm guards, rejection/double submission, independent baskets, stale basket during confirmation, closed round, claim/retry, all-route reflow, keyboard/focus trap/return, opaque contrast and 200% text enlargement. |
| `web/tests/reveal.mjs` | 6 groups pass: pause freezes pixels/state, travel keeps stopped pixels, landed/stopped buffers byte-identical, bonus stop and NFT tie-break gating, deterministic replay/skip/reduced motion, continuous normal-speed recording. Muted-by-default control asserted. |
| `PLAYWRIGHT_MODULE=… ESBUILD_MODULE=… node web/tests/plush.mjs` | Pass: 20 distinct number prints, 5 distinct orientations, rear printing hidden, all caller symbols distinct, WebGL-disabled software fallback, no page errors, no overflow at 320/390/768/1440, 390px action and jackpot bounds. |
| `IMD_PLAYWRIGHT=/tmp/sorphera-tools/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/sorphera-browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste-final` | 16/16 checks pass on the production export. `taste-summary.json` retains the results. |

The existing browser/reveal scripts were copied to `test/scratch/` with only
their output directory changed to `test/scratch/regression-browser` and
`test/scratch/regression-reveal`; their assertions were unchanged. They served
the production export under `/preview/`. Playwright lived in `/tmp/sorphera-tools`
with downloaded browsers in `/tmp/sorphera-browsers`. The new plush script also
bundles the source model in an isolated comparison harness; application route
checks use the actual production bundle.

The unit suite covers Passport 11+1, 11+3 and 24 boundaries; remainders; pending,
refunded, failed, free and off-price exclusion; purchase/redemption idempotency;
projected rewards not being spendable; free-only fees; and separate game baskets.
Passport logic and later-contract requirements in `docs/PASSPORT-HANDOFF.md`
were not changed by this visual revision.

## Better Interface review

The pinned workflow, core principles of all six domains and documentation
section were read and applied. `DESIGN.md` describes the final source values.

| Domain | Coverage and findings | Limits |
| --- | --- | --- |
| Accessibility | Checked native picker/button names in source; artwork stays decorative; visible external focus, checkout keyboard order, dialog trap/Escape return, reduced motion and delayed result announcements exercised. Existing semantics retained. | No native screen-reader or physical-device session; no claim of full accessibility compliance. |
| Layout | Checked Home and all routes at 320, 390, 768 and 1440. Fixed the 390px hero overflow below the fold. Probe reports no horizontal scroll, text overlap, covered text or hidden clipping. | 200% text enlargement tested; native browser zoom and RTL not tested. |
| Writing | Kept exact brand/tagline, simple demo labels and all reward/Atlas copy. Removed the duplicated hero kicker/direction; combined the round labels. No new sales or reward promise. | Review is limited to the changed surfaces and shared globe/type components. |
| Typography | Consolidated actual declarations into six semantic roles; explicit small text prevents the browser’s 10px reduction; print paths remove platform font substitution. Final mobile/desktop probe passes. | System Inter/Arial body stack remains; no additional script/language variants tested. |
| Colors | Existing cream/charcoal/ice/pink tokens preserved. Corrected the first model’s purple cast to pink/cream using luminance recoloring. All measured opaque text pairs pass 4.5:1, or 3:1 for large text. | Probe leaves 45 text boxes over imagery/canvas/gradients unmeasured; those are not asserted as contrast passes. |
| UI | Checked cached resting art, blank/digit badges, five angles, all palettes, software fallback, pause/replay/skip, stops/travel/landing, bonus and NFT finale. Thickened numerals and resized the badge after comparison. | Rear art is reconstructed; tests do not certify likeness. Software-rendered Chromium took roughly 31–38ms for sampled uncached model paints; native GPU/device performance was not measured. |

The browser MCP returned `Transport closed`; a separate local Playwright
Chromium runner provided all rendered checks and screenshots. A WebKit launch
was attempted but failed because system libraries including `libgtk-4.so.1`,
`libgraphene-1.0.so.0` and GStreamer libraries are absent. WebKit is unverified.
No publishing, wallet transaction or deployment was attempted in this revision.

## Packaging

The prospective source archive (existing tracked files plus deliverable new
files; task inputs and scratch excluded) was measured below **8.24 MB gzip**,
below the **8,388,608-byte** cap. Root `dist/` contains **2,125,572 bytes**.
No `node_modules`, package caches, source-image duplicate, ZIP or npm archive
is included in the export. No ignore file or protected configuration was
changed. The network worker performs the final Git submission; this revision
does not mutate `.git/`.
