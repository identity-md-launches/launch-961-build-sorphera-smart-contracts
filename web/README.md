# Sorphera website

The existing React 19 / TypeScript / Vite static site uses the supplied Sorphera artwork. Home, Play, Draw room, My tickets, History and FAQ use hash routes. The default is **Demo - no real tickets or prizes**.

## Install, preview and rebuild

Use Node 22.12+ (validated here with Node 24.21.0 and npm 11.19.0).

```sh
cd web
npm ci
npm run typecheck
npm test
npx tsx --test src/schedule.test.ts
npm run build
npm run preview
```

The unchanged `package.json` and `package-lock.json` pin dependencies. The build writes repository-root **`dist/`**. `npm run dev` is available for editing; preview serves the built export. With a read-only npm cache, use `npm ci --cache /tmp/sorphera-npm-cache`. To serve the export without Node:

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173/`. Use HTTP(S), not `file://`, for module scripts. Serve the entire `dist/` directory, including `assets/` and `brand/`. Relative asset URLs (`base: './'`) and hash routes work at a gateway subpath without a rewrite service. No external font, registry mirror, private credential or backend is needed to serve the demo. Publication belongs to the launch platform; this task ran no publishing command.

## Current globe and schedule update

- **One continuous plush family.** Source-photo fibres are synthesized without mirrored swatches, joined in sphere space, and combined with raised, rounded applique, contact shadows, panel seams and one front badge. The approved central front photograph and dynamic curved black digits remain. Blue/pink and pink/cream share the material, mesh and lighting across pickers, stage, slots, baskets, receipts and software fallback. Source/provenance and deterministic rebuild instructions: [artwork/README.md](artwork/README.md). The animation still enters badge-away, eases through a 1.5-second turn, stops, holds for 0.85 seconds and travels to its slot. Pause/resume, replay, skip, muted-default audio and reduced motion remain.
- **Two independent schedules.** Round 42 cutoff anchors are ETH `2026-10-18T00:00:00Z` and NFT `2026-10-18T01:00:00Z`. The explicitly simulated draw-window gap is 30 minutes, not a production policy. Later rounds add seven days and use different IDs. The first visit selects an identity by the UTC week; the selection persists. Time passing never advances a stored round. After cutoff, an explicit “Explore next simulated round” action can select the next identity. Exact round links keep their original deadline.
- **Cutoff is not draw time.** `Round` / `ContractAdapter` carry the contract's `earliestDraw`, `settlementDeadline` and `requestedAt`; `drawDelay` is derived from `earliestDraw - cutoff`, with no ABI change. `earliestDraw` is the earliest request time, after FWA reconciliation. Fulfillment, finalization and possible NFT tie-breaks can delay numbers. One shared clock displays days/hours/minutes, adding seconds inside the final hour, and refreshes on visibility/focus/page resume. UTC timestamps are stored internally; dates show local time with a zone. Missing times are labelled unavailable.
- **Upcoming Draw Room.** `#draw` defaults to upcoming rounds, with an ETH/NFT switch and the draw-window countdown first. `#draw?game=1&round=42` opens that exact round. Past replay and fixture previews are explicitly separate simulations; existing `#draw?scenario=nft-tie` and other scenarios still work. Unknown game/round/replay links do not substitute results. Only supplied confirmed events enable reveal outcomes; a zero countdown cannot create a winner or reopen sales.
- **Safe drafts and records.** At cutoff both paid and reward review/confirmation disable, including a modal opened earlier. Confirmation checks again before and after the demo pending delay. Pauses, closure and delayed results preserve budgets, Passport stamps and unused rewards. Entries, timestamps and per-round drafts persist per demo identity in a new `sorphera.demo.entries.v2:*` namespace. Existing Passport v1 records remain untouched; missing old ticket schedules are not replaced with guessed deadlines. Old drafts can be revisited or explicitly removed to release reserved rewards.
- **Honest calendars.** “Add draw-window opening to calendar” and “Add sales-closing reminder” create distinct RFC5545 events, UIDs, timestamps and filenames. Both include the exact game/round link; the draw event includes the delay caveat. No sales reminder is relabelled as a draw appointment.

## Preserved product behavior

USD budget limits, exact wei arithmetic, estimated fees and the illustrative US$2,500/ETH rate remain. Invalid or exceeded budgets block checkout in the UI and handlers. Demo wallet identities remain isolated. No provider, signer, transaction or real prize is used in demo mode.

The **Passport** earns one stamp per finalized eligible paid ticket; every 12 earns one free entry, shared across games. Pending, refunded, failed and free entries do not incorrectly earn stamps. Reward entries have the same draw rights; the network fee remains visible. The **Atlas** teaser retains Canada, Japan and Brazil concept globes without a sale, mint or utility claim. See [Passport handoff](../docs/PASSPORT-HANDOFF.md).

## Checks and evidence

See [current validation](evidence/continuity/validation.md) and the [comparison/clip viewer](evidence/continuity/index.html). These supersede the visual and timing descriptions in earlier evidence directories. Current results include build/typecheck, 46 unchanged unit tests, 12 added timing tests, 10 production-export browser flows, 3 paused/reward flows and 16/16 pinned design-probe checks. Both WebGL and software reveal checks were run separately; actual outcomes and frame timings are recorded with the clips.

