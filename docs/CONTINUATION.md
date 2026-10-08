# Sorphera contract continuation and handoff

This is a source continuation of merged PR #2, commit `6a6b3e57adcbfac8063aaa0d734c055c4fcff940`. No live transaction, mainnet deployment, public sale, new paid launch or retargeting of parked launch 961 was performed. Production deployment addresses remain null. The final artifact content hashes and exact checks are recorded in `continuation-validation.json`; the worker cannot assign the platform's eventual publication commit.

## Delivered changes

The separate automated contract reviewer reproduced a fairness fault: an NFT delivered before the frozen deadline could be ignored if a caller requested cancellation before reconciliation. A bounded post-deadline custody sweep now checks 50 recorded requests per transaction and persists its cursor. Pending FWA requests still cannot prevent a genuinely empty NFT round cancelling. A gas cap on untrusted collection ownership reads prevents a hostile collection exhausting this mandatory sweep. Regression tests demonstrate both failures before their fixes and preserve late recovery rights.

`configureVRFReserve(linkJuels,nativeWei)` adds company-selected funding floors, frozen per round. Launch/opening and each new draw/tie request check subscription funding and consumer registration. Accepted requests remain immutable. Zero preserves the legacy positive-balance requirement; production setup must select meaningful floors, confirmations and callback gas. Floors do not reserve subscription funds or guarantee later fulfillment.

The new [Sepolia canary](CANARY.md) deploys controlled synthetic FWA dependencies and production lottery callbacks against the published coordinator. It supports subscription creation or supplied ownership, registration, initial funding, 5,700 ETH combinations and 11,400 NFT entries at a small price, two draws, independent NFT tie, claims and canonical request/fulfillment/billing receipts. Atomic controlled purchases leave sales disabled between transactions. Its external journal resumes safely. Live mode never supplies randomness or impersonates the coordinator.

The [keeper](KEEPER.md) executes permissionless maintenance with bounded acquisitions/processing, urgent settlement, refunds/reconciliation, closing, draws/ties and finalization. It defaults to dry-run. An external signer, nonce/receipt journal, local sender lock, gas/spend ceilings, canonical block checks, funding alerts and systemd template support operation and recovery. It has no owner/treasury authority and never replaces an accepted VRF request. Local fork submission is explicitly separated from authorized live Sepolia submission; live mainnet submission is refused by this assignment's tooling.

ABIs, status/configuration artifacts, reserve preflight, deployment instructions and operational schemas have been updated. Existing build configuration/dependencies, historical launch manifest and mainnet integration semantics remain intact.

## Verification

Pinned compiler: Solidity **0.8.26**, Cancun, optimizer 200, via IR, metadata hash none. Executed Foundry: **1.8.3**, commit `cae51ad458f6abb64852b7709eb784352429825d`; Python **3.12.3**. No dependency installation is needed for the added CLIs/tests: Python standard library plus the existing Foundry toolchain.

Exact commands and final counts are in `continuation-validation.json`, with logs in `evidence/continuation/`. The default Foundry suite is offline, does not read/set environment variables, and includes the existing fuzz/stateful invariants, new failure regressions and exhaustive canary coverage. Six invariant properties are reported as one grouped run (256 runs × 64 calls). The full suite reports **75 passed, 0 failed, 0 skipped**. Build and both format checks pass. **47 tooling tests pass, 0 fail, 0 skip**, covering restart, loss of broadcast response, pending/reverted/replaced transactions, receipt/checkpoint reorgs, duplicate workers, ceilings, oracle waits and claim evidence.

The mainnet suite passes **11/11** at block **26,145,236**, hash `0xf7795aa3ff4975e1f907099acb0bdbefcead6ee7d85b0cca23584ce0704de179`. Genuine FWA/rewards/helper/coordinator code is unchanged; callbacks and funding are explicitly simulated on the fork. The Sepolia suite passes **3/3** at block **11,866,914**, hash `0x06d1c4d2944979bd9048d237637ab747cd808508b1ff83768d9ea178ba20dd99`, covering historical compatibility and genuine constructor success. Empty-state constructor rejection passes **1/1** as the intended dependency guard. Publicnode RPCs returned 403; the retained Valve public endpoint served both verified block pins. Fork success is not live VRF proof/billing evidence.

