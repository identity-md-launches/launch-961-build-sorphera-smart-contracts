// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraPassport} from "../src/SorpheraPassport.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";

/// @notice Fail-closed release readiness checks for the four application contracts. Pure reads; no owner
///         action, no deployment in `verify`. Every mismatch reverts with a named reason so a rehearsal,
///         preflight or canary stops instead of reporting partial readiness.
/// @dev Lives outside the lottery deliberately: `Sorphera` is 210 bytes under EIP-170 and must not grow.
contract ReleaseChecks {
    struct Expected {
        uint256 chain;
        address owner;
        address router;
        address factory;
        address lottery;
        address passport;
        address coordinator;
        uint256 qualifyingPrice;
    }

    struct Report {
        uint256 chain;
        uint256 blockNumber;
        bytes32 passportCodeHash;
        bytes32 lotteryCodeHash;
        bool[2] rulesConfigured;
        bool launchValidated;
        bool salesEnabled;
    }

    /// @notice Price rules the lottery itself enforces in `configureRules`; the Passport price must satisfy
    ///         them or no round can ever qualify.
    function validPrice(uint256 price) public pure returns (bool) {
        return price >= 10 && price <= 100 ether && price % 10 == 0;
    }

    /// @notice Verifies addresses, code, owners, dependency bindings, both Passport bindings and the
    ///         qualifying price. Reverts on the first failure. Rules may still be unconfigured (reported).
    function verify(Expected memory e) public view returns (Report memory report) {
        require(block.chainid == e.chain, "release: wrong chain");
        require(e.owner != address(0), "release: owner unset");
        require(e.router != address(0) && e.router.code.length != 0, "release: router code");
        require(e.factory != address(0) && e.factory.code.length != 0, "release: factory code");
        require(e.lottery != address(0) && e.lottery.code.length != 0, "release: lottery code");
        require(e.coordinator != address(0) && e.coordinator.code.length != 0, "release: coordinator code");
        require(validPrice(e.qualifyingPrice), "release: qualifying price");
        SorpheraRouter router = SorpheraRouter(payable(e.router));
        SorpheraVaultFactory factory = SorpheraVaultFactory(e.factory);
        Sorphera lottery = Sorphera(e.lottery);
        require(router.owner() == e.owner, "release: router owner");
        require(factory.owner() == e.owner, "release: factory owner");
        require(lottery.owner() == e.owner, "release: lottery owner");
        require(address(factory.router()) == e.router, "release: factory router");
        require(address(lottery.factory()) == e.factory, "release: lottery factory");
        require(address(lottery.coordinator()) == e.coordinator, "release: lottery coordinator");
        require(lottery.deploymentChainId() == e.chain, "release: lottery chain");
        require(factory.lottery() == e.lottery, "release: factory not bound");
        // Passport: ordinary paid buys work without it, but release readiness requires it.
        require(e.passport != address(0) && e.passport.code.length != 0, "release: passport code");
        require(lottery.passport() == e.passport, "release: passport not bound");
        SorpheraPassport passport = SorpheraPassport(e.passport);
        require(address(passport.lottery()) == e.lottery, "release: passport misbound");
        require(passport.qualifyingPrice() == e.qualifyingPrice, "release: passport price");
        require(passport.STAMPS_PER_REWARD() == 12 && passport.MAX_PROCESS() == 50, "release: passport rules");
        require(!lottery.salesEnabled(), "release: sales must remain disabled");
        report.chain = block.chainid;
        report.blockNumber = block.number;
        report.passportCodeHash = e.passport.codehash;
        report.lotteryCodeHash = e.lottery.codehash;
        report.launchValidated = lottery.launchValidated();
        report.salesEnabled = lottery.salesEnabled();
        for (uint8 game; game < 2; ++game) {
            (uint256 price,,,,,,,) = lottery.futureRules(game);
            // Both intended qualifying games must freeze exactly the Passport price; any other price
            // makes that game's rounds ineligible for stamps and reward entries.
            require(price == 0 || price == e.qualifyingPrice, "release: game price not qualifying");
            report.rulesConfigured[game] = price != 0;
        }
    }

    /// @notice Full readiness: `verify` plus both games configured at the qualifying price and the
    ///         launch validated on chain. Sales must still be disabled; enabling is a later owner decision.
    function requireReady(Expected memory e) external view returns (Report memory report) {
        report = verify(e);
        require(report.rulesConfigured[0] && report.rulesConfigured[1], "release: rules not configured");
        require(report.launchValidated, "release: launch not validated");
    }

    /// @notice Deploys a throwaway reference Passport with the same immutables and compares runtime code
    ///         hashes, so the checked Passport is exactly this source with exactly these constructor
    ///         inputs. Local simulation only: never broadcast this call.
    function expectPassportCode(address passport, address lottery, uint256 qualifyingPrice) external {
        SorpheraPassport expectedCode = new SorpheraPassport(lottery, qualifyingPrice);
        require(address(expectedCode).codehash == passport.codehash, "release: passport code mismatch");
    }
}
