// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {Balls} from "../src/lib/Balls.sol";
import {IFWA} from "../src/interfaces/External.sol";
import {
    MockNFT,
    MockToken,
    MockRewards,
    MockFWA,
    MockHelper,
    MockPermit2,
    MockVRF
} from "./mocks/ExternalMocks.sol";

contract Rejector {
    receive() external payable {
        revert("no ETH");
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert("no NFT");
    }
}

contract Reenter {
    Sorphera public immutable lottery;
    bool public reentrySucceeded;

    constructor(Sorphera l) {
        lottery = l;
    }

    receive() external payable {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        (reentrySucceeded,) =
            address(lottery).call(abi.encodeCall(lottery.claimETH, (uint8(0), 1, ids, address(this))));
    }
}

contract SorpheraTest is Test {
    Sorphera internal lottery;
    SorpheraRouter internal router;
    SorpheraVaultFactory internal factory;
    MockNFT internal nft;
    MockToken internal token;
    MockRewards internal rewards;
    MockFWA internal pool;
    MockHelper internal helper;
    MockVRF internal vrf;
    address internal alice = makeAddr("Sorphera Alice");
    address internal bob = makeAddr("Sorphera Bob");
    address internal company = makeAddr("Sorphera company");
    uint256 internal cutoff;

    function setUp() public {
        vm.chainId(11155111);
        vm.warp(10 days);
        vm.roll(100);
        MockPermit2 permit = new MockPermit2();
        vm.etch(0x000000000022D473030F116dDEE9F6B43aC78BA3, address(permit).code);
        nft = new MockNFT();
        token = new MockToken();
        rewards = new MockRewards(token);
        pool = new MockFWA(rewards, nft);
        rewards.setFWA(address(pool));
        helper = new MockHelper(address(token));
        token.setDistributor(address(helper));
        token.setDistributor(address(rewards));
        router = new SorpheraRouter(address(this));
        router.configure(address(pool), address(helper));
        factory = new SorpheraVaultFactory(address(router));
        vrf = new MockVRF();
        lottery = new Sorphera(address(this), address(factory), address(vrf));
        vrf.setConsumer(address(lottery));
        cutoff = vm.getBlockTimestamp() + 7 days;
        lottery.configureRules(0, _rules(cutoff));
        lottery.configureRules(1, _rules(cutoff + 1 hours));
        lottery.configureRandomness(Sorphera.RandomConfig(123, keccak256("mock key"), 3, 200000, true));
        lottery.validateLaunch();
        lottery.setSalesEnabled(true);
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(address(pool), 1000 ether);
    }

    function _rules(uint256 first) internal pure returns (Sorphera.Rules memory) {
        return Sorphera.Rules(0.005 ether, first, 1 hours, 2 days, 0.02 ether, 0.03 ether, 1 ether, 500);
    }

    function _open(uint8 game) internal returns (SorpheraVault) {
        if (game == 1 && vm.getBlockTimestamp() < cutoff + 1 hours - 7 days) {
            vm.warp(cutoff + 1 hours - 7 days);
        }
        uint256 id = lottery.openRound(game);
        return SorpheraVault(payable(lottery.getRound(game, id).vault));
    }

    function _pick(uint8 game, uint256 id, uint256 word) internal view returns (Sorphera.Pick memory p) {
        (p.main, p.bonus,) = Balls.draw(lottery.seedFor(game, id, word));
    }

    function _buy(uint8 game, uint256 id, address player, Sorphera.Pick memory p, uint256 count) internal {
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](count);
        for (uint256 i; i < count; ++i) {
            picks[i] = p;
        }
        vm.prank(player);
        lottery.buy{value: 0.005 ether * count}(game, id, picks);
    }

    function _draw(uint8 game, uint256 id, uint256 word) internal {
        Sorphera.Round memory r = lottery.getRound(game, id);
        vm.warp(r.earliestDraw);
        lottery.requestDraw(game, id);
        vrf.fulfill(lottery.getRound(game, id).requestId, word);
        lottery.finalize(game, id);
    }

    function _one(uint256 id) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = id;
    }

    function _claim(uint8 game, uint256 round, address player, uint256 ticket, address recipient) internal {
        vm.prank(player);
        lottery.claimETH(game, round, _one(ticket), recipient);
    }

    function _acquireNFT(SorpheraVault v, uint256 count) internal {
        uint256 start = pool.count();
        v.acquire(count, vm.getBlockTimestamp() + 10 minutes);
        for (uint256 i = 1; i <= count; ++i) {
            pool.allocate(start + i, 0.02 ether);
            v.settle(start + i);
        }
    }

    function _conserved() internal view {
        assertEq(address(lottery).balance, lottery.totalLiabilities());
    }

    function testStartsDisabledUnconfiguredAndOwnerSettings() public {
        Sorphera fresh = new Sorphera(address(this), address(factory), address(vrf));
        assertFalse(fresh.salesEnabled());
        vm.expectRevert("Sorphera: launch not validated");
        fresh.setSalesEnabled(true);
        vm.expectRevert("Sorphera: VRF not configured");
        fresh.validateLaunch();
        vm.prank(alice);
        vm.expectRevert("Sorphera: owner only");
        fresh.configureRules(0, _rules(cutoff));
        vrf.setFunding(0);
        vm.expectRevert("Sorphera: VRF unfunded");
        lottery.validateLaunch();
    }

    function testWeeklyGamesIndependentFreezeAndPauseClaims() public {
        SorpheraVault a = _open(0);
        SorpheraVault b = _open(1);
        _buy(0, 1, alice, _pick(0, 1, 41), 2);
        _buy(1, 1, bob, _pick(1, 1, 42), 3);
        assertEq(a.budget(), 0.009 ether);
        assertEq(b.budget(), 0.0135 ether);
        assertEq(lottery.getRound(1, 1).cutoff - lottery.getRound(0, 1).cutoff, 1 hours);
        Sorphera.Rules memory r = _rules(cutoff);
        r.price = 0.01 ether;
        lottery.configureRules(0, r);
        assertEq(lottery.getRound(0, 1).price, 0.005 ether);
        _draw(0, 1, 41);
        lottery.setSalesEnabled(false);
        uint256 beforeBalance = alice.balance;
        _claim(0, 1, alice, 1, alice);
        _claim(0, 1, alice, 2, alice);
        assertEq(alice.balance - beforeBalance, 0.009 ether);
        _conserved();
    }

    function testETHOneMatchFullPrizeAndOperatorReserve() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 11), 1);
        _buy(0, 1, bob, _pick(0, 1, 12), 4);
        uint256 request = pool.count() + 1;
        v.acquire(1, vm.getBlockTimestamp() + 1 minutes);
        pool.allocate(request, 0.04 ether);
        v.settle(request);
        _draw(0, 1, 11);
        assertEq(lottery.getRound(0, 1).matches, 1);
        uint256 prize = 0.0225 ether - 0.01 ether + 0.036 ether;
        uint256 beforeBalance = alice.balance;
        _claim(0, 1, alice, 1, alice);
        assertEq(alice.balance - beforeBalance, prize);
        vm.expectRevert("Sorphera: nothing to claim");
        _claim(0, 1, alice, 1, alice);
        vm.expectRevert("Sorphera: reserved funds");
        lottery.withdrawOperator(company, 0.003 ether);
        lottery.withdrawOperator(company, 0.0025 ether);
        assertEq(address(lottery).balance, 0);
        _conserved();
    }

    function testMultipleETHMatchesDuplicatesAndRounding() public {
        SorpheraVault v = _open(0);
        Sorphera.Pick memory p = _pick(0, 1, 18);
        _buy(0, 1, alice, p, 2);
        _buy(0, 1, bob, p, 1);
        vm.deal(address(v), address(v).balance + 2);
        _draw(0, 1, 18);
        assertEq(lottery.getRound(0, 1).matches, 3);
        _claim(0, 1, alice, 1, alice);
        _claim(0, 1, alice, 2, alice);
        _claim(0, 1, bob, 3, bob);
        (,, uint256 dust,,,) = lottery.groups(0, 2);
        assertEq(dust, 2);
        _conserved();
    }

    function testUnorderedNumbersIndexedNoTicketTransfer() public {
        _open(0);
        Sorphera.Pick memory p = Sorphera.Pick([uint8(20), 1, 5], 3);
        _buy(0, 1, alice, p, 1);
        p.main = [uint8(5), 20, 1];
        _buy(0, 1, bob, p, 1);
        uint32 key = lottery.combinationKey(p.main, p.bonus);
        assertEq(lottery.matchCount(0, 1, key), 2);
        assertEq(lottery.matchingTicket(0, 1, key, 1), 2);
        p.main = [uint8(1), 1, 5];
        vm.expectRevert("Sorphera: distinct balls");
        _buy(0, 1, alice, p, 1);
        p.main = [uint8(0), 1, 5];
        vm.expectRevert("Sorphera: ball");
        _buy(0, 1, alice, p, 1);
    }

    function testZeroTicketsSkipRandomnessAndSeparateGameDoesNotBlock() public {
        _open(0);
        _open(1);
        vm.warp(cutoff);
        lottery.requestDraw(0, 1);
        assertEq(uint256(lottery.getRound(0, 1).status), uint256(Sorphera.Status.Rolled));
        assertEq(vrf.requests(), 0);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Sales));
        lottery.openRound(0);
        assertEq(lottery.getRound(0, 2).cutoff, cutoff + 7 days);
    }

    function testETHRolloverOldTicketsExpireCarryNeverSpent() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 9), 10);
        _draw(0, 1, 10);
        assertEq(lottery.getRound(0, 1).matches, 0);
        SorpheraVault next = _open(0);
        assertEq(next.budget(), 0);
        vm.expectRevert("Sorphera: acquisition budget");
        next.acquire(1, vm.getBlockTimestamp() + 1 minutes);
        _buy(0, 2, bob, _pick(0, 2, 20), 1);
        _draw(0, 2, 20);
        vm.expectRevert("Sorphera: ticket owner");
        _claim(0, 1, alice, 1, alice);
        uint256 beforeBalance = bob.balance;
        _claim(0, 2, bob, 1, bob);
        assertEq(bob.balance - beforeBalance, 0.0495 ether);
        _conserved();
    }

    function testNFTOneWinnerAllAssetsAndFunds() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 21), 1);
        _buy(1, 1, bob, _pick(1, 1, 22), 9);
        _acquireNFT(v, 3);
        _draw(1, 1, 21);
        assertEq(lottery.getRound(1, 1).winningTicket, 1);
        assertEq(lottery.getRound(1, 1).frozenNFTs, 3);
        vm.prank(alice);
        v.claimNFTs(1, _one(0), alice);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), address(v));
        uint256 beforeBalance = alice.balance;
        _claim(1, 1, alice, 1, alice);
        assertEq(alice.balance - beforeBalance, 0.015 ether);
        vm.prank(bob);
        vm.expectRevert("Sorphera: not winning ticket");
        v.claimNFTs(2, _one(1), bob);
        _conserved();
    }

    function testNFTTieBreakIncludesEveryDuplicateAndIsDomainSeparated() public {
        SorpheraVault v = _open(1);
        Sorphera.Pick memory p = _pick(1, 1, 23);
        _buy(1, 1, alice, p, 3);
        _buy(1, 1, bob, p, 2);
        _acquireNFT(v, 2);
        _draw(1, 1, 23);
        Sorphera.Round memory r = lottery.getRound(1, 1);
        uint256 expected = Balls.uniform(
            lottery.seedFor(1, 1, 23), keccak256("Sorphera NFT matching ticket tie-break v1"), 5
        ) + 1;
        assertEq(r.matches, 5);
        assertEq(r.winningTicket, expected);
        address winner = expected <= 3 ? alice : bob;
        vm.prank(winner);
        v.claimNFTs(expected, _one(0), winner);
        assertEq(nft.ownerOf(1), winner);
    }

    function testNFTRolloverInventoryAndResidualCannotRespin() public {
        SorpheraVault old = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 31), 4);
        _acquireNFT(old, 1);
        _draw(1, 1, 32);
        SorpheraVault next = _open(1);
        assertEq(next.budget(), 0);
        _buy(1, 2, bob, _pick(1, 2, 33), 1);
        _draw(1, 2, 33);
        assertEq(lottery.getRound(1, 2).frozenNFTs, 1);
        vm.prank(bob);
        old.claimNFTs(1, _one(0), bob);
        assertEq(nft.ownerOf(1), bob);
        uint256 beforeBalance = bob.balance;
        _claim(1, 2, bob, 1, bob);
        assertEq(bob.balance - beforeBalance, 0.0125 ether);
        _conserved();
    }

    function testNFTCancellationFeesPartialRefundAndLateRecovery() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 1), 2);
        _buy(1, 1, bob, _pick(1, 1, 2), 2);
        v.acquire(1, vm.getBlockTimestamp() + 1 minutes);
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Cancelled));
        assertEq(vrf.requests(), 0);
        assertEq(lottery.operatorFees(), 0);
        uint256 beforeBalance = alice.balance;
        _claim(1, 1, alice, 1, alice);
        assertEq(alice.balance - beforeBalance, 0.0025 ether);
        pool.refund(1);
        v.reconcile(_one(1));
        v.recoverRefund();
        v.syncETH();
        beforeBalance = alice.balance;
        _claim(1, 1, alice, 1, alice);
        assertEq(alice.balance - beforeBalance, 0.00225 ether);
        _claim(1, 1, alice, 2, alice);
        _claim(1, 1, bob, 3, bob);
        _claim(1, 1, bob, 4, bob);
        assertEq(address(lottery).balance, 0);
        _conserved();
    }

    function testLateNFTDoesNotRescueCancelledRoundAndSharedRecovery() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 1), 1);
        _buy(1, 1, bob, _pick(1, 1, 2), 2);
        v.acquire(1, vm.getBlockTimestamp() + 1 minutes);
        vm.warp(lottery.getRound(1, 1).settlementDeadline + 1);
        pool.allocate(1, 0.01 ether);
        v.settle(1);
        lottery.requestDraw(1, 1);
        assertEq(vrf.requests(), 0);
        assertEq(uint256(lottery.getRound(1, 1).status), uint256(Sorphera.Status.Cancelled));
        vm.prank(alice);
        v.claimNFTs(1, _one(0), alice);
        assertEq(nft.ownerOf(1), address(v));
        vm.prank(bob);
        v.claimNFTs(2, _one(0), alice);
        vm.prank(bob);
        v.claimNFTs(3, _one(0), alice);
        assertEq(nft.ownerOf(1), alice);
    }

    function testNFTTransferFailuresAreIsolatedAndRetryable() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 5), 5);
        _acquireNFT(v, 2);
        _draw(1, 1, 5);
        uint256 ticket = lottery.getRound(1, 1).winningTicket;
        Rejector rejector = new Rejector();
        vm.prank(alice);
        v.claimNFTs(ticket, _one(0), address(rejector));
        assertEq(nft.ownerOf(1), address(v));
        uint256[] memory indices = new uint256[](2);
        indices[1] = 1;
        nft.setRejected(1, true);
        vm.prank(alice);
        v.claimNFTs(ticket, indices, alice);
        assertEq(nft.ownerOf(2), alice);
        assertEq(nft.ownerOf(1), address(v));
        nft.setRejected(1, false);
        vm.prank(alice);
        v.claimNFTs(ticket, _one(0), bob);
        assertEq(nft.ownerOf(1), bob);
        vm.prank(alice);
        vm.expectRevert("Sorphera: NFT claimed");
        v.claimNFTs(ticket, _one(0), alice);
    }

    function testBlackoutSlippageBudgetDeadlineAndFailedAcquireRollback() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 1), 4);
        pool.setBlackout(true);
        vm.expectRevert("Sorphera: FWA blackout");
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.setBlackout(false);
        pool.setQuote(0.025 ether, 0);
        vm.expectRevert("Sorphera: quote bounds");
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.setQuote(0.009 ether, 0.001 ether);
        vm.expectRevert("Sorphera: acquisition batch");
        v.acquire(9, vm.getBlockTimestamp() + 1);
        vm.expectRevert("Sorphera: acquisition budget");
        v.acquire(2, vm.getBlockTimestamp() + 1);
        vm.expectRevert("Sorphera: acquisition batch");
        v.acquire(1, vm.getBlockTimestamp() - 1);
        assertEq(v.budget(), 0.018 ether);
        assertEq(v.pending(), 0);
    }

    function testExpiredAcquisitionBlocksDrawUntilReconciled() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 6), 4);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        vm.warp(cutoff + 1 hours);
        vm.expectRevert("Sorphera: reconciliation/time");
        lottery.requestDraw(0, 1);
        vm.roll(vm.getBlockNumber() + 31);
        v.process(50);
        v.reconcile(_one(1));
        v.recoverRefund();
        _draw(0, 1, 6);
        assertEq(v.pending(), 0);
        assertEq(v.exportedETH(), 0.017 ether);
        vm.expectRevert();
        v.recoverRefund();
        _conserved();
    }

    function testStuckNFTCustodyRequiredAndRecoveryAfterWindow() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 7), 4);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        nft.setRejected(1, true);
        vm.expectRevert("mock NFT rejected");
        v.settle(1);
        vm.warp(vm.getBlockTimestamp() + 3 hours);
        pool.finalizeUnsettled(1);
        v.reconcile(_one(1));
        assertEq(v.pending(), 1);
        assertEq(v.securedCount(), 0);
        nft.setRejected(1, false);
        v.recoverNFT(1);
        assertEq(v.pending(), 0);
        assertEq(nft.ownerOf(1), address(v));
        _draw(1, 1, 7);
        assertEq(lottery.getRound(1, 1).frozenNFTs, 1);
    }

    function testDelayedCashoutNFTGameRemainsIncidentalETHAndCancels() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 7), 3);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        vm.warp(vm.getBlockTimestamp() + 1 hours);
        pool.forcedCashout(1);
        v.reconcile(_one(1));
        assertEq(v.securedCount(), 0);
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        assertEq(vrf.requests(), 0);
        assertEq(lottery.operatorFees(), 0);
        _conserved();
    }

    function testFixedETHSettlementEvenAfterExclusiveWindow() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 1), 3);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        vm.warp(vm.getBlockTimestamp() + 90 minutes);
        v.settle(1);
        assertEq(v.securedCount(), 0);
        assertEq(v.pending(), 0);
        assertEq(nft.ownerOf(1), address(pool));
    }

    function testCallbackAuthenticationBindingDuplicateNoRerollOrCancellation() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 8), 1);
        vm.warp(cutoff);
        vm.expectRevert("Sorphera: reconciliation/time");
        lottery.requestDraw(0, 1);
        vm.warp(cutoff + 1 hours);
        lottery.requestDraw(0, 1);
        vm.expectRevert("Sorphera: coordinator only");
        lottery.rawFulfillRandomWords(1, _one(8));
        vm.expectRevert("Sorphera: draw state");
        lottery.requestDraw(0, 1);
        vm.warp(vm.getBlockTimestamp() + 100 days);
        vm.expectRevert("Sorphera: draw state");
        lottery.requestDraw(0, 1);
        vrf.fulfill(1, 8);
        vm.expectRevert("Sorphera: stale callback");
        vrf.fulfill(1, 9);
        lottery.finalize(0, 1);
        vm.expectRevert("Sorphera: randomness not ready");
        lottery.finalize(0, 1);
    }

    function testNoLateEntryAndBoundedTickets() public {
        _open(0);
        Sorphera.Pick memory p = _pick(0, 1, 1);
        vm.expectRevert("Sorphera: tickets/payment");
        _buy(0, 1, alice, p, 101);
        vm.warp(cutoff);
        vm.expectRevert("Sorphera: sales closed");
        _buy(0, 1, alice, p, 1);
    }

    function testRejectedETHAndReentrancyRetainLiabilities() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 15), 1);
        _draw(0, 1, 15);
        Rejector rejector = new Rejector();
        vm.expectRevert("Sorphera: ETH rejected");
        _claim(0, 1, alice, 1, address(rejector));
        assertEq(lottery.claimedETH(0, 1, 1), 0);
        Reenter reenter = new Reenter(lottery);
        _claim(0, 1, alice, 1, address(reenter));
        assertFalse(reenter.reentrySucceeded());
        _conserved();
    }

    function testBuilderAttributionOverpaymentAndPurchaserRewardsSeparated() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 28), 3);
        pool.setRefund(0.001 ether);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        assertEq(pool.builder(1), address(router));
        assertEq(pool.acquisitions(1).purchaser, address(v));
        pool.allocate(1, 0.02 ether);
        v.settle(1);
        assertGt(rewards.tokenBuyAllowance(address(router)), 0);
        assertEq(rewards.tokenBuyAllowance(address(v)), 0);
        router.claimBuilderRewards(address(pool), company, 1, vm.getBlockTimestamp() + 1);
        assertGt(helper.pending(company), 0);
        rewards.grantEpoch(address(v), 7, 300);
        v.claimEpochRewards(_one(7));
        _draw(0, 1, 28);
        vm.prank(alice);
        v.claimTokens(1, alice, vm.getBlockTimestamp() + 1);
        assertEq(helper.pending(alice), 100);
        vm.roll(vm.getBlockNumber() + 1);
        helper.claim(alice);
        assertEq(token.balanceOf(alice), 100);
        vm.prank(alice);
        vm.expectRevert("FWA: InvalidTransfer");
        token.transfer(bob, 1);
        assertEq(router.isValidSignature(bytes32(0), ""), bytes4(0xffffffff));
        _conserved();
    }

    function testLateETHRecoveryGoesToOriginalWinnerNotNextRound() public {
        SorpheraVault old = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 44), 1);
        _draw(0, 1, 44);
        _claim(0, 1, alice, 1, alice);
        _open(0);
        _buy(0, 2, bob, _pick(0, 2, 45), 1);
        vm.deal(address(old), 0.1 ether);
        old.syncETH();
        uint256 beforeBalance = alice.balance;
        _claim(0, 1, alice, 1, alice);
        assertEq(alice.balance - beforeBalance, 0.1 ether);
        (,, uint256 nextCash,,,) = lottery.groups(0, 2);
        assertEq(nextCash, 0);
        _conserved();
    }

    function testLargeSalesConstantFinalizationAndPartialLargeInventory() public {
        SorpheraVault v = _open(1);
        Sorphera.Pick memory p = _pick(1, 1, 55);
        for (uint256 i; i < 20; ++i) {
            _buy(1, 1, alice, p, 100);
        }
        for (uint256 i; i < 13; ++i) {
            _acquireNFT(v, 8);
        }
        vm.warp(lottery.getRound(1, 1).earliestDraw);
        lottery.requestDraw(1, 1);
        vrf.fulfill(1, 55);
        uint256 gasBefore = gasleft();
        lottery.finalize(1, 1);
        uint256 used = gasBefore - gasleft();
        assertLt(used, 350000);
        Sorphera.Round memory r = lottery.getRound(1, 1);
        assertEq(r.matches, 2000);
        assertEq(r.frozenNFTs, 104);
        vm.prank(alice);
        v.claimNFTs(r.winningTicket, _one(103), alice);
        assertEq(nft.ownerOf(104), alice);
        assertEq(nft.ownerOf(1), address(v));
    }

    function testFuzzSamplingRangeDistinctAndReplay(uint256 word) public view {
        (uint8[3] memory ordered, uint8 bonus, uint32 key) = Balls.draw(lottery.seedFor(0, 1, word));
        for (uint256 i; i < 3; ++i) {
            assertGe(ordered[i], 1);
            assertLe(ordered[i], 20);
        }
        assertTrue(ordered[0] != ordered[1] && ordered[0] != ordered[2] && ordered[1] != ordered[2]);
        assertGe(bonus, 1);
        assertLe(bonus, 5);
        assertEq(key, lottery.combinationKey(ordered, bonus));
    }

    function testFuzzConservationUnusedBudget(uint8 countRaw, uint64 donation) public {
        uint256 count = bound(countRaw, 1, 100);
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 71), count);
        vm.deal(address(v), address(v).balance + donation);
        _draw(0, 1, 71);
        uint256[] memory ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = i + 1;
        }
        vm.prank(alice);
        lottery.claimETH(0, 1, ids, alice);
        lottery.withdrawOperator(company, count * 0.0005 ether);
        (,, uint256 dust,,,) = lottery.groups(0, 2);
        assertEq(address(lottery).balance, dust);
        assertEq(dust, uint256(donation) % count);
        _conserved();
    }

    function testUnwithdrawnFWARefundPreventsDraw() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 87), 3);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.refund(1);
        v.reconcile(_one(1));
        vm.warp(cutoff + 1 hours);
        vm.expectRevert("Sorphera: reconciliation/time");
        lottery.requestDraw(0, 1);
        v.recoverRefund();
        lottery.requestDraw(0, 1);
        assertEq(vrf.requests(), 1);
    }

    function testCallbacksOutOfOrderAreBoundToSeparateGamesAndZeroWordValid() public {
        _open(0);
        SorpheraVault v = _open(1);
        _buy(0, 1, alice, _pick(0, 1, 0), 1);
        _buy(1, 1, bob, _pick(1, 1, 93), 3);
        _acquireNFT(v, 1);
        vm.warp(cutoff + 2 hours);
        lottery.requestDraw(0, 1);
        lottery.requestDraw(1, 1);
        vrf.fulfill(2, 93);
        assertEq(uint256(lottery.getRound(0, 1).status), uint256(Sorphera.Status.Requested));
        lottery.finalize(1, 1);
        vrf.fulfill(1, 0);
        lottery.finalize(0, 1);
        assertEq(lottery.getRound(0, 1).matches, 1);
        assertEq(lottery.getRound(1, 1).matches, 3);
        assertEq(lottery.getRound(0, 1).randomWord, 0);
    }

    function testETHForcedNFTCustodyIsReservedForWinners() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 90), 3);
        v.acquire(1, vm.getBlockTimestamp() + 1);
        pool.allocate(1, 0.02 ether);
        vm.warp(vm.getBlockTimestamp() + 3 hours);
        pool.finalizeUnsettled(1);
        v.reconcile(_one(1));
        assertEq(v.securedCount(), 1);
        _draw(0, 1, 90);
        vm.prank(alice);
        v.claimNFTs(1, _one(0), alice);
        vm.prank(alice);
        v.claimNFTs(2, _one(0), alice);
        assertEq(nft.ownerOf(1), address(v));
        vm.prank(alice);
        v.claimNFTs(3, _one(0), alice);
        assertEq(nft.ownerOf(1), alice);
    }

    function testNFTFeeReserveCannotBeWithdrawnUntilSuccess() public {
        SorpheraVault v = _open(1);
        _buy(1, 1, alice, _pick(1, 1, 92), 3);
        _acquireNFT(v, 1);
        vm.expectRevert("Sorphera: reserved funds");
        lottery.withdrawOperator(company, 1);
        vm.warp(lottery.getRound(1, 1).earliestDraw);
        lottery.requestDraw(1, 1);
        vm.expectRevert("Sorphera: reserved funds");
        lottery.withdrawOperator(company, 1);
        vrf.fulfill(1, 92);
        lottery.finalize(1, 1);
        lottery.withdrawOperator(company, 0.0015 ether);
        _conserved();
    }

    function testRewardHelperFailureRollsBackAllowanceAndClaims() public {
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 28), 3);
        _acquireNFT(v, 1);
        uint256 allowance = rewards.tokenBuyAllowance(address(router));
        helper.setEnabled(false);
        vm.expectRevert();
        router.claimBuilderRewards(address(pool), company, 1, vm.getBlockTimestamp() + 1);
        assertEq(rewards.tokenBuyAllowance(address(router)), allowance);
        helper.setEnabled(true);
        router.claimBuilderRewards(address(pool), company, 1, vm.getBlockTimestamp() + 1);
        vm.expectRevert("Sorphera: no builder allowance");
        router.claimBuilderRewards(address(pool), company, 1, vm.getBlockTimestamp() + 1);
    }

    function testUnclaimedWinningsStayReservedAcrossNewRoundAndWithdrawals() public {
        _open(0);
        _buy(0, 1, alice, _pick(0, 1, 27), 2);
        _draw(0, 1, 27);
        _claim(0, 1, alice, 1, alice);
        _open(0);
        _buy(0, 2, bob, _pick(0, 2, 26), 3);
        _draw(0, 2, 26);
        lottery.withdrawOperator(company, 0.0025 ether);
        vm.expectRevert("Sorphera: reserved funds");
        lottery.withdrawOperator(company, 1);
        _claim(0, 1, alice, 2, alice);
        _claim(0, 2, bob, 1, bob);
        _claim(0, 2, bob, 2, bob);
        _claim(0, 2, bob, 3, bob);
        assertEq(address(lottery).balance, 0);
        _conserved();
    }

    function testApplicationSizeAndNoEscapeOpcodes() public view {
        _runtime(address(lottery));
        _runtime(address(router));
        _runtime(address(factory));
    }

    function _runtime(address app) internal view {
        bytes memory code = app.code;
        assertLe(code.length, 24576);
        for (uint256 i; i < code.length; ++i) {
            uint8 op = uint8(code[i]);
            if (op >= 0x60 && op <= 0x7f) {
                i += op - 0x5f;
                continue;
            }
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff);
        }
    }

    function testFuzzConservationAfterFWAChargesCashoutAndLateFunds(uint8 winnersRaw, uint64 recovery)
        public
    {
        uint256 winners = bound(winnersRaw, 3, 50);
        SorpheraVault v = _open(0);
        _buy(0, 1, alice, _pick(0, 1, 96), winners);
        _acquireNFT(v, 1);
        _draw(0, 1, 96);
        uint256 prize = winners * 0.0045 ether - 0.01 ether + 0.018 ether;
        uint256 paid;
        uint256[] memory ids = new uint256[](winners);
        for (uint256 i; i < winners; ++i) {
            ids[i] = i + 1;
        }
        uint256 beforeBalance = alice.balance;
        vm.prank(alice);
        lottery.claimETH(0, 1, ids, alice);
        paid = alice.balance - beforeBalance;
        assertEq(paid, (prize / winners) * winners);
        vm.deal(address(v), recovery);
        v.syncETH();
        if (recovery >= winners) {
            beforeBalance = alice.balance;
            vm.prank(alice);
            lottery.claimETH(0, 1, ids, alice);
            paid += alice.balance - beforeBalance;
        }
        lottery.withdrawOperator(company, winners * 0.0005 ether);
        (,, uint256 dust,,,) = lottery.groups(0, 2);
        assertEq(paid + dust, prize + recovery);
        _conserved();
    }
}