The executable worker smoke test uses a local Sepolia fork, production Sorphera, the deployed coordinator's request path and controlled synthetic FWA. Its callbacks are deliberately impersonated **only on local Anvil**. Its evidence is labelled simulation and is kept separately from the live canary journal. The smoke passes all five lifecycle/recovery check groups, with 21 administrative fixture transactions and 17 keeper transactions. Both final statuses are `Won`; cash and NFT custody claims succeed. Historical fork test actors with EIP-7702 delegation were explicitly cleaned only on local Anvil; dependency bytecode was preserved. The validation record gives the reproducible startup/test commands and separate simulation receipts.

## Remaining findings and gates

**Permanent accepted VRF nonfulfillment remains unresolved.** Underfunding/top-up, delayed callbacks and callback gas failure are tested, but no request retry, timeout cancellation, fallback seed or replacement winner was introduced. Callback gas failure can be billed without a second delivery. Funds and held fees can remain reserved indefinitely. The exact deferred timeout-refund proposal, discard/censorship attack and company policy decision are in [the review](REVIEW-CONTINUATION.md); it is excluded from this candidate.

FWA settlement races, mutable dependency/helper permissions, malicious collections and unanimous exceptional-NFT recovery remain material operational assumptions. `ownerOf` must fit the 50,000-gas custody-read bound. The canary's token/rewards/helper components are labelled wiring stubs; genuine reward delivery evidence comes from the mainnet fork. Automated review and passing tests are not a professional audit. Slither/Mythril and a human audit were not run.

**Live Sepolia VRF: NOT RUN.** Company authorization, secure test-wallet signer access and test funds/subscription control were not supplied. There are no actual oracle billing/fulfillment receipts from this assignment.

**Private IMD gate: NOT RERUN.** The runner/harness is not available through the worker's tools. Its last public failure remains unresolved despite public empty-state and genuine-fork reproductions. The [single support-request draft](IMD-SUPPORT-DRAFT.md) lists the required evidence; it has not been sent.

**Publication: platform receipt pending.** Deliverables are ordinary files in the assigned worktree for IMD's supported artifact collection into the existing repository/PR flow. Worker restrictions prohibit `.git` writes, so no commit/push/merge was performed. No callable IMD publication/private-runner tool was exposed. Only a platform publication receipt can establish the final repo/PR commit and final gate status; this report does not claim either.

## External action checklist

- **Company/requester:** choose production owner/treasury, independent weekly anchors, frozen bounds, subscription currency/key/confirmations/gas and reserve floors; decide whether the unresolved no-discard oracle lock risk is acceptable or commission a separate future-cohort policy design. Existing sold terms cannot change.
- **Company test operator:** authorize the isolated Sepolia workflow, provide a dedicated secure signer and test funds, create/supply the company-owned subscription, run the resumable canary and preserve three actual request/fulfillment/billing receipts plus cash/NFT claims.
- **Company operations/hosting operator:** provide a maintained host, archive/live RPC, supervisor, dedicated permissionless keeper wallet and gas budget; configure deadline/funding alert response and a single active signer owner. Keep treasury/configuration powers separate.
- **Independent human security reviewer:** review this final source, external dependency/trust assumptions, bounded custody sweep and unresolved oracle/refund policies before any release decision.
- **IMD platform/operator:** publish the collected artifacts through the existing continuation, return the final commit/PR status, and rerun the private gate with resolved chain/manifest/arguments/code/inner-revert evidence. Keep launch 961 parked; any future mainnet deployment requires a separately authorized route.

The refreshed ABI/status interfaces are ready for **website implementation against this source version**. Live integration/activation is not ready: addresses are null and the live oracle, private gate and release decisions remain outstanding. A future UI must show the bounded cancellation-review progress, provisional NFT match result, independent tie wait, indefinite original-request wait and purchaser/company accounting separately. It must not promise timeout refunds or a redraw.
