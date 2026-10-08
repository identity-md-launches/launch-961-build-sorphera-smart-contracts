# Sorphera dependency verification

**Current target: Ethereum mainnet.** See [MAINNET.md](MAINNET.md) and `reference/mainnet/` for this continuation's pinned integration evidence. The remainder of this file preserves the earlier Sepolia readback as historical evidence, not the mainnet configuration.

Read on 2026-10-08; block 11,866,914 on Ethereum Sepolia (11155111). Application contracts have **not** been deployed.

| Dependency | Published/observed address | Verification |
| --- | --- | --- |
| FWAV2 | `0x8D62A3eb2AC9Fc0148f1A69CAC3Eb2c71623AA90` | Code present, 24,563 bytes; verified source and ABI retrieved; incompatible builder version |
| FWAV2Rewards | `0xB013ec82d838a2e0f9AAF95847ccee2c89788fb8` | Code present, 12,056 bytes; matches pool's `rewards()` and its own `fwa()` |
| FWA test token | `0x14ea7A2087E32610C08c5210E16aD163353F5Fe5` | Code present, symbol FWA; matches pool and rewards |
| FWA hook | `0xf86c9c7e3B4EB188ee351EE7304001ECdc40e444` | Token/rewards wiring agrees |
| FWA PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | Token/rewards wiring agrees |
| Canonical Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Token's reported Permit2; required by reference helper flow |
| Lottery Chainlink VRF v2.5 coordinator | `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B` | [Chainlink official Sepolia reference](https://docs.chain.link/vrf/v2-5/supported-networks#ethereum-sepolia-testnet); code present, 24,094 bytes |
| Lottery gas lane | `0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae` | Published 500 gwei Sepolia key hash; owner must recheck before setup |
| FWA transfer helper | Not supplied/verified on Sepolia | Owner-configured after an independently verified compatible deployment is identified |
| Lottery subscription | Company-specific, unset | Owner supplies its own funded ID; never infer it from FWA |

FWA addresses: [Sepolia documentation](https://www.fwa.fun/docs/v2-sepolia). The local RPC gateway is a transport only and is not a source citation.

## Observed compatibility gap

The explorer-verified Sepolia pool calls `registerAcquisition(requestId, purchaser, fee, surchargeBps)`; it does not pass the immediate caller into rewards accounting. Its rewards ABI has emission-era fields and lacks `builderRewardBps()`. A live call to that getter reverted. This is materially different from the [current builder specification](https://www.fwa.fun/docs/builder-revenue), which attributes acquisition and later settlement revenue to the original caller and uses actual allowances.

The [reference builder repository](https://github.com/adamlizek/fwa-examples), commit `a54aa65d47173cde00dd337d40e5f6d0a1b9b546`, was read. The router/purchaser split and narrowly scoped Permit2 authorization follow that design. Sorphera uses its own small interfaces and implementations; no upstream pool implementation is silently deployed or substituted.

`SorpheraRouter.configure` requires the modern getter plus pool/rewards/token/market/helper wiring and distributor status. The old public dependency fails before sales can activate. Those interface checks do not prove that a malicious contract implements correct builder attribution: verify source and a real acquisition/settlement trace on the candidate deployment before use.

Observed live `settlementWindow()` was **86,400 seconds**, `finalizeWindow()` **604,800 seconds**, and `selectionTimeoutBlocks()` **30**. These differ from the mainnet reference's one-hour snapshot. `quoteAcquisitionPrice()` returned zeros in that read's pool/gas context; zero-fee/empty-pool quotes are not actionable acquisitions. Sorphera quotes again in each transaction and rejects zero acquisition fees. Quote using the intended transaction gas price because FWA VRF cost can depend on it.

Raw data and provenance:

- [RPC readback](reference/sepolia-readback.json)
- [Verified Sepolia pool ABI](reference/FWAV2.sepolia.abi.json)
- [Verified Sepolia rewards ABI](reference/FWAV2Rewards.sepolia.abi.json)
- [Source hash and reference commit](reference/verification.json)
- [Actual fork test](../integration/Sepolia.t.sol)

## Reward delivery and permissions

FWA transfers between ordinary accounts/contracts are restricted. Builder rewards are claimed only when the router has a positive `tokenBuyAllowance`; no fixed emission rate or revenue is assumed. `claimBuilderRewards` buys at least the company-specified `minOut`, then atomically queues the newly received tokens into a verified transfer helper. Purchaser epoch tokens stay in the originating vault and can only be queued by the entitled ticket owner after a result/refund entitlement exists.

Permit2 authorization binds the exact token, amount, helper, nonce and deadline; ERC-1271 accepts only the active digest, only from canonical Permit2, and only during the synchronous deposit. There is no general signing, approval or arbitrary call method. The helper's next-block claim is a separate operation. A paused helper or changed distributor permission can delay delivery without allowing a company withdrawal of purchaser tokens. Emergency builder ETH recovery relies on the external rewards module's own exit preconditions and transfers only the actual balance increase.

The application does not interact with a DEX, deploy a pool or sell purchaser tokens. Existing rewards/helper/market functionality must retain its documented permissions and liquidity. Purchaser tokens are disclosed as in-kind prize/recovery rights, separate from ETH prize value and NFT inventory.
