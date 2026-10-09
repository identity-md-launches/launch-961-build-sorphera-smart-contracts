# Sorphera website

A responsive React 19 / TypeScript / Vite static site using the supplied Sorphera artwork. The default experience is **Demo - no real tickets or prizes**. It includes Home, Play, Draw room, My tickets, History and FAQ, with hash routes that survive static-host reloads.

## Install, preview and rebuild

Use Node.js 22.12+ (built here with Node 24.21.0 and npm 11.19.0).

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

The build writes the repository-root **`dist/`**, not `web/dist/`. `npm run preview` serves this export. `npm run dev` is available for editing. The checked-in `package-lock.json` pins the frontend dependencies; no contract build settings or dependencies are changed. If the user's npm cache is read-only, run `npm ci --cache /tmp/sorphera-npm-cache`.

The finished export also works without npm or a backend:

```sh
python3 -m http.server 4173 --directory dist
```

Visit `http://localhost:4173/`. To check an IPFS-style subpath, serve a parent directory with `dist` beneath it and visit `/dist/`. Serve over HTTP(S); browsers do not support module scripts reliably from `file://`.

## Publish

The publisher must serve the **contents of root `dist/`**, including its `assets/` and `brand/` directories. No rebuild, rewrite service, secret or assumed backend is needed. Vite's `base: './'` emits relative URLs. Routes use fragments such as `#play?game=1` and `#draw?scenario=nft-tie`.

For the IdentityMD Website workflow, select this repository/source submission and set the static export directory to `dist`. Publish the labelled demo with `web/src/deployment.json` unchanged. For IPFS, add the complete `dist` directory and use the resulting gateway path; do not copy only `index.html`.

**Publication limitation:** this worker session exposed shell and browser tools, but no Website publishing capability. The production export was built and inspected at a local `/preview/` path. No public URL or CID was created, and no claim of public publication is made. The local worker preview is ephemeral, not a durable website URL.

## What works in the demo

- **Budget first.** An editable total spending limit (default US$30) shows how many whole tickets fit after an estimated network fee, plus subtotal, estimated fee, all-in USD/ETH total and remaining budget, and explains when one ticket is unaffordable. The ETH/USD rate (US$2,500) and fee (0.0004 ETH) are fixed illustrative demo values in `src/budget.ts`, labelled everywhere and never a live quote. Wei arithmetic stays exact; nothing is added or purchased automatically.
- ETH and NFT selections with separate per game/round baskets that survive navigation; switching views never retargets entries. Accessible main/bonus globe picker, Quick Pick (selection only), "Generate N different entries" (distinct combinations), "Repeat these numbers", editable/removable lines, duplicate combinations, a flagged closed round and a maximum of 100 tickets per transaction.
- Round facts above the picker: prize, ETH + USD price, closing countdown with local time and timezone, ETH sharing versus one NFT winner, and expandable odds (1 in 5,700, no partial prizes).
- Review with one explicit demo-confirm action (rejection is an optional demonstration), then a receipt with the numbers, ticket count, amount, local closing time, countdown, "View your draw", "My tickets" and a calendar download.
- Nine event-based draw replays: ETH split, NFT tie, ETH rollover, NFT rollover, empty-inventory cancellation review, delayed draw oracle, delayed tie oracle, and two labelled fixture replays of the customer's own open rounds (simulated time, fixed outcomes independent of picks). Ball reveals follow supplied result events; no client random function chooses a result.
- Signature globe reveal: each ball arrives with its badge facing away, rotates in 3D with continents travelling across the sphere, decelerates to a stop with the number facing the camera, holds, then moves into its slot; the pink bonus globe has its own reveal. Numbers, match counts, payouts and winners (including screen-reader announcements) are withheld until the balls stop. Personal entries are highlighted as balls stop, with a per-ticket outcome; multiple NFT matches end in a paginated tie finale that reveals the confirmed winner only after the separate tie-break result.
- Pause/resume, replay, skip-to-results, sound (muted by default; spoken callouts only after enabling) and reduced-motion controls (static quick reveals). The reveal stage is lazy-loaded with a lightweight fallback; results and controls are identical either way.
- My tickets separates your demo entries from labelled sample winners/refunds/rewards and lets you advance your own round into the fixture replay. The default NFT claim succeeds with a receipt and illustrative thumbnails; failed delivery, incompatible recipient and per-asset retry sit under "Demo scenarios". Separate incidental ETH, claim limits, claims during paused sales and purchaser reward queue versus delivery are preserved. Claim state survives navigation in this page session. Reloading resets synthetic tickets and claims.
- Synthetic gallery with artwork details, result history, explanatory disclosures and contract/risk FAQ. All amounts, identifiers, inventory, schedules and results in this experience are fixture data, not deployed values. There are no fabricated explorer transaction hashes or actual NFT valuations.

The demo adapter accepts no wallet/provider, exposes no signer and never signs or broadcasts. The Wallet button explains that connection is unavailable in the demo. The live wallet library and contract workspace are in a separate lazy chunk.

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

NFT metadata is untrusted: `safeMetadata` limits name length and allows only HTTPS image URLs, React renders text without HTML injection, and no iframe/SVG/data-URL metadata is executed. The current gallery is local supplied artwork and performs no third-party metadata fetch.

## Validation and limitations

See `evidence/validation.md` (change notes, browser checks, Better Interface review, recording limitations), the actual command logs `evidence/typecheck.txt`, `evidence/tests.txt` and `evidence/build.txt`, screenshots and `evidence/reveal-nft-tie.gif`, plus `../DESIGN.md`. Latest run (2026-10-09): typecheck exit 0, **39 tests passed, 0 failed**, production build exit 0. The browser inspected the exported site under `/preview/`, not the development server, at 1280 px and 390 px, including emulated reduced motion. Tests exercise number validation, all 5,700 packed combinations, price/batch calculation, USD/budget math, distinct versus repeated picks, basket switching, game/round identity, premature spoilers, NFT ties, replay/skip/reduced-motion equivalence, demo isolation, activation, reorg recovery, claims and reward delivery.

The recording is a GIF assembled from sequential element screenshots (about 2.5 frames per second), not a video capture; mid-rotation frames are sparse. No physical device or screen-reader session was run.

No genuine deployment inputs were provided, so the live adapter and workspace are implemented and typechecked, with mocked receipt/index/claim tests, but not verified through a funded wallet or a live lottery. Real VRF, wallet extensions, collection behavior, RPC CORS/rate limits and cross-wallet interoperability remain untested. The production draw view uses confirmed data and a lightweight results presentation; the theatrical replay experience is the default demo. No screen-reader session, physical-device test or exhaustive accessibility certification is claimed.

## Packaging

Submit source in `web/`, root `dist/`, root `DESIGN.md` and the validation/screenshots in `artifacts/`. Keep the package manifest and lockfile. Exclude generated `node_modules` at every depth, package caches, traces and the original ZIP. No ignore file is changed. The worker removes transient dependencies and browser traces before handoff and records the final payload-byte check. All four supplied images are optimized locally, with alpha and proportions preserved; cropped board details are additional derivative assets. See `THIRD_PARTY_NOTICES.md` and `licenses/`.

The runner already excludes root `artifacts/` from Git. Attachment originals remain there; `web/evidence/` preserves the same validation, logs and screenshots in the source submission. No Git exclude or ignore configuration was modified. The byte-budget report counts Git-eligible deliverable files, with the evidence included once.
