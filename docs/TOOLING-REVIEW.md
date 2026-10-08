# Operations tooling review and executed evidence

The separate tooling reviewer implemented adversarial transaction-engine tests and exercised the keeper against an actual local Anvil Sepolia fork. The root implementer built the keeper; another contributor built the canary and its controlled FWA dependencies. This automated contributor review is not a professional audit. Contract findings and oracle policy limits remain in the main review/release documents.

The first transaction-engine regression run reproduced five failures before repair: checkpoint hashes were not checked; independent state files could race one sender; adopted fee replacements bypassed spend accounting; replacement gas ceilings were not enforced; and a replacement disappearing before confirmation could cause the original signed bytes to be rebroadcast under the replacement hash. The repaired engine checks canonical checkpoints, locks each chain/sender across journals, validates and accounts replacement budgets, and refuses to rebroadcast an adopted replacement without its own signed bytes. External replacements can only retain the original sender, nonce, recipient, calldata and value. Operator adoption does not authorize fresh randomness.

The worker sends only permissionless maintenance calls. It rejects a sender that owns the lottery, factory or router. Transport failures exit 75 for supervisor retry; safety halts exit 2. A lost broadcast response retains the signed intent before any retry. An accepted draw or tie request is monitored without replacement, including after delayed callbacks and restart. Permanent nonfulfillment is still an unresolved lockup.

Event-only reorganization recovery is explicit:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper.py \
  --config /secure/sorphera/keeper.json --state /var/lib/sorphera/keeper.json \
  --recover-checkpoints
```

This first checks that every journaled transaction has a canonical confirmed receipt. It then clears event checkpoints/discovery cursors and rescans from the original configured deployment block, retaining all transactions and maintenance cooldowns. Pending transactions or orphaned receipts require operator investigation; this command refuses to erase them. Keep the dedicated sender and its single journal on one host; the file lock does not coordinate separate hosts.

The executable local smoke command is:

```sh
anvil --fork-url "$SEPOLIA_ARCHIVE_RPC" --fork-block-number 11866914 \
  --chain-id 11155111 --port 18547 --silent
PYTHONDONTWRITEBYTECODE=1 python3 tools/keeper_smoke.py \
  --rpc-url http://127.0.0.1:18547 --output /tmp/sorphera-keeper-smoke.json
```

The script refuses public RPC endpoints and requires loopback Anvil plus genuine Sepolia coordinator code. It uses production lottery/router/factory/vault callbacks, controlled `CanaryDependencies` FWA mocks and explicitly impersonated coordinator callbacks on the local fork. Known mock words select fixture tickets; this procedure is unsuitable for a live canary and does not attest Chainlink proof verification or billing. No public transaction was broadcast.

The pinned fork was block **11866914**, hash **0x06d1c4d2944979bd9048d237637ab747cd808508b1ff83768d9ea178ba20dd99**. The script verifies the returned block number in decimal before recording that hash. Anvil was **1.8.3**. Both games completed: permissionless opening; bounded acquisition; urgent FWA settlement; closing; two accepted draw requests; a two-hour callback delay across worker restarts; draw finalization; a distinct NFT tie request and callback; finalization; ETH claims and verified NFT custody. Each keeper iteration opens the persisted journal anew. The owner/controller is separate from the keeper sender, and controlled purchases enable and disable test sales atomically.

Two fixture issues were corrected during execution. An immediate receipt lookup on the fork could race local mining and trigger a slow archive lookup; the smoke fixture now mines locally after sends and retries read transport failures. Publicly known Anvil development addresses had existing EIP-7702 delegation code on the real Sepolia snapshot; receiving a prize invoked that code and drained their simulated balance. The fixture now clears code and assigns simulated balances **only to its two local test actors**, leaving dependency bytecode unchanged. Live Sepolia submission refuses any sender with deployed or delegated code, and requires a dedicated company EOA with a secure external signer.

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tools -p 'test_*.py' -v` passed **47 tests, 0 failed, 0 skipped**: 24 runtime, 15 keeper and 8 canary tests. Tests cover signer mutation, dry-run zero submissions, funding/gas ceilings, lost responses, dropped/pending/replaced/reverted transactions, receipt/checkpoint reorgs, checkpoint recovery, duplicate workers, bounded scans and acquisitions, deadline ordering, funding depletion, callback waiting, permissions and supervisor behavior. The separate real local-Anvil engine test confirmed that a lost broadcast response plus restart used exactly one nonce.

Evidence is in [tooling-tests.log](evidence/continuation/tooling-tests.log), [runtime-simulation.json](evidence/continuation/runtime-simulation.json) and [keeper-fork-simulation.json](evidence/continuation/keeper-fork-simulation.json). The fork artifact includes actual **local simulation** transaction receipts, coordinator request logs, and three separately labelled simulated callbacks. These are deliberately separate from live oracle evidence. **Live Sepolia VRF: NOT RUN**; company authorization, a dedicated funded test wallet/secure signer, subscription ownership/funding and a Sepolia RPC remain external inputs.
