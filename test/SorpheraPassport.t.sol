// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SorpheraFixture} from "./helpers/SorpheraFixture.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraPassport} from "../src/SorpheraPassport.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";

/// @notice Passport rewards: stamps, finality, redemption, cancellation cohort and restoration.
contract SorpheraPassportTest is SorpheraFixture {
    uint256 internal constant PRICE = 0.005 ether;
    address internal carol = makeAddr("Sorphera Carol");

    function setUp() public override {
        super.setUp();
        vm.deal(carol, 1000 ether);
    }

    // ------------------------------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------------------------------

    /// @dev Opens the next ETH round that is still open for sales (previous rounds must be terminal).
    ///      Weekly rounds whose window already passed roll empty, as they would in production.
    function _nextETH() internal returns (uint256 id) {
        _open(0);
        id = lottery.latestRound(0);
        while (vm.getBlockTimestamp() >= lottery.getRound(0, id).cutoff) {
            lottery.requestDraw(0, id);
            assertEq(uint256(lottery.getRound(0, id).status), uint256(Sorphera.Status.Rolled));
            _open(0);
            id = lottery.latestRound(0);
        }
    }

    /// @dev Draws with a word whose combination nobody bought (all buys use pick word 1): Rolled.
    function _rollETH(uint256 id) internal {
        if (lottery.getRound(0, id).sold == 0) {
            vm.warp(lottery.getRound(0, id).cutoff);
            lottery.requestDraw(0, id);
        } else {
            _draw(0, id, 777_000 + id);
        }
        assertEq(uint256(lottery.getRound(0, id).status), uint256(Sorphera.Status.Rolled));
    }

    /// @dev An open NFT round after ETH earning moved time to the NFT round-1 cutoff: round 1 rolls empty,
    ///      round 2 is open for the following week. Returns the open round id and its vault.
    function _openNFT() internal returns (uint256 id, SorpheraVault v) {
        v = _open(1);
        id = lottery.latestRound(1);
        if (vm.getBlockTimestamp() >= lottery.getRound(1, id).cutoff) {
            lottery.requestDraw(1, id);
            assertEq(uint256(lottery.getRound(1, id).status), uint256(Sorphera.Status.Rolled));
            v = _open(1);
            id = lottery.latestRound(1);
        }
        assertLt(vm.getBlockTimestamp(), lottery.getRound(1, id).cutoff);
    }

    function _available(address who) internal view returns (uint256) {
        return passport.availableRewards(who);
    }

    /// @dev Finalized ETH round where `who` bought `n` tickets; returns the round id.
    function _earn(address who, uint256 n) internal returns (uint256 id) {
        id = _nextETH();
        if (n != 0) _buy(0, id, who, _pick(0, id, 1), n);
        _rollETH(id);
        passport.process(who, _key(0, id));
    }

    // ------------------------------------------------------------------------------------------
    // 1. product rules
    // ------------------------------------------------------------------------------------------

    function testThresholdsAndRemainders() public {
        _earn(alice, 11);
        (uint256 paid, uint256 stamps, uint256 earned,,, uint256 available) = passport.summary(alice);
        assertEq(paid, 11);
        assertEq(stamps, 11);
        assertEq(earned, 0);
        assertEq(available, 0);
        _earn(alice, 1); // 11 + 1 => 1 reward / 0 stamps
        (, stamps, earned,,, available) = passport.summary(alice);
        assertEq(stamps, 0);
        assertEq(earned, 1);
        assertEq(available, 1);
        _earn(alice, 2); // 12 + 2 = 14 => 1 reward / 2 stamps (11 + 3 boundary)
        (, stamps, earned,,, available) = passport.summary(alice);
        assertEq(stamps, 2);
        assertEq(available, 1);
        _earn(alice, 10); // 24 => 2 rewards / 0 stamps
        (, stamps, earned,,, available) = passport.summary(alice);
        assertEq(stamps, 0);
        assertEq(earned, 2);
        assertEq(available, 2);
    }

    function testFuzzBatchAndOrderEquivalence(uint8 a, uint8 b, uint8 c, uint8 splitSeed) public {
        a = uint8(bound(a, 0, 30));
        b = uint8(bound(b, 0, 30));
        c = uint8(bound(c, 0, 30));
        uint256 total = uint256(a) + b + c;
        // Round 1: `a` tickets bought as two transactions of arbitrary split.
        uint256 id1 = _nextETH();
        uint256 split = total == 0 ? 0 : uint256(splitSeed) % (uint256(a) + 1);
        if (split != 0) _buy(0, id1, alice, _pick(0, id1, 1), split);
        if (a - split != 0) _buy(0, id1, alice, _pick(0, id1, 1), a - split);
        _rollETH(id1);
        // Round 2 and 3; process out of order and twice.
        uint256 id2 = _nextETH();
        if (b != 0) _buy(0, id2, alice, _pick(0, id2, 1), b);
        _rollETH(id2);
        uint256 id3 = _nextETH();
        if (c != 0) _buy(0, id3, alice, _pick(0, id3, 1), c);
        _rollETH(id3);
        SorpheraPassport.RoundKey[] memory keys = new SorpheraPassport.RoundKey[](4);
        keys[0] = SorpheraPassport.RoundKey(0, id3);
        keys[1] = SorpheraPassport.RoundKey(0, id1);
        keys[2] = SorpheraPassport.RoundKey(0, id2);
        keys[3] = SorpheraPassport.RoundKey(0, id1);
        uint256 changed = passport.process(alice, keys);
        assertEq(changed, 3);
        assertEq(passport.process(alice, keys), 0);
        (uint256 paid, uint256 stamps, uint256 earned,,, uint256 available) = passport.summary(alice);
        assertEq(paid, total);
        assertEq(stamps, total % 12);
        assertEq(earned, total / 12);
        assertEq(available, total / 12);
    }

    function testWalletSplittingCannotIncreaseRewards() public {
        uint256 id = _nextETH();
        _buy(0, id, alice, _pick(0, id, 1), 6);
        _buy(0, id, bob, _pick(0, id, 1), 6);
        _rollETH(id);
        passport.process(alice, _key(0, id));
        passport.process(bob, _key(0, id));
        assertEq(_available(alice), 0);
        assertEq(_available(bob), 0);
        assertEq(passport.stamps(alice), 6);
        assertEq(passport.stamps(bob), 6);
    }

    function testMixedGamesShareOneCounter() public {
        uint256 e = _nextETH();
        _buy(0, e, alice, _pick(0, e, 1), 7);
        _rollETH(e);
        (uint256 n, SorpheraVault v) = _openNFT();
        _buy(1, n, alice, _pick(1, n, 1), 5);
        _acquireNFT(v, 1);
        _draw(1, n, 999);
        assertEq(uint256(lottery.getRound(1, n).status), uint256(Sorphera.Status.Rolled));
        SorpheraPassport.RoundKey[] memory keys = new SorpheraPassport.RoundKey[](2);
        keys[0] = SorpheraPassport.RoundKey(0, e);
        keys[1] = SorpheraPassport.RoundKey(1, n);
        passport.process(alice, keys);
        assertEq(_available(alice), 1);
        assertEq(passport.stamps(alice), 0);
    }

    function testOtherPriceRoundsEarnNothingAndRefuseRewards() public {
        _earn(alice, 12);
        assertEq(_available(alice), 1);
        Sorphera.Rules memory expensive = _rules(cutoff + 1 hours);
        expensive.price = 0.01 ether;
        lottery.configureRules(1, expensive);
        (uint256 n, SorpheraVault v) = _openNFT();
        assertEq(lottery.getRound(1, n).price, 0.01 ether);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](1);
        picks[0] = _pick(1, n, 1);
        vm.prank(alice);
        lottery.buy{value: 0.01 ether * 12}(1, n, _repeat(picks[0], 12));
        vm.prank(alice);
        vm.expectRevert("Sorphera: round price not qualifying");
        passport.enter(1, n, picks, 1, _noKeys());
        _acquireNFT(v, 1);
        _draw(1, n, 999);
        (,, bool processable, SorpheraPassport.Outcome outcome) = passport.roundCredit(alice, 1, n);
        assertFalse(processable);
        passport.process(alice, _key(1, n));
        (,,, outcome) = passport.roundCredit(alice, 1, n);
        assertEq(uint256(outcome), uint256(SorpheraPassport.Outcome.Ineligible));
        assertEq(_available(alice), 1);
        assertEq(passport.stamps(alice), 0);
    }

    function _repeat(Sorphera.Pick memory p, uint256 n) internal pure returns (Sorphera.Pick[] memory picks) {
        picks = new Sorphera.Pick[](n);
        for (uint256 i; i < n; ++i) {
            picks[i] = p;
        }
    }

    // ------------------------------------------------------------------------------------------
    // 2. finality
    // ------------------------------------------------------------------------------------------

    function testPendingUntilOwnRoundIsWonOrRolled() public {
        uint256 id = _nextETH();
        _buy(0, id, alice, _pick(0, id, 1), 12);
        (uint256 pendingPaid,, bool processable,) = passport.roundCredit(alice, 0, id);
        assertEq(pendingPaid, 12);
        assertFalse(processable);
        assertEq(passport.process(alice, _key(0, id)), 0);
        Sorphera.Round memory r = lottery.getRound(0, id);
        vm.warp(r.cutoff);
        lottery.close(0, id); // cutoff is not finality
        assertEq(passport.process(alice, _key(0, id)), 0);
        vm.warp(r.earliestDraw);
        lottery.requestDraw(0, id); // accepted VRF request is not finality
        assertEq(passport.process(alice, _key(0, id)), 0);
        vrf.fulfill(lottery.getRound(0, id).requestId, 777_000 + id); // stored randomness is not finality
        assertEq(passport.process(alice, _key(0, id)), 0);
        assertEq(_available(alice), 0);
        lottery.finalize(0, id);
        assertEq(passport.process(alice, _key(0, id)), 1);
        assertEq(_available(alice), 1);
        assertEq(passport.process(alice, _key(0, id)), 0);
        assertEq(_available(alice), 1);
    }

    function testWonRoundCreditsStampsOnce() public {
        uint256 id = _nextETH();
        _buy(0, id, alice, _pick(0, id, 5), 12);
        _draw(0, id, 5);
        assertEq(uint256(lottery.getRound(0, id).status), uint256(Sorphera.Status.Won));
        assertEq(passport.process(alice, _key(0, id)), 1);
        assertEq(passport.process(alice, _key(0, id)), 0);
        assertEq(_available(alice), 1);
    }

    function testCancelledRoundEarnsNothing() public {
        _open(1);
        _buy(1, 1, alice, _pick(1, 1, 1), 12);
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Cancelled));
        assertEq(passport.process(alice, _key(1, 1)), 1);
        assertEq(_available(alice), 0);
        assertEq(passport.stamps(alice), 0);
    }

    function testProcessingCreditsOnlyTheNamedWalletFromItsOwnEntries() public {
        uint256 id = _nextETH();
        _buy(0, id, alice, _pick(0, id, 1), 12);
        _rollETH(id);
        vm.prank(bob);
        passport.process(bob, _key(0, id));
        assertEq(_available(bob), 0);
        vm.prank(bob);
        passport.process(alice, _key(0, id));
        assertEq(_available(alice), 1);
        assertEq(_available(bob), 0);
    }

    function testUnknownGameOrRoundIsIgnored() public {
        SorpheraPassport.RoundKey[] memory keys = new SorpheraPassport.RoundKey[](2);
        keys[0] = SorpheraPassport.RoundKey(7, 1);
        keys[1] = SorpheraPassport.RoundKey(0, 99);
        assertEq(passport.process(alice, keys), 0);
        keys = new SorpheraPassport.RoundKey[](51);
        vm.expectRevert("Sorphera: process batch");
        passport.process(alice, keys);
    }

    // ------------------------------------------------------------------------------------------
    // 3. redemption
    // ------------------------------------------------------------------------------------------

    function testFreeOnlyRedemptionCreatesOwnedZeroPriceTickets() public {
        _earn(alice, 24);
        uint256 id = _nextETH();
        uint256 liabilitiesBefore = lottery.totalLiabilities();
        SorpheraVault v = SorpheraVault(payable(lottery.getRound(0, id).vault));
        vm.expectEmit(true, true, true, true);
        emit SorpheraPassport.RewardsRedeemed(alice, 0, id, 2, 1, 2);
        _enter(0, id, alice, _pick(0, id, 1), 2, 2, _noKeys());
        Sorphera.Round memory r = lottery.getRound(0, id);
        assertEq(r.sold, 2);
        assertEq(r.paidEntries, 0);
        assertEq(r.rewardEntries, 2);
        assertEq(r.fees, 0);
        assertEq(v.budget(), 0);
        assertEq(address(v).balance, 0);
        assertEq(lottery.totalLiabilities(), liabilitiesBefore);
        (address player,, bool reward) = lottery.tickets(0, id, 1);
        assertEq(player, alice);
        assertTrue(reward);
        (uint256 paidOf, uint256 rewardOf) = lottery.entriesOf(0, id, alice);
        assertEq(paidOf, 0);
        assertEq(rewardOf, 2);
        assertEq(_available(alice), 0);
        assertEq(address(passport).balance, 0);
        _conserved();
    }

    function testMixedBatchChargesOnlyPaidEntries() public {
        _earn(alice, 12);
        uint256 id = _nextETH();
        SorpheraVault v = SorpheraVault(payable(lottery.getRound(0, id).vault));
        _enter(0, id, alice, _pick(0, id, 1), 3, 1, _noKeys());
        Sorphera.Round memory r = lottery.getRound(0, id);
        assertEq(r.sold, 3);
        assertEq(r.paidEntries, 2);
        assertEq(r.rewardEntries, 1);
        assertEq(r.fees, 2 * PRICE / 10);
        assertEq(v.budget(), 2 * PRICE * 9 / 10);
        (,, bool reward1) = lottery.tickets(0, id, 1);
        (,, bool reward3) = lottery.tickets(0, id, 3);
        assertFalse(reward1);
        assertTrue(reward3);
        assertEq(
            lottery.matchCount(0, id, lottery.combinationKey(_pick(0, id, 1).main, _pick(0, id, 1).bonus)), 3
        );
        _conserved();
    }

    function testFinalizationAlongsideRedemptionInOneTransaction() public {
        uint256 id = _nextETH();
        _buy(0, id, alice, _pick(0, id, 1), 12);
        _rollETH(id);
        assertEq(_available(alice), 0);
        uint256 next = _nextETH();
        _enter(0, next, alice, _pick(0, next, 1), 1, 1, _key(0, id));
        assertEq(_available(alice), 0);
        (, uint256 rewardOf) = lottery.entriesOf(0, next, alice);
        assertEq(rewardOf, 1);
    }

    function testRedemptionFailuresPreserveCredit() public {
        _earn(alice, 24);
        uint256 id = _nextETH();
        Sorphera.Pick[] memory picks = _repeat(_pick(0, id, 1), 1);
        // insufficient credit
        vm.prank(alice);
        vm.expectRevert("Sorphera: insufficient rewards");
        passport.enter(0, id, _repeat(picks[0], 3), 3, _noKeys());
        // paying for a free ticket, or rewards above the batch
        vm.prank(alice);
        vm.expectRevert("Sorphera: tickets/payment");
        passport.enter{value: PRICE}(0, id, picks, 1, _noKeys());
        vm.prank(alice);
        vm.expectRevert("Sorphera: tickets/payment");
        passport.enter(0, id, picks, 2, _noKeys());
        // invalid pick rolls the consumed credit back
        Sorphera.Pick[] memory bad = new Sorphera.Pick[](1);
        bad[0] = Sorphera.Pick([1, 1, 2], 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: distinct balls");
        passport.enter(0, id, bad, 1, _noKeys());
        assertEq(_available(alice), 2);
        // no credit at all for bob
        vm.prank(bob);
        vm.expectRevert("Sorphera: insufficient rewards");
        passport.enter(0, id, picks, 1, _noKeys());
        // sales pause
        lottery.setSalesEnabled(false);
        vm.prank(alice);
        vm.expectRevert("Sorphera: sales closed");
        passport.enter(0, id, picks, 1, _noKeys());
        lottery.setSalesEnabled(true);
        // cutoff is strict
        vm.warp(lottery.getRound(0, id).cutoff);
        vm.prank(alice);
        vm.expectRevert("Sorphera: sales closed");
        passport.enter(0, id, picks, 1, _noKeys());
        assertEq(_available(alice), 2);
        // zero-reward batches are plain paid buys through the Passport
        vm.warp(lottery.getRound(0, id).cutoff - 1);
        vm.prank(alice);
        passport.enter{value: PRICE}(0, id, picks, 0, _noKeys());
        (uint256 paidOf,) = lottery.entriesOf(0, id, alice);
        assertEq(paidOf, 1);
        assertEq(_available(alice), 2);
    }

    function testOnlyThePassportCanIssueRewardEntries() public {
        uint256 id = _nextETH();
        Sorphera.Pick[] memory picks = _repeat(_pick(0, id, 1), 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: passport only");
        lottery.enter(alice, 0, id, picks, 1);
        vm.expectRevert("Sorphera: passport binding");
        lottery.setPassport(address(passport));
        vm.prank(alice);
        vm.expectRevert("Sorphera: owner only");
        lottery.setPassport(address(passport));
    }

    function testUnboundLotteryRefusesRewardEntriesUntilConfigured() public {
        Sorphera fresh = new SimulatedLottery(address(this), address(factory), address(vrf));
        vm.expectRevert("Sorphera: passport binding");
        fresh.setPassport(alice);
        Sorphera.Pick[] memory picks = _repeat(_pick(0, 1, 1), 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: passport only");
        fresh.enter(alice, 0, 1, picks, 1);
        vm.expectRevert("Sorphera: qualifying price");
        new SorpheraPassport(address(fresh), 0);
        vm.expectRevert("Sorphera: lottery");
        new SorpheraPassport(address(0), PRICE);
    }

    /// @notice Redemption never calls back into the player (no refunds, no hooks), so a contract wallet
    ///         cannot re-enter; a nested second redemption in the same transaction still cannot overspend.
    function testContractWalletCannotOverspendThroughNestedRedemption() public {
        ReenteringPlayer attacker = new ReenteringPlayer(passport);
        vm.deal(address(attacker), 10 ether);
        uint256 id = _nextETH();
        attacker.buy{value: 12 * PRICE}(lottery, 0, id, _repeat(_pick(0, id, 1), 12));
        _rollETH(id);
        passport.process(address(attacker), _key(0, id));
        assertEq(_available(address(attacker)), 1);
        uint256 next = _nextETH();
        Sorphera.Pick[] memory picks = _repeat(_pick(0, next, 1), 1);
        vm.expectRevert("Sorphera: insufficient rewards");
        attacker.reenter(0, next, picks);
        assertEq(_available(address(attacker)), 1);
        assertEq(lottery.getRound(0, next).sold, 0);
        attacker.once(0, next, picks);
        assertEq(_available(address(attacker)), 0);
        (address player,, bool reward) = lottery.tickets(0, next, 1);
        assertEq(player, address(attacker));
        assertTrue(reward);
    }

    // ------------------------------------------------------------------------------------------
    // 4. prizes and recursion
    // ------------------------------------------------------------------------------------------

    function testRewardAndPaidWinnersShareETHEqually() public {
        _earn(alice, 12);
        uint256 id = _nextETH();
        _enter(0, id, alice, _pick(0, id, 42), 1, 1, _noKeys());
        _buy(0, id, bob, _pick(0, id, 42), 1);
        _buy(0, id, carol, _pick(0, id, 1), 10);
        _draw(0, id, 42);
        assertEq(uint256(lottery.getRound(0, id).status), uint256(Sorphera.Status.Won));
        (,,,, uint256 divisor,) = lottery.groups(0, lottery.groupOf(0, id));
        assertEq(divisor, 2);
        SorpheraVault v = SorpheraVault(payable(lottery.getRound(0, id).vault));
        v.syncETH();
        uint256 a = alice.balance;
        uint256 b = bob.balance;
        _claim(0, id, alice, 1, alice);
        _claim(0, id, bob, 2, bob);
        assertEq(alice.balance - a, bob.balance - b);
        assertGt(alice.balance - a, 0);
        // Reward tickets earn no stamps of their own.
        passport.process(alice, _key(0, id));
        assertEq(passport.stamps(alice), 0);
        assertEq(_available(alice), 0);
        _conserved();
    }

    function testRewardTicketCanWinNFTTieBreakAndClaim() public {
        _earn(alice, 12);
        (uint256 n, SorpheraVault v) = _openNFT();
        _enter(1, n, alice, _pick(1, n, 42), 1, 1, _noKeys());
        _buy(1, n, bob, _pick(1, n, 42), 1);
        _buy(1, n, carol, _pick(1, n, 1), 3); // funds the acquisition budget
        _acquireNFT(v, 1);
        _draw(1, n, 42);
        Sorphera.Round memory r = lottery.getRound(1, n);
        assertEq(uint256(r.status), uint256(Sorphera.Status.Won));
        assertEq(r.matches, 2);
        assertTrue(r.winningTicket == 1 || r.winningTicket == 2);
        address winner = r.winningTicket == 1 ? alice : bob;
        vm.prank(winner);
        v.claimNFTs(r.winningTicket, _one(0), winner);
        assertEq(nft.ownerOf(1), winner);
        address loser = winner == alice ? bob : alice;
        vm.prank(loser);
        vm.expectRevert("Sorphera: not winning ticket");
        v.claimNFTs(r.winningTicket == 1 ? 2 : 1, _one(0), loser);
    }

    // ------------------------------------------------------------------------------------------
    // 5. cancellation cohort and restoration
    // ------------------------------------------------------------------------------------------

    uint256 internal n; // the cancelled NFT round
    uint256 internal baseLiabilities; // lottery liabilities before the cancelled round sold anything

    function _cancelledMixedNFTRound() internal returns (SorpheraVault v) {
        _earn(alice, 12);
        (n, v) = _openNFT();
        baseLiabilities = lottery.totalLiabilities();
        _buy(1, n, bob, _pick(1, n, 1), 3); // tickets 1-3
        _enter(1, n, alice, _pick(1, n, 2), 2, 1, _noKeys()); // alice: ticket 4 paid, ticket 5 reward
        v.acquire(1, vm.getBlockTimestamp() + 1 minutes);
        vm.warp(lottery.getRound(1, n).settlementDeadline);
        lottery.requestDraw(1, n);
        assertEq(uint256(lottery.getRound(1, n).status), uint256(Sorphera.Status.Cancelled));
    }

    /// @notice Regression: the refund divisor must be the paid cohort, not every entry.
    function testCancellationDividesRecoveryAmongPaidEntriesOnly() public {
        _cancelledMixedNFTRound();
        Sorphera.Round memory r = lottery.getRound(1, n);
        assertEq(r.sold, 5);
        assertEq(r.paidEntries, 4);
        assertEq(r.rewardEntries, 1);
        (, uint256 terminal, uint256 cash, uint256 perTicket, uint256 divisor,) = lottery.groups(1, r.group);
        assertEq(terminal, n);
        assertEq(divisor, 4, "divisor must be paid entries, not sold");
        // Fees plus the unspent vault budget are the recovery pool so far; each paid ticket gets a quarter,
        // not a fifth. With the old `sold` divisor the share would have been 20% smaller and the reward
        // ticket would have held the difference.
        uint256 pool_ = lottery.totalLiabilities() - baseLiabilities;
        assertEq(perTicket, pool_ / 4);
        assertEq(cash, pool_ % 4);
        assertGt(perTicket, pool_ / 5);
        uint256 b = bob.balance;
        _claim(1, n, bob, 1, bob);
        assertEq(bob.balance - b, perTicket);
        uint256 a = alice.balance;
        _claim(1, n, alice, 4, alice);
        assertEq(alice.balance - a, perTicket);
        // The reward ticket (5) has no cancellation rights, and nobody else can claim it either.
        vm.prank(alice);
        vm.expectRevert("Sorphera: reward entry");
        lottery.claimETH(1, n, _one(5), alice);
        vm.prank(bob);
        vm.expectRevert("Sorphera: ticket owner");
        lottery.claimETH(1, n, _one(5), bob);
        _conserved();
    }

    function testRewardTicketHasNoTokenOrNFTRecoveryRights() public {
        SorpheraVault v = _cancelledMixedNFTRound();
        // Late NFT settles to the ETH bid in a cancelled round; tokens arrive from an epoch.
        pool.allocate(1, 0.01 ether);
        v.settle(1);
        rewards.grantEpoch(address(v), 1, 300e18);
        v.claimEpochRewards(_one(1));
        vm.prank(alice);
        vm.expectRevert("Sorphera: reward entry");
        v.claimTokens(5, alice, vm.getBlockTimestamp() + 1 hours);
        vm.prank(alice);
        vm.expectRevert("Sorphera: reward entry");
        v.claimNFTs(5, _one(0), alice);
        // Paid tickets split the tokens four ways.
        vm.prank(alice);
        v.claimTokens(4, alice, vm.getBlockTimestamp() + 1 hours);
        assertEq(v.tokenClaimed(4), 75e18);
        v.syncETH();
        (,, uint256 cash, uint256 perTicket, uint256 divisor,) = lottery.groups(1, lottery.groupOf(1, n));
        assertEq(divisor, 4);
        assertGe(perTicket, (4 * PRICE / 10 + 0.009 ether) / 4);
        assertEq(
            perTicket * 4 + cash,
            lottery.totalLiabilities() - baseLiabilities,
            "whole recovery is the paid cohort's"
        );
        _conserved();
    }

    function testCancelledRewardIsRestoredExactlyOnceWithoutStamps() public {
        _cancelledMixedNFTRound();
        assertEq(_available(alice), 0);
        (uint256 pendingPaid, uint256 pendingRestore, bool processable,) = passport.roundCredit(alice, 1, n);
        assertEq(pendingPaid, 0);
        assertEq(pendingRestore, 1);
        assertTrue(processable);
        vm.expectEmit(true, true, true, true);
        emit SorpheraPassport.RewardsRestored(alice, 1, n, 1);
        assertEq(passport.process(alice, _key(1, n)), 1);
        (uint256 paid, uint256 stamps,, uint256 restored, uint256 redeemed, uint256 available) =
            passport.summary(alice);
        assertEq(paid, 12, "cancelled paid ticket earned no stamp");
        assertEq(stamps, 0);
        assertEq(restored, 1);
        assertEq(redeemed, 1);
        assertEq(available, 1);
        assertEq(passport.process(alice, _key(1, n)), 0);
        assertEq(_available(alice), 1);
        // Bob had no reward entry: restoration is per wallet.
        passport.process(bob, _key(1, n));
        assertEq(_available(bob), 0);
        // The restored reward is spendable again in a later round.
        uint256 id = _nextETH();
        _enter(0, id, alice, _pick(0, id, 1), 1, 1, _noKeys());
        assertEq(_available(alice), 0);
    }

    function testLosingAndWinningRewardEntriesAreNotRestored() public {
        _earn(alice, 24);
        uint256 id = _nextETH();
        _enter(0, id, alice, _pick(0, id, 42), 2, 2, _noKeys());
        _draw(0, id, 42);
        assertEq(passport.process(alice, _key(0, id)), 1);
        (,,, uint256 restored,, uint256 available) = passport.summary(alice);
        assertEq(restored, 0);
        assertEq(available, 0);
        uint256 next = _nextETH();
        _rollETH(next);
        passport.process(alice, _key(0, next));
        assertEq(_available(alice), 0);
    }

    function testRewardOnlyCancelledRoundHasNoDivisionByZeroAndCarriesRecoveries() public {
        _earn(alice, 12);
        (uint256 id, SorpheraVault v) = _openNFT();
        _enter(1, id, alice, _pick(1, id, 1), 1, 1, _noKeys());
        vm.warp(lottery.getRound(1, id).settlementDeadline);
        lottery.requestDraw(1, id);
        assertEq(uint256(lottery.getRound(1, id).status), uint256(Sorphera.Status.Cancelled));
        uint256 group = lottery.groupOf(1, id);
        (, uint256 terminal, uint256 cash,, uint256 divisor,) = lottery.groups(1, group);
        assertEq(terminal, id);
        assertEq(divisor, 0);
        assertEq(cash, 0);
        assertEq(lottery.currentGroup(1), group + 1);
        uint256 liabilities = lottery.totalLiabilities();
        // A late arrival credited to the empty cohort moves forward to the game's current group.
        vm.deal(address(v), 1 ether);
        vm.prank(address(v));
        vm.expectEmit(true, true, true, true);
        emit Sorphera.DustCarried(1, group + 1, 1 ether);
        lottery.credit{value: 1 ether}(1, id);
        (,, cash,,,) = lottery.groups(1, group);
        assertEq(cash, 0);
        (,, uint256 nextCash,,,) = lottery.groups(1, group + 1);
        assertEq(nextCash, 1 ether);
        assertEq(lottery.totalLiabilities(), liabilities + 1 ether);
        _conserved();
        // The reward comes back once; the reward ticket cannot claim anything.
        passport.process(alice, _key(1, id));
        assertEq(_available(alice), 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: reward entry");
        lottery.claimETH(1, id, _one(1), alice);
        // The next NFT round of the game inherits the carried cash as its group's prize.
        _open(1);
        assertEq(lottery.groupOf(1, id + 1), group + 1);
    }

    function testRewardOnlyRoundStillDrawsAndRolls() public {
        _earn(alice, 12);
        uint256 id = _nextETH();
        _enter(0, id, alice, _pick(0, id, 1), 1, 1, _noKeys());
        _rollETH(id);
        assertEq(lottery.getRound(0, id).sold, 1);
        passport.process(alice, _key(0, id));
        assertEq(_available(alice), 0);
    }

    // ------------------------------------------------------------------------------------------
    // 6. bounds and inflation
    // ------------------------------------------------------------------------------------------

    function testProcessingGasDoesNotGrowWithHistory() public {
        uint256 first = _earn(alice, 1);
        uint256 g0 = gasleft();
        passport.process(alice, _key(0, first));
        g0 = g0 - gasleft();
        uint256 last;
        for (uint256 i; i < 6; ++i) {
            last = _nextETH();
            _buy(0, last, alice, _pick(0, last, 1), 3);
            _rollETH(last);
        }
        uint256 g1 = gasleft();
        passport.process(alice, _key(0, last));
        g1 = g1 - gasleft();
        // Both are a single bounded round lookup; cold/warm storage differences stay well under 2x.
        assertLt(g1, 200_000);
        assertLt(g0, 200_000);
    }

    function testRewardsCannotBeInflatedByRepeatedProcessingOrSelfCalls() public {
        uint256 id = _earn(alice, 12);
        for (uint256 i; i < 5; ++i) {
            passport.process(alice, _key(0, id));
        }
        assertEq(_available(alice), 1);
        uint256 next = _nextETH();
        _enter(0, next, alice, _pick(0, next, 1), 1, 1, _key(0, id));
        assertEq(_available(alice), 0);
        Sorphera.Pick[] memory picks = _repeat(_pick(0, next, 1), 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: insufficient rewards");
        passport.enter(0, next, picks, 1, _key(0, id));
    }
}

contract SimulatedLottery is Sorphera {
    constructor(address owner_, address factory_, address coordinator_)
        Sorphera(owner_, factory_, coordinator_)
    {}

    function _validateNetwork(RandomConfig memory) internal view override {
        require(block.chainid == 31337, "simulation chain only");
    }
}

contract ReenteringPlayer {
    SorpheraPassport internal immutable passport;
    uint8 internal game;
    uint256 internal round;
    Sorphera.Pick[] internal picks;

    constructor(SorpheraPassport p) {
        passport = p;
    }

    function buy(Sorphera lottery, uint8 g, uint256 id, Sorphera.Pick[] memory p) external payable {
        lottery.buy{value: msg.value}(g, id, p);
    }

    /// @dev Two redemptions in one transaction with one reward: the second must fail and undo the first.
    function reenter(uint8 g, uint256 id, Sorphera.Pick[] memory p) external {
        game = g;
        round = id;
        delete picks;
        picks.push(p[0]);
        passport.enter(game, round, picks, 1, new SorpheraPassport.RoundKey[](0));
        passport.enter(game, round, picks, 1, new SorpheraPassport.RoundKey[](0));
    }

    function once(uint8 g, uint256 id, Sorphera.Pick[] memory p) external {
        delete picks;
        picks.push(p[0]);
        passport.enter(g, id, picks, 1, new SorpheraPassport.RoundKey[](0));
    }
}
