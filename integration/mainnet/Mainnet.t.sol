// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Vm} from "forge-std/Vm.sol";
import {Test} from "forge-std/Test.sol";
import {Sorphera} from "../../src/Sorphera.sol";
import {SorpheraRouter} from "../../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../../src/SorpheraVaultFactory.sol";
import {SorpheraVault} from "../../src/SorpheraVault.sol";
import {IFWA, IRewards, IFWAToken, IERC721} from "../../src/interfaces/External.sol";
import {Balls} from "../../src/lib/Balls.sol";

interface LivePool is IFWA {
    function vrfCoordinatorAndSubId() external view returns (address, uint256);
    function rawFulfillRandomWords(uint256, uint256[] calldata) external;
    function ownerAcquisitionFeeBps() external view returns (uint256);
    function acquisitionTokenSlice(uint256) external view returns (uint256);
    function lastIssuedSequence() external view returns (uint64);
    function nextSequenceToProcess() external view returns (uint64);
    function requestIdAtSequence(uint64) external view returns (uint256);
    function finalizeUnsettled(uint256) external;
    function owner() external view returns (address);
    function setUint(uint256, uint256) external;
}

interface LiveRewards is IRewards {
    function acquisitionRewards(uint256) external view returns (address, uint64, uint8, uint256, address);
    function acquisitionBuilderRewardBps(uint256) external view returns (uint16);
    function settlementRewards(uint256) external view returns (address, uint16, bool);
    function owner() external view returns (address);
    function setBuilderRewardBps(uint256) external;
    function currentEpoch() external view returns (uint64);
    function purchaserEpochAmount(uint256) external view returns (uint256);
    function acquisitionsInEpoch(uint256) external view returns (uint256);
    function userAcquisitionsInEpoch(uint256, address) external view returns (uint256);
    function purchaserClaimed(uint256, address) external view returns (bool);
}

interface LiveCoordinator {
    function createSubscription() external returns (uint256);
    function fundSubscriptionWithNative(uint256) external payable;
    function addConsumer(uint256, address) external;
}

interface LiveHelper {
    function claims(address) external view returns (uint64 claimableBlock, uint256 amount);
    function claim(address) external returns (uint256);
}

