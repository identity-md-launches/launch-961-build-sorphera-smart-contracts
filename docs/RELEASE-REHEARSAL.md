# Passport deployment integration and release rehearsal

This iteration wires `SorpheraPassport` into the actual deployers, decoders, manifests and
release checks. Nothing was signed, funded, broadcast or deployed; launch 961 stays parked and
its protected `launch.json` is untouched. Fixture values are labelled local; production owner
and qualifying price remain unapproved inputs and are left unset.

## Deployment order and bindings

1. `SorpheraRouter(owner)`
2. `SorpheraVaultFactory(router, owner)`
3. `Sorphera(owner, factory, coordinator)`
4. `SorpheraPassport(lottery, qualifyingPriceWei)` — immutable price, no owner
5. Owner: `factory.setLottery(lottery)` once, then `lottery.setPassport(passport)` once
6. Owner: `router.configure(pool, helper)`, `configureRules` for **both** games with
   `price == qualifyingPriceWei`, `configureRandomness`, `configureVRFReserve`, `validateLaunch`
7. `ReleaseChecks.requireReady(...)` (or `tools/preflight.py`) must pass with sales disabled.
   Enabling sales is a separate, later owner decision outside this task.

`qualifyingPriceWei` must satisfy the lottery's own price rule (`>= 10`, `<= 100 ether`,
multiple of 10) and equal the frozen price of both intended qualifying games. Rounds frozen at
any other price are ineligible for stamps and reward entries; earned rewards are never repriced.
`5000000000000000` wei (0.005 ETH) is only the local fixture value.

## Fail-closed checks (`script/ReleaseChecks.sol`)

`verify(Expected)` reverts with a named reason on: wrong chain, unset owner, missing code at
router/factory/lottery/passport/coordinator, owner mismatch on any contract, `factory.router`,
`lottery.factory`, `lottery.coordinator` or `deploymentChainId` mismatch, `factory.lottery()` not
bound, `lottery.passport() != passport`, `passport.lottery() != lottery`, wrong
`qualifyingPrice`, Passport constants changed, a game frozen at another price, and enabled
sales. `requireReady` additionally requires both games configured and `launchValidated`.
`expectPassportCode(passport, lottery, price)` deploys a throwaway Passport with the same
immutables in local simulation and compares runtime code hashes, so the checked Passport is
exactly this source with exactly these constructor inputs (never broadcast that call).

A missing or misbound Passport blocks readiness even though ordinary `buy` works without it;
`test/SorpheraRelease.t.sol::testMissingPassportBlocksReadinessWhileOrdinaryBuyWorks` pins it.
The checks live outside `Sorphera` on purpose: its runtime is 210 bytes under EIP-170.

## Rehearsal commands (local simulation, no broadcast)

```sh
# Offline: actual deployer through an etched coordinator on simulated chain 11155111.
FOUNDRY_FUZZ_SEED=0x9d6409c255b9eaceb9006c4d992dc2b3264ebfab44a255a1463634c19f415f0a \
  forge test --match-contract SorpheraReleaseTest -vv

# Mainnet fork rehearsal; the requester's OWNER and QUALIFYING_PRICE_WEI are mandatory inputs.
forge script script/Rehearse.s.sol:Rehearse \
  --sig 'run(uint256,address,address,bytes32,uint256)' 1 "$OWNER" \
  0xD7f86b4b8Cae7D942340FF628F82735b7a20893a \
  0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9 "$QUALIFYING_PRICE_WEI" \
  --fork-url "$MAINNET_ARCHIVE_RPC" --fork-block-number 26145236 -vvvv

# Sepolia preparation rehearsal (controlled FWA mocks + published coordinator), never live.
forge script script/SepoliaCanary.s.sol:SepoliaCanary --sig 'run(address,uint256)' \
  "$OWNER" "$QUALIFYING_PRICE_WEI" --fork-url "$SEPOLIA_ARCHIVE_RPC" --fork-block-number 11866914 -vvvv

# Read-only preflight of a filled external configuration copy (null drafts exit UNCONFIGURED).
python3 tools/preflight.py /path/to/filled-config.json --rpc-url "$RPC" --block "$BLOCK"
```

