# Sorphera Passport: developer handoff for the contracts iteration

Status: the website implements the Passport (**every 12 paid tickets earns 1 free ticket**) as a **DEMO / SIMULATED** feature. All records live in the browser's local storage, keyed by a demo identity. No Solidity, ABI, pricing, payout or protected deployment file was changed, and nothing here performs an on-chain redemption. This document lists what the contracts must establish so the website can replace its demo accounting with authoritative data.

The demo rules are implemented in `web/src/passport.ts` and exercised by the unit tests appended to `web/src/core.test.ts`. Read them as the product specification the contracts should confirm or correct.

## Product rules the demo follows

| Rule | Demo behaviour | Where |
| --- | --- | --- |
| One stamp = one eligible paid ticket | `paid` tickets of a purchase at the standard price count once the purchase is `finalized` | `passportView` |
| Every 12 tickets earns one reward; leftovers carry | `earn(n)` = `floor(n / 12)` rewards, `n mod 12` stamps. 11+1 = 1 reward / 0 stamps, 11+3 = 1 reward / 2 stamps, 24 = 2 rewards / 0 stamps | `earn`, tests |
| Shared across ETH and NFT games | Both demo rounds share the standard price 0.005 ETH; progress is one counter; the reward can be used in either game | `STANDARD_PRICE`, `eligiblePrice` |
| Different-price rounds are ineligible | Purchases whose round price differs from the standard price earn no stamps and cannot take reward tickets | `eligiblePrice`, `redeemReward` |
| Free, reward, sponsored, failed, cancelled, refunded tickets earn nothing | Only `state === "finalized"` purchases count; `refunded` and `failed` purchases count zero; reward tickets are recorded as redemptions, never as paid tickets | `passportView` |
| Pending versus finalized | New demo purchases are recorded `pending` and shown separately on the card. "Simulate finality" and "Simulate refund" controls on My tickets model the contract outcome | `setPurchaseState`, `Tickets.tsx` |
| Count each purchase once | A purchase id is generated when a review opens; retries after failure reuse it and `recordPurchase` ignores duplicate ids | `recordPurchase`, `Play.tsx` |
| Isolated by identity | Records are stored per demo wallet (`demo-a`, `demo-b`). Switching never transfers progress, tickets or baskets | `loadRecord`, `App.tsx` |
| No expiry, limits or enrollment | No weekly limit, streak, reset, mission, NFT requirement or sign-up | by omission |
| Reward consumption | One reward is consumed per reward ticket **only after** a successful demo confirmation. Rejection, failure and closed rounds leave it untouched. Reserved rewards in saved baskets cannot be used twice, and a synchronous latch blocks concurrent confirmation | `redeemReward`, `reservedRewards`, `Play.tsx` |
| Redeeming earns no stamp and needs no extra purchase | A free-only basket records a purchase with `paid = 0` and consumes the reward; the network fee still applies (no gas-free promise) | `planBudget(..., freeCount)` |
| Reward tickets are promotional entries into the existing funded jackpot | Added to the entry count with equal winning and claim rights; never counted as paid revenue or jackpot funding; no extra FWA purchase is simulated. Rule text shown to players: "Reward tickets enter the same draw and are included in the total number of entries." | `REWARD_RULE`, `Tickets.tsx` |

## What the contracts must establish

1. **Authoritative paid-ticket counts and finality.** Which event or state marks a purchase as irrevocably paid (for example, round closed or draw requested), and how the frontend reads per-owner eligible paid counts. The demo's `pending` versus `finalized` states are placeholders for that rule.
2. **Price eligibility.** The canonical standard price, and whether a round frozen at a different price is excluded from earning and from redemption (the demo excludes both).
3. **One-use reward consumption.** A reward must be consumed atomically with the entry it creates, so a failed or reverted redemption leaves the reward intact and a successful one cannot be replayed. The demo uses idempotent purchase and redemption ids; the contract should use nonces or on-chain balances.
4. **Cancellation and refunds.** A refunded or cancelled purchase must remove its stamps, including stamps that already contributed to an earned reward. Decide whether an already-used reward from a later-refunded card creates a debt, is forgiven, or blocks the refund. The demo simply recounts from the remaining finalized purchases, so a refund can make `earned` fall below `used`; `available` floors at zero.
5. **Player ownership and claim rights.** Reward tickets must be owned by the redeeming player, enter the same round's entry set, and carry the same winning, tie-break and claim rights as paid tickets, including NFT vault claims and ETH shares.
6. **Accounting.** Reward tickets add to the entry count only. They must not add to paid revenue, to the 90% FWA acquisition budget, or to operator fees, and they must not trigger extra FWA purchases. Prize-sharing math (equal split per matching ticket) includes them.
7. **Identity.** Progress is per wallet address, never transferable between accounts, and not affected by connecting or disconnecting.

## Frontend integration points

- `web/src/passport.ts`: replace `loadRecord` / `saveRecord` with reads from the indexer or contract views; keep `passportView`, `earn` and `projectPurchase` as the display logic.
- `web/src/Play.tsx`: `recordPurchase` and `redeemReward` run after the demo confirmation; in live mode they should run after the confirmed receipt, or be replaced by re-reading on-chain state.
- `web/src/Tickets.tsx`: the ledger and the two demo controls ("Simulate finality", "Simulate refund") are demo-only and should be removed when live data exists.
- Reward tickets are `DemoTicket` entries with `reward: true`; the Draw Room and My tickets already label them and treat results identically.

No live funding, deployment or token change is requested by this handoff.
