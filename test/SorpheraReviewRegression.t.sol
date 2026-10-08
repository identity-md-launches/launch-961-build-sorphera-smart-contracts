// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SorpheraFixture} from "./helpers/SorpheraFixture.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {SimulatedSorphera} from "./helpers/SimulatedSorphera.sol";
import {MockVRF, IRandomReceiver} from "./mocks/ExternalMocks.sol";

/// @dev Simulation of coordinator billing and one-shot callbacks, not a real VRF proof or receipt.
contract ReviewVRF is MockVRF {
    mapping(uint256 => bool) public consumed;
    mapping(uint256 => uint256) public billed;
    mapping(uint256 => bool) public callbackSucceeded;
    uint96 public constant CALLBACK_COST = 0.01 ether;

    function attemptFulfill(uint256 id, uint256 word, uint256 gasLimit) external returns (bool success) {
        require(requestConsumer[id] != address(0) && !consumed[id], "already fulfilled or unknown");
        require(funding >= CALLBACK_COST, "billing underfunded");
        funding -= CALLBACK_COST;
        consumed[id] = true;
        billed[id] = CALLBACK_COST;
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        (success,) = requestConsumer[id].call{gas: gasLimit}(
            abi.encodeCall(IRandomReceiver.rawFulfillRandomWords, (id, words))
        );
        callbackSucceeded[id] = success;
    }
}

contract GasBombNFT {
    function ownerOf(uint256) external pure returns (address) {
        while (true) {}
        return address(0);
    }
}

