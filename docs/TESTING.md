# Test report — historical PR #2 baseline

The current continuation results are in [CONTINUATION.md](CONTINUATION.md) and `continuation-validation.json`. The remainder records PR #2 evidence and its original toolchain.

Use `docs/validation.json` and `docs/evidence/` for final execution counts and logs. Toolchain: Forge **1.8.5**, Solidity **0.8.26**, optimizer 200, via IR, Cancun, metadata hash none. Existing build configuration and vendored dependencies are unchanged. Tests never read/set environment variables; default tests run offline. CLI RPC/profile parameters select the separate integration suite.

The baseline at `b06997d42012b7ad7ffe943b3acdd816b2092c4e` passed: Forge 1.8.5 reported **59 passed, 0 failed, 0 skipped**. This runner groups six `invariant_*` properties into one invariant run; there were 64 test/property functions, consistent with the earlier 64/64 report but not an independent reproduction on Forge 1.7.1. This continuation adds six offline hardening tests and eleven mainnet-fork tests.

## Commands

```sh
forge build
forge test --summary
forge fmt --check
forge test --match-test testLargeSalesConstantFinalizationAndPartialLargeInventory -vv --gas-report
python3 tools/export.py
FOUNDRY_PROFILE=integration forge test --match-contract ConstructorRehearsalTest -vvvv
FOUNDRY_PROFILE=integration forge test --match-contract ConstructorRehearsalTest \
  --fork-url "$SEPOLIA_ARCHIVE_RPC" --fork-block-number 11866914 -vvvv
FOUNDRY_PROFILE=integration forge test --match-contract SorpheraSepoliaIntegrationTest \
  --fork-url "$SEPOLIA_ARCHIVE_RPC" --fork-block-number 11866914 -vv
FOUNDRY_PROFILE=integration forge test --match-contract SorpheraMainnetForkTest \
  --fork-url "$MAINNET_ARCHIVE_RPC" --fork-block-number 26145236 -vv -j 1
```

Mainnet used a localhost read-only RPC cache forwarding to the public `https://one.valve.city/rpc/vk_demo/evm/1`; the snapshot initially used `https://eth-pokt.nodies.app`. Provider URLs are transport, not trust anchors. Pin and verify block hash. Initial public RPC attempts encountered 403/method restrictions, rate limits and a storage-read timeout; a failure in fork setup is not a contract failure unless the trace establishes it. Local cache files are optional temporary infrastructure, not offline verification dependencies.

## Coverage and distinctions

| Behavior | Evidence |
| --- | --- |
| Full ETH game, duplicates/equal shares, zero winners, dust, reserved claims/fees | Offline unit/fuzz/invariants; mainnet ETH lifecycle with actual allocation/cashout and 100 matching tickets |
| Full NFT game, one winner, independent multiwinner tie, inventory rollover | Offline and mainnet fork; separate requests and one ticket for all inventory |
| Bounded delivery, receiver rejection/reentry, retry and stuck recovery | Offline adversarial/invariants; actual NFT custody/claim on mainnet fork |
| Expiry, immediate/deferred refunds, stale price/value bounds | Offline and real FWA fork |
| Ordered allocation, out-of-order words, settlement price drift | Real FWA fork: two queued requests, separate cached words, zero drift tolerance and refund; pending FWA config changes reject |
| Missed FWA windows, forced ETH/NFT outcomes, cancellation and late shared assets | Offline full matrix; mainnet actual public default NFT delivery into ETH recovery cohort |
| Company builder attribution, snapshotted rates, eligible acquisition/settlement credit | Real pool/rewards records and allowance deltas/events; rate-change fault uses actual rewards owner setter on fork |
| Token purchase, liquidity, exact Permit2 authority, helper next-block queue | Real mainnet rewards, v4 market, canonical Permit2 and published helper |
| Purchaser epoch entitlements kept in originating vault | Real mainnet acquisition unit and nonzero epoch token claim, ticket share/helper delivery; offline late deposits/dust/helper failures |
| Cross-game/round isolation and conservation, locked liabilities | Six stateful invariants, directed adversarial tests and fork balances/custody checks |
| Number validation, all unordered permutations, duplicate entries, cutoff/frozen terms | Offline exhaustive 5,700-combination indexing test, boundary tests and sampler fuzz |
| Unknown/unauthorized/duplicate/delayed/out-of-order VRF; round/phase binding | Offline callbacks for both games and independent tie; real coordinator request path on fork, **fulfillment simulated** |
| Administration, pause, dependency/helper permission changes | Offline authorization/fail-closed tests; real current permission reads and helper path on fork |
| 2,000 tickets / 104 NFTs, no ticket enumeration in finalization | Directed gas/scaling test; bounded acquisition and individual delivery progress |
| Constructor code checks and argument substitutions | Empty-state negative and real-chain positive public rehearsals; private gate unavailable |

