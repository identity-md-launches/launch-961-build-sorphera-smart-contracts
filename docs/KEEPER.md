# Executable Sorphera keeper

`tools/keeper.py` is a runnable permissionless worker using Python 3.12 standard library and Foundry (`cast`). Build and export ABIs first. It defaults to **dry-run**. This assignment does not authorize mainnet submission; the worker refuses live mainnet RPCs. Explicit live submission is supported for company-authorized Sepolia tests, and loopback Anvil forks can submit simulated transactions with `localFork=true`. `script/Operations.s.sol` remains an unsigned onchain-call planner; the Python worker needs no planner deployment.

## Setup and permissions

Copy `ops/keeper.example.json` to an external configuration directory, fill nulls with verified deployment/operator inputs, and review `ops/keeper.schema.json`. Never fill deployment fields with example addresses. Monetary limits are decimal strings in wei; `minimumVRFBalance` is native wei or LINK juels according to the round's frozen currency. `acquire=false` is the starting operational choice; enable bounded FWA purchases only after reviewing that round's immutable budget and fee/total/backing/slippage policy. The worker cannot amend those bounds. It quotes immediately and simulates before signing.

Use a **dedicated keeper sender**, separate from owner, factory/router owner, treasury, purchaser and subscription administrator. The worker refuses ownership of the three application admin contracts and never builds treasury/configuration/sales-enabling calls. A transaction contains no keeper-supplied ETH value. Keeper gas and company subscription funding come from separate company funds, never prizes or purchaser refunds.

Signing uses an externally managed Clef-compatible `account_signTransaction` endpoint. Keep that signer on an authenticated local/private transport with an operator-enforced policy restricting chain, sender, lottery/vault addresses and maintenance selectors. No private key/password is accepted by these CLIs. Anvil `eth_signTransaction` is permitted only for explicitly verified local simulation. Never expose an unlocked RPC publicly. Only one host may use a sender; a local per-sender lock and per-journal lock prevent competing local workers, but there is no distributed leader election. Assign distinct gas wallets to separate hosts or use a single active supervisor.

Live Sepolia requires a dedicated EOA with no deployed code or EIP-7702 delegation. An external signer alone does not establish that receiving ETH is passive: the fork smoke test encountered existing delegation code on publicly known development addresses. The local test normalizes its actor accounts; the live worker instead refuses such a sender.

```sh
forge build
PYTHONDONTWRITEBYTECODE=1 python3 tools/export.py
# Inspect current chain and next simulated action; does not sign or broadcast.
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper.py \
  --config /etc/sorphera/keeper.json --state /var/lib/sorphera/keeper.json --once
# Start a continuously polling dry-run process; terminate with SIGTERM / Ctrl-C.
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper.py \
  --config /etc/sorphera/keeper.json --state /var/lib/sorphera/keeper.json
# Only after company authorization and test funds, on Sepolia:
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper.py \
  --config /etc/sorphera/sepolia-keeper.json --state /var/lib/sorphera/sepolia-keeper.json \
  --mode live-sepolia --authorize-test-wallet
# Local fork, verified loopback Anvil RPC and localFork=true:
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper.py \
  --config /tmp/sorphera-fork-keeper.json --state /tmp/sorphera-fork-state.json \
  --mode local-fork --once
```

`ops/sorphera-keeper.service` is a supervisor template. The hosting operator supplies Python/Foundry, the repository at `/opt/sorphera`, a restricted `sorphera` OS user and external configuration. Review paths before installing. `systemctl start sorphera-keeper`, `systemctl stop sorphera-keeper`, `systemctl restart sorphera-keeper` and `journalctl -u sorphera-keeper -f` are start/stop/recovery/log commands. The supplied unit runs dry-run; a reviewed service override must explicitly add the Sepolia flags to submit. Exit 2 means operator review is required; transient RPC outages exit 75 for bounded supervisor restart. SIGTERM stops between bounded RPC operations; journaled transactions remain recoverable. Hosting and operating funds are external prerequisites.

## Work scheduling

