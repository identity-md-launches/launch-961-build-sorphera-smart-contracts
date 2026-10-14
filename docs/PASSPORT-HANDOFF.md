# Sorphera Passport: contracts handoff (buy 12 paid tickets, earn 1 free)

Status: **implemented in contracts** (`src/SorpheraPassport.sol` plus `src/Sorphera.sol` changes) and covered by `test/SorpheraPassport.t.sol`. Nothing is deployed by this iteration; the website still runs its labelled browser-storage demo and must not import that data as entitlements. Wiring the site to these contracts is a later Website task.

Customer copy the contracts support: **"Rewards become available after the qualifying round completes. A cancelled reward entry returns your free ticket."**

## 1. Product rules as implemented

| Rule | Contract behaviour |
| --- | --- |
| One stamp per qualifying paid ticket | `Sorphera.entriesOf(game, round, wallet).paid` is the only stamp source. Reward entries, cancelled rounds and other-priced rounds add nothing. |
| 12 stamps = 1 reward, remainders carry | `SorpheraPassport` keeps one cumulative `finalizedPaid` per wallet. `earned = finalizedPaid / 12`, `stamps = finalizedPaid % 12`. 11+1 => 1/0, 11+3 => 1/2, 24 => 2/0; transaction and wallet splitting cannot change the result. |
| Shared across ETH and NFT games, weeks, purchases | The counter is per wallet only; rounds of both games feed it. |
| One immutable qualifying price | `SorpheraPassport.qualifyingPrice` is a constructor argument (0.005 ETH in local fixtures; production value is an owner input before deployment). Earning and redemption require the round's frozen `price` to equal it. Nothing can reprice rewards later. |
| No expiry, cap, enrollment, NFT, token, tier, streak, transfer, admin grant | By omission: there is no owner function on the Passport at all. |
| Finality | A wallet's paid entries in a round count only once **that round** is `Won` or `Rolled`. Cutoff, `Closed`, `Requested`, `RandomReady`, tie-break states and pending FWA work are not finality. `Cancelled` credits zero stamps. Rounds that never settle stay pending. |
| Idempotent, bounded, permissionless finalization | `process(wallet, keys[])` (≤ 50 keys) credits only `wallet`, from the lottery's own counts, each (game, round) at most once (`processed(wallet, game, round)` outcome). Anyone may call it. No loop over players or history. |
| Redemption | `enter(game, round, picks, rewards, finalizeFirst)`: the last `rewards` picks are free, the first `picks.length - rewards` are paid at the frozen price (`msg.value` must equal exactly that). `rewards = 0` is an ordinary paid buy; `rewards = picks.length` is free-only with `msg.value = 0`. `finalizeFirst` lets the player finalize their own terminal rounds in the same transaction. All-or-nothing: any revert restores credit. |
| Reward tickets | Owned by the redeeming wallet, same matching index, same winning-number eligibility, equal ETH share per matching ticket, same NFT tie-break chance and claim rights. They earn no stamps. |
| Cancellation | Only **paid** entries share the recovery pool (`Group.divisor = paidEntries`). Reward tickets receive no cancellation ETH, FWA tokens, late recoveries or shared-NFT release votes (`entitlement` reverts `Sorphera: reward entry`). Each reward redeemed in a cancelled round is restored exactly once (`restored`), earns no stamp and leaves no active entry. |

## 2. Accounting

