# Sorphera

**Weekly ETH & NFT lottery ball jackpots. Powered by FWA.**


## Website demo

The Sorphera website source is in **[web/](web/README.md)** and its finished static export is in **[dist/](dist/index.html)**. It defaults to **Demo - no real tickets or prizes**. All deployment addresses remain null; this work deploys no contracts and enables no public sales.

```sh
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` writes root `dist/`. Publish that complete directory with the Website workflow or any static/IPFS host; assets are relative and routes use hashes. The worker attempted IMD CLI publishing, but the service refused it with **503 `member_sites_closed`**; public publication is still pending. The local preview and exported pages were tested; no public preview URL is invented.

See [install, preview, rebuild, publish and integration setup](web/README.md), [implemented design](DESIGN.md), [current checks and limitations](web/evidence/iteration/validation.md), and [before/after screenshots and continuous reveal clip](web/evidence/iteration/index.html). The supplied four brand PNGs were inspected and optimized. Contract source, tests, configuration and original ABI exports are preserved. The demo is a useful website deliverable, not a claim of launch readiness.

Ethereum mainnet contracts, offline Foundry tests, pinned mainnet-fork integration tests, deployment rehearsals and ABI artifacts. A labelled demo website is now included; no new token/pool. No transaction was broadcast and public sales remain disabled.

Launch **961 remains parked on Sepolia**; this source continuation does not redeploy or retarget it. Mainnet dependencies are recorded at block **26,145,236**. See [mainnet evidence](docs/MAINNET.md), [constructor investigation](docs/REHEARSAL.md), [deployment preparation](docs/DEPLOYMENT.md), and [test report](docs/TESTING.md). Company owner/treasury, subscription and launch schedule remain explicit inputs; undeployed addresses are null.

## Current contract continuation

The continuation of merged PR #2 fixes a reproduced NFT cancellation race, adds frozen per-round VRF reserve checks, and supplies executable keeper and Sepolia canary CLIs. See [current verification and handoff](docs/CONTINUATION.md), [automated adversarial review](docs/REVIEW-CONTINUATION.md), [keeper commands](docs/KEEPER.md), and [canary commands](docs/CANARY.md). Permanent accepted VRF nonfulfillment remains unresolved; no reroll, timeout cancellation or replacement winner was introduced. Live Sepolia execution and the private IMD gate remain external prerequisites.

## Build and check

Requires Foundry and solc **0.8.26**. Forge standard-library **v1.9.7** source and licenses are vendored as ordinary files under `lib/forge-std`; there are no submodules or package downloads during verification. `foundry.toml` pins compiler, Cancun, optimizer, via-IR, and `bytecode_hash = "none"`. No FFI or filesystem cheatcode permission is enabled.

```sh
forge build
forge test
forge fmt --check
python3 tools/export.py
```

The ordinary suite needs no network, environment variables, wallet or RPC. Mock simulation uses a separately named test subclass on chain 31337; production validates chain/coordinator/key bindings. The integration profile must be filtered by chain:

```sh
FOUNDRY_PROFILE=integration forge test --match-contract SorpheraMainnetForkTest \
  --fork-url "$MAINNET_ARCHIVE_RPC" --fork-block-number 26145236 -vv -j 1
FOUNDRY_PROFILE=integration forge test --match-contract SorpheraSepoliaIntegrationTest \
  --fork-url "$SEPOLIA_ARCHIVE_RPC" --fork-block-number 11866914
```

Mainnet tests use deployed FWA code unchanged and explicitly simulate oracle fulfillment on the fork. They do not prove live VRF proofs/billing. Published Sepolia FWA still represents the historical incompatible builder version, not a production alternative.

## Contracts

| Contract | Purpose |
| --- | --- |
| `Sorphera` | Both independent game schedules, nontransferable tickets, combination indices, lottery VRF callbacks, results, ETH liabilities and claims |
| `SorpheraRouter` | Immediate `FWAV2.acquire` caller, exact forwarding and overpayment return, company-owned builder allowance claims |
| `SorpheraVaultFactory` | Creates a separate immutable purchaser vault for every game/round; only the owner-registered `Sorphera` lottery may call it, so `VaultCreated` is a trustworthy discovery index |
| `SorpheraVault` | Round acquisition budget, purchaser rights, fixed settlement choice, NFT custody/recovery, purchaser token rewards and asset claims |