/// @notice Reproductions from the independent automated contract-review role. Not a professional audit.
contract SorpheraReviewRegressionTest is SorpheraFixture {
    ReviewVRF internal billingVRF;

    function setUp() public override {
        super.setUp();
        factory = new SorpheraVaultFactory(address(router), address(this));
        billingVRF = new ReviewVRF();
        vrf = billingVRF;
        lottery = new SimulatedSorphera(address(this), address(factory), address(vrf));
        factory.setLottery(address(lottery));
        vrf.setConsumer(address(lottery));
        lottery.configureRules(0, _rules(cutoff));
        lottery.configureRules(1, _rules(cutoff + 1 hours));
        lottery.configureRandomness(Sorphera.RandomConfig(123, keccak256("mock key"), 3, 150000, true));
        lottery.validateLaunch();
        lottery.setSalesEnabled(true);
    }

    function testUnreconciledPredeadlineCustodyCannotBeFrontRunByCancellation() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 19), 3);
        v.acquire(1, block.timestamp + 1);
        pool.allocate(1, 0.02 ether);
        uint256 deadline = lottery.getRound(1, 1).settlementDeadline;
        vm.warp(deadline - 1);
        pool.finalizeUnsettled(1);
        assertEq(nft.ownerOf(1), address(v));
        assertEq(v.receivedAt(address(nft), 1), deadline - 1);
        assertEq(lottery.getRound(1, 1).eligibleNFTs, 0);
        vm.warp(deadline);
        vm.prank(bob);
        lottery.requestDraw(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Requested));
        assertEq(lottery.getRound(1, 1).eligibleNFTs, 1);
        assertEq(lottery.getRound(1, 1).frozenNFTs, 1);
        assertEq(v.pending(), 0);
        assertEq(vrf.requests(), 1);
    }

    function testHostileOwnerOfCannotExhaustCancellationSweepGas() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 26), 3);
        v.acquire(1, block.timestamp + 1);
        pool.allocate(1, 0.02 ether);
        nft.setRejected(1, true);
        uint256 deadline = lottery.getRound(1, 1).settlementDeadline;
        vm.warp(deadline - 1);
        pool.finalizeUnsettled(1);
        assertEq(pool.stuckNFTRecipient(1), address(v));
        GasBombNFT bomb = new GasBombNFT();
        vm.etch(address(nft), address(bomb).code);
        vm.warp(deadline);
        (bool ok,) = address(lottery).call{gas: 1000000}(abi.encodeCall(lottery.requestDraw, (1, 1)));
        assertTrue(ok, "untrusted collection must not exhaust the bounded cancellation transaction");
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Cancelled));
        assertEq(v.pending(), 0);
        assertEq(v.securedCount(), 0);
        _conserved();
    }

    function testLargePendingCancellationReviewCommitsBoundedProgress() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 20), 100);
        _buy(1, 1, alice, _pick(1, 1, 20), 20);
        for (uint256 i; i < 6; ++i) {
            v.acquire(8, block.timestamp + 1);
        }
        v.acquire(3, block.timestamp + 1);
        assertEq(v.requestCount(), 51);
        vm.expectRevert("Sorphera: lottery only");
        v.reviewCancellation(0);
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Closed));
        assertEq(v.cancellationCursor(), 50);
        assertEq(vrf.requests(), 0);
        lottery.requestDraw(1, 1);
        assertEq(v.cancellationCursor(), 51);
        assertEq(v.pending(), 51, "cancel must not wait forever for FWA");
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Cancelled));
        assertEq(lottery.operatorFees(), 0);
        _conserved();
    }

    function testPredeadlineCustodyInLastCancellationBatchPreservesDraw() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 21), 100);
        _buy(1, 1, alice, _pick(1, 1, 21), 20);
        for (uint256 i; i < 6; ++i) {
            v.acquire(8, block.timestamp + 1);
        }
        v.acquire(3, block.timestamp + 1);
        for (uint256 id = 1; id <= 50; ++id) {
            pool.refund(id);
        }
        v.recoverRefund();
        pool.allocate(51, 0.02 ether);
        uint256 deadline = lottery.getRound(1, 1).settlementDeadline;
        vm.warp(deadline - 1);
        pool.finalizeUnsettled(1);
        vm.warp(deadline);
        lottery.requestDraw(1, 1);
        assertEq(v.cancellationCursor(), 50);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Closed));
        lottery.requestDraw(1, 1);
        assertEq(v.cancellationCursor(), 51);
        assertEq(lottery.getRound(1, 1).eligibleNFTs, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Requested));
    }

    function testFrozenReserveRejectsRequestBeforeAcceptanceThenTopupAllowsSameRound() public {
        lottery.configureVRFReserve(1 ether, 0.1 ether);
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 22), 1);
        assertEq(lottery.roundMinimumVRFBalance(0, 1), 0.1 ether);
        // A future policy change cannot weaken the guard that existed when tickets were sold.
        lottery.configureVRFReserve(0, 0);
        vrf.setFunding(0.09 ether);
        vm.warp(lottery.getRound(0, 1).earliestDraw);
        vm.expectRevert("Sorphera: VRF reserve");
        lottery.requestDraw(0, 1);
        assertEq(vrf.requests(), 0);
        assertEq(lottery.getRound(0, 1).requestId, 0);
        assertEq(uint256(lottery.getRound(0, 1).status), uint256(Sorphera.Status.Sales));
        vrf.setFunding(0.1 ether);
        lottery.requestDraw(0, 1);
        uint256 id = lottery.getRound(0, 1).requestId;
        assertEq(id, 1);
        // Subscription depletion after acceptance can delay fulfillment; it grants no replacement rights.
        vrf.setFunding(0);
        vm.expectRevert("billing underfunded");
        billingVRF.attemptFulfill(id, 22, 150000);
        assertFalse(billingVRF.consumed(id));
        vm.warp(block.timestamp + 60 days);
        vm.expectRevert("Sorphera: draw state");
        lottery.requestDraw(0, 1);
        vrf.setFunding(0.1 ether);
        uint256 beforeBalance = address(lottery).balance;
        uint256 beforePlayer = alice.balance;
        assertTrue(billingVRF.attemptFulfill(id, 22, 150000));
        assertEq(address(lottery).balance, beforeBalance, "callback must not pay externally");
        assertEq(alice.balance, beforePlayer);
        assertEq(billingVRF.billed(id), 0.01 ether);
        lottery.finalize(0, 1);
        _claim(0, 1, alice, 1, alice);
        _conserved();
    }

    function testReservePermissionsCurrencyAndConsumerRecheckedBeforeRequest() public {
        vm.prank(bob);
        vm.expectRevert("Sorphera: owner only");
        lottery.configureVRFReserve(1, 1);
        lottery.configureVRFReserve(2 ether, 0.1 ether);
        _open(0); // Native balance passes even though the LINK-specific floor would fail.
        _buy(0, 1, alice, _pick(0, 1, 23), 1);
        vrf.setConsumer(bob);
        vm.warp(lottery.getRound(0, 1).earliestDraw);
        vm.expectRevert("Sorphera: VRF consumer missing");
        lottery.requestDraw(0, 1);
        assertEq(vrf.requests(), 0);
        vrf.setConsumer(address(lottery));
        lottery.requestDraw(0, 1);
        assertEq(vrf.requests(), 1);
    }

    function testInsufficientCallbackGasIsBilledAndCannotReplaceAcceptedDraw() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 24), 1);
        vm.warp(lottery.getRound(0, 1).earliestDraw);
        lottery.requestDraw(0, 1);
        assertFalse(billingVRF.attemptFulfill(1, 24, 1000));
        assertTrue(billingVRF.consumed(1));
        assertEq(billingVRF.billed(1), 0.01 ether);
        assertEq(uint256(lottery.getRound(0, 1).status), uint256(Sorphera.Status.Requested));
        vm.warp(block.timestamp + 3650 days);
        vm.expectRevert("already fulfilled or unknown");
        billingVRF.attemptFulfill(1, 24, 150000);
        vm.expectRevert("Sorphera: draw state");
        lottery.requestDraw(0, 1);
        vm.expectRevert("Sorphera: previous unsettled");
        lottery.openRound(0);
        assertEq(vrf.requests(), 1);
        assertEq(lottery.operatorFees(), 0);
        _conserved();
    }

    function testPermanentTieNonfulfillmentLocksUntilOriginalDelayedCallback() public {
        lottery.configureVRFReserve(0, 0.1 ether);
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 25), 3);
        _acquireNFT(v, 1);
        vm.warp(lottery.getRound(1, 1).earliestDraw);
        lottery.requestDraw(1, 1);
        assertTrue(billingVRF.attemptFulfill(1, 25, 150000));
        lottery.finalize(1, 1);
        vrf.setFunding(0.01 ether);
        vm.expectRevert("Sorphera: VRF reserve");
        lottery.requestTieBreak(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.TieBreakNeeded));
        assertEq(vrf.requests(), 1);
        vrf.setFunding(0.1 ether);
        lottery.requestTieBreak(1, 1);
        assertEq(lottery.getRound(1, 1).tieBreakRequestId, 2);
        vm.warp(block.timestamp + 3650 days);
        vm.expectRevert("Sorphera: tie-break state");
        lottery.requestTieBreak(1, 1);
        vm.expectRevert("Sorphera: prize not finalized");
        lottery.entitlement(1, 1, 1, alice);
        assertEq(lottery.operatorFees(), 0);
        assertEq(nft.ownerOf(1), address(v));
        assertTrue(billingVRF.attemptFulfill(2, 37, 150000));
        lottery.finalizeTieBreak(1, 1);
        uint256 winner = lottery.getRound(1, 1).winningTicket;
        vm.prank(alice);
        v.claimNFTs(winner, _one(0), alice);
        assertEq(nft.ownerOf(1), alice);
        _conserved();
    }
}
