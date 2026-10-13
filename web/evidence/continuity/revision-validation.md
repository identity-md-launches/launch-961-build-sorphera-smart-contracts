# Review revision: polar felt and mobile reflow

13 October 2026. Complete for the stated three-finding revision. This is a worker-side validation record, not independent certification. Source and root `dist/` contain the same build. The accepted schedules, draw states, Passport, budget flow, Atlas and brand assets remain unchanged.

## Findings reproduced and fixed

| Finding | Reproduction before editing | Fix and recheck |
| --- | --- | --- |
| `6fdac5dd1d5030f27d34030ef0ba0b50e11600dacf67a64e6ce3fde8b88e5aca` | Chromium 154 / SwiftShader, 1560px harness: all four WebGL poles had broad smooth radial fans at 170px and 256px. Software retained substantially more fibre detail. | `web/src/plushModel.ts:208` reprojects the existing albedo into two planar x/z polar patches once during model load. Wrapped bilinear source sampling, continuous cap coordinates and a smooth 0.90–0.96 radial-y blend keep the sampling footprint bounded. Both albedo samplers still use `LINEAR_MIPMAP_LINEAR`; WebGL antialiasing stays enabled. No mesh, lighting, badge, cache, public API, map/recipe or animation change. Updated reference/size, full-turn, pole and video evidence was inspected in both renderers. |
| `e1841b7c50f0ec341fec2d0b62dce1ad52cb2681a5ccae97a74d32f9cdade50e` | With the declared stack resolving to DejaVu Sans, 390×844: hero actions were 108px tall and the first jackpot occupied y=859.08–895.08. Existing plush test failed its first-screen assertion. | `web/src/pages.tsx:33` removes only the decorative arrow. Actions now occupy one 46px row; jackpot bottom is 833.08px with DejaVu Sans and 810.69px with Arial/Liberation Sans. Labels, exact tagline and art remain. |
| `3046486cd24cfbbea97f0b993188b33bbf9fa6aa8a7750cd91a05aa58a192964` | Both games at 320px with DejaVu Sans: a 288px grid held 305px-wide cards ending at x=321. Existing schedule test failed `Overflow 320 #play?game=1`. | `web/src/styles.css:2038` uses `minmax(0, 1fr)` and `min-width: 0` for mobile picker/basket. Both cards now span x=16–304, width 288px; page scrollWidth is 320. No overflow hiding or content removal. Both games pass with all tested font stacks. |

Measurements are in [revision-reproduction.json](revision-reproduction.json) and [plush-results.json](plush-results.json). [Open the evidence viewer](index.html).

The added pole regression measures RMS luminance Laplacian inside each 16px-radius centre disk at 256px, away from applique edges, and compares WebGL with software. Before: WebGL retained only 20.7–24.8% of software detail. After: 62.1–68.8%. The broad tolerance (45–150%) allows normal filtering differences. Running this exact regression against the unchanged original renderer failed at 20.7%; the fixed renderer passes all four poles. This detects excessive blur; it does not replace visual inspection. A separate original-versus-revised render comparison found **zero changed channels** in the central 160×192 front crop of both palettes (122,880 RGBA channels each).

## Commands and actual results

Dependencies were installed from the **unchanged lockfile in `/tmp/sorphera-revision/web/`**, with an exact source/config/public mirror and the existing `frontend/` fixtures. This avoided writing the repository's prohibited `node_modules/` path. No manifest, lockfile, build config, ABI, Solidity or ignore file was changed. The resulting static export was copied to root `dist/`, replacing stale hashed bundles. Node 22.23.3, npm 10.9.9, Vite 7.1.9, installed Playwright 1.64 alpha / Chromium 154.

