# Sorphera checks and review scope

Solidity 0.8.26, Foundry 1.8.3. Default tests are self-contained, do not inspect/set environment variables, and share no persistent state between tests. The standard library is vendored v1.9.7 (MIT/Apache licenses preserved). No runtime third-party Solidity dependency is downloaded.

## Local coverage

The application suite exercises:

- Unset/disabled launch, owner-only configuration, unfunded VRF rejection, separate game anchors, immutable opened rules and sale pause with continuing claims.
- Valid/invalid/unordered combinations; duplicate tickets within/across wallets; zero/one/multiple exact matches; late purchases and bounded calls.
- Both carryovers, old-ticket expiry, inability to acquire with carryover, reserved unclaimed winnings, fee withdrawals and division dust.
- NFT exact-match tie-break over ticket indices, custody before inventory registration, frozen inventory, individual/partial claims, nominated recipients, rejecting receivers, token-specific transfer failure and retry, double claims.
- Real-cost quote/VRF bounds, blackout, expired deadline, insufficient budget, reverted acquisitions, timed-out FWA requests, known-but-unwithdrawn refund credit blocking a draw, late ETH refunds and cancellation fee refunds.
- Delayed settlement, forced ETH in the NFT game, stuck NFT recovery after timeout, involuntary ETH-game NFT custody, late NFT after the published cancellation deadline and unanimous co-owner recovery.
- A permanently stuck FWA delivery that leaves no request pending: the ETH draw, fee release and next round proceed, an NFT round with nothing else secured cancels, and a much later recovery is claimable by the original winner or refund cohort only.
- Forced delivery before the settlement deadline that is reconciled after it still counts as secured (receipt-time stamp), while forced delivery after the deadline still cancels.
- A late allocation settled after cancellation becomes ETH refund cash shared pro rata rather than a shared NFT.
- Vault factory binding: anyone-but-the-lottery creation reverts, the binding is owner-only and one-time, and launch validation refuses an unbound factory.
- Authenticated/mapped asynchronous VRF, out-of-order callbacks across games, unknown/duplicate/stale callbacks, zero word acceptance, no new request after delay, and separate finalization.
- Builder immediate caller vs purchaser, overpayments, allowance-bounded builder rewards, purchaser token entitlements, restricted FWA transfers, scoped Permit2 signatures, helper failure rolling back allowance consumption.
- ETH receiver rejection and reentry attempts, conservation under fuzzed ticket counts/recovery amounts, unbiased sampler bounds/distinctness/replay, application runtime size and forbidden opcode checks.
- 2,000 matching tickets and 104 NFTs with finalization below a fixed gas ceiling and individual NFT delivery. The entire fixture is many simulated calls inside one test; it does not claim they fit in a single block/transaction.

Tests choose words in a **mock coordinator** to exercise specific outcomes. Users/operators cannot choose words in the deployed lottery. Mocks implement FWA request status/expiry, fixed settlement outcomes, restricted purchaser permissions, refund credits and ERC721 delivery failures; they do not prove external protocol correctness, Chainlink proofs/billing, reward market depth, or arbitrary NFT compliance.

## Separate real-dependency checks

The `integration` Foundry profile points at `integration/` and requires a Sepolia fork. It is excluded from offline default tests. At pinned block 11,866,914 the two tests passed: published pool/token/rewards/coordinator wiring and quote/windows; and **expected incompatibility** of the current builder getter. That is a deployment gate, not an end-to-end success result.

No fork purchase, actual lottery VRF callback, funded subscription, helper deposit, transaction signing or deployment was performed. Before release, verify a compatible deployment's code/source and exercise real acquisition attribution, settlement attribution, refunds, rewards and helper delivery on Sepolia with company-funded resources. Published addresses alone are insufficient.

## Local review and remaining trust

The implementation was reviewed for authority boundaries, state transitions, refund/fee separation, callbacks, carryover addressing and fail-closed dependency setup. The protected deployment checks supplied with the assignment were read; corresponding EIP-170/opcode checks are included locally. The external protected factory rehearsal requires deployment inputs supplied by the network and was not fabricated here.

No Slither/Mythril report or independent contributor audit is claimed. A separate adversarial review is required before holding player funds. Relevant residual assumptions:

1. Chainlink's configured coordinator verifies proofs and issues globally distinct asynchronous request IDs; the subscription owner preserves consumer registration/funding. Sorphera cannot recover by rerolling after permanent callback failure.
2. FWA/rewards/helper implementations and their upgrade/owner powers can change behavior or liveness. New round dependencies are snapshotted, but external protocol state and fee/windows remain mutable. Settlement keepers must react promptly.
3. NFT `ownerOf` and transfer methods obey ERC721 semantics. Malicious collections can lie or permanently reject transfer; no owner rescue bypass exists. A permanently rejecting collection costs that one asset, not the round or the game. FWA's forced deliveries are assumed to use `safeTransferFrom` (its stuck-recipient bookkeeping implies a receiver check); a plain `transferFrom` would merely fall back to the reconciliation time for the deadline test.
4. Helper/Permit2/token permissions and liquidity remain available. Token amounts are actual claimed amounts, not fixed emissions. Shared indivisible recovery assets can require unanimous ticket-holder cooperation.
5. Permissionless acquisitions use a frozen company-selected price/slippage policy. Execution timing within those bounds is not optimized for guaranteed value. External charges/losses can reduce prizes/refunds.
6. Sales are scheduled weekly but serialized within each game; severe delays can shorten/skip subsequent sales windows without allowing late entry or a schedule rewrite.
7. Rejection sampling uses cryptographic hash expansion in the random-oracle model. Its rejection loops are probabilistically terminating, independent of ticket sales; all inventory/sales-dependent work is bounded/indexed.