The FWA contracts and mainnet coordinator are deployed bytecode; no dependency code is etched/replaced. `vm.deal` funds test wallets and a newly created fork subscription. Both FWA and lottery callbacks impersonate the coordinator **only in fork tests**. A snapshot/revert and router impersonation previews token output, then the real router executes against a minimum of 99% of that preview. Isolated protocol-owner impersonation tests configure zero drift tolerance before requests and change builder share to prove snapshotting. No live administrative changes occur.

The nonzero purchaser epoch amount observed for the test vault is **72,496,539,568,554,303,529 token units** before ticket division; it is a fixture observation, not a promised emission. Builder purchase/delivery and purchaser claims are independently accounted. Ancillary service/notifier/buyback runtime bytes are recorded; full Sourcify ABIs were unavailable for those three (404). Their observable bindings come from verified pool/rewards code and actual execution; that limitation is retained in the snapshot. Core pool/rewards/token/helper/Permit2/hook/PoolManager/coordinator ABIs are saved.

`Balls.uniform` rejection excludes the incomplete residue interval before modulo. Main numbers sample without replacement from a 20-ball bag; bonus uses a separate domain and may equal any main number. Hash expansion assumes a cryptographic random oracle. Fuzzing checks range/distinctness/replay; it is not a statistical proof of VRF randomness. There is no automatic onchain quick-pick API: a future client may sample entry numbers locally, but it must never substitute client seeds for draw/tie VRF. Choosing entry numbers does not create valuable randomness.

## Gas and scaling

At 2,000 matching tickets and 104 NFTs: measured draw finalization **138,634 gas**, separate tie finalization **224,049 gas**; both are asserted below 350,000. The gas reporter shows a maximum **5,351,848 gas** for a 100-ticket purchase, **1,593,767** for an eight-acquisition batch against mocks, and **108,844** for delivery of asset index 103. No earlier assets are enumerated or delivered by that claim. See `evidence/gas-scaling.txt`; instrumentation and warm/cold storage affect the difference between call-reporter gas and gasleft measurements.

The fixture performs many bounded calls in one test harness; its aggregate 187.9 million test gas is not a proposed transaction/block. Keeper/user operations split sales, acquisitions, settlement and claims into their enforced batch limits. Counts can grow without a cap on total sales. A future estimate must use the actual mainnet pool/collection/current gas state, not mock batch figures.

Runtime sizes: Sorphera **21,485**, router **8,424**, factory **15,710**, vault **12,914** bytes. All are below EIP-170; all initcode sizes are below EIP-3860. ABI/size exports are regenerated from build artifacts.

## Repairs during testing and limits

The required independent tie state exposed several earlier tests/handler steps that claimed immediately after a draw. They now wait for separate request, fulfillment and finalization, and assert locked fees/claims throughout. New test failures exposed a consumed `vm.prank` before an argument getter, the helper's actual `(claimableBlock, amount)` return order, pre-funded deterministic fork addresses, and FWA's protection against config changes while requests are pending; those fixtures were corrected against traces, without weakening production guards. Quotes can fall during staged-listing activation, so the refund assertion compares actual escrow plus VRF fee rather than assuming the pre-call quote was spent in full. RPC quotes use `--legacy --gas-price` to make the intended `tx.gasprice` explicit; an EIP-1559 cap alone can yield a different effective gas price.

Real Sepolia oracle canary: **NOT RUN**; company test owner, funded subscription/access and controlled deployment authority are required. Scripts and exact procedure are in `DEPLOYMENT.md`. No live cryptographic proof verification or Chainlink fulfillment bill was tested. The private IMD gate is **last reported failed, not rerun**; see `REHEARSAL.md`. Slither, Mythril and an independent audit were not run.

Permanent VRF failure can lock either draw or tie phase indefinitely. ETH acquisitions wait for FWA resolution; NFT no-inventory cancellation follows its precommitted deadline. Shared exceptional NFTs may require unanimous ticket-owner agreement. Mutable external permissions and liquidity can delay token delivery. These are explicit liveness/trust assumptions, not owner withdrawal permissions. Tests support independent security review and deployment rehearsal; they do not approve public sales.
