# Sorphera validation record

## Scope and outcome

Worker-run verification on 2026-10-09 Asia/Taipei. The preserved baseline is merged PR #3, `ed68e960dc3b9f0847caa637b5d3ea0c082bcfe3`. Implemented source is `web/`; the production static export is root `dist/`.

**Local demo deliverable complete; requested public publication incomplete.** The session provided browser and shell tools but no callable Website publishing workflow. The actual production export was served locally beneath `/preview/`, inspected and exercised. No public URL/CID or publication is claimed. Genuine deployment configuration remains absent by design, with the assignment-authorized null inputs and demo mode. This is not a launch-readiness assessment or independent network certification.

All four supplied brand files were accessible, inspected and optimized. The board guides the palette and supplies cropped globes; the ice-blue icon supersedes its pink badge. The reference copy is bundled but never displayed wholesale. No “BRAND CONCEPT 01” label appears in the UI. The ZIP and bundled prompts are not submitted. Asset hashes/dimensions are in `asset-manifest.json`.

## Actual build and logic checks

| Command | Actual outcome |
| --- | --- |
| `npm install --prefix web --cache /tmp/sorphera-npm-cache --no-audit --no-fund` | Passed, normal registry dependencies installed; earlier attempt without a temporary cache hit read-only home cache and was retried |
| `npm test --prefix web` | **28 tests passed, 0 failed**; `tests.txt` |
| `npm run typecheck --prefix web` | Passed, `tsc --noEmit`; `typecheck.txt` |
| `npm run build --prefix web` | Passed, typecheck and Vite production build, 1,099 modules; `build.txt` |

An intermediate typecheck caught an intentionally invalid test tuple cast; its test-only cast was corrected and the final typecheck/build passed. The final export was rebuilt after the final application source changes.

Tests cover number ranges/distinctness, all 5,700 Solidity packed combinations, Quick Pick isolation, duplicate combinations, fractional/oversized batches, exact wei totals, price/identity/time/pause eligibility checks, baseline terminal statuses, NFT provisional ties, unrelated randomness rejection, cancellation review, oracle lockups, replay/skip equivalence, both rollovers, 20-asset batching, per-asset claim failure/retry, demo transport isolation, null/chain/activation gates, canonical lottery ABI equality, untrusted metadata, namespaced caches, log paging/concurrent deduplication/reorg recovery, ABI-based ETH/refund claims independent of sales pause, reverted receipts versus uncertain broadcast/receipt timeouts, actual NFT claim events (including a vote followed by delivery in one receipt) and queued-versus-delivered purchaser rewards.

No contract source/tests, original ABI exports, Foundry settings, root dependencies or protected directories were modified. Existing contract suites were not rerun: this task changed the website only.

## Browser verification

Used the provided Chromium browser tools against **the production export**, served at `http://127.0.0.1:4173/preview/`. This address is worker-local and ephemeral. The local server is a bounded tool-owned exec session; no host daemon or public deployment was created. Relative JS, CSS, favicon and image URLs loaded under the subpath. Direct hash-route navigation and full reload worked.

Checked all six routes (Home, Play, My tickets, History, FAQ, Draw room) for document overflow at **320×760**, **768×1024**, **1440×1000**: all returned `scrollWidth === innerWidth` after fixes. Additional rendered/mobile interaction checks used **390×844**, and draw capture used **1440×1100**. Screenshots were viewed, not just generated. Full-page captures start at scroll position zero so sticky elements do not appear halfway down the artifact.

Actual exercised flows:

- Home jackpot links selected the correct game; gallery opened an artwork explanation; FAQ and result disclosures were checked in source and accessibility snapshots. Route names and active links remained readable at mobile sizes.
- Quick Pick selected valid numbers without adding a ticket; explicit Add added the line. Keyboard Tab/Space selected main 7, 8, 9 and bonus 1. The focused number's 3px ring was visually inspected. Edit retained the entry; quantity 101 produced an error; quantity 100 produced **0.5 ETH** at 0.005 each. The final invalid-quantity field has `aria-invalid`/error association and receives focus.
- Ticket review → simulated rejection → retry → pending → confirmed → My tickets succeeded. An injected wallet provider recorded **zero requests** during the demo purchase and claims. At 390px, the NFT path added two tickets at **0.01 ETH**, reviewed and confirmed them.
- My tickets filtered by game/round. ETH + round 38 produced the expected empty state; Clear filters restored the list. NFT claim delivered five assets, left one failed, and retry delivered the remaining asset without repeating the successful ones. ETH/refund and purchaser reward queue/delivery actions succeeded in the demo. After navigating away/back, the five-delivered/one-failed state remained intact.
- Native modal Escape closed and returned focus to the invoking claim button. Mobile dialogs stayed within the viewport and scroll to reach additional actions.
- All seven replay scenarios were exercised through the selector and skip-to-results. The full NFT replay was also played, paused at the original oracle wait, resumed and observed through every phase. There was **no winning ticket** during either randomness wait or the provisional result. Only `Winning ticket confirmed` displayed **#118**. Both rollover scenarios displayed no matches; cancellation showed the below-cost 0.0031 ETH refund; both delayed-oracle scenarios remained nonterminal.
- Emulated reduced motion enabled the toggle, produced zero browser animations in the inspected draw state and preserved numeric results/skip. Sound is muted by default and code creates audio only on a user play action. Actual speaker output was not assessed.
- Browser console after the reviewed flows: **0 errors, 0 warnings**. Observed static resource requests returned HTTP 200, including lazy DrawRoom/Chamber chunks. No missing images were found in the checked routes.

Screenshots:

| Artifact | Actual capture |
| --- | --- |
| `home-desktop.webp` | 1440px desktop, full Home page |
| `home-mobile.webp` | 390px mobile, full Home page |
| `play-mobile.webp` | 390px mobile, picker and populated ticket |
| `claims-mobile.webp` | 390×844 native claim dialog, five deliveries and one failed NFT |
| `draw-desktop.webp` | 1440px full draw page, confirmed synthetic NFT tie winner |

## Better Interface review — six domains

The pinned workflow, core principles of all six domains and documentation section were read before/during implementation. Review was consolidated rather than delegated. The combined upstream MIT/Apache notices are retained in `web/licenses/better-interface.txt`.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility | **Checked.** Native links/buttons/forms/dialogs/disclosures; accessible picker state and numeric result alternatives; keyboard selection, visible focus, modal Escape/return, error announcements, reduced-motion behavior and mobile targets. | No screen-reader session, automated WCAG certification, forced-colors rendered session or full keyboard-only traversal of every possible claim state. |
| Layout | **Checked.** Shared edges, spaced grouping, desktop/mobile screenshots, all six routes at 320/768/1440, mobile overlays and nested scrolling. Fixed narrow hero overflow. | No native browser 200% zoom, text-only enlargement, RTL mirror or physical-device measurements. Product is English-only. |
| Writing | **Checked.** Exact tagline; clear demo/synthetic labels, verb-based actions, recovery copy, game/round identity, explicit limitations. Reviewed fees, claims, oracle, cancellation, rollover and provisional NFT tie language against baseline. | No professional legal/license review or translated copy. |
| Typography | **Checked.** Source scale/line height/wrapping, visual heading hierarchy and system font fallback, tabular changing numbers, 16px fields and readable mobile layouts. | No installed Inter font assertion, exhaustive OS font coverage or native zoom validation. |
| Colors | **Checked.** Tokens and actual computed solid background pairs; body 15.26:1, muted/picker 7.49:1, primary button 9.08:1, selected ETH 11.67:1, focus/picker 13.05:1. Viewed focus and text in the screenshots. | Did not measure every gradient/image/translucent or disabled combination; disabled controls are not a text contrast pass claim. One dark theme only. |
| UI | **Checked.** Selected/disabled/error/empty/pending/confirmed/partial-failure states, native overlays, consistent spheres, sparse gradients and surfaces. Replay, pause/resume, lazy fallback source and reduced motion checked. | No 10%-speed DevTools animation review, network-throttled fallback timing or physical audio assessment. |

