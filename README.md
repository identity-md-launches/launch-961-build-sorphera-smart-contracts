# Sorphera

**Weekly ETH & NFT lottery ball jackpots. Powered by FWA.**

Ethereum Sepolia contracts, offline Foundry tests, a separate live-fork compatibility suite, and frontend ABIs. No website, new ERC20, liquidity pool, proxy, key handling, or broadcast.

**Deployment is disabled pending a compatible FWA Sepolia deployment.** Read-only verification at Sepolia block **11,866,914** found that the [published pool](https://www.fwa.fun/docs/v2-sepolia) uses an older rewards integration without builder attribution. Its linked rewards module does not implement `builderRewardBps()`. The [current builder documentation](https://www.fwa.fun/docs/builder-revenue) and [reference implementation](https://github.com/adamlizek/fwa-examples) describe a newer interface. `SorpheraRouter.configure` rejects the published incompatible dependency. Mocks implement the intended newer interface explicitly; they are not substitutes for live validation. Details and raw evidence: [dependency verification](docs/DEPENDENCIES.md).

## Build and check

Requires Foundry and solc **0.8.26**. Forge standard-library **v1.9.7** source and licenses are vendored as ordinary files under `lib/forge-std`; there are no submodules or package downloads during verification. `foundry.toml` pins compiler, Cancun, optimizer, via-IR, and `bytecode_hash = "none"`. No FFI or filesystem cheatcode permission is enabled.

```sh
forge build
forge test
forge fmt --check
python3 tools/export.py
```

The ordinary suite needs no network, environment variables, wallet, or RPC. It uses reproducible named mocks. Run real-dependency read checks separately:

```sh
FOUNDRY_PROFILE=integration forge test \
  --fork-url YOUR_SEPOLIA_RPC_URL \
  --fork-block-number 11866914
```

This pinned fork suite confirms wiring, quote/window reads, and the known incompatible builder ABI. It does **not** establish a working end-to-end FWA purchase or production VRF delivery. Revalidate a proposed replacement deployment and its verified source before activation. No live transactions were made.

## Contracts

| Contract | Purpose |
| --- | --- |
| `Sorphera` | Both independent game schedules, nontransferable tickets, combination indices, lottery VRF callbacks, results, ETH liabilities and claims |
| `SorpheraRouter` | Immediate `FWAV2.acquire` caller, exact forwarding and overpayment return, company-owned builder allowance claims |
| `SorpheraVaultFactory` | Creates a separate immutable purchaser vault for every game/round |
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
| Multiple exact matches | Equal ETH amount per matching ticket, including duplicates | One matching ticket selected uniformly by a separate stream of the same verified round randomness wins everything |
| No exact match | ETH carries to the next round; old tickets expire | Inventory and residual funds carry to the next round; old tickets expire |
| Zero tickets | No VRF request; carryover retained | No VRF request; carryover retained |

ETH prize is **actual cashouts + unused budget + refunds + ETH carryover**. Its value is never guaranteed. Winning ETH division dust goes to the next unresolved group of that game. Unpaid winnings remain reserved indefinitely; no owner sweep or expiry. Late recoveries increase the original terminal winner/refund entitlements or the still-active rollover group, never company revenue.

NFT purchases expose only `keepNFT`; there are no voluntary cashouts, sales, relisting or substitutions. Every recorded asset includes collection, token ID, acquisition ID, listing ID, originating game/round and custody. `ownerOf(vault)` is checked before recording and before transfer; notifications are not evidence of custody. Secured inventory count is frozen before lottery randomness is requested. A winner nominates a compatible recipient and claims assets individually or in bounded batches; a rejected transfer stays claimable and does not undo other successful transfers in that batch.

If **no NFT was secured before the settlement deadline**, including carryover, the NFT round cancels before any lottery VRF request. All available prize ETH **and this round's held fees** become equal per-ticket refunds; late ETH/token recoveries remain refundable. Third-party acquisition/VRF charges and losses can make the refund smaller than the ticket price. Cancellation rounding residue remains reserved for those tickets and combines with later receipts. Once randomness is requested, cancellation is impossible.

External FWA timeout settlements can defeat the desired asset choice. These exceptions and the treatment of involuntary NFTs as shared recovery assets are explicit in [operations](docs/OPERATIONS.md); they are never valued as ETH or used to promise a refund. Purchaser FWA rewards, if any, are additional in-kind prizes; they are not assumed emissions or counted as ETH.

## After launch

`launch.json` defines three factory-deployed application contracts, explicit `$owner`, backward references and Chainlink's verified Sepolia coordinator. Constructors send no ETH and assign no ownership to the deploying factory. Applications start with sales disabled; round vaults are created later on-chain. [Deployment export](frontend/deployment.json) intentionally has `null` addresses/blocks until a real deployment receipt exists.

The owner must perform these steps with real deployment values; none was guessed:

| Setter/action | Required value and source |
| --- | --- |
| Router `configure(pool, helper)` | A compatible **Sepolia** pool with verified builder attribution and a verified FWA transfer helper. Obtain addresses from the FWA deployment owner/release and verify live code, ABI, rewards, token, market, canonical Permit2 and distributor permissions. The currently published pool fails the check. Registration is permanent per pool; future pool registrations affect only newly opened vaults. |
| Lottery `configureRules(game, rules)` | Configure each game separately. Use `0.005 ether` price by default; choose distinct initial cutoff timestamps, draw delay and settlement delay. Sales windows are exactly seven days. Pick documented fee/total/weighted-value/slippage bounds from live FWA quotes. Deadline and initial schedule choices are owner-settable before sale; no missing timestamp is fabricated. |
| Lottery `configureRandomness(config)` | The company's own Chainlink v2.5 subscription ID, Sepolia key hash, confirmations, callback gas and payment currency. Get/create the subscription in [Chainlink's subscription manager](https://vrf.chain.link/sepolia). Key/coordinator references are in [dependencies](docs/DEPENDENCIES.md). Default operational suggestion: 3+ confirmations and 200,000 callback gas, validated in a test deployment. |
| Chainlink subscription | Add `Sorphera` as consumer and fund with company LINK or Sepolia ETH. Never use FWA's subscription ID, a made-up ID or prize assets. |
| Lottery `validateLaunch()` | Confirms Sepolia, configured FWA dependencies, nonzero VRF funding, registered consumer and both game rule sets. This is a structural check; deployment review must also validate key hash, subscription adequacy, permissions, and an end-to-end canary. |
| Lottery `setSalesEnabled(true)` | Enable only after those dependency/configuration/funding checks and the release review. `false` pauses sales only; settlement, claims and recovery continue. |
| Permissionless `openRound(game)` | At/after that game's seven-day window begins and after the previous round finishes. Creates its immutable vault and snapshots settings. |

Subscription reconfiguration automatically disables sales and invalidates launch validation. Existing rounds retain their original subscription/key/gas settings; changing future config cannot replace a pending request. Coordinators are immutable. A subscription owner can remove/fund/cancel their subscription outside Sorphera; that is an external liveness responsibility, not a reroll option.

Owners use two-step ownership transfer. They can change future settings, pause sales, withdraw only released fees, and claim actual router builder rewards to company recipients. They cannot edit entries, replace randomness, select winners, cancel after a request, seize prizes, alter active rules, or drain round vaults. No upgrade mechanism exists.

Read [operations and delay handling](docs/OPERATIONS.md), [frontend/replay interfaces](frontend/README.md), and [testing/review notes](docs/TESTING.md). Independent adversarial review and a real compatible-dependency canary remain release requirements; this implementation's tests are not a security audit.
