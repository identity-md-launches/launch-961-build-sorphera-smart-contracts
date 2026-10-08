# Executable isolated Sepolia VRF canary

**Live execution: NOT RUN.** No company test-wallet address/access, secure signer endpoint,
test ETH, company subscription/funding reserve or authorization was supplied. No live
receipts, coordinator billing or actual oracle callback result is claimed. Historical
`deployments/sepolia.json` and launch 961 remain unchanged.

`tools/canary.py` is the executable continuation of the earlier nonbroadcasting
`script/SepoliaCanary.s.sol` rehearsal. It uses Python's standard library and the pinned
Foundry project; no package installation, remote SDK or secret environment variable is needed.
Build the reviewed source with `forge build` first. Review and fill an **external** copy
of `deployments/canary.example.json`; `deployments/canary.schema.json` describes the activation inputs. Undeployed addresses are null and are filled only
from confirmed deployment receipts in the external journal.

```sh
# Offline plan: no RPC, signer or transaction; works with the null template.
PYTHONDONTWRITEBYTECODE=1 python3 tools/canary.py \
  --config deployments/canary.example.json --mode dry-run

# Company operator only, after explicit authorization and filling external config:
PYTHONDONTWRITEBYTECODE=1 python3 tools/canary.py \
  --config /var/lib/sorphera/canary-config.json \
  --state /var/lib/sorphera/canary-state.json --mode live-sepolia \
  --company-test-wallet-authorized --max-actions 5
```

Repeat the identical live command to resume. Exit 2 means a safe wait for confirmations,
cutoff, funding, callback or the per-invocation action limit; exit 0 requires completed
claims **and** three actual coordinator fulfillment receipts. Stop by ending the command;
there is no background signing service started by this CLI. The external signer remains
under company control. Use the shared keeper recovery commands for journal receipt/reorg,
reverted-action and identical-calldata fee-replacement recovery; never delete accepted
VRF request state or create a replacement draw. Retain the external journal and its lock
file on durable local disk. Do not run two journals or processes with the same sender.

The company supplies a dedicated EOA and Clef-compatible `account_signTransaction`
endpoint. No unlocked Sepolia account, raw private key, mnemonic or key file is accepted. Live submission also rejects a sender with contract/delegated code; use a dedicated plain EOA.
The signer must approve only this reviewed canary, bounded values and the published
coordinator. `dedicatedSender` acknowledges exclusive nonce use. Gas limit, gas-price,
per-transaction cost, aggregate spend and account minimum balance are explicit ceilings;
null budget inputs must be supplied by the company. Values are integer wei, or integer
juels for LINK subscription reserves. At the illustrative 1,000-wei test ticket price,
entries total 17,100,000 wei; deployment, 171 purchase transactions and oracle billing
dominate the cost. The example gas cap is a ceiling, not a cost estimate.

## What executes

1. Deploy `CanaryDependencies(companyOperator)` on chain 11155111, then production
   `SorpheraRouter(controller)`, `SorpheraVaultFactory(router,controller)` and
   `Sorphera(controller,factory,publishedSepoliaCoordinator)`. Read component addresses,
   verify code, bind factory and configure router through the controller.
2. Create a company subscription when `subscription` is null, recording its actual
   `SubscriptionCreated` receipt, or inspect a supplied nonzero ID owned by the sender.
   Register only the production lottery consumer. `nativeTopUpWei` authorizes one initial
   native top-up; LINK mode requires company-provided LINK funding externally. Recheck
   currency, membership, coordinator key/limits and configured reserves through production
   validation. A reserve is a monitoring threshold, not a guarantee of fulfillment costs.
3. Freeze both rounds at a 1,000-wei test price by default, 1,000-wei mock acquisition
   bound, minimum value 1 and zero slippage, with a six-hour first cutoff by default.
   The seven-day window and fixed 10%/90% allocation remain production behavior.
   The CLI permits 2 hours–7 days for first-cutoff preparation; choose enough time for
   all confirmed purchases. Sold terms cannot be extended after a slow run.
4. Buy all 5,700 distinct combinations in the ETH game and all combinations twice in
   the NFT game, in 100-ticket batches. No random outcome is guessed. Only the company
   controller owns tickets. Its `buyBatch` enables sales, buys and disables sales in one
   atomic transaction; there is no public sales interval. Sales remain off between calls
   and after completion. Resume reconciles `sold` on chain before selecting the next batch.
5. Acquire one mock asset per round, explicitly allocate it as the company mock operator,
   immediately settle to ETH for game 0 and NFT custody for game 1. Wait until cutoff +
   60 seconds, then request both draws. Actual coordinator callbacks call production
   `rawFulfillRandomWords`; the CLI never impersonates the coordinator or provides a seed.
6. Finalize each draw. Exhaustive coverage guarantees exactly one ETH matching ticket
   and two NFT matching tickets. Request the **independent** NFT tie-break, await its real
   callback, finalize, then claim both cash entitlements and NFT custody to the company
   sender. Empty, rolled or cancelled guaranteed-coverage rounds stop with an error.

`script/CanaryDependencies.sol` is **not FWA**. It is a controlled synthetic acquisition
pool and NFT, with token/rewards/helper wiring stubs. Only the supplied company operator
may allocate NFTs or drive the controller; one-time dependency wiring cannot be changed.
The stubs do not implement a market, FWA VRF, purchaser rewards, builder rewards, real
Permit2 transfers or helper reward delivery. This canary verifies the real lottery VRF
path and prize claims; mainnet fork suites separately test genuine FWA/reward helpers.
The canary dependencies reject mainnet deployment. Never add them to a production manifest.

## Evidence and recovery boundaries

The shared engine journals signed transactions before broadcast, verifies signer output,
checks canonical receipts, tracks spend and serializes nonce use under an exclusive lock.
RPC errors and pending transactions stop safely. An accepted request awaiting a callback
is only monitored, including after restarts; underfunding can be remedied by topping up
the **same** company subscription. A reverted request transaction can be explicitly
reconciled and retried. Callback failure/nonfulfillment cannot be repaired by this worker:
no timeout refund, re-request, fallback seed or winner replacement is provided.

The journal's `canary.evidence` contains actual `RandomWordsRequested` and
`RandomWordsFulfilled` logs, their full receipts, callback `success`, billing `payment`
and currency. Bounded 500-block scans persist a canonical block checkpoint; an evidence
reorg clears the scan for restart. Own transaction reorgs halt the shared engine for
operator reconciliation. Round state supplies distinct ETH draw, NFT draw and NFT tie
IDs. Confirmed claim receipts remain in `transactions`, and claim accounting/NFT owner
are checked on chain. Completion requires three distinct nonzero request IDs, positive
callback success and all receipts. `localFork` configuration is rejected by live mode;
do not present any local mock/fork journal as live evidence.

Local checks:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools -p 'test_canary.py' -v
forge test --match-contract SepoliaCanaryTest -vv
```

Python tests simulate restart, coverage cursors, delayed callbacks, independent tie
requests, successful claims and rejection of false live evidence. Solidity tests execute
the production lottery and controlled canary contracts; their coordinator is explicitly
etched/mocked, so they are **simulation**. Exhaustive ticket fixture creation temporarily
pauses aggregate Forge gas metering because 171 separate live transactions exceed one
test's gas budget; callback/finalization gas remains metered. None of these results clears
the external live-VRF release gate.
