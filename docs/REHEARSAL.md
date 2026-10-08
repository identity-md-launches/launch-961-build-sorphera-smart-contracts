# Constructor rehearsal and IMD follow-up

Launch 961 remains parked on Sepolia. The public [launch record](https://api.imd.fun/launches/99bc23dd-15a8-4a58-9ce8-030ed7074f26), saved in `evidence/imd-launch-961.json`, reports six passed admission checks and `protected_invariants` failed in `invariants-11aebc2aca1e`: `application constructor failed`, `setUp()`, gas 0. It exposes neither which CREATE failed, the resolved addresses, the rehearsal block/state nor the inner revert data. Its manifest is valid and correctly ordered. The repository started exactly at reviewed commit `b06997d42012b7ad7ffe943b3acdd816b2092c4e`; there were no intervening changes.

## Findings and repair

The reviewed constructors require deployed router code before the factory, and deployed factory **and coordinator** code before Sorphera. An ordinary unforked Forge EVM has no code at the published Sepolia coordinator. Merely setting its chain ID does not import that code. This condition reproducibly rejects Sorphera after the first two deployments succeed. Incorrect `$contract` resolution or a factory constructed before its router also rejects construction. These are sufficient causes, **not a proven diagnosis of the private harness**. An RPC state-fetch failure can also surface as a zero-gas setUp failure; the initial mainnet fork attempt here encountered that transport error and was rerun using a different archive endpoint.

The public empty-state reproduction passes its expected-revert assertion, and the constructor sequence succeeds at Sepolia block 11,866,914 with the actual coordinator code. See `evidence/constructor-empty.txt` and `evidence/sepolia-fork-and-constructor.txt` for resolved fixture addresses, encoded constructor arguments and CREATE traces. The safeguards remain mandatory. Constructors now report `MissingRouterCode(address,chainId)`, `MissingFactoryCode(address,chainId)` and `MissingCoordinatorCode(address,chainId)` separately. `integration/rehearsal/Constructor.t.sol` emits the resolved test owner, dependencies, chain/block and code lengths, reproduces the empty-state refusal and executes the same dependency order against real Sepolia state. No coordinator is etched or substituted in this reproduction. `script/Rehearse.s.sol` accepts the real owner explicitly, checks the target network, creates router → factory → lottery, binds the factory as owner, and asserts disabled sales, exclusively in local simulation.

The available toolchain is Forge 1.8.5 (commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`). The earlier 1.7.1 result is requester-reported; IMD's attestation independently records Forge 1.8.3. All use the repository's Solidity **0.8.26**, optimizer **200**, `viaIR=true`, `evmVersion=cancun`, `bytecodeHash=none`. These exact IMD settings were compared to `forge config --json` (`evidence/compiler-settings.json`). The public attestation's bytecode gate passed, which weighs against a basic compiler mismatch. Neither old Forge executable is installed; no cross-version execution result is claimed. Build configuration and dependencies are unchanged.

## Public commands

```sh
# No fork: expected rejection is asserted, so the reproduction test itself passes.
FOUNDRY_PROFILE=integration forge test --match-contract ConstructorRehearsalTest -vvvv
# Real Sepolia state: constructor order and explicit owner substitution must succeed.
FOUNDRY_PROFILE=integration forge test --match-contract ConstructorRehearsalTest \
  --fork-url "$SEPOLIA_ARCHIVE_RPC" --fork-block-number 11866914 -vvvv
# Mainnet rehearsal, actual requester OWNER is mandatory; no --broadcast.
forge script script/Rehearse.s.sol:Rehearse \
  --sig 'run(uint256,address,address,bytes32)' 1 "$OWNER" \
  0xD7f86b4b8Cae7D942340FF628F82735b7a20893a \
  0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9 \
  --fork-url "$MAINNET_ARCHIVE_RPC" --fork-block-number 26145236 -vvvv
```

The `makeAddr` owner in the test is explicitly a fixture, never a deployment parameter. Production templates leave owner, treasury, company subscription and undeployed addresses null. The rehearsal does not validate subscription funding or enable sales; mainnet integration tests cover funding/consumer checks on a newly created **fork-only** subscription.

## Exact platform action required

IMD must rerun `invariants-11aebc2aca1e` on this reviewed source with its actual manifest resolver. Obtain: generated harness source/hash; CREATE/CREATE2 trace and failing contract name; encoded constructor calldata and decoded arguments; resolved `$owner` and `$contract:*` table; deployment order and transaction sender; chain ID, block number/hash and archive provider; `eth_getCode` length/hash at each dependency at each CREATE; complete inner revert bytes; Solidity standard JSON settings; Forge executable version/hash and command. The generic error/gas figure alone cannot distinguish these cases.

Use the chain named by that manifest, populate genuine dependency state from an archive fork, deploy preceding contracts before resolving later arguments, and propagate the original revert. Do not inject dummy code or disable code checks. If IMD's protected runner is intentionally offline and cannot retain authenticated chain state, its maintainers must provide a supported external-dependency rehearsal or an independently captured, authenticated state fixture. Application code should continue to fail in an empty environment.

`GET /reads/suite/protected_invariants` and the public launch-read attempt did not expose that harness. Its status remains **FAILED in the last public record / NOT RERUN by this assignment**, regardless of local test outcomes.

## Mainnet route and parked launch

[IMD continuation rules](https://imd.fun/docs/#continuing-a-project-job-continue) say `job.continue` updates the repository and rejects deployment/retargeting inputs. The [capabilities snapshot](evidence/imd-launch-capabilities.json) currently includes chain 1 with `evm_contracts`. Keep `launch.json` as the historical Sepolia manifest. `deployments/mainnet.launch.json` is a separate draft.

After independent review, the requester must authorize a **new `launch.open` with `onchain: "evm_contracts"`, `chainId: 1`, this repository and the delivered commit as `repoUrl`/`baseCommit`**, with the mainnet manifest selected and owner resolved by the platform. Alternatively, the company's deployment operator can deploy these immutable artifacts through its reviewed deployment process. Neither route is performed here. A continuation does not unpark, deploy or silently retarget launch 961. Do not create a token, pool or contributor reward contract.
