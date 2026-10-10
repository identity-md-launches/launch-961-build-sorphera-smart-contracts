# Sorphera website iteration — worker validation

2026-10-10. Baseline/current branch at start: `cc450384ecf7ddbf5cb49b8a2aba62921c0a2e62` (merged PR #5), clean working tree. No newer changes were overwritten. Scope: purchase budget enforcement, one continuous plush globe reveal, accurate demo NFT presentation. Contracts, canonical ABIs, deployment settings, build configuration, dependencies and lockfiles were left unchanged. No ignore rules were changed.

## Result and assumptions

The local implementation and requested checks are complete. **Public publication is pending:** the available `imd site publish dist --name sorphera-a-world-of-possibility` command bundled 601,174 bytes, then exited 1 with **503 `member_sites_closed`: “this plane names no member sites.”** See `publication.json`. The provided existing URL is https://sorphera-a-world-of-possibility.sites.imd.fun/; this worker did not update it or obtain a new URL/CID. The platform can publish the complete root `dist/` under the existing site name `sorphera-a-world-of-possibility.site.identitymd.eth`. This is a labelled demo, not production or launch readiness.

The budget remains session state, matching the existing saved-draft lifetime: it survives navigation and game switching, and reload starts a fresh demo. It is a limit on each active checkout, not total account spending. Both games retain independent round-specific baskets. USD uses the fixed illustrative US$2,500/ETH rate and 0.0004 ETH fee per checkout; there is no pricing feed. Original wordmark, hero assets, palette and exact tagline are retained.

## Commands and actual outcomes

The worker installed the **unchanged** `web/package-lock.json` with `npm ci --no-audit --no-fund` in an isolated `/tmp/sorphera-build-…/web` mirror, then copied the final source there and root `dist/` back. The tests import `frontend/configuration.json`, so the unchanged `frontend/` directory was also copied into that mirror. An initial test/typecheck attempt before that copy failed on the missing file; it was a mirror setup problem, corrected before the passing runs below. No dependencies, package manifests, lockfiles or generated dependency folders were added to the submission.

| Check | Actual result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Exit 0 | `typecheck.txt` |
| `npm test` | Exit 0; 41 passed, 0 failed (39 existing + 2 focused budget tests) | `tests.txt` |
| `npm run build` after final source edit | Exit 0; TypeScript + Vite export | `build.txt` |
| `node web/tests/browser.mjs` | Exit 0; nine interaction groups | `browser-results.json` |
| `node web/tests/reveal.mjs` | Exit 0; reveal/pause/gating checks and continuous recording | `reveal-results.json` |
| `ffprobe` on final MP4 | H.264, yuv420p, 960×760, 25 fps, 22.92 seconds, silent | `video-probe.json` |
| Source/export paths, protected-file diff and byte budget | See exact byte/count report | `bundle-report.json` |

The browser scripts use the installed Playwright module with `PLAYWRIGHT_MODULE=/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs`, `CHROMIUM_PATH=/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome`, and `PLAYWRIGHT_BROWSERS_PATH=/opt/imd-tools/ms-playwright`. They serve the actual export at a temporary `/preview/` subpath, close their browser/server, and require no account or wallet. The assigned browser MCP first returned a tab list but then failed navigation with **Transport closed**. Actual rendered testing and screenshots therefore used local Playwright Chromium, not that connector.

## Regression coverage

- Before screenshots were reproduced from PR #5's committed `dist/`: US$30, three entries, US$38.50 all-in, Review and Confirm both accepted the purchase. The after version disables those actions and also rejects forced handler invocation after DOM `disabled` removal.
- Both games: default suggestion of two; two cost 0.0104 ETH / US$26.00; US$30 leaves US$4.00. Three cost US$38.50 and report the precise US$8.50 excess. Two fit US$26.00 and fail US$25.99. US$10 disables batch generation with an explanation.
- Blank, zero, negative, malformed, exponential, incomplete and overprecision input does not bypass the guard. Editing does not coerce the field to a different amount. Unit tests also cover a fractional-cent ticket price where rounding individual prices would disagree with the true total.
- Budget and drafts survive navigation; ETH/NFT baskets stay separate. The 100-ticket transaction limit and closed-round checks remain. No weekly ticket limit was added.
- Lowering the budget inside review disables confirmation. A forced budget edit during pending is caught at acceptance and retains the budget and two entries. A forced basket edit during pending rejects the stale purchase and keeps the newly edited draft. Eight rapid confirmation events create exactly two entries once. Pending confirmation is disabled. Rejected approval and acceptance failure retain drafts and budgets.
- Receipt totals, own-ticket counts, default NFT claim, partial NFT failure, retry of the remaining asset, and simulated delivery receipt were exercised. Claims show six neutral “Demo NFT” entries and no globe prize thumbnails.
- All six routes were checked for horizontal overflow at 320, 390, 768 and 1440 CSS pixels. No overflow was found. Additional desktop captures use 1280px; the continuous clip is 960px. Keyboard generation/review, modal Tab containment, Escape and focus return were tested. CSS 200% text enlargement at 390px was checked separately; this is **not** native browser zoom.
- Reveal checks pause during spinning and travel and compare the pixel buffer/transform after 450ms: unchanged. Stopped, travelling and landed globe pixel buffers compare byte-for-byte equal. The bonus has a separate pink stopping moment. Numbers and live announcements appear on stop; NFT winner/finale remain hidden until the tie-break. Replay, skip and emulated reduced motion retain the same result and rendered globe. Sound starts muted; no real transaction occurs.
- No page exceptions or failed HTTP resources were recorded in the passing interaction run.

## Better Interface — six-domain review

Applied the pinned guide during implementation and reviewed final source/export. Coverage is scoped to these changes and affected shared components.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility — Checked | Native labels and disabled states, explicit error remedies, stage-gated text alternatives/live region, keyboard focus wrapping/return, reduced-motion setting, 320px reflow. Focus ring viewed in `keyboard-focus.jpg`; mobile Review ring is also visible. | No native screen-reader session, physical touch device or full WCAG certification. Optional speech audio not listened to across voices/devices. |
| Layout — Checked | Home, Play, Draw, Tickets, History, FAQ at four widths; narrow review/claim and draw screenshots; budgets stay next to totals; FWA provenance sits in the existing jackpot section. | Native zoom, RTL and all possible viewport/content combinations not verified. |
| Writing — Checked | Exact purchase-specific label, precise excess/remedy, demo/illustrative labels, FWA explanation on jackpot/play/draw/claim, neutral claim placeholders. Fictional collection/gallery removed. | Live inventory and metadata intentionally outside scope. |
| Typography — Checked | Existing font stack and hierarchy preserved; 16px+ fields; tabular totals; readable cream badges viewed at stop and in narrow resting slots; source and rendered wrapping checked. | No claim that Inter is installed; Arial/system fallback renders. No exhaustive font/platform audit. |
| Colors — Checked | Original ice/pink/charcoal/cream tokens retained. Computed opaque contrast: budget field 15.26:1; explanation 6.72:1; enabled Review 9.08:1 (all ≥4.5). `contrast.json` records actual pairs. | Every image/gradient/translucent pair was not measured. Disabled controls are visibly disabled; no normal-text contrast claim for them. |
| UI — Checked | Empty/invalid/over-budget/review/pending/rejected/failed/confirmed states; draft actions; claim/retry; interrupted reveal/replay/skip; normal-speed recorded rotation and landing. No WebGL or animation dependency added. | No physical-mobile or cross-browser performance guarantee; slow-motion browser Animations-panel inspection not performed. |

## Findings, fixes and rechecks

| Severity | Source location (final tree) | Reproduction / impact | Disposition |
| --- | --- | --- | --- |
| High | `web/src/budget.ts:64`, `web/src/Play.tsx:209` | Three entries exceeded US$30 but original handlers accepted them; invalid budget could suppress the warning. | One shared exact-wei/all-in-cent plan, fail-closed parser, button and handler guards, final acceptance recheck. Both games and boundary/invalid/race tests passed. |
| High | `web/src/Play.tsx:226` | Confirm remained active while pending and could create duplicate entries. | Synchronous latch plus pending disabled state; eight-event UI regression accepted once. Failure preserves draft/budget. |
| Medium | `web/src/Play.tsx:97` | Generator began at three despite two fitting; no-ticket states remained actionable. | Initial suggestion derives from remaining affordability; no-fit batch disabled with recovery text. Draft edits remain explicit. |
| High | `web/src/PlushGlobe.tsx:14`, `web/src/Chamber.tsx:7` | Smooth animated blob switched to a numbered photo on landing. Geography did not convincingly follow the surface. | Shared texture-mapped sphere with real land outlines, local felt texture, dynamic badge and fixed light. No photographed digits. Pixel identity assertion and stage captures passed. |
| High | `web/src/DrawRoom.tsx:91` | Original timer restart and CSS travel transition could diverge from paused visual state. | One elapsed-time frame clock controls phases, rotation and travel; remaining time preserved. Both pause states passed. Aggregate outcomes and separate tie-break gating preserved. |
| High | `web/src/pages.tsx:112`, `web/src/Tickets.tsx:261` | Invented World Study collection and globes presented as claimable NFTs. | Gallery/modal/style removal, exact FWA provenance with adjacent demo qualifier, neutral NFT placeholders. Home and claim UI checks passed. |
| Medium | `web/src/components.tsx:77` | Keyboard traversal at the end of the review dialog reached browser chrome; first correction included an input inside closed details because it still had layout rectangles. | Wrap only visible controls (`checkVisibility`, with closed-details fallback). Twelve Tab presses stayed inside the modal; Escape returned to Review. |

## Motion and evidence

`index.html` is an accessible evidence viewer with the silent clip, transcript and links to screenshots. Required states: `globe-away.jpg`, `globe-mid-turn.jpg`, `globe-stopped.jpg`, `globe-landed.jpg`, plus `globe-bonus-stop.jpg`. Before/after: `home-before.jpg` / `home-after.jpg`, `budget-before.jpg` / `budget-after.jpg`, and `review-before.jpg` / `review-after.jpg`.

`reveal-normal.mp4` is a continuous **25 fps** Playwright recording converted to H.264, not interpolated screenshot animation. No timer override, pause or speed-up was applied in the recording. The final run recorded 1,242 requestAnimationFrame intervals: median 16.7ms, p95 33.3ms, max 66.6ms. Recorded turns were about 1.52s and holds 0.87s (nominal 1.5s/0.85s). Frame timing includes the whole capture, not solely GPU rendering, and occasional dropped frames remain. Dense extracted rotation/landing frames and the individual states were inspected; smoothness on real phones was **not** inferred from stills. `motion-summary.json` retains phase measurements.

Implementation/validation is complete for the requested local website scope. Worker-side publication was attempted and refused by the service; subsequent platform publication is a separate action. These checks are the worker's evidence, not independent service certification.