/// @notice Real deployed dependency bytecode, fork state only. Both oracle callbacks are explicitly simulated.
/// @dev No vm.etch, vm.store, mockCall, dependency deployment or FWA admin impersonation in the success paths.
contract SorpheraMainnetForkTest is Test {
    uint256 public constant FORK_BLOCK = 26145236;
    LivePool constant pool = LivePool(0x958C41181182e76F221331b2755b77D9e1426A98);
    LiveRewards constant rewards = LiveRewards(0xA54b44C7a894AA19C49734A753D01f9B8C5f6516);
    IFWAToken constant token = IFWAToken(0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845);
    address constant HELPER = 0xcE6d5B618e034f87C7a8B6dCa65FB8669b8c301B;
    address constant COORDINATOR = 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a;
    bytes32 constant KEY = 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9;
    Sorphera lottery;
    SorpheraRouter router;
    SorpheraVaultFactory factory;
    uint256 subId;
    address alice = makeAddr("fork-only ticket holder");
    address treasury = makeAddr("fork-only company treasury");

    function setUp() public {
        require(block.chainid == 1 && block.number == FORK_BLOCK, "use pinned mainnet fork 26145236");
        vm.txGasPrice(1 gwei); // Explicit simulation assumption; service fee is quoted at this gas price.
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 100 ether);
        router = new SorpheraRouter(address(this));
        router.configure(address(pool), HELPER);
        factory = new SorpheraVaultFactory(address(router), address(this));
        lottery = new Sorphera(address(this), address(factory), COORDINATOR);
        factory.setLottery(address(lottery));
        subId = LiveCoordinator(COORDINATOR).createSubscription();
        LiveCoordinator(COORDINATOR).addConsumer(subId, address(lottery));
        LiveCoordinator(COORDINATOR).fundSubscriptionWithNative{value: 5 ether}(subId);
        lottery.configureRandomness(Sorphera.RandomConfig(subId, KEY, 3, 200000, true));
        // Five pre-existing ready requests at the pin must advance before ours, using unchanged pool code.
        pool.processAcquisitions(50);
        if (pool.isPurchaseBlackout()) vm.warp(block.timestamp + 16 minutes);
        (uint256 fee,, uint256 total) = pool.quoteAcquisitionPrice();
        Sorphera.Rules memory rules = Sorphera.Rules(
            0.005 ether,
            block.timestamp + 7 days,
            1 hours,
            2 days,
            fee * 101 / 100,
            total * 101 / 100,
            pool.weightedBackingTotal() * 99 / 100,
            1000
        );
        lottery.configureRules(0, rules);
        lottery.configureRules(1, rules);
        lottery.validateLaunch();
        assertFalse(lottery.salesEnabled());
        lottery.setSalesEnabled(true); // FORK ONLY: there is no broadcast or live sales activation.
    }

    function _one(uint256 n) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = n;
    }

    function _openBuy(uint8 game, uint256 word, bool winning) internal returns (SorpheraVault v) {
        lottery.openRound(game);
        v = SorpheraVault(payable(lottery.getRound(game, 1).vault));
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](100);
        (uint8[3] memory main, uint8 bonus,) = Balls.draw(lottery.seedFor(game, 1, word));
        if (!winning) bonus = bonus == 5 ? 1 : bonus + 1;
        for (uint256 i; i < 100; ++i) {
            picks[i] = Sorphera.Pick(main, bonus);
        }
        vm.prank(alice);
        lottery.buy{value: 0.5 ether}(game, 1, picks);
    }

    function _allocate(SorpheraVault v) internal returns (uint256 id) {
        v.acquire(1, block.timestamp + 10 minutes);
        id = v.requestAt(v.requestCount() - 1);
        (address purchaser,,, uint256 slice, address caller) = rewards.acquisitionRewards(id);
        assertEq(purchaser, address(v));
        assertEq(caller, address(router));
        assertEq(rewards.tokenBuyAllowance(address(router)), 0);
        IFWA.Acquisition memory a = pool.acquisitions(id);
        assertEq(
            slice,
            (a.priceEscrowed * pool.ownerAcquisitionFeeBps() / 10000)
                * rewards.acquisitionBuilderRewardBps(id) / 10000
        );
        // Only the coordinator identity is impersonated. No Chainlink proof or billing is exercised.
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(id, _one(456789));
        v.process(50);
        a = pool.acquisitions(id);
        assertEq(a.status, 2);
        assertGt(a.listingId, 0);
        assertEq(rewards.tokenBuyAllowance(address(router)), slice);
        assertEq(rewards.tokenBuyAllowance(address(v)), 0);
    }

    function _draw(uint8 game, uint256 word) internal {
        vm.warp(lottery.getRound(game, 1).earliestDraw);
        lottery.requestDraw(game, 1);
        uint256 drawId = lottery.getRound(game, 1).requestId;
        vm.prank(COORDINATOR);
        lottery.rawFulfillRandomWords(drawId, _one(word));
        lottery.finalize(game, 1);
        if (lottery.getRound(game, 1).status == Sorphera.Status.TieBreakNeeded) {
            lottery.requestTieBreak(game, 1);
            uint256 tieId = lottery.getRound(game, 1).tieBreakRequestId;
            vm.prank(COORDINATOR);
            lottery.rawFulfillRandomWords(tieId, _one(999));
            lottery.finalizeTieBreak(game, 1);
        }
    }

    function testRealETHLifecycleBuilderAllowanceAndNextBlockDelivery() public {
        SorpheraVault v = _openBuy(0, 123, true);
        uint256 id = _allocate(v);
        IFWA.Acquisition memory a = pool.acquisitions(id);
        uint256 beforeAllowance = rewards.tokenBuyAllowance(address(router));
        vm.recordLogs();
        v.settle(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 settlementSlice;
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(rewards)
                    && logs[i].topics[0]
                        == keccak256("SettlementBuilderRewardAccrued(uint256,address,uint256,uint256)")
            ) {
                (uint256 protocolFee, uint256 slice) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(slice, protocolFee * rewards.acquisitionBuilderRewardBps(id) / 10000);
                settlementSlice += slice;
            }
        }
        assertEq(rewards.tokenBuyAllowance(address(router)), beforeAllowance + settlementSlice);
        (address builder,, bool settled) = rewards.settlementRewards(a.listingId);
        assertEq(builder, address(router));
        assertTrue(settled);
        assertEq(v.pending(), 0);
        // Preview via snapshot to derive a meaningful 1% output bound from actual market execution.
        uint256 snap = vm.snapshotState();
        vm.prank(address(router));
        uint256 quoted = rewards.claimAccruedTokens(1);
        vm.revertToState(snap);
        uint256 purchaserBalance = token.balanceOf(address(v));
        router.claimBuilderRewards(address(pool), treasury, quoted * 99 / 100, block.timestamp + 10 minutes);
        assertEq(rewards.tokenBuyAllowance(address(router)), 0);
        (uint64 atBlock, uint256 queued) = LiveHelper(HELPER).claims(treasury);
        assertGt(queued, 0);
        assertEq(token.balanceOf(treasury), 0);
        assertEq(token.balanceOf(address(v)), purchaserBalance);
        vm.expectRevert();
        LiveHelper(HELPER).claim(treasury);
        vm.roll(atBlock);
        LiveHelper(HELPER).claim(treasury);
        assertEq(token.balanceOf(treasury), queued);
        _draw(0, 123);
        vm.prank(alice);
        lottery.claimETH(0, 1, _one(1), alice);
        assertEq(address(lottery).balance, lottery.totalLiabilities());
    }

    function testRealNFTLifecycleIndependentTieBreakAndCustody() public {
        SorpheraVault v = _openBuy(1, 77, true);
        uint256 id = _allocate(v);
        IFWA.Listing memory l = pool.listings(pool.acquisitions(id).listingId);
        v.settle(id);
        assertEq(IERC721(l.collection).ownerOf(l.tokenId), address(v));
        _draw(1, 77);
        Sorphera.Round memory r = lottery.getRound(1, 1);
        assertTrue(r.tieBreakRequestId != 0 && r.tieBreakRequestId != r.requestId);
        vm.prank(alice);
        v.claimNFTs(r.winningTicket, _one(0), alice);
        assertEq(IERC721(l.collection).ownerOf(l.tokenId), alice);
    }

    function testRealNoWinnerInventoryRollover() public {
        SorpheraVault v = _openBuy(1, 55, false);
        uint256 id = _allocate(v);
        v.settle(id);
        _draw(1, 55);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Rolled));
        lottery.openRound(1);
        assertEq(lottery.getRound(1, 2).eligibleNFTs, 1);
        vm.expectRevert("Sorphera: prize not finalized");
        lottery.entitlement(1, 1, 1, alice);
    }

    function testRealExpiredAcquisitionRefundAndNoBuilderCredit() public {
        SorpheraVault v = _openBuy(0, 12, true);
        v.acquire(1, block.timestamp + 5 minutes);
        uint256 id = v.requestAt(0);
        uint256 fee = pool.acquisitions(id).priceEscrowed;
        vm.roll(block.number + pool.selectionTimeoutBlocks() + 1);
        v.process(50);
        v.reconcile(_one(id));
        assertEq(v.pending(), 0);
        assertEq(v.refundCredit(), fee);
        assertEq(rewards.tokenBuyAllowance(address(router)), 0);
        uint256 beforeBalance = address(v).balance;
        v.recoverRefund();
        assertEq(address(v).balance, beforeBalance + fee);
        // Delayed and duplicate external callbacks cannot change the terminal refund.
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(id, _one(1));
        v.reconcile(_one(id));
        assertEq(v.pending(), 0);
        _draw(0, 12);
    }

    function testRealMissedETHSettlementWindowRecoversInKind() public {
        SorpheraVault v = _openBuy(0, 9, true);
        uint256 id = _allocate(v);
        uint256 listing = pool.acquisitions(id).listingId;
        IFWA.Listing memory l = pool.listings(listing);
        vm.warp(l.allocatedAt + pool.finalizeWindow() + 1);
        pool.finalizeUnsettled(listing);
        v.reconcile(_one(id));
        assertEq(v.securedCount(), 1);
        assertEq(v.pending(), 0);
        _draw(0, 9);
        assertEq(lottery.entitlement(0, 1, 1, alice), 100); // shared recovery; operator cannot select an owner
    }

    function testRealDelayedOutOfOrderAllocationProgress() public {
        SorpheraVault v = _openBuy(0, 88, true);
        v.acquire(2, block.timestamp + 5 minutes);
        uint256 first = v.requestAt(0);
        uint256 second = v.requestAt(1);
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(second, _one(54321));
        v.process(1);
        assertEq(pool.acquisitions(first).status, 1);
        assertEq(pool.acquisitions(second).status, 5);
        assertEq(rewards.tokenBuyAllowance(address(router)), 0);
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(first, _one(12345));
        v.process(1);
        assertEq(pool.acquisitions(first).status, 2);
        assertEq(pool.acquisitions(second).status, 2);
        v.settle(first);
        v.settle(second);
        assertEq(v.pending(), 0);
        _draw(0, 88);
    }

    function testRealStaleQuoteAndImmediateOverpaymentRefund() public {
        (uint256 fee, uint256 vrfFee, uint256 total) = pool.quoteAcquisitionPrice();
        uint256 backing = pool.weightedBackingTotal();
        vm.expectRevert();
        router.acquire{value: total}(address(pool), 1, fee / 2, backing, 1000, block.timestamp + 10);
        vm.expectRevert();
        router.acquire{value: total}(address(pool), 1, fee, backing * 2, 1000, block.timestamp + 10);
        uint256 beforeBalance = address(this).balance;
        uint256 routerBefore = address(router).balance;
        uint256[] memory ids = router.acquire{value: total + 1 ether}(
            address(pool), 1, fee, backing, 1000, block.timestamp + 10
        );
        assertEq(address(this).balance, beforeBalance - pool.acquisitions(ids[0]).priceEscrowed - vrfFee);
        assertEq(address(router).balance, routerBefore);
    }

    function testRealNFTSingleWinningTicketSkipsTieRequest() public {
        SorpheraVault v = _openBuy(1, 15, false);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](1);
        (picks[0].main, picks[0].bonus,) = Balls.draw(lottery.seedFor(1, 1, 15));
        vm.prank(alice);
        lottery.buy{value: 0.005 ether}(1, 1, picks);
        uint256 id = _allocate(v);
        v.settle(id);
        _draw(1, 15);
        assertEq(lottery.getRound(1, 1).winningTicket, 101);
        assertEq(lottery.getRound(1, 1).tieBreakRequestId, 0);
        vm.prank(alice);
        v.claimNFTs(101, _one(0), alice);
    }

    function testRealSlippageRefundAfterEarlierAllocation() public {
        // Fault policy set BEFORE purchases: zero positive drift tolerance, using the real owner setter.
        // No FWA configuration can change while acquisitions are pending.
        address admin = pool.owner();
        vm.prank(admin);
        pool.setUint(14, 0);
        (uint256 quotedFee,, uint256 quotedTotal) = pool.quoteAcquisitionPrice();
        lottery.configureRules(
            0,
            Sorphera.Rules(
                0.005 ether,
                block.timestamp + 7 days,
                1 hours,
                2 days,
                quotedFee * 101 / 100,
                quotedTotal * 101 / 100,
                pool.weightedBackingTotal() * 99 / 100,
                0
            )
        );
        SorpheraVault v = _openBuy(0, 24, true);
        v.acquire(2, block.timestamp + 10 minutes);
        uint256 first = v.requestAt(0);
        uint256 second = v.requestAt(1);
        vm.prank(admin);
        vm.expectRevert(bytes4(keccak256("AcquisitionStateLocked()")));
        pool.setUint(13, 10000);
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(second, _one(8));
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(first, _one(456789));
        v.process(50);
        uint256 refund;
        uint256 allowed;
        for (uint256 i; i < 2; ++i) {
            uint256 id = v.requestAt(i);
            IFWA.Acquisition memory acq = pool.acquisitions(id);
            if (acq.status == 4) {
                refund += acq.priceEscrowed;
                v.reconcile(_one(id));
            } else {
                assertEq(acq.status, 2);
                (,,, uint256 slice,) = rewards.acquisitionRewards(id);
                allowed += slice;
            }
        }
        assertGt(refund, 0);
        assertEq(v.refundCredit(), refund);
        assertEq(rewards.tokenBuyAllowance(address(router)), allowed);
        v.recoverRefund();
        for (uint256 i; i < 2; ++i) {
            if (pool.acquisitions(v.requestAt(i)).status == 2) v.settle(v.requestAt(i));
        }
        assertEq(v.pending(), 0);
    }

    function testRealBuilderRateSnapshotsAtRequest() public {
        SorpheraVault v = _openBuy(0, 25, true);
        v.acquire(1, block.timestamp + 10 minutes);
        uint256 id = v.requestAt(0);
        (,,, uint256 slice,) = rewards.acquisitionRewards(id);
        uint16 share = rewards.acquisitionBuilderRewardBps(id);
        address admin = rewards.owner();
        vm.prank(admin);
        rewards.setBuilderRewardBps(2500);
        assertEq(rewards.acquisitionBuilderRewardBps(id), share);
        vm.prank(COORDINATOR);
        pool.rawFulfillRandomWords(id, _one(9));
        v.process(50);
        assertEq(rewards.tokenBuyAllowance(address(router)), slice);
        (, uint16 settlementShare,) = rewards.settlementRewards(pool.acquisitions(id).listingId);
        assertEq(settlementShare, share);
        v.settle(id);
    }
    receive() external payable {}

    function testRealPurchaserEpochRightsRemainWithVault() public {
        SorpheraVault v = _openBuy(0, 66, true);
        uint256 id = _allocate(v);
        v.settle(id);
        (, uint64 epoch,,,) = rewards.acquisitionRewards(id);
        assertEq(rewards.userAcquisitionsInEpoch(epoch, address(v)), 1);
        assertEq(rewards.userAcquisitionsInEpoch(epoch, address(router)), 0);
        _draw(0, 66);
        uint256 amount = rewards.purchaserEpochAmount(epoch) / rewards.acquisitionsInEpoch(epoch);
        emit log_named_uint("purchaser epoch entitlement at pin", amount);
        if (amount == 0) {
            vm.expectRevert();
            v.claimEpochRewards(_one(epoch));
            assertEq(token.balanceOf(address(v)), 0);
        } else {
            uint256 beforeBalance = token.balanceOf(address(v));
            v.claimEpochRewards(_one(epoch));
            assertEq(token.balanceOf(address(v)) - beforeBalance, amount);
            vm.prank(alice);
            v.claimTokens(1, alice, block.timestamp + 10 minutes);
            (uint64 atBlock, uint256 queued) = LiveHelper(HELPER).claims(alice);
            vm.roll(atBlock);
            LiveHelper(HELPER).claim(alice);
            assertGe(token.balanceOf(alice), queued);
        }
        assertEq(rewards.tokenBuyAllowance(address(v)), 0);
    }
}
