// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script} from "forge-std/Script.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraPassport} from "../src/SorpheraPassport.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {ReleaseChecks} from "./ReleaseChecks.sol";
import {MockNFT, MockToken, MockRewards, MockFWA, MockHelper} from "../test/mocks/ExternalMocks.sol";

/// @notice PREPARATION ONLY: explicitly controlled FWA mocks + real Sepolia VRF coordinator.
/// @dev No broadcast calls: run produces local rehearsal contracts, never a live deployment.
/// These public mutable mocks must NEVER hold player funds or appear in a mainnet manifest.
/// `qualifyingPriceWei` is an explicit input; the 0.005 ETH value is only a local fixture.
contract SepoliaCanary is Script {
    address constant COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;

    function run(address owner, uint256 qualifyingPriceWei)
        external
        returns (Sorphera lottery, SorpheraPassport passport, MockFWA pool)
    {
        require(block.chainid == 11155111 && owner != address(0), "Sepolia canary inputs");
        MockNFT nft = new MockNFT();
        MockToken token = new MockToken();
        MockRewards rewards = new MockRewards(token);
        pool = new MockFWA(rewards, nft);
        rewards.setFWA(address(pool));
        MockHelper helper = new MockHelper(address(token));
        token.setDistributor(address(helper));
        token.setDistributor(address(rewards));
        SorpheraRouter router = new SorpheraRouter(owner);
        SorpheraVaultFactory factory = new SorpheraVaultFactory(address(router), owner);
        lottery = new Sorphera(owner, address(factory), COORDINATOR);
        passport = new SorpheraPassport(address(lottery), qualifyingPriceWei);
        vm.startPrank(owner);
        router.configure(address(pool), address(helper));
        factory.setLottery(address(lottery));
        lottery.setPassport(address(passport));
        vm.stopPrank();
        ReleaseChecks checks = new ReleaseChecks();
        checks.verify(
            ReleaseChecks.Expected(
                11155111,
                owner,
                address(router),
                address(factory),
                address(lottery),
                address(passport),
                COORDINATOR,
                qualifyingPriceWei
            )
        );
        checks.expectPassportCode(address(passport), address(lottery), qualifyingPriceWei);
        require(!lottery.salesEnabled(), "disabled canary");
    }
}