The Sepolia canary CLI (`tools/canary.py`) now deploys the Passport fourth with the frozen
canary ticket price, binds it (`bind-passport`), verifies both bindings, the price and disabled
sales before any subscription work, and after both rounds are `Won` processes the controller's
17,100 paid entries into 1,425 rewards as journaled evidence (`evidence.passport`). Live
execution remains **NOT RUN** (company signer, subscription, test funds and authorization).

## Manifests and release artifacts

- `deployments/mainnet.launch.json` (draft, separate from Sepolia) adds `SorpheraPassport`
  with `["$contract:Sorphera", null]`; the null is the unapproved production price and the
  post-deployment owner actions are listed in the file.
- `deployments/sepolia.launch.candidate.json` is the concrete candidate patch for the
  protected `launch.json` of parked launch 961. It is **not applied**: protected records and
  hashes were not edited. IMD applies it through the manifest step once the requester confirms
  the Sepolia qualifying price (the brief's default 0.005 ETH is noted, not assumed).
- `deployments/mainnet.json`, `sepolia.json`, `fork.json` and `config.schema.json` gained
  `passport` and `qualifyingPriceWei`; `tools/preflight.py` requires the price, checks it
  against both games' rules and, once the lottery is set, verifies both bindings on chain.
- `frontend/abi/*.json` and `frontend/bytecode-sizes.json` were regenerated from the final
  build (`forge build && python3 tools/export.py`). `frontend/deployment.json` lists the
  Passport (null address) and `frontend/configuration.json` records constructor inputs,
  post-deployment binding, appended Round fields and the Website follow-ups.
- Runtime hashes: the rehearsal compares the deployed Passport code hash against a reference
  deployment with the same immutables and reports both code hashes in `Resolved`. No hash was
  hand-written; production hashes exist only once a deployment receipt exists.

## Decoders

`tools/canary.py` decoded `getRound` with a hard-coded 22-field tuple; the Round struct now has
24 fields (`paidEntries`, `rewardEntries` appended). The signature was corrected and
`tools/test_canary.py::test_round_signature_matches_exported_abi_with_passport_fields` pins it
to the exported ABI, together with `tickets(...).reward` and `Cancelled.tickets` (paid count).
`tools/keeper.py` reads the exported ABI through `tools/contracts.py`, so `sold` keeps its
meaning (total entries) and the appended fields decode without code changes.

## Validation table

Source revision: working tree on top of `bbe3fa9` (PR #9). Toolchain: Forge 1.8.3
(`cae51ad4`), Solidity 0.8.26, optimizer 200, via IR, Cancun, metadata hash none, Python 3.12.
Automated checks are not an audit.

| Command | Network / block | Result | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| `forge build` | offline | PASS | sizes below | — |
| `FOUNDRY_FUZZ_SEED=0x9d64…f0a forge test --summary` | offline | PASS, 108 tests, 0 failed (9 suites incl. new `SorpheraReleaseTest` 5/5, `SepoliaCanaryTest` 2/2, Passport 27 + 2 invariant properties) | this run | — |
| `forge fmt --check` (default and integration profiles) | offline | PASS | this run | — |
| `python3 -m unittest discover -s tools -p 'test_*.py'` | offline | PASS, 49 tests (10 canary incl. 2 new) | this run | — |
| `python3 tools/export.py` | offline | PASS; Sorphera 24,366 B runtime (limit 24,576; 210 B headroom), Passport 4,582 B | `frontend/bytecode-sizes.json` | — |
| `FOUNDRY_PROFILE=integration forge test --match-contract SorpheraMainnetForkTest --fork-url https://one.valve.city/rpc/vk_demo/evm/1 --fork-block-number 26145236 -j 1` | chain 1, block 26,145,236, hash `0xf7795aa3ff4975e1f907099acb0bdbefcead6ee7d85b0cca23584ce0704de179` (re-read from the endpoint this run) | PASS, 12/12 (11 existing + new `testRealPassportPaidEntriesEarnRewardAndFreeEntryFundsNothing`); setUp deploys and binds the Passport and `ReleaseChecks.requireReady` passes before the fork-only sales enable | this run; real FWA pool/rewards/helper/coordinator bytecode unchanged | none (callbacks and funding simulated; not live VRF) |
| `FOUNDRY_PROFILE=integration forge test --match-contract 'ConstructorRehearsalTest\|SorpheraSepoliaIntegrationTest' --fork-url $SEPOLIA_ARCHIVE_RPC --fork-block-number 11866914` | chain 11155111, block 11,866,914 | PASS, 3/3 (constructor order with the real coordinator code, explicit owner substitution, published-dependency reads); block hash `0x06d1c4d2944979bd9048d237637ab747cd808508b1ff83768d9ea178ba20dd99` re-read this run via `https://one.valve.city/rpc/vk_demo/evm/11155111` | — | none; note `https://ethereum-sepolia-rpc.publicnode.com` refuses the pin (`pruned history unavailable`, earliest 11901040), so an archive endpoint is required |
| `forge script script/Rehearse.s.sol:Rehearse ... 1 "$OWNER" ... "$QUALIFYING_PRICE_WEI" --fork-url $MAINNET_ARCHIVE_RPC` | chain 1 fork | NOT RUN as a script: the requester's owner and production qualifying price are unapproved inputs; the identical path runs offline in `SorpheraReleaseTest` and on the fork in `SorpheraMainnetForkTest.setUp` with fixture values | — | owner, qualifying price |
| Live Sepolia canary (`tools/canary.py --mode live-sepolia`) | Sepolia live | NOT RUN | — | company signer, subscription, funds, authorization |
| Private IMD gate rerun | — | NOT RUN | — | runner unavailable |
| Historical: mainnet fork 11/11, Sepolia 3/3 (PR #3 toolchain) | historical | historical only, not current evidence | `docs/evidence/` | — |

### Fork runs

The mainnet fork run used the documented public Valve endpoint without an API key. The new
fork test enters 24 paid tickets through `SorpheraPassport.enter` (12 would fund less than
one real FWA draw, about 0.076 ETH at the pin), checks exact 90/10 ETH forwarding and player
ownership, acquires and settles through the real pool, draws with an impersonated coordinator
callback, processes stamps once (24 → 2 rewards, idempotent), then redeems one reward into
round 2 with no vault funding and a `reward` ticket owned by the player, and claims the round 1
prize with liabilities conserved. The first attempt reproduced an `acquisition budget` revert
with 12 tickets; that is a fixture sizing fact, not a contract defect, and is recorded here.

Fork passes use `vm.deal` funding, a fork-only subscription and coordinator impersonation for
callbacks; they are not live VRF proof or billing evidence. Dependency bytecode is never
replaced.

## Lifecycle coverage for this candidate

Offline, through the rehearsed deployment (`test/SorpheraRelease.t.sol`): direct buy and paid
Passport entry with exact 90/10 ETH forwarding and player ownership; 12 qualifying paid entries
→ own round `Won` → finalization → one reward, idempotent processing, wallet isolation; equal
ETH claims for direct and Passport tickets; mixed free+paid redemption in the other game
funding only the paid share; insufficient-credit revert; underpayment revert; cancellation
without inventory → paid-cohort divisor, reward ticket refused by `entitlement`, reward
restored exactly once, no stamp for the cancelled paid entry, conservation of liabilities;
readiness refusing enabled sales. The existing `test/SorpheraPassport.t.sol` (27) and
`SorpheraPassportInvariant.t.sol` cover remainders across games/rounds, free-only batches,
fees/budget, reward winners in the separate NFT tie-break and vault claims, FWA token and NFT
recovery rights, zero-paid cancelled cohorts with carried late recoveries, retries, duplicate
processing and nested redemption; they were re-run here with the verifier seed.

Gas and limits unchanged: 100 tickets per transaction, 8 acquisitions, 50 reconciliation /
Passport processing keys, 20 NFT claims, 32 reward epochs. Deployed sizes are in
`frontend/bytecode-sizes.json`.

## Known issue recorded separately

Permanent accepted-VRF nonfulfillment is still unresolved and deliberately untouched: no
reroll, replacement seed, discretionary cancellation or winner change was added. See
`docs/REVIEW-CONTINUATION.md`.

## Website follow-ups (later Website task)

Use the regenerated `frontend/abi/Sorphera.json` (Round has `paidEntries`/`rewardEntries`,
`tickets` returns `reward`) and `frontend/abi/SorpheraPassport.json`; read `summary`,
`roundCredit`, `processed` and the `StampsCredited`/`RewardsRestored`/`RewardsRedeemed` events;
redeem through `SorpheraPassport.enter`; show `Cancelled.tickets` as the paid cohort; add the
Passport address and `qualifyingPriceWei` to `frontend/deployment.json` once deployed; never
import browser demo records as entitlements.
