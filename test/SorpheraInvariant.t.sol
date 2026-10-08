// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SorpheraFixture} from "./helpers/SorpheraFixture.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {Balls} from "../src/lib/Balls.sol";
import {IFWA} from "../src/interfaces/External.sol";
import {MockFWA, MockNFT, MockVRF, MockToken, MockRewards, MockHelper} from "./mocks/ExternalMocks.sol";

/// @notice Offline FWA/VRF models; ghost flows measure ETH crossing the Sorphera boundary.
contract SorpheraHandler is Test {
    Sorphera public immutable lottery;
    MockFWA public immutable pool;
    MockVRF public immutable vrf;
    address public immutable administrator;
    address[3] public actors;
    uint256 public epochNonce;
    uint256 public mintedRewards;
    uint256 public builderQueued;
    mapping(address => uint256) public purchaserMinted;
    uint256 public sales;
    uint256 public donations;
    uint256 public acquisitionPayments;
    uint256 public recoveries;
    uint256 public playerPayments;
    uint256 public operatorPayments;
    uint256 public successfulBuys;
    uint256 public successfulAcquisitions;
    uint256 public successfulClaims;
    mapping(uint8 => uint256) public gameSales;
    mapping(uint8 => uint256) public gamePayments;
    mapping(uint8 => uint256) public gameRecoveries;
    mapping(uint8 => uint256) public gameSpent;
    mapping(uint8 => uint256) public gameDonations;
    mapping(uint8 => uint256) public gameWithdrawals;
    mapping(uint8 => mapping(uint256 => uint256)) public terminalStatus;
    mapping(uint8 => mapping(uint256 => uint256)) public recordedWord;
    uint256[] public stuck;
    uint256 public forcedDeliveries;
    uint256 public stuckRecoveries;

    constructor(Sorphera l, MockFWA p, MockVRF v, address admin, address a, address b, address c) {
        lottery = l;
        pool = p;
        vrf = v;
        administrator = admin;
        actors = [a, b, c];
    }

    function _one(uint256 id) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = id;
    }

    function _vault(uint8 game, uint256 id) internal view returns (SorpheraVault) {
        return SorpheraVault(payable(lottery.getRound(game, id).vault));
    }

    function buy(uint256 g, uint256 who, uint256 size, bool matchingPick) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = lottery.latestRound(game);
        Sorphera.Round memory r = lottery.getRound(game, id);
        if (!lottery.salesEnabled() || r.status != Sorphera.Status.Sales || block.timestamp >= r.cutoff) {
            return;
        }
        uint256 n = bound(size, 1, 12);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](n);
        (uint8[3] memory main, uint8 bonus,) = Balls.draw(lottery.seedFor(game, id, 42));
        if (!matchingPick) bonus = bonus == 5 ? 1 : bonus + 1;
        for (uint256 i; i < n; ++i) {
            picks[i] = Sorphera.Pick(main, bonus);
        }
        uint256 payment = n * r.price;
        vm.prank(actors[bound(who, 0, 2)]);
        lottery.buy{value: payment}(game, id, picks);
        sales += payment;
        gameSales[game] += payment;
        ++successfulBuys;
    }

    function acquire(uint256 g, uint256 size, bool blackout) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = lottery.latestRound(game);
        Sorphera.Round memory r = lottery.getRound(game, id);
        if (r.status != Sorphera.Status.Sales || block.timestamp >= r.cutoff) return;
        SorpheraVault v = _vault(game, id);
        uint256 maxCount = v.budget() / 0.01 ether;
        if (maxCount == 0) return;
        uint256 n = bound(size, 1, maxCount > 8 ? 8 : maxCount);
        pool.setBlackout(blackout);
        if (blackout) {
            uint256 beforeBudget = v.budget();
            vm.expectRevert("Sorphera: FWA blackout");
            v.acquire(n, block.timestamp);
            assertEq(v.budget(), beforeBudget);
        } else {
            v.acquire(n, block.timestamp);
            acquisitionPayments += n * 0.01 ether;
            gameSpent[game] += n * 0.01 ether;
            ++successfulAcquisitions;
        }
        pool.setBlackout(false);
    }

    function resolve(uint256 raw, bool refund, uint256 value) external {
        if (pool.count() == 0) return;
        uint256 id = bound(raw, 1, pool.count());
        IFWA.Acquisition memory a = pool.acquisitions(id);
        SorpheraVault v = SorpheraVault(payable(a.purchaser));
        uint8 game = v.game();
        if (a.status == 1) {
            if (refund) pool.refund(id);
            else pool.allocate(id, bound(value, 1, 0.1 ether));
        }
        a = pool.acquisitions(id);
        uint256 beforeBalance = address(v).balance;
        if (a.status == 2 && pool.listings(a.listingId).status == 2) v.settle(id);
        else v.reconcile(_one(id));
        uint256 returned = address(v).balance - beforeBalance;
        recoveries += returned;
        gameRecoveries[game] += returned;
        if (v.refundCredit() != 0) {
            uint256 credit = v.refundCredit();
            v.recoverRefund();
            recoveries += credit;
            gameRecoveries[game] += credit;
        }
    }

    /// @notice FWA resolves an allocation the vault never settled: forced cashout, forced NFT delivery, or a
    ///         delivery the collection rejects, which FWA parks as stuck. The vault must stay consistent.
    function forceSettlement(uint256 raw, uint256 mode) external {
        if (pool.count() == 0) return;
        uint256 id = bound(raw, 1, pool.count());
        IFWA.Acquisition memory a = pool.acquisitions(id);
        if (a.status != 2) return;
        IFWA.Listing memory l = pool.listings(a.listingId);
        if (l.status != 2) return;
        SorpheraVault v = SorpheraVault(payable(a.purchaser));
        uint8 game = v.game();
        uint256 ready = uint256(l.allocatedAt) + pool.finalizeWindow();
        if (vm.getBlockTimestamp() < ready) vm.warp(ready);
        uint256 choice = bound(mode, 0, 2);
        uint256 beforeBalance = address(v).balance;
        if (choice == 0) {
            pool.forcedCashout(a.listingId);
        } else {
            pool.nft().setRejected(l.tokenId, choice == 2);
            pool.finalizeUnsettled(a.listingId);
            if (choice == 2) stuck.push(id);
        }
        v.reconcile(_one(id));
        assertEq(v.requestState(id), 2, "Sorphera: forced resolution must be terminal");
        uint256 returned = address(v).balance - beforeBalance;
        recoveries += returned;
        gameRecoveries[game] += returned;
        ++forcedDeliveries;
    }

    function recoverStuck(uint256 raw) external {
        if (stuck.length == 0) return;
        uint256 i = bound(raw, 0, stuck.length - 1);
        uint256 id = stuck[i];
        IFWA.Acquisition memory a = pool.acquisitions(id);
        SorpheraVault v = SorpheraVault(payable(a.purchaser));
        uint256 tokenId = pool.listings(a.listingId).tokenId;
        uint256 securedBefore = v.securedCount();
        pool.nft().setRejected(tokenId, false);
        v.recoverNFT(id);
        assertEq(pool.nft().ownerOf(tokenId), address(v));
        assertEq(v.securedCount(), securedBefore + 1);
        stuck[i] = stuck[stuck.length - 1];
        stuck.pop();
        ++stuckRecoveries;
    }

    function stuckCount() external view returns (uint256) {
        return stuck.length;
    }

    function syncOrDonate(uint256 g, uint256 rawRound, uint256 amount, bool donate) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = bound(rawRound, 1, lottery.latestRound(game));
        SorpheraVault v = _vault(game, id);
        if (donate) {
            amount = bound(amount, 1, 0.02 ether);
            vm.deal(address(this), amount);
            (bool ok,) = address(v).call{value: amount}("");
            require(ok);
            donations += amount;
            gameDonations[game] += amount;
        }
        v.syncETH();
    }

    function advance(uint256 g, bool missSettlementWindow) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = lottery.latestRound(game);
        Sorphera.Round memory r = lottery.getRound(game, id);
        if (r.status == Sorphera.Status.Sales || r.status == Sorphera.Status.Closed) {
            uint256 time = missSettlementWindow ? r.settlementDeadline : r.earliestDraw;
            if (vm.getBlockTimestamp() < time) vm.warp(time);
            SorpheraVault v = _vault(game, id);
            if (game == 1 && r.eligibleNFTs == 0 && vm.getBlockTimestamp() >= r.settlementDeadline) {
                lottery.requestDraw(game, id);
            } else if (v.pending() == 0 && v.refundCredit() == 0 && (game == 0 || r.eligibleNFTs > 0)) {
                lottery.requestDraw(game, id);
            } else if (r.status == Sorphera.Status.Sales) {
                lottery.close(game, id);
            }
        } else if (r.status == Sorphera.Status.Requested) {
            vrf.fulfill(r.requestId, 42);
            recordedWord[game][id] = 42;
        } else if (r.status == Sorphera.Status.RandomReady) {
            lottery.finalize(game, id);
        } else if (r.status == Sorphera.Status.TieBreakNeeded) {
            lottery.requestTieBreak(game, id);
        } else if (r.status == Sorphera.Status.TieBreakRequested) {
            vrf.fulfill(r.tieBreakRequestId, 777);
        } else if (r.status == Sorphera.Status.TieBreakReady) {
            lottery.finalizeTieBreak(game, id);
        } else if (lottery.isTerminal(r.status) && id < 4) {
            terminalStatus[game][id] = uint256(r.status);
            uint256 nextStart = r.cutoff;
            if (vm.getBlockTimestamp() < nextStart) vm.warp(nextStart);
            lottery.openRound(game);
        }
        r = lottery.getRound(game, id);
        if (lottery.isTerminal(r.status)) terminalStatus[game][id] = uint256(r.status);
    }

    function claim(uint256 g, uint256 rawRound, uint256 rawTicket, bool wrongCaller) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = bound(rawRound, 1, lottery.latestRound(game));
        uint256 group = lottery.groupOf(game, id);
        (, uint256 terminal,, uint256 share,,) = lottery.groups(game, group);
        if (terminal == 0) return;
        Sorphera.Round memory r = lottery.getRound(game, terminal);
        uint256 ticket = bound(rawTicket, 1, r.sold);
        (address player, uint32 combination) = lottery.tickets(game, terminal, ticket);
        uint256 already = lottery.claimedETH(game, group, ticket);
        bool winning = r.status == Sorphera.Status.Cancelled
            || (combination == r.winningKey && (game == 0 || ticket == r.winningTicket));
        address caller = wrongCaller ? address(this) : player;
        vm.prank(caller);
        if (!winning || wrongCaller || already == share) {
            vm.expectRevert();
            lottery.claimETH(game, id, _one(ticket), player);
            assertEq(lottery.claimedETH(game, group, ticket), already);
        } else {
            uint256 beforeBalance = player.balance;
            lottery.claimETH(game, id, _one(ticket), player);
            uint256 paid = player.balance - beforeBalance;
            assertEq(paid, share - already);
            playerPayments += paid;
            gamePayments[game] += paid;
            ++successfulClaims;
        }
    }

    function claimNFT(uint256 g, uint256 rawRound, uint256 rawIndex, bool reject) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = bound(rawRound, 1, lottery.latestRound(game));
        SorpheraVault v = _vault(game, id);
        if (v.assetCount() == 0) return;
        (, uint256 terminal,,,,) = lottery.groups(game, lottery.groupOf(game, id));
        if (terminal == 0) return;
        Sorphera.Round memory r = lottery.getRound(game, terminal);
        if (game != 1 || r.status != Sorphera.Status.Won) return;
        uint256 index = bound(rawIndex, 0, v.assetCount() - 1);
        (, uint256 tokenId,,, bool claimed) = v.assets(index);
        if (claimed) return;
        (address player,) = lottery.tickets(game, terminal, r.winningTicket);
        pool.nft().setRejected(tokenId, reject);
        vm.prank(player);
        v.claimNFTs(r.winningTicket, _one(index), player);
        assertEq(pool.nft().ownerOf(tokenId), reject ? address(v) : player);
        pool.nft().setRejected(tokenId, false);
    }

    function withdraw(uint256 raw, bool unauthorized) external {
        uint256 available = lottery.operatorFees();
        if (available == 0) return;
        uint256 amount = bound(raw, 1, available);
        vm.prank(unauthorized ? actors[0] : administrator);
        if (unauthorized) {
            vm.expectRevert("Sorphera: owner only");
            lottery.withdrawOperator(actors[2], amount);
        } else {
            lottery.withdrawOperator(actors[2], amount);
            operatorPayments += amount;
            // Allocate the withdrawal against released fees, independently by game.
            uint256 remaining = amount;
            for (uint8 game; game < 2; ++game) {
                uint256 released;
                for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                    released += lottery.releasedFees(game, id);
                }
                uint256 unspent = released - gameWithdrawals[game];
                uint256 take = remaining < unspent ? remaining : unspent;
                gameWithdrawals[game] += take;
                remaining -= take;
            }
            assertEq(remaining, 0);
        }
    }

    function rewardEpoch(uint256 g, uint256 rawRound, uint256 rawAmount) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = bound(rawRound, 1, lottery.latestRound(game));
        SorpheraVault v = _vault(game, id);
        uint256 amount = bound(rawAmount, 1, 1e20);
        uint256 epoch = ++epochNonce;
        MockRewards(pool.rewards()).grantEpoch(address(v), epoch, amount);
        v.claimEpochRewards(_one(epoch));
        purchaserMinted[address(v)] += amount;
        mintedRewards += amount;
    }

    function queueTokens(uint256 g, uint256 rawRound, uint256 rawTicket, uint256 who) external {
        uint8 game = uint8(bound(g, 0, 1));
        uint256 id = bound(rawRound, 1, lottery.latestRound(game));
        SorpheraVault v = _vault(game, id);
        (, uint256 terminal,,, uint256 divisor,) = lottery.groups(game, lottery.groupOf(game, id));
        if (terminal == 0) return;
        Sorphera.Round memory r = lottery.getRound(game, terminal);
        uint256 ticket = bound(rawTicket, 1, r.sold);
        (address player, uint32 key) = lottery.tickets(game, terminal, ticket);
        if (
            r.status == Sorphera.Status.Won
                && (key != r.winningKey || (game == 1 && ticket != r.winningTicket))
        ) return;
        uint256 entitlement = purchaserMinted[address(v)] / divisor;
        if (entitlement == v.tokenClaimed(ticket)) return;
        vm.prank(player);
        v.claimTokens(ticket, actors[bound(who, 0, 2)], block.timestamp);
    }

    function builderReward(bool helperFailure) external {
        MockRewards rewards = MockRewards(pool.rewards());
        uint256 allowance = rewards.tokenBuyAllowance(address(lottery.factory().router()));
        if (allowance == 0) return;
        MockHelper helper = MockHelper(lottery.factory().router().helper());
        helper.setEnabled(!helperFailure);
        SorpheraRouter router = lottery.factory().router();
        vm.prank(administrator);
        if (helperFailure) {
            vm.expectRevert();
            router.claimBuilderRewards(address(pool), actors[2], 1, block.timestamp);
            assertEq(rewards.tokenBuyAllowance(address(lottery.factory().router())), allowance);
        } else {
            router.claimBuilderRewards(address(pool), actors[2], 1, block.timestamp);
            // Mock exchange rate only; no assertion of real FWA emissions or market output.
            builderQueued += allowance * 100;
            mintedRewards += allowance * 100;
        }
        helper.setEnabled(true);
    }

    function receiveTokens(uint256 who) external {
        address recipient = actors[bound(who, 0, 2)];
        MockHelper helper = MockHelper(lottery.factory().router().helper());
        if (helper.pending(recipient) == 0) return;
        vm.roll(block.number + 1);
        helper.claim(recipient);
    }

    function pause(bool paused) external {
        vm.prank(administrator);
        lottery.setSalesEnabled(!paused);
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 64
/// forge-config: default.invariant.fail-on-revert = true
contract SorpheraInvariantTest is SorpheraFixture {
    SorpheraHandler internal handler;

    function setUp() public override {
        super.setUp();
        _open(0);
        _open(1);
        address carol = makeAddr("Sorphera Carol");
        vm.deal(carol, 1000 ether);
        handler = new SorpheraHandler(lottery, pool, vrf, address(this), alice, bob, carol);
        bytes4[] memory selectors = new bytes4[](16);
        selectors[0] = handler.buy.selector;
        selectors[1] = handler.acquire.selector;
        selectors[2] = handler.resolve.selector;
        selectors[3] = handler.syncOrDonate.selector;
        selectors[4] = handler.advance.selector;
        selectors[5] = handler.claim.selector;
        selectors[6] = handler.claimNFT.selector;
        selectors[7] = handler.withdraw.selector;
        selectors[8] = handler.pause.selector;
        selectors[9] = handler.buy.selector;
        selectors[10] = handler.rewardEpoch.selector;
        selectors[11] = handler.queueTokens.selector;
        selectors[12] = handler.builderReward.selector;
        selectors[13] = handler.receiveTokens.selector;
        selectors[14] = handler.forceSettlement.selector;
        selectors[15] = handler.recoverStuck.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
        // Pin non-vacuous activity before each random sequence, including a secured NFT and a stuck one.
        handler.buy(0, 0, 8, true);
        handler.buy(1, 1, 4, true);
        handler.acquire(0, 1, false);
        handler.acquire(1, 1, false);
        handler.acquire(0, 1, false);
        handler.resolve(1, false, 0.02 ether);
        handler.resolve(2, false, 0.02 ether);
        pool.allocate(3, 0.02 ether);
        handler.forceSettlement(3, 2);
        handler.rewardEpoch(0, 1, 103);
        handler.rewardEpoch(1, 1, 101);
        handler.builderReward(false);
        assertEq(handler.stuckCount(), 1);
    }

    /// @notice Fixed outcomes: cancellation never requests randomness or releases fees, every drawn round
    ///         with sales holds one request, held fees release exactly once, and winners are indexed tickets.
    function invariant_roundOutcomesFollowFixedRules() public view {
        for (uint8 game; game < 2; ++game) {
            for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                Sorphera.Round memory r = lottery.getRound(game, id);
                uint256 heldFees = r.sold * r.price / 10;
                (, uint256 terminal,,,, uint256 inventory) = lottery.groups(game, r.group);
                assertLe(r.eligibleNFTs, inventory, "Sorphera: eligible NFTs exceed group inventory");
                if (r.status == Sorphera.Status.Cancelled) {
                    assertEq(game, 1);
                    assertEq(r.requestId, 0, "Sorphera: cancelled round requested randomness");
                    assertEq(lottery.releasedFees(game, id), 0, "Sorphera: cancelled round released fees");
                    assertEq(r.fees, 0);
                    assertEq(terminal, id);
                } else if (r.status == Sorphera.Status.Won || r.status == Sorphera.Status.Rolled) {
                    assertEq(r.fees, 0);
                    if (r.sold == 0) {
                        assertEq(r.requestId, 0, "Sorphera: zero-ticket round used VRF");
                        assertEq(r.matches, 0);
                    } else {
                        assertGt(r.requestId, 0);
                        assertEq(lottery.releasedFees(game, id), heldFees, "Sorphera: fees released once");
                        if (game == 1) assertGt(r.frozenNFTs, 0, "Sorphera: NFT draw without inventory");
                    }
                    if (r.status == Sorphera.Status.Won) {
                        assertEq(terminal, id);
                        assertGt(r.matches, 0);
                        assertEq(lottery.matchCount(game, id, r.winningKey), r.matches);
                        if (game == 1) {
                            (, uint32 combination) = lottery.tickets(game, id, r.winningTicket);
                            assertTrue(r.winningTicket >= 1 && r.winningTicket <= r.sold);
                            assertEq(combination, r.winningKey, "Sorphera: tie-break outside matches");
                        }
                    } else {
                        assertEq(r.matches, 0);
                        assertEq(r.winningTicket, 0);
                    }
                } else {
                    assertEq(r.fees, heldFees, "Sorphera: fees must be held until a result");
                    assertEq(lottery.releasedFees(game, id), 0);
                    assertEq(terminal, 0);
                    if (r.status == Sorphera.Status.Requested || r.status == Sorphera.Status.RandomReady) {
                        assertGt(r.requestId, 0);
                        (uint8 boundGame, uint256 boundRound, bool exists,) = lottery.requests(r.requestId);
                        assertTrue(exists && boundGame == game && boundRound == id);
                    }
                }
                SorpheraVault v = SorpheraVault(payable(r.vault));
                for (uint256 i; i < v.assetCount(); ++i) {
                    (address collection, uint256 tokenId,,,) = v.assets(i);
                    uint256 receipt = v.receivedAt(collection, tokenId);
                    assertTrue(receipt != 0 && receipt <= block.timestamp, "Sorphera: asset without receipt");
                }
            }
        }
    }

    function invariant_externalFlowsConserveETH() public view {
        uint256 held = address(lottery).balance + address(router).balance;
        for (uint8 game; game < 2; ++game) {
            for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                held += lottery.getRound(game, id).vault.balance;
            }
        }
        assertEq(
            held + handler.playerPayments() + handler.operatorPayments() + handler.acquisitionPayments(),
            handler.sales() + handler.donations() + handler.recoveries(),
            "Sorphera: ghost ETH conservation"
        );
        assertGt(handler.successfulBuys(), 0);
        assertGt(handler.successfulAcquisitions(), 0);
        assertEq(address(router).balance, 0, "Sorphera: router must forward player ETH");
    }

    function invariant_liabilitiesEqualReservedFeesCashAndUnpaidTickets() public view {
        uint256 owed = lottery.operatorFees();
        for (uint8 game; game < 2; ++game) {
            uint256 maxGroup = lottery.currentGroup(game);
            for (uint256 group = 1; group <= maxGroup; ++group) {
                (, uint256 terminal, uint256 cash, uint256 share, uint256 divisor,) =
                    lottery.groups(game, group);
                owed += cash;
                if (terminal == 0) continue;
                Sorphera.Round memory r = lottery.getRound(game, terminal);
                uint256 paid;
                for (uint256 ticket = 1; ticket <= r.sold; ++ticket) {
                    paid += lottery.claimedETH(game, group, ticket);
                }
                owed += share * divisor - paid;
            }
            for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                owed += lottery.getRound(game, id).fees;
            }
        }
        assertEq(address(lottery).balance, owed, "Sorphera: reserved liabilities");
        assertEq(lottery.totalLiabilities(), owed);
        assertLe(handler.operatorPayments() + lottery.operatorFees(), handler.sales() / 10);
    }

    function invariant_gameAssetsNeverCrossSubsidize() public view {
        for (uint8 game; game < 2; ++game) {
            uint256 held;
            uint256 released;
            for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                Sorphera.Round memory r = lottery.getRound(game, id);
                held += r.vault.balance + r.fees;
                released += lottery.releasedFees(game, id);
            }
            held += released - handler.gameWithdrawals(game);
            for (uint256 group = 1; group <= lottery.currentGroup(game); ++group) {
                (, uint256 terminal, uint256 cash, uint256 share, uint256 divisor,) =
                    lottery.groups(game, group);
                held += cash + share * divisor;
                if (terminal != 0) {
                    for (uint256 ticket = 1; ticket <= lottery.getRound(game, terminal).sold; ++ticket) {
                        held -= lottery.claimedETH(game, group, ticket);
                    }
                }
            }
            assertEq(
                held + handler.gamePayments(game) + handler.gameSpent(game) + handler.gameWithdrawals(game),
                handler.gameSales(game) + handler.gameDonations(game) + handler.gameRecoveries(game)
            );
        }
    }

    function invariant_vaultRequestsAndCustodyRemainBacked() public view {
        for (uint8 game; game < 2; ++game) {
            for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                SorpheraVault v = SorpheraVault(payable(lottery.getRound(game, id).vault));
                assertLe(v.budget(), address(v).balance);
                uint256 pending;
                for (uint256 i; i < v.requestCount(); ++i) {
                    uint256 request = v.requestAt(i);
                    assertEq(pool.acquisitions(request).purchaser, address(v));
                    assertEq(pool.builder(request), address(router));
                    if (v.requestState(request) == 1) ++pending;
                }
                assertEq(v.pending(), pending);
                assertEq(v.securedCount(), v.assetCount());
                for (uint256 i; i < v.assetCount(); ++i) {
                    (address collection, uint256 tokenId,, uint256 listing, bool claimed) = v.assets(i);
                    assertEq(collection, address(nft));
                    assertEq(v.assetIndexPlusOne(listing), i + 1);
                    if (!claimed) {
                        assertEq(nft.ownerOf(tokenId), address(v));
                    } else {
                        assertTrue(
                            nft.ownerOf(tokenId) == alice || nft.ownerOf(tokenId) == bob
                                || nft.ownerOf(tokenId) == handler.actors(2)
                        );
                    }
                }
                if (handler.terminalStatus(game, id) != 0) {
                    assertEq(uint256(lottery.getRound(game, id).status), handler.terminalStatus(game, id));
                }
                if (handler.recordedWord(game, id) != 0) {
                    assertEq(lottery.getRound(game, id).randomWord, handler.recordedWord(game, id));
                }
            }
        }
    }

    function invariant_purchaserAndBuilderTokensStayConserved() public view {
        uint256 held = token.balanceOf(address(router)) + token.balanceOf(address(helper));
        uint256 queued;
        for (uint8 game; game < 2; ++game) {
            for (uint256 id = 1; id <= lottery.latestRound(game); ++id) {
                SorpheraVault v = SorpheraVault(payable(lottery.getRound(game, id).vault));
                uint256 balance = token.balanceOf(address(v));
                held += balance;
                queued += v.queuedTokens();
                assertEq(
                    balance + v.queuedTokens(),
                    handler.purchaserMinted(address(v)),
                    "Sorphera: purchaser rewards cannot enter company allowance"
                );
            }
        }
        uint256 delivered;
        uint256 waiting;
        for (uint256 i; i < 3; ++i) {
            address actor = handler.actors(i);
            delivered += token.balanceOf(actor);
            waiting += helper.pending(actor);
        }
        assertEq(held + delivered, handler.mintedRewards());
        assertEq(waiting, token.balanceOf(address(helper)));
        assertEq(delivered + waiting, queued + handler.builderQueued());
        assertEq(router.isValidSignature(bytes32(0), ""), bytes4(0xffffffff));
    }

    function testHandlerPinnedLifecycleExercisesClaimsAndLateRecoveries() public {
        handler.advance(0, false);
        handler.advance(0, false);
        handler.advance(0, false);
        handler.claim(0, 1, 1, false);
        handler.syncOrDonate(0, 1, 17, true);
        handler.claim(0, 1, 1, false);
        handler.withdraw(type(uint256).max, false);
        handler.queueTokens(0, 1, 1, 0);
        handler.receiveTokens(0);
        handler.advance(1, false);
        handler.advance(1, false);
        handler.advance(1, false);
        handler.advance(1, false);
        handler.advance(1, false);
        handler.advance(1, false);
        handler.claimNFT(1, 1, 0, true);
        handler.claimNFT(1, 1, 0, false);
        handler.recoverStuck(0);
        assertEq(handler.stuckCount(), 0);
        assertEq(handler.stuckRecoveries(), 1);
        handler.advance(1, false);
        assertEq(lottery.latestRound(1), 2);
        handler.buy(1, 2, 8, false);
        handler.acquire(1, 1, false);
        pool.allocate(pool.count(), 0.02 ether);
        handler.forceSettlement(pool.count(), 0);
        handler.acquire(1, 1, false);
        uint256 requestsBefore = vrf.requests();
        handler.advance(1, true);
        assertEq(uint256(lottery.getRound(1, 2).status), uint256(Sorphera.Status.Cancelled));
        assertEq(vrf.requests(), requestsBefore);
        pool.allocate(pool.count(), 0.02 ether);
        handler.forceSettlement(pool.count(), 1);
        assertEq(handler.forcedDeliveries(), 3);
        assertEq(lottery.getRound(1, 2).eligibleNFTs, 0);
        (,,,,, uint256 inventory) = lottery.groups(1, lottery.groupOf(1, 2));
        assertEq(inventory, 1, "Sorphera: late delivery is held for the refund cohort");
        handler.claim(1, 2, 1, false);
        handler.claim(1, 2, 1, true);
        assertGt(handler.successfulClaims(), 1);
        invariant_externalFlowsConserveETH();
        invariant_liabilitiesEqualReservedFeesCashAndUnpaidTickets();
        invariant_gameAssetsNeverCrossSubsidize();
        invariant_vaultRequestsAndCustodyRemainBacked();
        invariant_purchaserAndBuilderTokensStayConserved();
        invariant_roundOutcomesFollowFixedRules();
    }
}
