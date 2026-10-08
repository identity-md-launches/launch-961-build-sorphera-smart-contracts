# Deployment and release preparation

No mainnet or Sepolia transaction was broadcast; no public sale was enabled. All rehearsal addresses are ephemeral. `deployments/mainnet.json`, `sepolia.json` and `fork.json` are intentionally separate. Owner, treasury, lottery subscription, gas reserve, schedules and slippage limits stay null until supplied by the company. Null drafts fail `tools/preflight.py`; they are not launch-ready configuration. `config.schema.json` defines the fields, and onchain checks enforce economic bounds.

## Inputs and order

1. Confirm chain 1, the archive block/hash, reviewed commit, compiler settings and the mainnet dependency snapshot. Use published coordinator `0xD7f86b4b8Cae7D942340FF628F82735b7a20893a`. Choose one published, still-active mainnet key (200/500/1000 gwei lanes); the 200 gwei key is used in fork tests. For Sepolia use its own coordinator/key; chain 31337 is restricted to the named test subclass, never a production setting.
2. The company supplies an explicit nonzero owner (prefer its reviewed multisig), treasury recipients, two independent weekly cutoff anchors, timing policy and live quote/value/slippage limits. Set default tickets to 0.005 ETH. Price is a multiple of ten wei; 10%/90% and number format cannot change. `drawDelay <= settlementDelay <= 30 days`, slippage ≤1,000 bps, positive max fee/total/minimum backing. Choose the NFT deadline with actual FWA allocation/settlement times and keeper coverage in mind. Sold/opened terms are immutable.
3. Deploy `SorpheraRouter(owner)`, then `SorpheraVaultFactory(router,owner)`, then `Sorphera(owner,factory,coordinator)`. Inspect runtime hashes, constructor arguments, deployed code sizes and owners after each receipt. Do not predict a dependency address without checking the actual deployment result; `$contract` resolves to the already deployed contract, not its deployer or the manifest's string bytes.
4. Owner calls `factory.setLottery(lottery)` once, then `router.configure(pool,helper)`. Verify the reverse factory binding, pool/rewards/token/market interfaces, Permit2, helper token, deposits and token distributor permissions. Mainnet Sorphera requires the verified mainnet pool. The router snapshots each pool's rewards/token/helper registration; opened vaults retain their original registration. A new registration cannot rewrite old vaults.
5. Company creates its **own** VRF v2.5 subscription with its chosen owner, adds the deployed lottery consumer, and funds in selected LINK/native currency. Never copy FWA's subscription. Supply it through `configureRandomness`; it is unset until then and every dependent operation fails closed. Read coordinator limits/active key and subscription membership/balance before validation and every round. The company supplies and monitors an adequate minimum reserve; greater-than-zero onchain funding is structural, not a promise of enough funding at peak gas.
6. Owner calls `configureRules` separately for both games and `configureRandomness`, then runs preflight and `validateLaunch`. Rehearse the exact transactions on a current pinned fork. `Rehearse.s.sol` never broadcasts; a requester-supplied owner is required. These actions keep sales disabled. No delivered script invokes `setSalesEnabled(true)` on a live chain.
7. Complete an independent adversarial security review, resolve its findings, complete the separate real VRF canary below, and obtain the company's explicit production release decision. Only a later authorized owner operation may enable sales. No passing test or IMD source continuation grants that approval.

Read-only preflight:

```sh
python3 tools/preflight.py deployments/mainnet.json \
  --rpc-url "$MAINNET_ARCHIVE_RPC" --block "$PREFLIGHT_BLOCK"
```

Fill a reviewed configuration copy first; the supplied null template intentionally exits `UNCONFIGURED`. `gasPriceAssumptionWei`, minimum funding, price/value bounds, reward minimum output and transaction deadlines must reflect company choices and live reads, not the historical snapshot. A one-hour FWA settlement window is a third-party race boundary, not an assurance that the NFT remains available until the lottery cutoff. The helper can pause/change distributor status after preflight; runtime acquisitions/sales reject changed wiring and bounded reward deposits revert atomically. Already acquired assets can still settle and cash claims remain available.

## Separate real Sepolia VRF canary — NOT RUN

No company subscription/access, Sepolia owner address, funded test wallet or test deployment authority was supplied. There is no live Chainlink verification result. A fork callback impersonation is not a replacement.

`script/SepoliaCanary.s.sol` prepares a local Sepolia rehearsal with **explicitly labelled, public mutable MockFWA/MockRewards/MockToken/MockNFT/MockHelper**, real coordinator and production Sorphera. It leaves sales disabled and has no broadcast calls. The mock helper is not compatible with real Permit2's transfer implementation and is excluded from this VRF-only canary; full helper delivery is covered on mainnet's deployed helper. Never represent these FWA mocks as published Sepolia FWA or mainnet-ready dependencies.

External prerequisites: company-owned Sepolia wallet/multisig and treasury; gas/test ETH; its own v2.5 subscription and owner access; selected billing currency funded; published Sepolia coordinator/key; explicitly authorized isolated canary deployment and test entries. The company's operator must deploy the canary artifacts, bind factory/router, configure both rules and its funded subscription, add the lottery consumer, validate, and enable only its controlled test instance. Use no public players or real funds. Mock NFT acquisition success requires only mock `allocate` and mock pool backing supplied with test ETH; FWA oracle is deliberately simulated here.

For each game: submit controlled ticket entries before cutoff, acquire/allocate/settle as appropriate, close, request draw, and **wait for actual Chainlink coordinator transactions**. Record chain, blocks, tx hashes, subscription ID/owner, request ID, key, confirmations, callback gas, currency, `RandomWordsRequested`, coordinator `RandomWordsFulfilled` success/payment and `RandomnessStored`. Finalize and claim. Ticket combinations cannot be preselected to match real VRF; to exercise every outcome efficiently in a canary, buy all 5,700 combinations in ≤100-ticket batches (28.5 test ETH at default price; the owner can choose a smaller pre-sale canary price in 10-wei increments). To guarantee a multiple-match NFT tie, buy each combination twice, preserving actual VRF randomness. Record the second distinct request and real fulfillment, then finalization and NFT custody transfer. Never impersonate the coordinator in this live test or retry/reseed a successful request.

Pause the controlled canary afterwards. Save receipts and bill/gas observations separately from fork reports. Mainnet subscription and operational budgets must be rechecked independently; Sepolia prices do not establish mainnet fees.

## Blocking external actions

- IMD: provide the private constructor harness/trace and rerun its protected gate; use `docs/REHEARSAL.md`'s exact requested evidence. Last public result is failed.
- Requester/company: supply real owner/treasury and deployment approval; choose frozen schedules/bounds, key, billing currency and callback limits; create/fund company subscriptions and register consumers.
- Company test operator: fund and execute the real Sepolia coordinator canary, preserving actual callback receipts and billing evidence.
- Independent reviewer: review this changed source, particularly tie states, external dependency assumptions, refunds, late assets and permanent-oracle-failure lockups. Tests are not an audit.
- Deployment operator/platform: approve a new chain-1 deployment route, re-attest the delivered commit with `deployments/mainnet.launch.json`, verify contracts and retain disabled sales. The parked Sepolia launch is not automatically changed by this continuation.