Game **0** is **Sorphera ETH Jackpot**. Game **1** is **Sorphera NFT Jackpot**. Each ticket belongs to exactly one game/round and cannot transfer. Players choose three distinct unordered numbers 1–20 and one bonus 1–5. There are 5,700 equally likely combinations. Multiple identical tickets and multiple tickets per wallet are allowed.

Default published price is `DEFAULT_PRICE() = 0.005 ether`; the initial rules setter takes that value explicitly. Every new sale allocates exactly 10% to held operator fees and 90% to that round's vault. Prices must be multiples of 10 wei, avoiding fee rounding by batch composition. Fees, number ranges and all round deadlines are immutable once the round opens. Future price/acquisition policy changes never modify an existing round.

There is no sales cap. A purchase contains at most 100 tickets; acquisition at most 8 pulls; reconciliation/processing at most 50 items; an NFT claim at most 20 assets; epoch reward collection at most 32 epochs. Claims do not scan ticket sales or inventory. Results look up an indexed combination and directly index the matching-ticket list.

## Money and outcomes

Acquisition spend is limited to the **originating round's new-sale budget**, including FWA VRF charges. Quotes, fee caps, total-cost caps, weighted-backing minimum, slippage, blackout and deadline are checked on every acquisition. Carryover, cashouts, refunds, purchaser rewards and operator fees cannot fund additional pulls. Lottery Chainlink VRF uses a separately funded company subscription; keepers pay their own transaction gas.

At cutoff the vault stops acquiring and exports unused budget and actual recovered ETH. Draws require zero unreconciled requests, no known unwithdrawn acquisition refund credit, and expired sales/earliest-draw deadlines. Each vault retains custody of its assets; an accounting group connects consecutive rollovers without moving an entire NFT inventory or iterating old rounds.

| Outcome | ETH jackpot | NFT jackpot |
| --- | --- | --- |
| One exact match | That ticket claims the entire ETH prize | That ticket claims all inventory and incidental ETH |
| Multiple exact matches | Equal ETH amount per matching ticket, including duplicates | A separate VRF request uniformly selects ONE matching ticket for all inventory; fees and claims wait for that result |
| No exact match | ETH carries to the next round; old tickets expire | Inventory and residual funds carry to the next round; old tickets expire |
| Zero tickets | No VRF request; carryover retained | No VRF request; carryover retained |

ETH prize is **actual cashouts + unused budget + refunds + ETH carryover**. Its value is never guaranteed. Winning ETH division dust goes to the next unresolved group of that game. Unpaid winnings remain reserved indefinitely; no owner sweep or expiry. Late recoveries increase the original terminal winner/refund entitlements or the still-active rollover group, never company revenue.

NFT purchases expose only `keepNFT`; there are no voluntary cashouts, sales, relisting or substitutions. The single exception is fixed by state, not by a caller: an allocation that is settled after its NFT round is already **cancelled** takes the ETH depositor bid, because a cancelled round has no jackpot and its ticket holders are owed divisible refunds, not a shared indivisible NFT. Every recorded asset includes collection, token ID, acquisition ID, listing ID, originating game/round and custody. `ownerOf(vault)` is checked before recording and before transfer; notifications are not evidence of custody. The vault's ERC721 receive hook records the physical receipt time per token, so an asset delivered before the settlement deadline counts even when it is reconciled afterwards. Secured inventory count is frozen before lottery randomness is requested.

A delivery FWA itself could not complete (the collection rejects transfers to the vault and FWA names the vault as `stuckNFTRecipient`) records no custody and is **not** left pending: the acquisition is terminal for draw accounting, the vault emits `DeliveryStuck`, and `recoverNFT` can retry FWA's purchaser-only recovery at any later time. A recovered asset then follows the originating round's winner, rollover group or refund cohort as a late in-kind recovery. Waiting for it would otherwise freeze the round's prize, its fees and every later round of that game. A winner nominates a compatible recipient and claims assets individually or in bounded batches; a rejected transfer stays claimable and does not undo other successful transfers in that batch.

If **no NFT was secured before the settlement deadline**, including carryover, the NFT round cancels before any lottery VRF request. All available prize ETH **and this round's held fees** become equal per-ticket refunds; late ETH/token recoveries remain refundable. Third-party acquisition/VRF charges and losses can make the refund smaller than the ticket price. Cancellation rounding residue remains reserved for those tickets and combines with later receipts. Once randomness is requested, cancellation is impossible.

