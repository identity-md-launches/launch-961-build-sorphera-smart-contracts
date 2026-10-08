# Mainnet integration evidence

The reproducible pin is Ethereum mainnet **26,145,236**, hash `0xf7795aa3ff4975e1f907099acb0bdbefcead6ee7d85b0cca23584ce0704de179`. Use the machine-readable `deployments/fork.json` and `reference/mainnet/snapshot.json` as authoritative for the full hash (and verify it with your archive RPC). All addresses below are external dependencies; Sorphera remains undeployed.

| Dependency | Address | Runtime bytes at pin |
| --- | --- | ---: |
| Pool | `0x958C41181182e76F221331b2755b77D9e1426A98` | 24,390 |
| Rewards | `0xA54b44C7a894AA19C49734A753D01f9B8C5f6516` | 11,751 |
| Token | `0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845` | 11,394 |
| Transfer helper | `0xcE6d5B618e034f87C7a8B6dCa65FB8669b8c301B` | 3,778 |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9,152 |
| Token hook | `0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444` | 7,072 |
| PoolManager | `0x000000000004444c5dc75cB358380D2e3dE08A90` | 24,009 |
| Lottery/FWA coordinator | `0xD7f86b4b8Cae7D942340FF628F82735b7a20893a` | 24,094 |

`reference/mainnet/` contains deployed runtime bytes, keccak hashes, full Sourcify ABIs, compiler/deployment provenance and RPC readbacks. These are evidence, not bundled replacements for the live contracts. The [FWA deployments](https://www.fwa.fun/docs/v2-deployments), [builder revenue](https://www.fwa.fun/docs/builder-revenue), [testing guide](https://www.fwa.fun/docs/testnet), [builder examples](https://github.com/adamlizek/fwa-examples) and [Chainlink network bindings](https://docs.chain.link/vrf/v2-5/supported-networks#ethereum-mainnet) were checked again. The mainnet verified pool passes the immediate caller to rewards; the published old Sepolia implementation does not.

At the pin: pool→rewards→pool and both token bindings agree; rewards/token agree on hook/PoolManager. Helper/token agree on canonical Permit2. Helper, rewards and PoolManager have token distributor permission; helper deposits are unpaused. Token symbol is FWA, decimals 18; token is launched and the hook permits external buys. The token's legacy `pool()` points to V1 rewards, not V2; V2 has its own bound buyback. Do not infer purchaser emissions by assuming this token getter points at V2.

The observed builder share is **1,500 bps of eligible protocol fees**, not 15% of ticket sales or acquisition price. Acquisition owner fee is 100 bps at this pin. A request snapshots its builder share. Successful allocation credits `floor(floor(acquisitionFee * ownerAcquisitionFeeBps / 10000) * builderShare / 10000)`; unsuccessful/refunded requests earn no builder credit. Final settlement can add a share of actual eligible protocol fees. The tests compare actual rewards events and allowances, including zero-fee outcomes. Rates remain mutable and are always read; no reward guarantee appears in lottery economics.

The immutable VRF service is `0xCACBd874e24B533935176154E990Bf710F56693A`, and notifier `0x612dF3a344990F8E53499ec1bC79Be63cFa496D0`; `source-bindings.json` proves the immutable offsets against the captured pool runtime. `floorOracle()` and rewards `buyback()` are captured too. Ancillary service/notifier/buyback full ABI retrieval returned Sourcify 404; this source-verification limitation is recorded rather than filled with an assumed ABI. Their bytecode and actual integration call traces remain available.

The pin's quote is **76,489,597,901,739,825 wei**, of which FWA VRF service fee is zero **at a zero-gas-price eth_call**. At the explicit 1 gwei fork assumption, the service charges 1,040,000,000,000,000 wei (0.00104 ETH); use `quoteAt1Gwei` in the snapshot. The pool has 3,267 active listings; five ready requests precede our fork requests. Both external settlement and finalize windows are **3,600 seconds**, selection timeout 30 blocks, positive selection slippage 1,000 bps. These are observations, never production defaults. The fork processes the existing ordered queue before quoting round terms, so its subsequent acquisition quote can differ. The fork uses an explicit **1 gwei** transaction gas assumption and derives fee/total/value bounds from the current quote/backing; production inputs stay unset.

Chainlink's onchain config at this pin requires ≥3 confirmations and ≤2,500,000 callback gas; gas after payment calculation is 38,900, native premium 24%, LINK premium 20%, flat fees zero. Sorphera uses a chosen published key, also verifies it remains active, and reads the live confirmation/gas limits. A gas lane is a cap, not an estimate or funding guarantee. Budget separately for two weekly draws **plus a possible third NFT tie-break**, proof verification, callback/overhead gas, premiums, LINK conversion if selected, maintenance and peak gas prices. Preflight against the selected key's maxGas and company reserve; canary-measure bills. The fork's 5 ETH subscription deposit is artificial funding, not a recommended mainnet reserve. Proof billing is unverified here.

## Fork semantics

`integration/mainnet/Mainnet.t.sol` uses real pool/rewards/token/helper/Permit2/market/coordinator bytecode unchanged. No `vm.etch`, `vm.store`, `mockCall` or replacement FWA deployment is used. It creates only Sorphera contracts and a subscription on fork state, adds the lottery as consumer, and funds test wallets with `vm.deal`. The success paths do not impersonate FWA administrators. Two separately named fault tests impersonate the actual pool/rewards owners through real setters: a zero positive-drift tolerance is configured before purchase to test ordered price-drift refunds, pending-request price changes are rejected, and builder-rate changes verify request-time rate snapshots. These fork-only configuration changes are not live observations.

FWA and lottery `rawFulfillRandomWords` are called by **test-only coordinator impersonation**. Forks receive no automatic live Chainlink callbacks. The tests exercise the real request path and application callback authentication/state transitions, but bypass proof verification and fulfillment billing. Callback words deliberately produce test outcomes. A temporary router impersonation plus snapshot/revert previews the real builder token purchase to set a 1% minimum-output bound; no simulated preview persists. Test owner/treasury addresses and subscriptions must never populate mainnet deployment artifacts.

Purchaser epoch accounting is checked independently: the vault, not router, gets the acquisition unit. A positive live epoch pot must deliver its actual pro-rata balance; if the live pot is empty the test asserts a no-reward revert and does not invent emissions. Offline tests separately cover nonzero late purchaser distributions and helper failures.

Liquidity evidence is the actual builder allowance purchase on the real v4 pool and helper queue/next-block delivery. It proves that tested amount at the pin, not future depth or a minimum company return. Fresh quotes, minimum output and deadlines remain mandatory.

## Reproduction

```sh
python3 tools/snapshot-mainnet.py --rpc-url "$MAINNET_ARCHIVE_RPC" --block 26145236
FOUNDRY_PROFILE=integration forge test --match-contract SorpheraMainnetForkTest \
  --fork-url "$MAINNET_ARCHIVE_RPC" --fork-block-number 26145236 -vv -j 1
```

Use a fully functional archive endpoint supporting code, balances, storage, historical calls and block reads. Public providers may throttle or omit methods. `tools/read-only-rpc.py` optionally caches pinned responses on localhost, excludes write methods, and never modifies returned state. The default offline suite needs no RPC and reads no environment variables. Supplying the RPC to Forge's CLI is separate from test code.