- `Round.sold` remains **total entries** and is still used for the matching index, the zero-ticket skip in `requestDraw`, `RoundClosed` and `Rollover`. `Round.paidEntries` and `Round.rewardEntries` were appended to the struct.
- Fees are still `msg.value / 10` and the vault still receives the other 90%: reward entries add no fee, liability, budget or FWA pull. A free-only batch forwards zero value; vault checks are not faked.
- `Cancelled(game, round, available, tickets)` now reports **paid** entries in `tickets`, because that is the refund cohort.
- **Regression fixed**: `_cancel` previously set `divisor = sold`. With reward entries present that would have diluted paid refunds and FWA token shares and handed reward tickets cancellation proceeds. `test/SorpheraPassport.t.sol::testCancellationDividesRecoveryAmongPaidEntriesOnly` and `testRewardTicketHasNoTokenOrNFTRecoveryRights` pin the fix.
- **Zero paid recipients**: a cancelled round with only reward entries has `divisor = 0`. `_distribute` then carries any cash (carried dust, or a late `credit` from its vault) forward to the game's **current group** (`DustCarried(game, toGroup, amount)`), never to the owner. Such a round has no vault budget, so it cannot hold FWA requests, tokens or NFTs; that invariant is asserted by the test above and in the vault no entitlement exists for anyone to claim them.
- Cancellation payouts remain shares of actual recoveries (fees + unspent budget + refunds + late settlements), not a guaranteed full refund.
- Invariants stated and tested: `address(lottery).balance == totalLiabilities`; `available = finalizedPaid/12 + restored - redeemed ≥ 0`; a (wallet, game, round) is processed at most once; `rewardEntries` of a round equals the sum of `RewardsRedeemed` counts into it; a reward ticket never passes `entitlement` in a cancelled round; a Won/Rolled round never restores.

## 3. Interfaces (ABI changes)

New contract `SorpheraPassport(address lottery, uint256 qualifyingPrice)` (no owner):

| Item | Purpose |
| --- | --- |
| `qualifyingPrice()`, `STAMPS_PER_REWARD()`, `MAX_PROCESS()` | Immutable rule parameters |
| `summary(wallet) → (finalizedPaid, stamps, earned, restored, redeemed, available)` | Authoritative credit |
| `availableRewards(wallet)`, `stamps(wallet)` | Convenience views |
| `roundCredit(wallet, game, round) → (pendingPaid, pendingRestore, processable, outcome)` | Bounded per-round preview; `outcome` 0 Pending, 1 Credited, 2 Restored, 3 Ineligible |
| `processed(wallet, game, round) → outcome` | Idempotency record |
| `process(wallet, RoundKey[] keys) → changed` | Finalization / restoration |
| `enter(game, round, Pick[] picks, rewards, RoundKey[] finalizeFirst) payable` | Redemption and mixed batches |
| events `StampsCredited(wallet, game, round, paid, finalizedPaid)`, `RewardsRestored(wallet, game, round, count)`, `RoundIneligible(wallet, game, round, price)`, `RewardsRedeemed(wallet, game, round, count, firstRewardTicket, lastRewardTicket)` | All three address/game/round topics indexed |

`Sorphera` changes:

| Item | Change |
| --- | --- |
| `Round` tuple | appended `paidEntries`, `rewardEntries` (`getRound` decoders must be regenerated) |
| `tickets(game, round, id)` | now returns `(player, combination, reward)` |
| `entriesOf(game, round, wallet) → (paid, reward)` | per-wallet counts |
| `passport()`, `setPassport(address)` (owner, once, requires code), event `PassportRegistered` | Passport binding; until bound, `enter` reverts `Sorphera: passport only` |
| `enter(player, game, round, picks, rewards) payable` | Passport-only entry path; `buy` is unchanged |
| `TicketBought` | emitted for paid **and** reward tickets; reward issuance is distinguished by the Passport's `RewardsRedeemed` range and `tickets(...).reward` |
| `Cancelled.tickets` | paid entries |
| `DustCarried` | also emitted when a zero-cohort cancelled group forwards cash |

Canonical ABIs were regenerated with the permitted workflow (`forge build && python3 tools/export.py`, which now also exports `SorpheraPassport.json`). `frontend/bytecode-sizes.json` is regenerated; `Sorphera` runtime is 24,366 bytes (EIP-170 limit 24,576), which is why no further views were added to the lottery itself.

## 4. Example reads and calls

Finalize after a round completes (anyone, for any wallet):