Round events are discovered in bounded block pages from `deploymentBlock`, then checked against canonical `getRound`. FWA allocation logs for tracked pools trigger urgent work, including old-round late allocations. Each round also receives a 50-request rotating scan, with durable cursors to recover missed/late events. All observed allocations are sorted by the earlier of live settlement and finalize deadlines. Refund/reconciliation and draw progress precede new acquisitions. Set polling/page capacity for the actual load; no offchain worker can guarantee timely settlement during RPC/network outages or arbitrarily large backlogs. Watch structured `urgent_settlement` alerts and provision enough throughput well before the one-hour FWA windows.

The worker supports opening due rounds, <=8 acquisitions, <=50 FWA processing/reconciliation, settlement, stuck-NFT recovery, purchaser refund withdrawal, ETH synchronization, closing, draw requests, finalization, independent tie requests and tie finalization. Every pending request is reconciled before a new transaction is planned. Accepted lottery draw/tie requests only generate wait/funding alerts, never another randomness request. During the new cancellation sweep, a successful `requestDraw` may leave status `Closed`; the next call continues the stored cursor. NFT cancellation without inventory can progress despite permanently pending FWA requests.

Price, budget, blackout and backing checks occur before acquisitions; contract checks remain authoritative. The worker rereads the round subscription and consumer membership and compares funding with both the configured alert floor and frozen onchain floor. Owner-controlled key/config changes or coordinator errors can still block a request; they require investigation, not a different random result. `process` calls have a configurable cooldown because FWA can report zero progress. Gas estimation adds 25% headroom; gas price adds 20%, bounded by per-transaction and cumulative spend ceilings. Expensive acquisition/cancellation/collection calls that exceed the configured gas ceiling are reported and left for smaller existing permissionless reconciliation batches.

## Durable journal and recovery

State is external to the repository, written atomically with fsync, and bound to chain and sender. It includes signed **public transaction bytes**, hashes, immutable action fingerprints, receipts, conservative cumulative spend, block checkpoints, event/round cursors and retry cooldowns. Securely retain and back it up; do not start a fresh empty journal for the same operating wallet while a transaction is pending.

An external signer is asked to sign only after a fresh simulation, gas/spend checks and nonce reconciliation. The signed sender/chain/nonce/value/calldata/gas are decoded and verified, then saved **before broadcast**. Lost responses and restarts rebroadcast exactly the same signed bytes. The worker waits for configured receipt confirmations. It never automatically bumps fees or creates a second transaction to replace a pending request.

Unknown consumed nonces halt. An operator may make a fee replacement externally and adopt its **mined** hash only if sender, target, nonce, value and calldata are identical and configured ceilings still hold:

```sh
python3 tools/keeper.py --config /etc/sorphera/keeper.json \
  --state /var/lib/sorphera/keeper.json --adopt 'ACTION_ID_FROM_LOG' 'MINED_TRANSACTION_HASH'
# Only for an explicitly investigated, confirmed reverted action:
python3 tools/keeper.py --config /etc/sorphera/keeper.json \
  --state /var/lib/sorphera/keeper.json --retry-reverted 'ACTION_ID_FROM_LOG'
```

Receipt/checkpoint block hashes are checked on restart and each iteration. A reorganization halts before signing: preserve the journal, identify the common canonical ancestor, inspect every affected deployment/request/receipt, rescan canonical logs, and resume from an operator-reviewed recovered journal. There is deliberately no automatic replay of orphaned deployment or accepted-randomness actions. Restoring a pre-reorg backup without checking pending nonces and canonical state is unsafe. The tool fails closed rather than guessing whether a mined result can be repeated.

For a checkpoint-only reorganization, use the bounded recovery command after reviewing the configured original `deploymentBlock`:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper.py \
  --config /etc/sorphera/keeper.json --state /var/lib/sorphera/keeper.json \
  --recover-checkpoints
```

It verifies every journaled receipt remains canonical and refuses pending or orphaned own transactions. It then clears discovered rounds, allocation queues and scan cursors to rescan from `deploymentBlock`, retaining the complete transaction journal, spend accounting and cooldowns. It sends no transaction. This command cannot resolve an orphaned accepted randomness request; investigate those cases independently before any further submission.

The keeper does not submit winner claims, choose claim recipients, claim company rewards or withdraw fees. Those actions belong to the entitled ticket holder/company signer and the canary workflow exercises authorized claims separately. Permanent VRF nonfulfillment remains unresolved even with funding alerts and these safeguards.
