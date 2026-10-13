# Initial Sorphera continuity and timing validation

Historical initial implementation report, 13 October 2026. The review reproduced pole-filtering and font-dependent layout defects after this run. See [revision validation](revision-validation.md) for their fixes, current measurements and limitations. The comparison sheets and clips in this directory have been regenerated from the revised export; the figures below are retained as the original run record. All observations are worker-side checks, not independent certification.

## Delivered behavior and boundaries

The existing brand, central photo-derived globe front, USD budget flow, buy-12-get-1 Passport and Atlas teaser remain. The 360-degree maps/recipe now reconstruct matching source-derived felt, rounded raised applique, contact shading and panel stitching around sides, rear and poles. Both palettes use one mesh/material family in WebGL and Canvas. The cream badge and dynamic black digits occur only at the front. The reveal timeline, badge-away entry, deceleration, hold, travel, pause, replay, skip and muted default remain.

Round data carries cutoff and earliestDraw separately. Round 42's frozen UTC anchors are ETH 18 October 2026 00:00 and NFT 01:00; the clearly simulated windows open at 00:30 and 01:30. Future identities add seven days; time passing cannot reset a saved deadline or advance a saved round. All visible dates use the browser's local zone. The adapter copies canonical contract timestamps, derives the frozen draw gap, and retains block-timestamp purchase checks. No Solidity or ABI edit was needed.

Home, Play, review, receipt, My tickets and the upcoming Draw Room share schedule rendering. The default draw journey has an ETH/NFT switch, exact round links, an emphasized draw-window timer, honest unknown/delayed states and separate fixture replays. A cancelled/final round's known state outranks a skewed browser clock. The two calendar downloads have different names, UIDs and timestamps; neither promises numbers at the opening time. Paused/closed checkouts preserve paid drafts, budgets, Passport progress and unused rewards.

## Commands actually run

Node 24.21.0 / npm 11.19.0; Python 3 with temporary Pillow, NumPy and SciPy. Browser/tool packages and extracted system libraries were installed in `/tmp`, with an ordinary `npm ci` from the unchanged frontend lockfile. No new frontend dependency or build configuration was introduced.

| Command / check | Actual outcome |
| --- | --- |
| `npm ci --cache /tmp/sorphera-npm-cache` in `web/` | Completed. npm reported the existing 3 audit advisories (1 moderate, 2 high); dependencies were not upgraded under this task's protected-path rule. |
| `npm run build --prefix web` | Exit 0. TypeScript and Vite production export produced root `dist/`; see `build.txt`. |
| `npm run typecheck --prefix web` | Exit 0; see `typecheck.txt`. |
| `npm test --prefix web` | 46/46 existing tests passed, zero failures; existing `core.test.ts` unchanged. See `unit-tests.txt`. |
| `npx tsx --test src/schedule.test.ts` in `web/` | 12/12 passed, including contract timestamp propagation, strict cutoff, known states, skewed clock/final status, immutable round identities, calendars, missing schedule, and result gating. See `schedule-unit-tests.txt`. |
| `node web/tests/schedule.mjs` | 10 production-export flows passed in Chromium at `/preview/`; zero page/resource errors. See `schedule-chromium-results.json`. |
| `node web/tests/paused-checkout.mjs` | 3 paused/reward/draft flows passed; zero page errors. Bundles real components with a test-only sales toggle, absent from the production export. See `paused-checkout-results.json`. |
| `node web/tests/plush.mjs` | WebGL and forced Canvas comparisons, 20 distinct digit prints, six blank/symbol variants, five different orientations, hidden rear ink and responsive export checks passed. See `plush-results.json`. |
| `node web/tests/reveal.mjs` | Six sequence checks passed; continuous normal-speed NFT recording made with both ball palettes. See `reveal-webgl-results.json`. |
| `SOFTWARE=1 node web/tests/reveal.mjs` | Same six checks passed with WebGL disabled; separate continuous Canvas recording. See `reveal-canvas-results.json`. |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | All 16 checks passed. See `design-probe.json`; pinned script is removed by the task runner. |
| `node test/scratch/offline-export.mjs` | Eight routes served from final export under `/gateway/` with external requests blocked; no external request, missing asset, page error or 390px overflow. Metadata and keyboard dialog Escape/focus return passed. See `offline-export-results.json`. |
| `/tmp/sorphera-python/bin/python web/scripts/plush-materials.py` | Rebuilt maps byte-identically. Source/public and dist map SHA-256 hashes match; see `material-hashes.json`. |
| FFmpeg WebM → H.264 MP4, CRF 29, normal timestamps | Both clips decode at 960×760, 25 fps, no time scaling, cuts, image swaps or accelerated motion. WebGL 27.80s; Canvas 25.08s. Metadata included. |
| `git diff --check`, protected-path diff and submission manifest checks | Final results recorded in `packaging.json`; no ignore/configuration/ABI/Solidity changes, dependency cache, archive or submodule in the eligible bundle. |