```
# is the round terminal and does the wallet have pending credit?
cast call $PASSPORT "roundCredit(address,uint8,uint256)(uint256,uint256,bool,uint8)" $WALLET 0 $ROUND
# credit it (no-op if already processed or not terminal)
cast send $PASSPORT "process(address,(uint8,uint256)[])" $WALLET "[(0,$ROUND)]"
cast call $PASSPORT "summary(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $WALLET
```

Redeem one free ticket plus two paid tickets into ETH round `$R`, finalizing an earlier round first:

```
cast send $PASSPORT --value $((2 * 5000000000000000)) \
  "enter(uint8,uint256,(uint8[3],uint8)[],uint256,(uint8,uint256)[])" \
  0 $R "[([1,2,3],1),([4,5,6],2),([7,8,9],3)]" 1 "[(0,$EARLIER)]"
```

Restoration after cancellation is the same `process` call; `RewardsRestored` is emitted once.

Confirmation and reorg handling: treat `StampsCredited`, `RewardsRestored` and `RewardsRedeemed` as pending until the block is final (the project's existing confirmation policy), then re-read `summary` and `roundCredit` rather than trusting a locally computed count. Optimistic UI state is never spendable authority: `enter` reverts with `Sorphera: insufficient rewards` if the chain disagrees. A redemption transaction dropped by a reorg leaves credit intact because the state and the ticket are written atomically.

## 5. Compatibility, deployment and operations

- **New launch contract**: `SorpheraPassport` must be deployed after `Sorphera` with the launch chain's qualifying price, then bound with `Sorphera.setPassport(passport)` (owner, once). The existing `launch.json` lists three contracts and was not edited here; the manifest step must add `SorpheraPassport` with `["$contract:Sorphera", <qualifyingPriceWei>]` and the owner must perform `setPassport`. Add this to the "After launch" checklist.
- **Protected hashes**: the `Sorphera` bytecode changed, so any protected release/runtime hashes (`frontend/bytecode-sizes.json`, deployment evidence) must be regenerated from this source by the release process. No hash was hand-edited and nothing activates the existing site's writes.
- **Keeper / tooling**: `tools/keeper.py` reads `r["sold"]` through the exported ABI; that remains the total entry count and keeps its meaning. `tools/canary.py` had a hard-coded 22-field `getRound` tuple that could not decode the 24-field Round; it is corrected and pinned to the ABI by `tools/test_canary.py`. Deployment wiring (deployers, canary CLI, manifests, preflight) is in [RELEASE-REHEARSAL.md](RELEASE-REHEARSAL.md). `frontend/configuration.json` status values are unchanged.
- **Oracle policy** is unchanged: no new VRF requests, no timeouts, no admin repricing.
- **Website**: replace `web/src/passport.ts` storage with `summary`, `roundCredit`, `processed` reads and the three indexed events; redemption goes through `SorpheraPassport.enter`, never `Sorphera.buy`. Remove the "Simulate finality/refund" controls. Never import browser demo records as entitlements.

## 6. Verification

`forge build`, `forge fmt --check` and `forge test` (offline, with `FOUNDRY_FUZZ_SEED=0xe7299debecaa06bd09234c7d201c1d942afcbf5f4709a9889ad32bf790259939`) pass; see `docs/TESTING.md`. The Passport suite covers thresholds and remainders, fuzzed batch/order equivalence, wallet splitting, mixed games, price exclusion, pending/Won/Rolled/Cancelled finality, duplicate processing, wallet isolation, free-only and mixed batches, pause/cutoff/invalid picks/insufficient credit/rollback, nested redemption in a contract wallet, paid and reward winners sharing ETH, a reward ticket winning an NFT tie-break, no recursive stamps, one-time restoration, no reward cancellation rights, zero-paid cancelled rounds with carried late recoveries, bounded processing gas and non-inflatable rewards. Tests passing are not an audit; an independent adversarial review is still required before funds are at risk.
