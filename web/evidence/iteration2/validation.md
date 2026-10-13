> Packaging note (13 October 2026): The superseded procedural-globe `reveal-stopped.png` has been removed from the delivery bundle to meet its size limit. The current stopped globe and complete 360-degree comparisons are in [continuity](../continuity/index.html); the record below describes the earlier run.

# Sorphera website iteration 2: plush globes, Passport, Atlas teaser

2026-10-13. Baseline at start: `ebd87a3a2787339b2838485a0384d25040bbc44f` (merged PR #6), clean tree. Scope: one plush globe asset family matching the photographed references, the draw animation on that family, the 12-stamp Passport (demo/simulated), the three-globe Atlas teaser, documentation and the developer handoff. Contracts, ABIs, deployment settings, build configuration, dependencies, lockfiles and ignore files are unchanged.

## Commands and actual results

Dependencies were installed from the unchanged `web/package-lock.json` into an isolated `/tmp/sorphera-build/web` mirror (`npm ci --no-audit --no-fund`), the source was synced there for each run, and the finished `dist/` was copied back. No generated dependency directory exists in the repository.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (typecheck) | Exit 0 |
| `npx tsx --test src/core.test.ts` | 46 passed, 0 failed (41 existing + 5 passport/budget tests) |
| `npx vite build` after the final source change | Exit 0; root `dist/` with relative asset URLs |
| Playwright interaction flow (`test/scratch/flow.mjs`, Chromium headless, served under `/preview/`) | 35 passed, 0 failed; no page errors, console errors or failed requests |
| taste@1 probe (`node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste`) | 14 of 16 passed, up from 9 of 16 on the baseline export |

Interaction flow coverage: no horizontal overflow on all six routes at 390; product and "Make your picks" on the first screen at 390; Atlas section with three globes and the exact copy; Buy-12 card; sample passport at 8 of 12 with 3 pending shown separately; simulated finality moves it to 11 of 12; the basket projects "0 of 12 and 1 new free ticket" while no "Use" button appears before earning; checkout shows paid subtotal, estimated network fee and all-in total; two rapid confirm clicks create exactly one entry; the receipt shows paid/reward quantities and "card complete: 1 free ticket earned"; finality then yields "1 free ticket available"; reload keeps it; "Use free ticket" enters reward mode, adds one reward line, and the second use is blocked while one is reserved; a free-only basket shows US$0.00 paid subtotal with the 0.0004 ETH fee; a rejected demo approval preserves the reward; the following successful confirmation produces a free-only receipt that earns no stamp; My tickets lists "Your reward ticket"; the reward is consumed once; switching to Demo wallet B shows 0 of 12 and none of A's tickets; switching back restores A. Unit tests cover 11+1, 11+3 and 24 boundaries, pending/refunded/failed/off-price exclusion, idempotent purchase ids, one-use redemption, projection not being spendable, free-only fee and per-game basket separation.

## Plush globe match

The procedural renderer was rebuilt against `eth-ball.webp`, `nft-ball.webp` and the brand board. Colours were sampled from the reference pixels (ETH felt top `#9bbfe0`, mid `#85aacd`, shadow `#2c4966`; pink continents `#f68ec1`; NFT felt `#fda2bc` to `#8d3e54`, cream continents `#f4d9cd`). The model has quilted seams, raised continents with rounded edges and contact shadows, a padded cream badge with a stitched rim at the photographed proportion (about 0.36 of the radius), and rounded 900-weight black numerals. Fronts were compared with the references at 185px and at picker sizes (56px, 45px) in a side-by-side render; the Google Drive originals were not downloaded (the local references were sufficient and no new upload was needed). Residual differences, by honest inspection: the photographs have finer, directional fibre and more irregular hand-cut continent edges than the procedural felt, and the photographed badge rim is slightly thicker. Tests cannot prove a visual match; the renders in `home-390.png` and `reveal-stopped.png` are the evidence.

The draw animation keeps the previous clock: badge-away entry, 1.5s decelerating turn with the badge following the curved surface (see `reveal-turning` in the probe run: the badge is seen edge-on mid-turn), stop facing the viewer, 0.85s hold with the number, travel into the slot at the same orientation. Pause/resume, replay, skip, muted-by-default audio, reduced motion and the NFT tie-break are unchanged and were exercised by the interaction flow (watch, skip). Rear and side views are true renders of the same sphere, not flipped crops.

## Better Interface review (six domains)

| Domain | Coverage | Findings and fixes | Limits |
| --- | --- | --- | --- |
| Accessibility | Keyboard flow through passport, reward mode, review and receipt; `role="status"` on progress; stamps carry an `aria-label` summary; Atlas globes have `role="img"` labels; focus rings stay outside the art; completion animation disabled under reduced motion | None open | No native screen-reader session or physical device |
| Layout | All routes at 390 and 1440, 320 via probe; Atlas and ledger responsive rules | None open | Native zoom not tested |
| Writing | Short literal copy; demo labels next to features; no urgency or over-budget prompts | Footer repeated the tagline (probe `repetition`): replaced with "Powered by FWA" (`App.tsx`) | — |
| Typography | Type scale consolidated to 7 sizes plus display clamps; weights 400/600/700; label token de-capitalised | `.eyebrow` tracked capitals on every section (probe `casing`, `tracking`, `eyebrows`): token changed in `styles.css`; `h2`/`h3` tracking loosened | Probe still counts 9 sizes at 390 because `clamp()` headings and two 10px one-offs resolve to extra pixel values |
| Colors | Tokens unchanged; new tints derived from tokens; probe contrast pass on all solid pairs | None open | Text over canvas/gradients unmeasured |
| UI | Empty, pending, finalized, refunded, earned, reserved, rejected, failed and completed passport states; free-only checkout; identity switch | Receipt showed the new empty card instead of the completed one on card completion: fixed in `Play.tsx` | No WebKit run |

Remaining probe failures: `eyebrows` flags the "Demo round 42" pill above the jackpot amount on the two existing jackpot cards (a round label, left as designed); `type-sizes` counts 9 sizes at 390 against a bar of 6 (see Typography).

## Limitations

- Browser checks ran in headless Chromium only; WebKit and physical phones were not tested.
- Passport persistence is browser local storage per demo wallet; it is demo data and is labelled as such. Finality and refunds are simulated by two labelled controls on My tickets.
- Both demo rounds use the standard price, so price ineligibility is covered by unit tests and the guard copy rather than by a visible different-price round.
- The Google Drive high-resolution originals were not fetched; the bundled references were used.
- Screenshots in this folder: `home-390.png`, `atlas-390.png`, `receipt-free-1440.png`, `reveal-stopped.png`.
