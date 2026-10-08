# Sorphera frontend contract interface

The website is a later assignment. This directory exports interfaces and deployment state, not a fabricated live deployment.

Run `forge build && python3 tools/export.py` after changing Solidity. `abi/` contains the four full application ABIs, including the runtime-created vault. `deployment.json` must be filled **from confirmed transaction receipts** with real addresses and deployment blocks. Keep `status` disabled until configuration/validation is complete. `bytecode-sizes.json` records reproducible bytecode size checks, not deployment receipts.

## Reads and input

Use Sepolia chain ID 11155111 and label **test ETH**. Show **Sorphera ETH Jackpot** / **Sorphera NFT Jackpot** separately, with the tagline **Weekly ETH & NFT lottery ball jackpots. Powered by FWA.** Do not present FWA spending or prizes as guaranteed returns.

| Interface | Purpose |
| --- | --- |
| `getRound(game, round)` | Status, immutable price, sales start/cutoff, earliest draw and settlement deadline, vault, sold tickets, fee reserve, request/timestamps, raw word, ordered balls, normalized combination, match count, selected NFT ticket, eligible/frozen inventory |
| `futureRules(game)` / `roundRandomConfig(game, round)` | Upcoming game settings / immutable round VRF configuration |
| `salesEnabled()` / `launchValidated()` | Global sale activation and validation; still check the round window/status |
| `tickets(game, round, ticket)` | Nontransferable ticket's owner and normalized combination |
| `matchCount(game, round, combination)` / `matchingTicket(..., index)` | Bounded random access to exact matches, including identical tickets |
| `groupOf(game, round)` / `groups(game, group)` | Carryover and terminal entitlement routing, unallocated cash and per-ticket allocation |
| `claimedETH(game, group, ticket)` / `entitlement(game, originRound, ticket, owner)` | Already-claimed ETH and eligibility/divisor for the terminal round's ticket |
| Vault `requestCount()` / `requestAt(index)` / `requestState(id)` | Page through acquisition IDs and reconciliation status |
| Vault `assets(index)` / `assetCount()` | Collection, token ID, originating acquisition/listing and claimed flag |
| Vault `receivedAt(collection, tokenId)` | Physical receipt timestamp from the ERC721 hook; zero if never received through `safeTransferFrom` |
| Factory `lottery()` | The one registered lottery allowed to create vaults |
| Vault `pending()` / `budget()` / `spent()` / `refundCredit()` | Required reconciliation and actual net acquisition spend |
| Vault `settings()` / `pool()` / `rewards()` / `helper()` | Origin's immutable settings and dependencies |

`buy(game, round, picks)` requires exact value `round.price * picks.length`, between 1 and 100 picks. A pick is `(uint8[3] main,uint8 bonus)`. Main ordering does not affect matching; duplicates within one ticket are invalid. Display the ticket IDs from `TicketBought`, not a guessed local counter. There is no transfer or approval endpoint.

Claim ETH with `claimETH(game, originRound, ticketIds, recipient)`. For a rolled group use ticket IDs from the group's terminal winning/refund round, **not the original expired ticket IDs**. Vault claims likewise take terminal-round ticket IDs while assets retain origin-round provenance. `claimNFTs(ticket, indices, recipient)` can partially succeed: reconcile each `NFTClaimed` / `NFTClaimFailed` event and read each claimed flag. `claimTokens` queues a helper claim; show a pending-delivery state until the helper's next-block transfer confirms.

## Replay and reconnection

Index logs from the actual deployment block. Use `(chainId, lotteryAddress, game, round)` for a round; add ticket/index/request ID to form resource IDs. Track block hashes and confirmations; on reorg, roll back logs then reload contract state. `RoundOpened` plus `VaultCreated` discovers every vault and its creation block. Filter `VaultCreated` by its indexed `lottery` argument equal to the deployed `Sorphera` address, and treat `RoundOpened.vault` (equivalently `getRound(game, round).vault`) as the authoritative vault for a round; the factory only lets the registered lottery create vaults. Read-only views allow recovery if a notification was missed. Never use an FWA notification as proof of NFT custody; the vault's `receivedAt(collection, tokenId)` and `CustodySecured` are the custody evidence.

Process the following persistent event families: `RulesConfigured`, `RandomnessConfigured`, `SalesEnabled`, `LaunchValidated`, factory `LotteryRegistered` / `VaultCreated`, `RoundOpened`, `TicketBought`, `RoundClosed`, vault `Acquisition`, `Reconciled`, `DeliveryStuck`, `CustodySecured`, `RefundRecovered`, `ETHExported`, core `PrizeCredited`, `DrawRequested`, `RandomnessStored`, `Result`, `Rollover`, `DustCarried`, `Cancelled`, `Claimed`, `NFTClaimed`, `NFTClaimFailed`, `RewardQueued`, `FeesReleased`, and ownership/company-fee events. Transaction receipt and originating contract address supply context for vault-local events.

Status enum values: `0 None`, `1 Sales`, `2 Closed`, `3 Requested`, `4 RandomReady`, `5 Won`, `6 Rolled`, `7 Cancelled`. At cutoff a round can still store `Sales` until somebody closes it; the timestamp already prevents purchases. Pending oracle/delivery is not a failed claim or an invitation to reroll.

The deterministic seed is:

```text
keccak256(abi.encode("Sorphera lottery v1", chainId, lottery, game, round, randomWord))
```

Draw sampling and normalization are in `src/lib/Balls.sol`. Three partial Fisher–Yates draws use domains `bytes32(1)`, `bytes32(2)`, `bytes32(3)` over a 1–20 bag; bonus uses `keccak256("Sorphera bonus")`. Each stream hashes `abi.encode(seed, domain, counter)` and rejects values below `2^256 mod n` before taking modulo. This eliminates modulo bias. The matching combination is sorted main values packed at offsets 0, 5, 10 and bonus at 15 bits; original draw order is stored separately.

For NFT ties, display: **“One matching ticket wins the entire NFT jackpot. Every matching ticket has equal odds, including multiple tickets from the same wallet.”** The index uses the domain `keccak256("Sorphera NFT matching ticket tie-break v1")` and the same unbiased sampler. `winningTicket` is the actual indexed ticket ID, not a wallet-weighted choice.

Globe-ball animations replay `ordered` then `bonus`; they do not generate results. The raw verified word, derived outcomes and winners can be read on-chain before an animation completes. There are no secret per-ball releases. Reconnection should resume or replay the stored result without calling any randomness endpoint again. With zero tickets show “No draw — carryover retained.” With cancellation show actual refundable funds and third-party charges, never a guaranteed full refund.

Involuntary shared recovery NFTs after a missed ETH cashout or a pre-draw NFT cancellation use the explicit co-owner nomination mechanism documented in `docs/OPERATIONS.md`. These are recovery assets, not ordinary single-winner NFT jackpots. Do not quote an invented resale value.
