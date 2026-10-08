// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {SorpheraFixture} from "./helpers/SorpheraFixture.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";

contract SorpheraNFTReentrantRecipient {
    SorpheraVault internal immutable vault;
    uint256 internal immutable ticket;
    bool public attempted;
    bool public succeeded;

    constructor(SorpheraVault v, uint256 t) {
        vault = v;
        ticket = t;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        attempted = true;
        uint256[] memory indices = new uint256[](1);
        indices[0] = 1;
        (succeeded,) = address(vault).call(abi.encodeCall(vault.claimNFTs, (ticket, indices, address(this))));
        return 0x150b7a02;
    }
}

contract SorpheraAdversarialTest is SorpheraFixture {
    function testInvalidTicketAtEndRollsBackEntireBatchAndBothAccounts() public {
        SorpheraVault v = _open(0);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](100);
        for (uint256 i; i < 100; ++i) {
            picks[i] = Sorphera.Pick([uint8(20), 1, 2], 5);
        }
        picks[99].bonus = 6;
        vm.prank(alice);
        vm.expectRevert("Sorphera: bonus");
        lottery.buy{value: 0.5 ether}(0, 1, picks);
        assertEq(lottery.getRound(0, 1).sold, 0);
        assertEq(lottery.matchCount(0, 1, lottery.combinationKey([uint8(1), 2, 20], 5)), 0);
        assertEq(lottery.totalLiabilities(), 0);
        assertEq(address(lottery).balance, 0);
        assertEq(v.budget(), 0);
        assertEq(address(v).balance, 0);
    }

    function testEmptyAndUnderpaidAndOverpaidSalesAreAtomic() public {
        SorpheraVault v = _open(0);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](0);
        vm.expectRevert("Sorphera: tickets/payment");
        lottery.buy(0, 1, picks);
        picks = new Sorphera.Pick[](1);
        picks[0] = _pick(0, 1, 42);
        vm.deal(address(this), 1 ether);
        vm.expectRevert("Sorphera: tickets/payment");
        lottery.buy{value: 0.005 ether - 1}(0, 1, picks);
        vm.expectRevert("Sorphera: tickets/payment");
        lottery.buy{value: 0.005 ether + 1}(0, 1, picks);
        assertEq(v.budget(), 0);
        assertEq(lottery.getRound(0, 1).sold, 0);
    }

    function testEveryCombinationHasUniqueKeyAndAllSixOrdersMatch() public view {
        uint256[] memory seen = new uint256[](1024);
        uint256 count;
        for (uint8 a = 1; a <= 18; ++a) {
            for (uint8 b = a + 1; b <= 19; ++b) {
                for (uint8 c = b + 1; c <= 20; ++c) {
                    for (uint8 bonus = 1; bonus <= 5; ++bonus) {
                        uint32 key = lottery.combinationKey([a, b, c], bonus);
                        assertEq(
                            seen[key / 256] & (uint256(1) << (key % 256)),
                            0,
                            "Sorphera: combination collision"
                        );
                        seen[key / 256] |= uint256(1) << (key % 256);
                        assertEq(lottery.combinationKey([a, c, b], bonus), key);
                        assertEq(lottery.combinationKey([b, a, c], bonus), key);
                        assertEq(lottery.combinationKey([b, c, a], bonus), key);
                        assertEq(lottery.combinationKey([c, a, b], bonus), key);
                        assertEq(lottery.combinationKey([c, b, a], bonus), key);
                        ++count;
                    }
                }
            }
        }
        assertEq(count, 5700);
    }

    function testDuplicateClaimIdsNeverMultiplyPayoutAndMixedOwnerBatchRollsBack() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 42), 1);
        _buy(0, 1, bob, _pick(0, 1, 42), 1);
        _draw(0, 1, 42);
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        vm.prank(alice);
        vm.expectRevert("Sorphera: ticket owner");
        lottery.claimETH(0, 1, ids, alice);
        assertEq(lottery.claimedETH(0, 1, 1), 0);
        ids[1] = 1;
        uint256 beforeBalance = alice.balance;
        vm.prank(alice);
        lottery.claimETH(0, 1, ids, alice);
        assertEq(alice.balance - beforeBalance, 0.0045 ether);
        vm.prank(alice);
        vm.expectRevert("Sorphera: nothing to claim");
        lottery.claimETH(0, 1, ids, alice);
        _claim(0, 1, bob, 2, bob);
        _conserved();
    }

    function testPauseBlocksSaleButPreservesPermissionlessSettlement() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 42), 5);
        v.acquire(1, vm.getBlockTimestamp());
        pool.allocate(1, 0.02 ether);
        lottery.setSalesEnabled(false);
        Sorphera.Pick memory p = _pick(1, 1, 42);
        vm.expectRevert("Sorphera: sales closed");
        _buy(1, 1, alice, p, 1);
        vm.prank(bob);
        v.settle(1);
        _draw(1, 1, 42);
        uint256 ticket = lottery.getRound(1, 1).winningTicket;
        vm.prank(alice);
        v.claimNFTs(ticket, _one(0), alice);
        _claim(1, 1, alice, ticket, alice);
        assertEq(nft.ownerOf(1), alice);
    }

    function testNFTReceiverCannotReenterClaimAnotherAsset() public {
        SorpheraVault v = _open(1);
        SorpheraNFTReentrantRecipient receiver = new SorpheraNFTReentrantRecipient(v, 1);
        vm.deal(address(receiver), 1 ether);
        _buy(1, 1, address(receiver), _pick(1, 1, 42), 1);
        Sorphera.Pick memory losing = _pick(1, 1, 42);
        losing.bonus = losing.bonus == 5 ? 1 : losing.bonus + 1;
        _buy(1, 1, alice, losing, 4);
        _acquireNFT(v, 2);
        _draw(1, 1, 42);
        assertEq(lottery.getRound(1, 1).winningTicket, 1);
        vm.prank(address(receiver));
        v.claimNFTs(1, _one(0), address(receiver));
        assertTrue(receiver.attempted());
        assertFalse(receiver.succeeded());
        assertEq(nft.ownerOf(1), address(receiver));
        assertEq(nft.ownerOf(2), address(v));
        vm.prank(address(receiver));
        v.claimNFTs(1, _one(1), bob);
        assertEq(nft.ownerOf(2), bob);
    }

    function testVaultPrivilegeAndCrossRoundRequestBoundaries() public {
        SorpheraVault ethVault = _open(0);
        SorpheraVault nftVault = _open(1);
        _buy(0, 1, alice, _pick(0, 1, 42), 3);
        ethVault.acquire(1, vm.getBlockTimestamp());
        vm.expectRevert("Sorphera: unknown acquisition");
        nftVault.reconcile(_one(1));
        vm.expectRevert("Sorphera: unknown acquisition");
        nftVault.settle(1);
        vm.expectRevert("Sorphera: unknown acquisition");
        nftVault.recoverNFT(1);
        vm.expectRevert("Sorphera: lottery only");
        ethVault.fund();
        vm.expectRevert("Sorphera: self only");
        ethVault.deliver(0, alice);
        vm.expectRevert("Sorphera: vault only");
        lottery.credit(0, 1);
        vm.expectRevert("Sorphera: vault only");
        lottery.recordNFT(1, 1, vm.getBlockTimestamp() - 1 days);
        vm.prank(address(ethVault));
        vm.expectRevert("Sorphera: vault only");
        lottery.recordNFT(1, 1, vm.getBlockTimestamp() - 1 days);
        vm.prank(address(ethVault));
        vm.expectRevert("Sorphera: vault only");
        lottery.credit(1, 1);
        assertEq(ethVault.pending(), 1);
        assertEq(nftVault.pending(), 0);
    }

    function testBadCallbackShapeUnknownRequestAndFutureRulesCannotMutateActiveRound() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 42), 1);
        Sorphera.Round memory original = lottery.getRound(0, 1);
        Sorphera.Rules memory rules = _rules(cutoff);
        rules.price = 10;
        rules.drawDelay = 0;
        rules.settlementDelay = 1;
        lottery.configureRules(0, rules);
        assertEq(keccak256(abi.encode(original)), keccak256(abi.encode(lottery.getRound(0, 1))));
        vm.warp(original.earliestDraw);
        lottery.requestDraw(0, 1);
        vm.prank(address(vrf));
        vm.expectRevert("Sorphera: unknown callback");
        lottery.rawFulfillRandomWords(1, new uint256[](0));
        vm.prank(address(vrf));
        vm.expectRevert("Sorphera: unknown callback");
        lottery.rawFulfillRandomWords(1, new uint256[](2));
        vm.prank(address(vrf));
        vm.expectRevert("Sorphera: unknown callback");
        lottery.rawFulfillRandomWords(999, _one(42));
        assertEq(uint256(lottery.getRound(0, 1).status), uint256(Sorphera.Status.Requested));
        vrf.fulfill(1, 42);
        lottery.finalize(0, 1);
        _open(0);
        assertEq(lottery.getRound(0, 2).price, 10);
        assertEq(lottery.getRound(0, 2).earliestDraw, cutoff + 7 days);
    }

    function testCancellationAccumulatesSubTicketLateRecoveriesWithoutFees() public {
        Sorphera.Rules memory rules = _rules(cutoff + 1 hours);
        rules.price = 10;
        lottery.configureRules(1, rules);
        SorpheraVault v = _open(1);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](3);
        for (uint256 i; i < 3; ++i) {
            picks[i] = Sorphera.Pick([uint8(1), 2, 20], 5);
        }
        vm.prank(alice);
        lottery.buy{value: 30}(1, 1, picks);
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        uint256 beforeBalance = alice.balance;
        for (uint256 ticket = 1; ticket <= 3; ++ticket) {
            _claim(1, 1, alice, ticket, alice);
        }
        assertEq(alice.balance - beforeBalance, 30);
        vm.deal(address(v), 1);
        v.syncETH();
        vm.expectRevert("Sorphera: nothing to claim");
        _claim(1, 1, alice, 1, alice);
        (,, uint256 remainder,,,) = lottery.groups(1, 1);
        assertEq(remainder, 1);
        vm.deal(address(v), 2);
        v.syncETH();
        beforeBalance = alice.balance;
        for (uint256 ticket = 1; ticket <= 3; ++ticket) {
            _claim(1, 1, alice, ticket, alice);
        }
        assertEq(alice.balance - beforeBalance, 3);
        assertEq(lottery.operatorFees(), 0);
        assertEq(address(lottery).balance, 0);
        _conserved();
    }

    function testEmptyAndOversizedMaintenanceAndClaimBatchesReject() public {
        SorpheraVault v = _open(1);
        vm.expectRevert("Sorphera: process batch");
        v.process(0);
        vm.expectRevert("Sorphera: process batch");
        v.process(51);
        vm.expectRevert("Sorphera: reconcile batch");
        v.reconcile(new uint256[](0));
        vm.expectRevert("Sorphera: reconcile batch");
        v.reconcile(new uint256[](51));
        vm.expectRevert("Sorphera: claim batch");
        lottery.claimETH(1, 1, new uint256[](0), alice);
        vm.expectRevert("Sorphera: claim batch");
        lottery.claimETH(1, 1, new uint256[](101), alice);
        vm.expectRevert("Sorphera: NFT claim bounds");
        v.claimNFTs(1, new uint256[](0), alice);
        vm.expectRevert("Sorphera: NFT claim bounds");
        v.claimNFTs(1, new uint256[](21), alice);
        vm.expectRevert("Sorphera: epoch batch");
        v.claimEpochRewards(new uint256[](0));
        vm.expectRevert("Sorphera: epoch batch");
        v.claimEpochRewards(new uint256[](33));
        assertEq(v.requestCount(), 0);
        assertEq(v.budget(), 0);
        _conserved();
    }

    /// @notice Anyone may call the vault's ERC721 hook, but the stamp is keyed by the caller, so a stamp
    ///         forged by a non-collection cannot backdate the real collection's late delivery. Receipt
    ///         exactly at the deadline is late: the strict boundary cancels rather than draws.
    function testForgedReceiptStampCannotRescueLateDeliveryAndDeadlineBoundaryIsStrict() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 61), 3);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        uint256 deadline = lottery.getRound(1, 1).settlementDeadline;
        vm.warp(deadline - 1);
        vm.prank(bob);
        assertEq(v.onERC721Received(address(pool), address(pool), 1, ""), bytes4(0x150b7a02));
        assertEq(v.receivedAt(bob, 1), deadline - 1);
        assertEq(
            v.receivedAt(address(nft), 1), 0, "Sorphera: forged stamp must not reach the real collection"
        );
        vm.warp(deadline);
        pool.finalizeUnsettled(1);
        assertEq(nft.ownerOf(1), address(v));
        assertEq(v.receivedAt(address(nft), 1), deadline);
        v.reconcile(_one(1));
        assertEq(v.securedCount(), 1);
        assertEq(lottery.getRound(1, 1).eligibleNFTs, 0, "Sorphera: receipt at the deadline is late");
        lottery.requestDraw(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Cancelled));
        assertEq(vrf.requests(), 0);
        assertEq(lottery.operatorFees(), 0);
        vm.prank(alice);
        v.claimNFTs(1, _one(0), alice);
        vm.prank(alice);
        v.claimNFTs(2, _one(0), alice);
        assertEq(nft.ownerOf(1), address(v), "Sorphera: two of three cohort tickets cannot release the asset");
        vm.prank(alice);
        v.claimNFTs(3, _one(0), alice);
        assertEq(nft.ownerOf(1), alice);
        _conserved();
    }

    /// forge-config: default.fuzz.runs = 512
    function testFuzzReceiptTimeNotReconcileTimeDecidesCancellation(uint256 rawReceipt, bool reconcileLate)
        public
    {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 62), 3);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        uint256 deadline = lottery.getRound(1, 1).settlementDeadline;
        uint256 receipt = bound(rawReceipt, vm.getBlockTimestamp() + pool.finalizeWindow(), deadline + 1 days);
        vm.warp(receipt);
        pool.finalizeUnsettled(1);
        if (reconcileLate && vm.getBlockTimestamp() < deadline) vm.warp(deadline);
        v.reconcile(_one(1));
        bool eligible = receipt < deadline;
        assertEq(v.securedCount(), 1);
        assertEq(lottery.getRound(1, 1).eligibleNFTs, eligible ? 1 : 0);
        if (vm.getBlockTimestamp() < deadline) vm.warp(deadline);
        lottery.requestDraw(1, 1);
        assertEq(
            uint256(lottery.getRound(1, 1).status),
            uint256(eligible ? Sorphera.Status.Requested : Sorphera.Status.Cancelled)
        );
        assertEq(vrf.requests(), eligible ? 1 : 0);
        assertEq(lottery.getRound(1, 1).frozenNFTs, eligible ? 1 : 0);
    }

    /// @notice A stuck delivery never blocks the draw; once recovered during the next round of the same
    ///         rollover group it joins the carryover for that round's winner, and the expired tickets of the
    ///         originating round have no claim on their own vault's inventory.
    function testStuckAssetRecoveredIntoRolledRoundJoinsCarryoverForNextWinnerOnly() public {
        SorpheraVault first = _open(1);
        Sorphera.Pick memory losing = _pick(1, 1, 42);
        losing.bonus = losing.bonus == 5 ? 1 : losing.bonus + 1;
        _buy(1, 1, alice, losing, 5);
        first.acquire(2, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        first.settle(1);
        pool.allocate(2, 0.02 ether);
        nft.setRejected(2, true);
        vm.warp(vm.getBlockTimestamp() + pool.finalizeWindow());
        pool.finalizeUnsettled(2);
        first.reconcile(_one(2));
        assertEq(first.pending(), 0);
        assertEq(first.securedCount(), 1);
        _draw(1, 1, 42);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Rolled));
        assertEq(lottery.getRound(1, 1).frozenNFTs, 1);
        SorpheraVault second = _open(1);
        assertEq(lottery.getRound(1, 2).eligibleNFTs, 1);
        nft.setRejected(2, false);
        first.recoverNFT(2);
        assertEq(first.securedCount(), 2);
        assertEq(lottery.getRound(1, 2).eligibleNFTs, 2);
        (,,,,, uint256 inventory) = lottery.groups(1, 1);
        assertEq(inventory, 2);
        _buy(1, 2, bob, _pick(1, 2, 7), 1);
        _draw(1, 2, 7);
        Sorphera.Round memory r = lottery.getRound(1, 2);
        assertEq(uint256(r.status), uint256(Sorphera.Status.Won));
        assertEq(r.frozenNFTs, 2);
        assertEq(r.winningTicket, 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: ticket owner");
        first.claimNFTs(1, _one(0), alice);
        vm.prank(alice);
        vm.expectRevert("Sorphera: ticket owner");
        first.claimNFTs(4, _one(1), alice);
        vm.prank(alice);
        vm.expectRevert("Sorphera: ticket owner");
        lottery.claimETH(1, 1, _one(1), alice);
        uint256[] memory both = new uint256[](2);
        both[1] = 1;
        vm.prank(bob);
        first.claimNFTs(1, both, bob);
        assertEq(nft.ownerOf(1), bob);
        assertEq(nft.ownerOf(2), bob);
        assertEq(second.securedCount(), 0);
        uint256 beforeBalance = bob.balance;
        _claim(1, 1, bob, 1, bob);
        // Round 1 unspent budget (0.0225 - 0.02) rolled into round 2's unspent budget (0.0045).
        assertEq(bob.balance - beforeBalance, 0.0025 ether + 0.0045 ether);
        _conserved();
    }

    function testSecondLotteryCannotValidateAgainstBoundFactoryOrCreateVaults() public {
        Sorphera impostor = new Sorphera(address(this), address(factory), address(vrf));
        impostor.configureRules(0, _rules(cutoff));
        impostor.configureRules(1, _rules(cutoff + 1 hours));
        impostor.configureRandomness(Sorphera.RandomConfig(123, keccak256("mock key"), 3, 200000, true));
        vrf.setConsumer(address(impostor));
        vm.expectRevert("Sorphera: factory not bound");
        impostor.validateLaunch();
        vm.expectRevert("Sorphera: launch not validated");
        impostor.openRound(0);
        vm.prank(address(impostor));
        vm.expectRevert("Sorphera: lottery only");
        factory.create(0, 1, SorpheraVault.Settings(1, 1, 1, 1, cutoff));
        vm.expectRevert("Sorphera: lottery bound");
        factory.setLottery(address(impostor));
        vrf.setConsumer(address(lottery));
        assertEq(lottery.openRound(0), 1);
        assertEq(factory.lottery(), address(lottery));
    }

    function testMinimumTicketPriceSingleEntryRefundsAllUnspentFunds() public {
        testFuzzPriceEdgesKeepExactSplitAndFullBatchRefund(1, 1);
    }

    function testMaximumTicketPriceFullBatchRefundsAllUnspentFunds() public {
        testFuzzPriceEdgesKeepExactSplitAndFullBatchRefund(10 ether, 100);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzzPriceEdgesKeepExactSplitAndFullBatchRefund(uint256 rawPrice, uint8 rawCount) public {
        uint256 price = bound(rawPrice, 1, 10 ether) * 10;
        uint256 count = bound(rawCount, 1, 100);
        Sorphera.Rules memory rules = _rules(cutoff + 1 hours);
        rules.price = price;
        lottery.configureRules(1, rules);
        SorpheraVault v = _open(1);
        uint256 paid = price * count;
        vm.deal(alice, paid);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](count);
        for (uint256 i; i < count; ++i) {
            picks[i] = Sorphera.Pick([uint8(1), 2, 20], 5);
        }
        vm.prank(alice);
        lottery.buy{value: paid}(1, 1, picks);
        assertEq(v.budget() + lottery.getRound(1, 1).fees, paid);
        assertEq(lottery.getRound(1, 1).fees * 9, v.budget());
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        uint256[] memory ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = i + 1;
        }
        vm.prank(alice);
        lottery.claimETH(1, 1, ids, alice);
        assertEq(alice.balance, paid, "Sorphera: all unspent money and held fees refunded");
        assertEq(lottery.operatorFees(), 0);
        assertEq(address(lottery).balance, 0);
        assertEq(address(v).balance, 0);
    }
}
