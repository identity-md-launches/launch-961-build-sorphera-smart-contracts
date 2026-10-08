# Sorphera offline verification

Run `forge test` with no environment or RPC. All dependencies in these tests are explicit mocks. `SimulatedSorphera` overrides only production network validation, requires chain 31337, and is never a launch artifact. Production `Sorphera` is exercised against real dependencies by the separate integration profile.

`Sorphera.t.sol`: economics, lifecycles, custody, recovery, callbacks and scaling. `SorpheraAdversarial.t.sol`: access, validation, boundaries, reentrancy and immutable terms. `SorpheraHardening.t.sol`: independent tie request/phase binding, locked claims, funding failure retry, immutable random config, wrong chains, changed helper permissions, inventory failure and constructor diagnostics. `SorpheraInvariant.t.sol`: six grouped properties over 256 runs × 64 handler calls, including funds, liabilities, inventory, cross-round outcomes and separate reward accounting. Some fuzz tests carry higher inline run counts.

The complete commands, actual execution counts, fork-oracle disclosures and remaining unrun gates are in [docs/TESTING.md](../docs/TESTING.md) and [docs/validation.json](../docs/validation.json). Nothing in `test/scratch/` is required for verification or delivered functionality.