| Command | Result |
| --- | --- |
| `npm ci --prefix /tmp/sorphera-revision/web --cache /tmp/sorphera-revision/npm-cache --no-audit --no-fund` | 87 packages installed from the existing lockfile. No dependency updates. |
| `npm run typecheck --prefix /tmp/sorphera-revision/web` | Passed; `typecheck.txt`. |
| `npm run build --prefix /tmp/sorphera-revision/web` | Passed after the final source edit; 1,109 modules, relative asset URLs; `build.txt`. Export matches the isolated build byte-for-byte. |
| `npm test --prefix /tmp/sorphera-revision/web` | 46/46 passed; `unit-tests.txt`. |
| `./node_modules/.bin/tsx --test src/schedule.test.ts`, working directory `/tmp/sorphera-revision/web` | 12/12 passed; `schedule-unit-tests.txt`. An initial invocation from repository root missed the JSX tsconfig and failed with `React is not defined`; running in the documented web directory resolved it without a source edit. |
| `node web/tests/plush.mjs` | Passed actual-size comparisons, all four pole regressions, five orientations, 20 numbers, six symbols, hidden rear ink, forced Canvas fallback, declared-font reflow at 320/390/768/1440, 390px hero with Arial/DejaVu/sans-serif, and both 320px Play games with each font. Zero page errors. |
| `node web/tests/schedule.mjs` with DejaVu-only fontconfig | 10/10 controlled-clock flows passed; no page/resource errors; `schedule-chromium-results.json`. Same export also passed the default-font run before the layout fixes, confirming the original failures were font-dependent. |
| `node test/scratch/paused-checkout.mjs` | 3/3 passed; exact existing pause harness with only its source resolution directed to the isolated build mirror. `paused-checkout-results.json`. |
| `node web/tests/reveal.mjs` and `SOFTWARE=1 node web/tests/reveal.mjs` | Six checks passed in each renderer: pause freezes pixels/phase, resume, travel/landing pixel equality, bonus stop, gated tie-break winner, replay/skip/reduced motion, and full normal-speed recording. Zero page errors. |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline` | 16/16 passed; `design-probe.json`. Repeated with DejaVu-only fontconfig into `test/scratch/taste-dejavu`: 16/16; `design-probe-dejavu.json`. |
| FFmpeg conversion and `ffprobe` | Both refreshed clips are H.264/yuv420p, 960×760, **25 fps**, faststart, silent browser recordings. WebGL 24.48s / 286,220 bytes; software 22.64s / 291,490 bytes. No cuts, time scaling or image swaps. |
| `git diff --check`, protected-path and complete snapshot checks | Results in `packaging.json`. Existing dependency and build configuration hashes are unchanged; no caches, dependency archives or submodules are delivered. |

Browser harnesses use `PLAYWRIGHT_MODULE=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs`, `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright`, and `ESBUILD_MODULE=/tmp/sorphera-revision/web/node_modules/esbuild/lib/main.js` where needed. Taste uses `IMD_PLAYWRIGHT` for that same Playwright module. DejaVu-only fontconfig is test-only and lives outside the repository; the shipped font stack is unchanged. Tests own and close their local HTTP server, serving the export at `/preview/`.

## Visual and interaction coverage

Inspected the supplied references against front, both sides and rear at 43/59px picker and 140/170px draw sizes; full turns at eight 45-degree intervals; north/south poles of both palettes at 170px and 256px; both WebGL and forced Canvas. Extra scratch captures rotated each cap through eight angles at ±80° tilt to inspect the planar blend and longitude seam. The broad radial blur is removed without changing the approved central face. The software renderer remains slightly grainier and has different edge antialiasing; no claim of pixel-identical renderers is made.

Inspected 390px Home with DejaVu and Arial, 320px Play in both games, desktop layout, and continuous clip frame sheets. Fresh captures replace affected evidence in this directory. `plush-poles-before.jpg` explicitly identifies the old defect. The 25fps clips preserve browser timestamps. Measured rAF sampling averaged 47.54 fps in WebGL (p95 66.6ms, some stalls) and 60.00 fps in software (p95 16.7ms) on this host; encoding at 25fps is not a guarantee of 25 unique frames every second or physical-phone performance. See `motion-summary.json` and both metadata files.

The controlled-clock suite rechecked an already-open paid checkout at cutoff, adversarial confirmation, draft/Passport preservation, draw-window opening without invented results, delayed result, tab resume, reload stability, independent games, later round identity, exact receipt/My tickets links, distinct calendars, missing rounds, NFT tie delay, rollover and cancellation. The separate pause harness rechecked reward checkout and unused-reward preservation. Keyboard skip/main-action navigation and focus, plus reduced-motion reveal/result gating, passed.

## Better Interface: six-domain review

The pinned workflow, six core domains and documentation method were applied to the affected surfaces; existing deliberate branding and copy were preserved.

| Domain | Coverage and result |
| --- | --- |
| Accessibility | Checked native action semantics, unchanged labels after arrow removal, keyboard focus/activation, cutoff disabled states, pause/resume and reduced motion. Home probe: all 21 targets satisfy 24px or spacing; 12 remain below the comfortable 44px size. No screen-reader or physical-device session. |
| Layout | Reproduced and fixed both font-dependent findings at `pages.tsx:33` and `styles.css:2038`. Measured both card edges, not just page scrollWidth. Checked desktop, 768px, 390px and 320px. Content remains in normal flow; overflow is not hidden. |
| Writing | Checked that the two action labels, exact tagline, simulated schedule wording, delay caveat and separate calendar names remain intact. No pressure language, new result-time promise or invented result. |
| Typography | Retained six size roles and three weights. Tested declared stack, Arial/Liberation, explicit DejaVu Sans and generic sans-serif. Probe passes tracking/casing/size checks. First-screen jackpot now fits with the wider tested fallback. No new font dependency. |
| Colors | Tokens and palette unchanged. Both probe runs pass measured solid-background contrast pairs (4.5:1, 3:1 large). The probe excludes 69 text boxes over imagery/canvas/gradients; those are not claimed measured. |
| UI | Fixed the WebGL sampling cause while retaining trilinear filtering, antialiasing, raised felt/badge geometry and sequence controls. Inspected all four caps and the transition at oblique angles. Rechecked timing states, dialogs, fixture replays and local-storage behavior through existing tests. |

`DESIGN.md` and both READMEs now describe the implemented cap sampling and responsive rules. The original implementation report remains in `validation.md` as a historical record, with an explicit pointer here.

## Limitations

The browser MCP returned `Transport closed`; all rendered checks above used local Playwright automation and inspected real screenshots instead. WebKit 26.6 downloaded successfully but could not launch: missing host libraries include `libgtk-4.so.1`, `libgraphene-1.0.so.0` and GStreamer libraries. WebKit/Safari behavior is therefore unverified. No native-phone GPU, browser-native 200% zoom, screen-reader, RTL/localization or live wallet transaction was tested. The source retains its accepted English dark-theme demo and activation safeguards; no chain action or hosting operation was performed.
