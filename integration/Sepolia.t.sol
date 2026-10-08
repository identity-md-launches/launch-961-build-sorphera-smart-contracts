// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {IFWA, IRewards, IFWAToken, IVRF} from "../src/interfaces/External.sol";

/// @notice Read-only fork checks of REAL Sepolia contracts; deliberately separate from offline mocks.
/// @dev Run with profile integration and a Sepolia fork. No impersonation, deployment or broadcasting.
contract SorpheraSepoliaIntegrationTest is Test {
    address internal constant POOL = 0x8D62A3eb2AC9Fc0148f1A69CAC3Eb2c71623AA90;
    address internal constant REWARDS = 0xB013ec82d838a2e0f9AAF95847ccee2c89788fb8;
    address internal constant TOKEN = 0x14ea7A2087E32610C08c5210E16aD163353F5Fe5;
    address internal constant COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;

    function setUp() public view {
        require(block.chainid == 11155111, "Use a Sepolia fork; this is not a mock test");
    }

    function testPublishedDependencyWiringAndLiveQuote() public view {
        assertGt(POOL.code.length, 0);
        assertGt(REWARDS.code.length, 0);
        assertGt(TOKEN.code.length, 0);
        assertGt(COORDINATOR.code.length, 0);
        IFWA p = IFWA(POOL);
        assertEq(p.rewards(), REWARDS);
        assertEq(p.token(), TOKEN);
        assertEq(IRewards(REWARDS).fwa(), POOL);
        assertEq(IRewards(REWARDS).tokenPoolManager(), IFWAToken(TOKEN).poolManager());
        assertEq(IRewards(REWARDS).tokenHook(), IFWAToken(TOKEN).hook());
        assertEq(IFWAToken(TOKEN).permit2(), 0x000000000022D473030F116dDEE9F6B43aC78BA3);
        (uint256 fee, uint256 vrf, uint256 total) = p.quoteAcquisitionPrice();
        assertEq(total, fee + vrf);
        assertGt(p.settlementWindow(), 0);
        assertGe(p.finalizeWindow(), p.settlementWindow());
        assertGt(p.selectionTimeoutBlocks(), 0);
    }

    function testPinnedPublicDeploymentLacksCurrentBuilderABI() public {
        // Evidence of a launch blocker, not proof that a mock represents this deployment.
        vm.expectRevert();
        IRewards(REWARDS).builderRewardBps();
    }
}
