// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SorpheraFixture} from "./helpers/SorpheraFixture.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraPassport} from "../src/SorpheraPassport.sol";
import {MockVRF} from "./mocks/ExternalMocks.sol";

/// @notice Stateful Passport model over the ETH game: paid buys, redemptions, finalization and rolls in
///         any order. Ghost totals are what the player paid for and what the Passport issued.
contract PassportHandler is Test {
    Sorphera public immutable lottery;
    SorpheraPassport public immutable passport;
    MockVRF public immutable vrf;
    address[2] public actors;
    mapping(address => uint256) public paidBought;
    mapping(address => uint256) public rewardsIssued;
    mapping(address => uint256) public terminalPaid; // paid tickets in Won/Rolled rounds (model)
    mapping(address => mapping(uint256 => uint256)) public paidInRound;
    mapping(uint256 => bool) public terminal;
    uint256 public rounds;

    constructor(Sorphera l, SorpheraPassport p, MockVRF v, address a, address b) {
        lottery = l;
        passport = p;
        vrf = v;
        actors = [a, b];
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % 2];
    }

    function _pick(uint256 word) internal view returns (Sorphera.Pick memory p) {
        uint256 id = lottery.latestRound(0);
        (p.main, p.bonus) = _draw(lottery.seedFor(0, id, word));
    }

    function _draw(bytes32 seed) internal pure returns (uint8[3] memory main, uint8 bonus) {
        // Simple deterministic distinct picks; validity is all that matters here.
        uint256 n = uint256(seed);
        main[0] = uint8(1 + (n % 20));
        main[1] = uint8(1 + ((n / 20 + 1 + main[0]) % 20));
        if (main[1] == main[0]) main[1] = main[1] % 20 + 1;
        main[2] = uint8(1 + ((n / 400 + 7) % 20));
        while (main[2] == main[0] || main[2] == main[1]) {
            main[2] = main[2] % 20 + 1;
        }
        bonus = uint8(1 + (n / 8000) % 5);
    }

    function _openRound() internal returns (uint256 id) {
        id = lottery.latestRound(0);
        if (id == 0 || lottery.isTerminal(lottery.getRound(0, id).status)) {
            Sorphera.Rules memory rules = _rulesOf();
            uint256 cutoff = rules.firstCutoff + id * 7 days;
            if (vm.getBlockTimestamp() < cutoff - 7 days) vm.warp(cutoff - 7 days);
            id = lottery.openRound(0);
            ++rounds;
        }
        Sorphera.Round memory r = lottery.getRound(0, id);
        if (vm.getBlockTimestamp() >= r.cutoff) {
            _finish(id);
            return _openRound();
        }
    }

    function _rulesOf() internal view returns (Sorphera.Rules memory r) {
        (
            r.price,
            r.firstCutoff,
            r.drawDelay,
            r.settlementDelay,
            r.maxFee,
            r.maxTotal,
            r.minValue,
            r.slippage
        ) = lottery.futureRules(0);
    }

    function _finish(uint256 id) internal {
        Sorphera.Round memory r = lottery.getRound(0, id);
        if (lottery.isTerminal(r.status)) return;
        if (r.status == Sorphera.Status.Sales || r.status == Sorphera.Status.Closed) {
            if (vm.getBlockTimestamp() < r.earliestDraw) vm.warp(r.earliestDraw);
            lottery.requestDraw(0, id);
            r = lottery.getRound(0, id);
            if (r.status == Sorphera.Status.Rolled) {
                _markTerminal(id);
                return;
            }
        }
        if (r.status == Sorphera.Status.Requested) {
            vrf.fulfill(r.requestId, uint256(keccak256(abi.encode("word", id))));
            lottery.finalize(0, id);
        }
        _markTerminal(id);
    }

    function _markTerminal(uint256 id) internal {
        if (!terminal[id] && lottery.isTerminal(lottery.getRound(0, id).status)) {
            terminal[id] = true;
            for (uint256 i; i < 2; ++i) {
                terminalPaid[actors[i]] += paidInRound[actors[i]][id];
            }
        }
    }

    function buy(uint256 seed, uint8 count) external {
        count = uint8(bound(count, 1, 15));
        address who = _actor(seed);
        uint256 id = _openRound();
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](count);
        seed = seed % type(uint128).max;
        for (uint256 i; i < count; ++i) {
            picks[i] = _pick(seed + i);
        }
        vm.deal(who, who.balance + count * 0.005 ether);
        vm.prank(who);
        lottery.buy{value: count * 0.005 ether}(0, id, picks);
        paidBought[who] += count;
        paidInRound[who][id] += count;
    }

    function redeem(uint256 seed, uint8 paid, uint8 free) external {
        address who = _actor(seed);
        uint256 id = _openRound();
        paid = uint8(bound(paid, 0, 3));
        // Finalize first so the overspend prediction matches what `enter`'s own finalization will see.
        passport.process(who, _keys(who, id));
        uint256 available = passport.availableRewards(who);
        free = uint8(bound(free, 0, 3));
        bool overspend = free > available;
        if (paid + free == 0) paid = 1;
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](paid + free);
        seed = seed % type(uint128).max;
        for (uint256 i; i < picks.length; ++i) {
            picks[i] = _pick(seed + 1000 + i);
        }
        vm.deal(who, who.balance + uint256(paid) * 0.005 ether);
        vm.prank(who);
        if (overspend) {
            vm.expectRevert("Sorphera: insufficient rewards");
            passport.enter{value: uint256(paid) * 0.005 ether}(0, id, picks, free, _keys(who, id));
            return;
        }
        passport.enter{value: uint256(paid) * 0.005 ether}(0, id, picks, free, _keys(who, id));
        paidBought[who] += paid;
        paidInRound[who][id] += paid;
        rewardsIssued[who] += free;
    }

    function _keys(address, uint256 upto) internal pure returns (SorpheraPassport.RoundKey[] memory k) {
        uint256 n = upto > 8 ? 8 : upto;
        k = new SorpheraPassport.RoundKey[](n);
        for (uint256 i; i < n; ++i) {
            k[i] = SorpheraPassport.RoundKey(0, upto - i);
        }
    }

    function process(uint256 seed, uint8 round) external {
        address who = _actor(seed);
        uint256 id = bound(round, 1, rounds == 0 ? 1 : rounds);
        passport.process(who, _keys(who, id));
    }

    function finish(uint256) external {
        uint256 id = lottery.latestRound(0);
        if (id == 0) return;
        _finish(id);
    }
}

