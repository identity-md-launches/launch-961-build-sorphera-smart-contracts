// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script} from "forge-std/Script.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraPassport} from "../src/SorpheraPassport.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {Networks} from "../src/lib/Networks.sol";
import {ReleaseChecks} from "./ReleaseChecks.sol";

/// @notice Local fork rehearsal only. No broadcast calls or keys. Owner and qualifying price are explicit
///         inputs: 5000000000000000 wei (0.005 ETH) is a local fixture, never an approved production value.
/// @dev Order: Router -> VaultFactory -> Sorphera -> SorpheraPassport(lottery, qualifyingPriceWei), then the
///      two owner bindings `factory.setLottery` and `lottery.setPassport`. Ends with sales disabled.
contract Rehearse is Script {
    event Resolved(
        uint256 chain,
        uint256 blockNumber,
        address owner,
        address router,
        address factory,
        address coordinator,
        address lottery,
        address passport,
        uint256 qualifyingPrice,
        bytes32 passportCodeHash,
        bytes32 lotteryCodeHash
    );

    function run(
        uint256 expectedChain,
        address owner,
        address coordinator,
        bytes32 keyHash,
        uint256 qualifyingPriceWei
    )
        external
        returns (
            SorpheraRouter router,
            SorpheraVaultFactory factory,
            Sorphera lottery,
            SorpheraPassport passport
        )
    {
        require(block.chainid == expectedChain && owner != address(0), "rehearsal inputs");
        Networks.validate(expectedChain, coordinator, keyHash);
        ReleaseChecks checks = new ReleaseChecks();
        require(checks.validPrice(qualifyingPriceWei), "rehearsal qualifying price");
        router = new SorpheraRouter(owner);
        factory = new SorpheraVaultFactory(address(router), owner);
        lottery = new Sorphera(owner, address(factory), coordinator);
        passport = new SorpheraPassport(address(lottery), qualifyingPriceWei);
        vm.startPrank(owner);
        factory.setLottery(address(lottery));
        lottery.setPassport(address(passport));
        vm.stopPrank();
        ReleaseChecks.Report memory report = checks.verify(
            ReleaseChecks.Expected(
                expectedChain,
                owner,
                address(router),
                address(factory),
                address(lottery),
                address(passport),
                coordinator,
                qualifyingPriceWei
            )
        );
        checks.expectPassportCode(address(passport), address(lottery), qualifyingPriceWei);
        require(!lottery.salesEnabled() && !report.salesEnabled, "sales must remain disabled");
        emit Resolved(
            block.chainid,
            block.number,
            owner,
            address(router),
            address(factory),
            coordinator,
            address(lottery),
            address(passport),
            qualifyingPriceWei,
            report.passportCodeHash,
            report.lotteryCodeHash
        );
    }
}