Browser commands used external Playwright 1.56.1 (`PLAYWRIGHT_MODULE`) and Chromium 141 build 1194 (`PLAYWRIGHT_BROWSERS_PATH`), external esbuild where needed (`ESBUILD_MODULE`), plus `--use-angle=swiftshader --enable-unsafe-swiftshader`. Temporary fontconfig used DejaVu/Liberation so text screenshots include actual glyphs. The site's CSS requests Inter then Arial/Helvetica/system sans; it does not bundle Inter or rely on a remote font.

## Controlled-clock and interaction coverage

The schedule browser test controls wall time in `America/New_York`; the output still asserts exact UTC `datetime` and calendar values. It covers a paid review opened before cutoff, confirmation at exactly cutoff (including adversarial handler invocation), tab suspension/time jump, draw-window opening without results, an eight-day delay, reload stability, independent NFT time, explicit round 43 versus old round 42, successful receipt and persisted My tickets deep links, unknown game/round/replay links, separate downloaded calendar events and USD budget preservation.

The component browser harness covers an already-open reward review while sales pause, then cutoff; attempted confirmation cannot consume its reward or Passport progress. Old-round drafts remain accessible and explicit removal releases reserved rewards without moving or spending entries. Existing unit tests continue to cover reward accounting, failed/rejected transactions and identity isolation.

Delayed oracle, NFT tie delay, rollover and cancellation remain explicitly labelled simulations. No live winner or LIVE badge is produced by a countdown. Received randomness is labelled awaiting finalization. Rollover no longer exposes a bogus “winning ticket #0”. `revealView` gates numbers and matches by stop, and the winner by the separate finalized tie result. Main balls stay blue and bonus pink in the shared reveal code for both games.

Keyboard checks cover the skip link, main action and visible focus; the offline-export check covers modal Escape and focus return. Reduced-motion preference is picked up and preserves the supplied outcome. Desktop/mobile route layouts were measured at 320, 390, 768 and 1440px, without horizontal overflow. At 390×844, the homepage product, primary action (bottom approximately 467px) and first jackpot amount (bottom approximately 811px) are on the first screen.

## Visual inspection and motion evidence

Open [the evidence viewer](index.html). Four comparison sheets show the unchanged supplied ETH/NFT references beside front, side and back renders at actual **43/59px picker** and **140/170px draw** sizes in both renderers. Full-turn sheets show **0, 45, 90, 135, 180, 225, 270, 315 degrees** for blue/pink and pink/cream, plus both poles. Sheets were inspected directly, including 90/135/180/225 degrees and fallback; comparison is not limited to front screenshots.

Observed: the front retains the supplied photo's continent/badge design; rear continents now have rounded relief/contact shading and source-derived felt instead of the old mirrored diamond swatches. Rear lighting is naturally darker toward the lower hemisphere. One badge rotates away around the silhouette and does not repeat at the back. Canvas has slightly different filtering/edge antialiasing from WebGL, while geometry, palettes, fibres, badge and geography remain shared. Rear geography is a reconstruction, not a photograph or a scan of an unseen original. The original brand assets and PR #7 defect comparison remain available.

The clips are uninterrupted browser recordings at normal playback speed, transcoded without changing timestamps. `motion-summary.json` records observed requestAnimationFrame intervals and phase transitions. Headless WebGL/SwiftShader averaged **38.33 fps** overall, median **16.7ms**, p95 **99.9ms**; Canvas averaged **45.31 fps**, median **16.7ms**, p95 **50.1ms**. There are visible recording/render stalls; 25 fps encoding does not claim every frame contains a unique render or guarantee physical-phone smoothness. The existing timeline clamps long frame gaps, so stalls lengthen playback rather than skipping the back. Both clips show entry, turn, stop, landing, pink bonus and the separate NFT tie-break.

The isolated 256px render benchmark recorded WebGL **1.8–6.5ms** for five views and Canvas **24.6–60.7ms** for warmed sequential views (69.8ms first view). Paused pixels and phase are frozen; travelling and landed buffers are byte-identical to the stopped globe in each renderer. UI screenshot captures include Home, Draw Room, Play schedule, My tickets and cutoff checkout.

## Better Interface review: six domains

The pinned guide's workflow and all six core domains were read and applied while building. Its documentary checklist informed root `DESIGN.md`. Supporting checks included responsive grids, timezone labels, disabled states, keyboard behavior and motion accessibility. Coverage includes source review and actual Chromium rendering; it is not a blanket accessibility audit.