contract SorpheraPassportInvariantTest is SorpheraFixture {
    PassportHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new PassportHandler(lottery, passport, vrf, alice, bob);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = PassportHandler.buy.selector;
        selectors[1] = PassportHandler.redeem.selector;
        selectors[2] = PassportHandler.process.selector;
        selectors[3] = PassportHandler.finish.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 40
    function invariant_passportCreditIsBoundedByFinalizedPaidTickets() public view {
        address[2] memory who = [alice, bob];
        for (uint256 i; i < 2; ++i) {
            (
                uint256 finalizedPaid,
                uint256 stamps,
                uint256 earned,
                uint256 restored,
                uint256 redeemed,
                uint256 avail
            ) = passport.summary(who[i]);
            assertLe(finalizedPaid, handler.paidBought(who[i]), "credited more paid tickets than bought");
            assertLe(finalizedPaid, handler.terminalPaid(who[i]), "credited a non-terminal round");
            assertEq(earned, finalizedPaid / 12);
            assertEq(stamps, finalizedPaid % 12);
            assertEq(redeemed, handler.rewardsIssued(who[i]), "issued reward tickets differ from redemptions");
            assertEq(restored, 0, "ETH rounds never cancel");
            assertEq(avail + redeemed, earned + restored, "available is earned plus restored minus redeemed");
            assertLe(redeemed, earned, "overspent rewards");
        }
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 40
    function invariant_rewardEntriesCreateNoLiabilityAndFundsConserve() public view {
        assertEq(address(lottery).balance, lottery.totalLiabilities());
        uint256 paidFees;
        uint256 issued;
        for (uint256 id = 1; id <= lottery.latestRound(0); ++id) {
            Sorphera.Round memory r = lottery.getRound(0, id);
            assertEq(r.sold, r.paidEntries + r.rewardEntries, "entry counts");
            issued += r.rewardEntries;
            paidFees += r.fees + lottery.releasedFees(0, id);
            (uint256 pa, uint256 ra) = lottery.entriesOf(0, id, alice);
            (uint256 pb, uint256 rb) = lottery.entriesOf(0, id, bob);
            assertEq(pa + pb, r.paidEntries);
            assertEq(ra + rb, r.rewardEntries);
        }
        assertEq(issued, handler.rewardsIssued(alice) + handler.rewardsIssued(bob));
        assertEq(
            paidFees,
            (handler.paidBought(alice) + handler.paidBought(bob)) * 0.005 ether / 10,
            "fees only from paid"
        );
        assertEq(address(passport).balance, 0);
    }
}