From the repository root, with Playwright installed as **external test tooling**:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node web/tests/schedule.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs ESBUILD_MODULE=/path/to/esbuild/lib/main.js node web/tests/paused-checkout.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs ESBUILD_MODULE=/path/to/esbuild/lib/main.js node web/tests/plush.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node web/tests/reveal.mjs
SOFTWARE=1 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node web/tests/reveal.mjs
```

Scripts start/close their own bounded HTTP servers. `PLAYWRIGHT_BROWSERS_PATH` can select an external browser installation; schedule/reveal also support `CHROMIUM_PATH`. The pause test bundles real components with a test-only sales-state hook; this hook is absent from `dist/`. Schedule/reveal tests serve the production export under `/preview/`. The plush harness bundles the renderer source against built material assets and also checks export reflow. `npm test` runs the existing suite; the additional schedule suite is invoked explicitly because the package manifest is preserved.

The pinned design probe command was `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` with `IMD_PLAYWRIGHT` pointing to external tooling. Pinned inputs are removed by the runner; the report is preserved here. Chromium used SwiftShader for WebGL and a forced WebGL-disabled Canvas run. WebKit did not complete a launch; physical devices, screen readers and native 200% zoom were not tested. A passing automated check is not a security or accessibility guarantee.

The runner ignores root `artifacts/` already. Tests write there or in `test/scratch/`; deliverable evidence is copied once to **`web/evidence/continuity/`** so it survives submission. No ignore file was edited. No dependency directory, registry archive or cache belongs in the submission. The finished runtime maps remain in both `web/public/` and `dist/`, as required for rebuild and static serving.

## Integration inputs and activation

`src/deployment.json` deliberately keeps addresses, deployment block, RPC URL, ABI digest and runtime hashes **null**, with `mode: "demo"` and `transactionsActivated: false`. The source's historical parked Sepolia launch is never inferred to be the current lottery. Only Ethereum mainnet is supported; there is no unlabelled Sepolia mode or synthetic FWA deployment used as a production dependency.

The deployment owner must supply a genuine Ethereum mainnet deployment, exact Sorphera/router/factory addresses and deployment block, a browser-accessible HTTPS RPC, a reviewed confirmation policy, verified runtime-code hashes for the three contracts, **every originating vault used for claims**, and the purchaser reward helper. `runtimeCodeHashes.vaults` maps lowercase vault addresses to their exact code hashes, including immutable bindings. Never substitute a template vault hash. The ABI digest is SHA-256 of the JSON serialization of `[sorpheraAbi, sorpheraVaultAbi, sorpheraRouterAbi, sorpheraVaultFactoryAbi]`; `abiDigest()` implements it. Verify it against the release's preserved ABI exports rather than blindly accepting a generated value.

A full configuration follows the `Deployment` interface in `src/contract.ts`. Do not fill nulls with stand-ins. Choose `read-only` to view verified data while keeping transactions disabled. Only `mode: "transactions"` **and** `transactionsActivated: true` can permit writes, after runtime verification and wallet chain/account checks. This is a build-time deployment setting; no customer control can activate it. RPC URLs are public in static exports: do not embed private API keys or other secrets.

Before a real release, complete the baseline's company inputs, subscription funding, independent review and real compatible-dependency canary described in `../docs/CONTINUATION.md`. This website does not perform those operations. No deployment, keeper, sale activation or fund spending was performed. **This delivery is not launch readiness.**

## Contract behavior

`ContractAdapter` uses viem and the canonical ABI signatures. It verifies chain, runtime bytecode, ABI fingerprint and lottery/factory/router bindings. Buy re-reads the round, compares the reviewed price/identity, checks the latest block time and sales eligibility, calculates exact value, simulates, and checks the signer again. UI states distinguish wallet rejection, pending receipt, confirmed receipt and failure. A receipt timeout does not imply cancellation; keep the transaction hash and check its explorer status before retrying a purchase.

ETH wins and cancellation refunds both call `claimETH`; claims are not gated on `salesEnabled`. NFT claims verify the origin vault, current entitlement, current custody and recipient acknowledgement, use at most 20 distinct indices and interpret `NFTClaimed`, `NFTClaimFailed` and `SharedAssetVote` separately. The live claim dialog offers confirmed source rounds so rollover assets can be claimed from their originating vaults. A source outside the ticket's group fails the onchain entitlement check. Purchaser tokens call `claimTokens`, and matured helper delivery calls the pinned helper's `claim(recipient)`. Only a matching, confirmed helper `Claimed` event reports delivery. Shared-asset votes can remain unresolved indefinitely. Recipient acknowledgement cannot guarantee that a malicious or unusual ERC721 collection will deliver; failures remain explicit and retryable.

`ConfirmedIndexer` pages 1,000-block log ranges, at most five pages per sync, starting at the supplied deployment block. It caches and deduplicates concurrent calls in memory; keys contain chain, lottery, game, round, request and log identity. It verifies the page boundary before/after scanning and the previous checkpoint hash before continuing. A reorg discards the cache and rebuilds from deployment. Confirmed events are replayed in block/log order, and RPC failures clear displayed live results. Each ticket page has 20 entries; each inventory read is bounded to 20 assets. Logs are filtered to the verified lottery address, keeping FWA request IDs in a separate namespace. NFT custody-review progress is read from its bound vault while a round remains Closed.

For a large deployment, an optional indexer can persist logs and owner filters outside the browser. It must retain block hashes, remove orphaned logs, partition chain/contract/game/round/request identities and deliver only events with the selected confirmation policy. Cross-check its claims, latest round state and custody through the RPC before signing. This export assumes no such service. The supplied implementation rebuilds the in-memory index after a page reload and caps the visible result list to the latest 20 indexed rounds.

NFT metadata is untrusted: `safeMetadata` limits name length and allows only HTTPS image URLs, React renders text without HTML injection, and no iframe/SVG/data-URL metadata is executed. The demo uses neutral NFT placeholders and performs no third-party metadata fetch; the globes are branding and lottery balls, not prize NFTs.
