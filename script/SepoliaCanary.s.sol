// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script} from "forge-std/Script.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {MockNFT, MockToken, MockRewards, MockFWA, MockHelper} from "../test/mocks/ExternalMocks.sol";

/// @notice PREPARATION ONLY: explicitly controlled FWA mocks + real Sepolia VRF coordinator.
/// @dev No broadcast calls: run produces local rehearsal contracts, never a live deployment.
/// These public mutable mocks must NEVER hold player funds or appear in a mainnet manifest.
contract SepoliaCanary is Script {
    function run(address owner) external returns (Sorphera lottery, MockFWA pool) {
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
        lottery = new Sorphera(owner, address(factory), 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B);
        vm.startPrank(owner);
        router.configure(address(pool), address(helper));
        factory.setLottery(address(lottery));
        vm.stopPrank();
        require(!lottery.salesEnabled(), "disabled canary");
    }
}
