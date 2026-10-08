# Contract review, October 2026 continuation

The initial reviewer was a separate automated contributor agent, assigned to adversarial contract review independently of the implementation coordinator. That reviewer read the existing contracts, deployment/interface evidence and pinned security/FWA references, reproduced the custody race below, then authored its fix and regression tests. The implementation coordinator reviews and integrates those changes. This is an automated review, not a professional audit or independent human release approval.

Reviewed source baseline: `6a6b3e57adcbfac8063aaa0d734c055c4fcff940` (merged PR #2). The checks below cover that baseline plus the delivered working-tree changes; they do not claim an unavailable final publication commit.

## Reproduced fault and repair

**Premature NFT cancellation despite timely physical custody — fixed.** `requestDraw` previously checked the recorded eligible inventory and cancelled at the NFT deadline before checking unresolved acquisitions. FWA can deliver an NFT directly with `finalizeUnsettled` or depositor resolution, stamping the vault's receipt hook without running Sorphera reconciliation. A permissionless caller could then cancel before a keeper reconciled that timely receipt. This converted jackpot rights into refund/shared-asset rights even though the NFT was secured before the committed deadline.

`testUnreconciledPredeadlineCustodyCannotBeFrontRunByCancellation` reproduces delivery at `settlementDeadline - 1`, followed by a different caller requesting the draw at the deadline. Before the fix:

```text
forge test --match-contract SorpheraReviewRegressionTest -vv
0 passed; 1 failed; 0 skipped
assertion failed: 7 != 3  # Cancelled instead of Requested
```

The lottery now asks its vault to inspect at most 50 recorded requests after the deadline before cancellation. The persistent `cancellationCursor` prevents an unbounded transaction. If more remain, `requestDraw` commits progress and returns with the round `Closed`; keepers repeat it. The sweep reconciles actual predeadline custody, preserves the strict deadline, and does not wait for unresolved FWA requests. Genuinely pending/no-inventory rounds still cancel and retain their existing late-recovery rights. Only the lottery can initiate the vault sweep using the round's frozen deadline. The request list cannot grow after cutoff.

Additional regressions cover 51 still-pending acquisitions and timely custody in the final batch. The previous early/late receipt, stuck asset, cancellation and rollover tests continue to pass.

**Hostile collection ownership getter exhausting the sweep — fixed during review of the repair.** A collection's `ownerOf` is an external static call and can consume its entire gas allowance. The existing uncapped call would make the new mandatory sweep lose its bounded execution property. `testHostileOwnerOfCannotExhaustCancellationSweepGas` initially failed with an infinite-loop getter and a 1,000,000-gas draw transaction. Reconciliation now caps the ownership read at 50,000 gas. A failed read never proves custody, and late recovery remains possible. Collections whose legitimate ownership getter exceeds that cap need separate compatibility assessment; ordinary ERC-721 ownership reads are covered by the existing integrations.

## Oracle safeguards and unresolved liveness

**Permanent accepted draw/tie nonfulfillment — unresolved high-impact liveness finding.** No timeout, cancellation, new request, fallback seed, replacement winner or owner withdrawal was added. Accepted requests can reserve funds indefinitely; an accepted callback that exhausts its gas can also leave the round permanently pending. Top-up and monitoring reduce preventable failures without proving eventual fulfillment.

New optional owner settings `configureVRFReserve(linkJuels, nativeWei)` specify pre-request subscription balance floors. Each round snapshots its selected-currency floor alongside its existing immutable randomness configuration. Launch/open-round checks use the current future policy; draw and independent tie requests recheck their frozen subscription, billing currency, consumer membership and balance floor. Changes to future policy cannot weaken an existing round's floor. Zero preserves the legacy positive-balance test; it is not a recommended production reserve. The company must choose and configure real reserve amounts before opening production rounds.

These floors are **not a fee quote or payment escrow**. Concurrent consumers, subscription-owner action, gas prices, premiums or LINK conversion can invalidate the assumption after acceptance. The operator must monitor and replenish the original subscription, retain the consumer and maintain enough headroom for both game draws and the separate NFT tie request. The keeper cannot spend purchaser prizes on oracle or keeper funding.

`ReviewVRF` in the new regression file models fee debit and a one-shot low-level callback. It deliberately labels itself simulation. Tests distinguish:

- A reverted request transaction: request counter, request binding and round transition roll back; a top-up allows the first accepted request.
- An accepted request with depleted balance: simulated fulfillment remains pending until top-up, then the same original request completes after a long delay.
- A callback given only 1,000 gas: simulated billing succeeds, callback fails, and the mock rejects any second delivery. Sorphera exposes no replacement request.
- A valid draw or tie callback with 150,000 gas: stores the word/status without ETH/NFT payouts; separate finalization and claim calls complete the round.
- A tie delayed for ten years: fees, NFT custody and ticket rights remain reserved until the original request completes; elapsed time creates no refund or reroll authority.

The 1,000-gas case is an explicit failure injection; production configuration rejects callback limits below 150,000. Passing the 150,000-gas unit case is not a substitute for live coordinator billing/fulfillment evidence under production configuration.

### Chainlink guidance reviewed

The [official VRF v2.5 security page](https://docs.chain.link/vrf/v2-5/security) returned HTTP 403 to this environment. Its [official repository source](https://raw.githubusercontent.com/smartcontractkit/documentation/main/src/content/vrf/v2-5/security.mdx) was successfully retrieved. Relevant exact sentences:

> Any re-request or cancellation of randomness is an incorrect use of VRF v2.5.

> If your `fulfillRandomWords()` implementation reverts, the VRF service will not attempt to call it a second time.

> Fulfillments require sufficient subscription balance at processing time.

The application binds each request ID to game, round and phase, freezes ticket inputs before request, and only stores the legitimate callback result. It retains explicit rejection of unauthorized, malformed and stale callbacks. It does not import `VRFConsumerBaseV2Plus`; its immutable coordinator authentication is a separately implemented equivalent check, and coordinator migration remains unavailable. A human auditor should review that intentional interface choice and the value-at-risk confirmation policy.

### Exact deferred policy proposal — NOT IMPLEMENTED

One possible future-cohort policy would freeze **30 days from each accepted draw/tie request** before first ticket sale. After that deadline, anybody could switch the entire unresolved group to pro-rata refunds across that terminal round's sold tickets, return the held operator fee, preserve late cash/token recovery for that cohort, and ignore later callbacks. Exceptional NFTs would use the existing unanimous shared-recipient rule. No replacement randomness would be requested.

This policy is **incompatible with the current requirement that unfavorable accepted randomness cannot be discarded**. A party able to withhold delivery, deplete the subscription or censor finalization can gain a refund option after learning an unfavorable result; a deadline fixed before sale does not eliminate that option. It also changes rights over rolled inventory and can strand shared NFTs when ticket owners disagree. It is excluded from this production candidate.

Decision required from the company/requester: retain the current no-discard fairness rule and accept unresolved permanent lock risk, or explicitly commission a separate future-cohort refund/trust design and independent economic/security review. Existing rounds cannot be amended. No documentation or passing test resolves this policy conflict.

## Other reviewed boundaries

The existing tests exercise per-round vault/group isolation, immutable sold price/schedule/bounds, exact 10/90 allocation, fee release, equal ETH matches, rounding, rollover and late recovery; authentication and draw/tie binding; helper permissions and purchaser/company reward separation; forced FWA outcomes, stuck assets, claims and reentrancy. No additional reproducible asset-theft fault was established in those paths during this bounded review.

The reviewer also independently read `CanaryDependencies.sol`, authored by a different contributor. The controller and synthetic allocation are operator-gated, dependency bindings are fixed by the deployment constructor, ticket purchases atomically enable/buy/disable sales, and no canary dependency can impersonate the production coordinator. End-to-end development tests exposed an incorrectly pure receiver cast in the initial NFT fixture: it produced a `STATICCALL` into the vault's state-writing receipt hook. The canary author replaced that cast with a nonview receiver interface; the reviewer inspected the corrected call. No additional demonstrated Solidity fault was established there. The dependency mocks intentionally do not implement real FWA randomness, a market, rewards balances or reward-helper delivery. The canary's actual request/fulfillment event decoding matches the vendored coordinator ABI. Its final executable test status is included in the release-wide evidence; this review is not a claim of live execution.

Residual dependencies remain material: mutable FWA/rewards/helper permissions can block actions, the company controls subscription funding and future setup, and exceptional shared NFTs need unanimous recipient agreement. A malicious or broken collection may refuse delivery. These are limitations, not newly granted treasury escape rights.

## Reviewer checks

Toolchain: Forge `1.8.3`, commit `cae51ad458f6abb64852b7709eb784352429825d`; pinned Solidity `0.8.26`, optimizer/via-IR from unchanged `foundry.toml`.

```sh
forge test --match-contract 'SorpheraReviewRegressionTest|SorpheraHardeningTest|SorpheraAdversarialTest' -vv
```

Result: **31 passed, 0 failed, 0 skipped** (8 new review regressions, 6 hardening tests, 17 adversarial tests). The existing adversarial fuzz cases ran 1,000 price-bound cases and 512 receipt-time cases. These are offline simulations with no fork block or live receipts. The release-wide build, invariant, fork and tooling results are recorded separately by the implementation coordinator. Slither/Mythril and a professional audit were not performed.
