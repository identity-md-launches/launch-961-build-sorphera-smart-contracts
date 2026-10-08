# Deployment and release preparation

No mainnet or Sepolia transaction was broadcast; no public sale was enabled. All rehearsal addresses are ephemeral. `deployments/mainnet.json`, `sepolia.json` and `fork.json` are intentionally separate. Owner, treasury, lottery subscription, gas reserve, schedules and slippage limits stay null until supplied by the company. Null drafts fail `tools/preflight.py`; they are not launch-ready configuration. `config.schema.json` defines the fields, and onchain checks enforce economic bounds.

## Inputs and order

1. Confirm chain 1, the archive block/hash, reviewed commit, compiler settings and the mainnet dependency snapshot. Use published coordinator `0xD7f86b4b8Cae7D942340FF628F82735b7a20893a`. Choose one published, still-active mainnet key (200/500/1000 gwei lanes); the 200 gwei key is used in fork tests. For Sepolia use its own coordinator/key; chain 31337 is restricted to the named test subclass, never a production setting.
2. The company supplies an explicit nonzero owner (prefer its reviewed multisig), treasury recipients, two independent weekly cutoff anchors, timing policy and live quote/value/slippage limits. Set default tickets to 0.005 ETH. Price is a multiple of ten wei; 10%/90% and number format cannot change. `drawDelay <= settlementDelay <= 30 days`, slippage ≤1,000 bps, positive max fee/total/minimum backing. Choose the NFT deadline with actual FWA allocation/settlement times and keeper coverage in mind. Sold/opened terms are immutable.
3. Deploy `SorpheraRouter(owner)`, then `SorpheraVaultFactory(router,owner)`, then `Sorphera(owner,factory,coordinator)`. Inspect runtime hashes, constructor arguments, deployed code sizes and owners after each receipt. Do not predict a dependency address without checking the actual deployment result; `$contract` resolves to the already deployed contract, not its deployer or the manifest's string bytes.
4. Owner calls `factory.setLottery(lottery)` once, then `router.configure(pool,helper)`. Verify the reverse factory binding, pool/rewards/token/market interfaces, Permit2, helper token, deposits and token distributor permissions. Mainnet Sorphera requires the verified mainnet pool. The router snapshots each pool's rewards/token/helper registration; opened vaults retain their original registration. A new registration cannot rewrite old vaults.
5. Company creates its **own** VRF v2.5 subscription with its chosen owner, adds the deployed lottery consumer, and funds in selected LINK/native currency. Never copy FWA's subscription. Supply it through `configureRandomness`; it is unset until then and every dependent operation fails closed. Read coordinator limits/active key and subscription membership/balance before validation and every round. The company supplies and monitors an adequate reserve. Set `configureVRFReserve(linkJuels,nativeWei)` before opening rounds; use the chosen billing currency floor from `minimumFundingWei` and zero for an unused currency. Rounds freeze the floor and recheck it before each request. These balance checks do not escrow funds or promise enough funding at peak gas.
6. Owner calls `configureRules` separately for both games and `configureRandomness`, then runs preflight and `validateLaunch`. Rehearse the exact transactions on a current pinned fork. `Rehearse.s.sol` never broadcasts; a requester-supplied owner is required. These actions keep sales disabled. The production path does not enable public sales. The separate Sepolia canary controller temporarily enables only its controlled test instance inside an operator-only atomic enable/buy/disable transaction; sales are disabled between transactions.
7. Complete an independent adversarial security review, resolve its findings, complete the separate real VRF canary below, and obtain the company's explicit production release decision. Only a later authorized owner operation may enable sales. No passing test or IMD source continuation grants that approval.

Read-only preflight:

```sh
python3 tools/preflight.py deployments/mainnet.json \
  --rpc-url "$MAINNET_ARCHIVE_RPC" --block "$PREFLIGHT_BLOCK"
```

Fill a reviewed configuration copy first; the supplied null template intentionally exits `UNCONFIGURED`. `gasPriceAssumptionWei`, minimum funding, price/value bounds, reward minimum output and transaction deadlines must reflect company choices and live reads, not the historical snapshot. A one-hour FWA settlement window is a third-party race boundary, not an assurance that the NFT remains available until the lottery cutoff. The helper can pause/change distributor status after preflight; runtime acquisitions/sales reject changed wiring and bounded reward deposits revert atomically. Already acquired assets can still settle and cash claims remain available.

## Separate real Sepolia VRF canary — NOT RUN

No company subscription/access, Sepolia owner address, funded test wallet or test deployment authority was supplied. There is no live Chainlink verification result. A fork callback impersonation is not a replacement.

The executable workflow is [tools/canary.py](../tools/canary.py), with setup, commands and exact evidence requirements in [CANARY.md](CANARY.md). It deploys production Sorphera against the published coordinator and separately labelled, operator-controlled synthetic FWA dependencies from `script/CanaryDependencies.sol`. It creates or uses a company subscription, registers/funds/checks it, buys all 5,700 combinations once for ETH and twice for NFT at a small frozen test price, waits for actual callbacks, requests the separate tie-break, and claims cash/NFT custody. It persists addresses and receipts across restarts. Public sales are never open between its controlled batch transactions.

`script/SepoliaCanary.s.sol` remains a historical local deployment simulation. Neither its mock helper nor the new wiring stub proves real FWA reward delivery; that coverage belongs to the pinned mainnet fork. A live canary must never impersonate the coordinator or presume the random result. The CLI rejects local Anvil nodes in live-Sepolia mode and labels its optional local simulation journal separately. Company authorization, a secure external signer, test gas/funding and company subscription control were not supplied; live execution is **NOT RUN**.

## Blocking external actions

- IMD: provide the private constructor harness/trace and rerun its protected gate; use `docs/REHEARSAL.md`'s exact requested evidence. Last public result is failed.
- Requester/company: supply real owner/treasury and deployment approval; choose frozen schedules/bounds, key, billing currency and callback limits; create/fund company subscriptions and register consumers.
- Company test operator: fund and execute the real Sepolia coordinator canary, preserving actual callback receipts and billing evidence.
- Independent reviewer: review this changed source, particularly tie states, external dependency assumptions, refunds, late assets and permanent-oracle-failure lockups. Tests are not an audit.
- Deployment operator/platform: approve a new chain-1 deployment route, re-attest the delivered commit with `deployments/mainnet.launch.json`, verify contracts and retain disabled sales. The parked Sepolia launch is not automatically changed by this continuation.
