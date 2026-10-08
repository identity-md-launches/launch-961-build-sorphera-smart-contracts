// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {SorpheraFixture} from "./helpers/SorpheraFixture.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {Networks} from "../src/lib/Networks.sol";

contract SorpheraHardeningTest is SorpheraFixture {
    function testIndependentTieBreakLocksPrizesFeesAndNextRound() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 99), 4);
        _acquireNFT(v, 1);
        vm.warp(lottery.getRound(1, 1).earliestDraw);
        lottery.requestDraw(1, 1);
        uint256 drawId = lottery.getRound(1, 1).requestId;
        vrf.fulfill(drawId, 99);
        lottery.finalize(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.TieBreakNeeded));
        assertEq(lottery.getRound(1, 1).winningTicket, 0);
        assertEq(lottery.operatorFees(), 0);
        vm.expectRevert("Sorphera: previous unsettled");
        lottery.openRound(1);
        vm.expectRevert("Sorphera: prize not finalized");
        lottery.entitlement(1, 1, 1, alice);
        vm.expectRevert("Sorphera: randomness not ready");
        lottery.finalize(1, 1);
        vrf.setFunding(0);
        vm.expectRevert();
        lottery.requestTieBreak(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.TieBreakNeeded));
        vrf.setFunding(1 ether);
        // Future configuration must not alter either request's frozen terms.
        lottery.configureRandomness(Sorphera.RandomConfig(456, keccak256("other"), 10, 400000, false));
        lottery.requestTieBreak(1, 1);
        uint256 tieId = lottery.getRound(1, 1).tieBreakRequestId;
        assertTrue(tieId != drawId);
        assertEq(vrf.requestHash(tieId), vrf.requestHash(drawId));
        (uint8 game, uint256 round, bool exists, bool tie) = lottery.requests(tieId);
        assertEq(game, 1);
        assertEq(round, 1);
        assertTrue(exists && tie);
        vm.expectRevert("Sorphera: stale callback");
        vrf.fulfill(drawId, 22);
        vm.warp(block.timestamp + 100 days);
        vm.expectRevert("Sorphera: tie-break state");
        lottery.requestTieBreak(1, 1);
        vm.expectRevert("Sorphera: draw state");
        lottery.requestDraw(1, 1);
        vm.expectRevert("Sorphera: tie-break not ready");
        lottery.finalizeTieBreak(1, 1);
        uint256[] memory words = _one(123);
        vm.expectRevert("Sorphera: coordinator only");
        lottery.rawFulfillRandomWords(tieId, words);
        vrf.fulfill(tieId, 0);
        vm.expectRevert("Sorphera: stale callback");
        vrf.fulfill(tieId, 42);
        lottery.finalizeTieBreak(1, 1);
        uint256 winner = lottery.getRound(1, 1).winningTicket;
        assertGe(winner, 1);
        assertLe(winner, 4);
        vm.prank(alice);
        v.claimNFTs(winner, _one(0), alice);
        assertEq(nft.ownerOf(1), alice);
        _conserved();
    }

    function testChangedHelperPermissionsStopNewRiskButPreserveCashClaims() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 7), 5);
        Sorphera.Pick memory pick = _pick(0, 1, 7);
        token.revokeDistributor(address(helper));
        vm.expectRevert("Sorphera: helper wiring");
        v.acquire(1, cutoff);
        vm.expectRevert("Sorphera: helper wiring");
        _buy(0, 1, alice, pick, 1);
        _draw(0, 1, 7);
        _claim(0, 1, alice, 1, alice);
        _conserved();
    }

    function testChangedChainStopsSalesAndRequests() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 3), 1);
        Sorphera.Pick memory pick = _pick(0, 1, 3);
        vm.chainId(1);
        vm.expectRevert("Sorphera: chain changed");
        _buy(0, 1, alice, pick, 1);
        vm.warp(cutoff + 1 hours);
        vm.expectRevert("Sorphera: chain changed");
        lottery.requestDraw(0, 1);
    }

    function testUnavailableInventoryDoesNotConsumeBudget() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 8), 10);
        uint256 budget = v.budget();
        pool.setInventory(0);
        vm.expectRevert();
        v.acquire(1, cutoff);
        assertEq(v.budget(), budget);
        assertEq(v.spent(), 0);
        assertEq(v.pending(), 0);
        _draw(0, 1, 8);
        _conserved();
    }

    function testProductionRejectsSimulationAndIncorrectGasLane() public {
        Sorphera production = new Sorphera(address(this), address(factory), address(vrf));
        production.configureRandomness(Sorphera.RandomConfig(123, keccak256("mock key"), 3, 200000, true));
        vm.expectRevert("Sorphera: network configuration");
        production.validateLaunch();
        vm.expectRevert("Sorphera: network configuration");
        this.network(1, Networks.MAINNET_COORDINATOR, keccak256("bad"));
        this.network(
            1,
            Networks.MAINNET_COORDINATOR,
            0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9
        );
        vm.expectRevert("Sorphera: network configuration");
        this.network(
            11155111,
            Networks.MAINNET_COORDINATOR,
            0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9
        );
    }

    function network(uint256 chain, address c, bytes32 key) external pure {
        Networks.validate(chain, c, key);
    }

    function testConstructorDiagnosticsEmptyChainAndUnresolvedDependencies() public {
        address missing = makeAddr("absent dependency, test only");
        vm.expectRevert(
            abi.encodeWithSelector(SorpheraVaultFactory.MissingRouterCode.selector, missing, block.chainid)
        );
        new SorpheraVaultFactory(missing, address(this));
        vm.expectRevert(abi.encodeWithSelector(Sorphera.MissingFactoryCode.selector, missing, block.chainid));
        new Sorphera(address(this), missing, address(vrf));
        vm.expectRevert(
            abi.encodeWithSelector(
                Sorphera.MissingCoordinatorCode.selector, Networks.SEPOLIA_COORDINATOR, block.chainid
            )
        );
        new Sorphera(address(this), address(factory), Networks.SEPOLIA_COORDINATOR);
        assertGt(address(router).code.length, 0);
        assertGt(address(factory).code.length, 0);
    }
}