## Findings, fixes and recheck

| Severity | Final source location | Finding, correction and evidence |
| --- | --- | --- |
| High | `web/src/styles.css:2528`, `web/src/App.tsx:34` | Initial demo notice scrolled away, and route focus could hide the page header. Made the notice sticky and focused main without scrolling. Browser computed sticky positioning and final scrolling views preserve the demo boundary. |
| Medium | `web/src/styles.css:2544` | At 320px the hero retained 20px bleed against 16px margins, producing 328px document width. Aligned bleed to 16px; all-route 320px recheck returned exactly 320px. |
| Medium | `web/src/core.ts:44` | Source review found an initial decoder inconsistent with Solidity `Balls.key`. Changed to 5-bit main fields and the bonus shift at bit 15. Exhaustive 5,700-combination round-trip test passes. |
| Medium | `web/src/App.tsx:25`, `web/src/Tickets.tsx:5` | Claim state was component-local and would reset on route changes. Lifted claim memory to the app; browser navigation away/back preserved delivered and retryable indices. Reload intentionally resets the labelled demo. |
| Medium | `web/src/Play.tsx:74`, `web/src/Play.tsx:201` | Invalid quantity had an alert but no input association/focus recovery. Added error reference, invalid state and focus to the field. The 101-ticket rejection and 100-ticket accepted total were exercised. |
| High | `web/src/LiveWorkspace.tsx:240` | Final source review found receipt timeouts shared the failure path. Submitted transactions now remain pending unless a reverted receipt proves failure, with a confirmation check and no enabled repurchase. Regression tests cover timeout, RPC outage, rejection and revert classification. |
| Medium | `web/src/contract.ts:569` | Receipt review found a shared vote and successful transfer could report two states for one index. Kept the last per-asset event; a focused receipt test verifies one final delivered result. |
| Low | `web/src/styles.css:2540` | Quick Pick's arrow wrapped awkwardly at 320px. Prevented control shrink/wrapping; final narrow view was inspected. |

No known blocking defect remains in the inspected default demo flows. This statement is bounded by the listed checks and is not proof of complete correctness.

## Remaining integration and delivery limitations

- **Public Website publication was not possible with the available tools.** Follow `web/README.md` to publish the complete `dist/` export. No approval was requested because the action was already authorized; the capability itself was absent.
- Mainnet addresses/block, runtime code hashes, public RPC, ABI release digest, vault/helper verification, company inputs and live canary remain external inputs. Nulls are intentional. Live code is typed and mocked where described, but funded wallet writes, actual VRF, real custody, live reorgs, helper behavior and wallet/network switching against deployed contracts were not executed. Do not activate from this report alone.
- The live workspace uses a lightweight confirmed-results view; the richer chamber replay is implemented for the default demo. In-memory log history rebuilds on reload and large histories benefit from the documented optional indexer. The current gallery is illustrative, not live metadata indexing or NFT pricing.
- HTTP static serving is verified. No actual IPFS pin/ENS deployment, offline-first service worker, cross-browser matrix, screen reader or independent accessibility audit was performed.
- The bundle check is recorded separately in `bundle-report.json`; it is a local payload accounting check, not the platform's final Git transport pack. The runner’s existing `.git/info/exclude` excludes root `artifacts/`; Git-eligible copies of all evidence are therefore retained in `web/evidence/`. The local bundle report counts these once. No ignore/exclude file was changed. Dependency directories/caches, temporary browser traces and ZIP archives are excluded; complete required runtime assets remain.