| Domain | Coverage, findings and fixes |
| --- | --- |
| Accessibility | `web/src/RoundSchedule.tsx:18` refreshes after suspension; `:102` limits polite announcements to status, not ticking seconds. Explicit labels and UTC `time` values remain readable. Keyboard focus, skip link, modal Escape/return, disabled checkout and reduced motion tested. Probe: all 21 Home controls meet 24px or spacing; 12 remain below the comfortable 44px size. New calendar targets use 44px. No screen-reader session. |
| Layout | `web/src/styles.css:3075` uses a compact two-column schedule; `:3160` prioritizes draw timing and `:3187` stacks it on mobile. First-screen product/action and 320/390/768/1440 reflow verified. My tickets remains compact. No text-box overlap, clipping or floating-control obstruction was reported by the Home probe. |
| Writing | `web/src/schedule.ts:4` states the exact delay caveat. Draw-window and sales labels are distinct; `web/src/fixtures.ts:14` freezes separately labelled demo anchors. `web/src/UpcomingDraw.tsx:122` keeps fixture previews apart from ticket outcomes. `web/src/reveal.ts:26` corrects received-versus-final labels; no request is claimed merely because a timer reaches zero. |
| Typography | `web/src/styles.css:1` retains six roles (12/14/18/20/28 plus 36–64 display), three weights and natural label tracking. Tabular numbers stabilize timers. Probe measured six used sizes at 390/1440, no repeated all-caps/spacing defects. Inter is a CSS preference, not a claimed installed font. |
| Colors | Existing ice-blue text, pink actions, cream copy and charcoal surfaces retained. No urgency red, pulsing timer or misleading LIVE treatment added. The probe passed every measurable solid text/background pair against 4.5:1 (3:1 large); **69 text boxes over images/canvas/gradients were not measured**. No blanket contrast guarantee is claimed. |
| UI | `web/src/Play.tsx:132` closes both purchase modes exactly at cutoff; `:1053` now combines frozen review times with current sales status, fixing a stale open-modal label. `web/src/LiveWorkspace.tsx` uses the same display guard while contract/block checks remain authoritative. `web/src/demoStorage.ts:7` safely persists per-identity tickets/drafts; `web/src/Tickets.tsx:148` uses exact round links. Unknown schedules, closed/paused state, pending/retry, empty upcoming tickets and separate calendar actions inspected/tested. |

Other findings fixed during implementation: the old one-swatch mirror recipe (`web/scripts/plush-materials.py:64`) and flat rear relief (`:132`); discontinuous seam normals and Canvas glitter/filter mismatch (`web/src/plushModel.ts`); mutable anonymous demo deadlines; automatic open-ticket fixture links; a cancelled/confirmed round still counting down under a skewed clock (`RoundSchedule.tsx:57`); and a calendar folding regression, repaired without changing the existing unit assertions. The final checks above pass after those fixes.

## Limitations and checks not executed

- The browser connector reported “Chromium distribution chrome not found”; local Playwright Chromium was used successfully. The latest Chromium download returned HTTP 403; Playwright 1.56.1's browser installed successfully. WebKit 26 stalled on two launch attempts even after temporary library installation; both were terminated. **No WebKit pass** is claimed.
- Physical devices, native screen-reader sessions, browser-native 200% zoom, calendar application import and cross-browser/GPU performance were not tested. The ICS payload and downloads were tested, not a third-party calendar UI.
- No funded wallet, public RPC/VRF execution, transaction, deployment or publication was attempted. Live adapter timing was checked with a read-contract stub; its new UI guard was typechecked, while actual wallet execution remains untested. The existing deployment stays disabled. Client clocks are presentation only and cannot authorize live purchases or choose outcomes.
- The old broad `web/tests/browser.mjs` was not rerun because it contains earlier replay-navigation assumptions. Its historical count is not presented as current evidence; current purpose-built flows and the unchanged unit suite were run instead.
- Forge, Slither and Aderyn were not run: no Solidity, ABI, contract test or dependency changed. The assignment's check profile is none. Passing website checks proves neither contract security nor launch readiness.

## Packaging

The runner already ignores root `artifacts/`; no ignore file or Git metadata was edited. Required comparisons, clips and reports are preserved once in this submitted `web/evidence/continuity/` directory. Temporary WebM recordings, duplicate recording directories, dependency/tool caches and test scaffolding are excluded. The source, existing lockfile and complete root export remain.

To fit the 8 MiB submission limit, two obsolete historical files were removed: the 2.5 fps `web/evidence/reveal-nft-tie.gif` and procedural-globe `web/evidence/iteration2/reveal-stopped.png`. Their reports now note the removal and link to this evidence. The current required full-turn sheets, both normal-speed clips, photographic references, PR #7 comparison, runtime assets and reproducible recipe are all retained. `packaging.json` records the final conservative gzip snapshot measurement and required-file checks.