External FWA timeout settlements can defeat the desired asset choice. These exceptions and the treatment of involuntary NFTs as shared recovery assets are explicit in [operations](docs/OPERATIONS.md); they are never valued as ETH or used to promise a refund. Purchaser FWA rewards, if any, are additional in-kind prizes; they are not assumed emissions or counted as ETH.

## After launch

`launch.json` records the parked Sepolia launch. The separately labelled `deployments/mainnet.launch.json` describes mainnet constructor order, explicit `$owner`, backward references and the mainnet coordinator. Constructors send no ETH and assign no ownership to the deploying factory. Applications start with sales disabled; round vaults are created later on-chain. [Deployment export](frontend/deployment.json) intentionally has `null` addresses/blocks until a real deployment receipt exists.

The owner must perform these steps with real deployment values; none was guessed:

| Setter/action | Required value and source |
| --- | --- |
| Factory `setLottery(lottery)` | The deployed `Sorphera` address from the deployment receipt, once. The factory is deployed before the lottery, so the binding cannot be a constructor argument. Until it is set, `openRound` reverts `Sorphera: lottery not bound` and `validateLaunch` reverts `Sorphera: factory not bound`. Only the registered lottery can create vaults. |
| Router `configure(pool, helper)` | The verified **mainnet** pool and helper in `deployments/mainnet.json`, or explicitly controlled Sepolia canary dependencies. Obtain addresses from the FWA deployment owner/release and verify live code, ABI, rewards, token, market, canonical Permit2 and distributor permissions. The published legacy Sepolia pool fails the check. Registration is permanent per pool; future pool registrations affect only newly opened vaults. |
| Lottery `configureRules(game, rules)` | Configure each game separately. Use `0.005 ether` price by default; choose distinct initial cutoff timestamps, draw delay and settlement delay. Sales windows are exactly seven days. Pick documented fee/total/weighted-value/slippage bounds from live FWA quotes. Deadline and initial schedule choices are owner-settable before sale; no missing timestamp is fabricated. |
| Lottery `configureVRFReserve(linkJuels,nativeWei)` | Company-selected reserve floors before opening rounds, based on coordinator billing estimates and concurrent consumer demand. Zero retains only the legacy positive-balance guard. Each round freezes its selected-currency floor. |
| Lottery `configureRandomness(config)` | The company's own Chainlink v2.5 subscription ID, network-specific published key hash, confirmations, callback gas and payment currency. Get/create the subscription in [Chainlink's subscription manager](https://vrf.chain.link/). Key/coordinator references are in [mainnet evidence](docs/MAINNET.md) and [deployment preparation](docs/DEPLOYMENT.md). Default operational suggestion: 3+ confirmations and 200,000 callback gas, validated in a test deployment. |
| Chainlink subscription | Add `Sorphera` as consumer and fund with company LINK or native ETH. Never use FWA's subscription ID, a made-up ID or prize assets. |
| Lottery `validateLaunch()` | Confirms the deployment chain (1 or 11155111), published coordinator and active key, coordinator gas/confirmation limits, configured FWA dependencies, nonzero VRF funding, registered consumer, both game rule sets and that the factory is bound to this lottery. This is a structural check; deployment review must also validate key hash, subscription adequacy, permissions, and an end-to-end canary. |
| Lottery `setSalesEnabled(true)` | Enable only after those dependency/configuration/funding checks and the release review. `false` pauses sales only; settlement, claims and recovery continue. |
| Permissionless `openRound(game)` | At/after that game's seven-day window begins and after the previous round finishes. Creates its immutable vault and snapshots settings. |

Subscription reconfiguration automatically disables sales and invalidates launch validation. Existing rounds retain their original subscription/key/gas settings; changing future config cannot replace a pending request. Coordinators are immutable. A subscription owner can remove/fund/cancel their subscription outside Sorphera; that is an external liveness responsibility, not a reroll option.

Owners use two-step ownership transfer. They can change future settings, pause sales, withdraw only released fees, and claim actual router builder rewards to company recipients. They cannot edit entries, replace randomness, select winners, cancel after a request, seize prizes, alter active rules, or drain round vaults. No upgrade mechanism exists.

Read [operations and delay handling](docs/OPERATIONS.md), [frontend/replay interfaces](frontend/README.md), and [testing/review notes](docs/TESTING.md). Independent adversarial review and a real compatible-dependency canary remain release requirements; this implementation's tests are not a security audit.
