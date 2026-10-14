// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraPassport} from "../src/SorpheraPassport.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {Balls} from "../src/lib/Balls.sol";
import {Rehearse} from "../script/Rehearse.s.sol";
import {ReleaseChecks} from "../script/ReleaseChecks.sol";
import {
    MockNFT,
    MockToken,
    MockRewards,
    MockFWA,
    MockHelper,
    MockPermit2,
    MockVRF
} from "./mocks/ExternalMocks.sol";

/// @notice OFFLINE release rehearsal through the actual deployer (`script/Rehearse.s.sol`) and the fail-closed
///         `ReleaseChecks`. The coordinator is an etched mock on a simulated chain id 11155111: this proves
///         deployment order, bindings, price validation and lifecycle wiring, never live VRF.
/// @dev Sales are enabled only inside isolated lifecycle tests; every rehearsal assertion ends disabled.
contract SorpheraReleaseTest is Test {
    address constant COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    bytes32 constant KEY = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;
    uint256 constant PRICE = 0.005 ether; // local fixture only; production price is an unapproved input

    Rehearse rehearse;
    ReleaseChecks checks;
    SorpheraRouter router;
    SorpheraVaultFactory factory;
    Sorphera lottery;
    SorpheraPassport passport;
    MockFWA pool;
    MockHelper helper;
    MockVRF vrf;
    address owner = makeAddr("explicit rehearsal owner; not a deployment input");
    address alice = makeAddr("release alice");
    address bob = makeAddr("release bob");
    uint256 cutoff;

    function setUp() public {
        vm.chainId(11155111);
        vm.warp(10 days);
        vm.roll(100);
        MockVRF implementation = new MockVRF();
        vm.etch(COORDINATOR, address(implementation).code);
        vrf = MockVRF(COORDINATOR);
        vrf.setFunding(1 ether);
        vm.etch(0x000000000022D473030F116dDEE9F6B43aC78BA3, address(new MockPermit2()).code);
        vm.mockCall(
            COORDINATOR, abi.encodeWithSignature("s_provingKeys(bytes32)", KEY), abi.encode(true, uint64(0))
        );
        vm.mockCall(
            COORDINATOR,
            abi.encodeWithSignature("s_config()"),
            abi.encode(
                uint16(3),
                uint32(2500000),
                false,
                uint32(0),
                uint32(0),
                uint32(0),
                uint32(0),
                uint8(0),
                uint8(0)
            )
        );
        MockNFT nft = new MockNFT();
        MockToken token = new MockToken();
        MockRewards rewards = new MockRewards(token);
        pool = new MockFWA(rewards, nft);
        rewards.setFWA(address(pool));
        helper = new MockHelper(address(token));
        token.setDistributor(address(helper));
        token.setDistributor(address(rewards));
        rehearse = new Rehearse();
        checks = new ReleaseChecks();
        (router, factory, lottery, passport) = rehearse.run(11155111, owner, COORDINATOR, KEY, PRICE);
        vrf.setConsumer(address(lottery));
        cutoff = vm.getBlockTimestamp() + 7 days;
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(address(pool), 10 ether);
    }

    function _expected() internal view returns (ReleaseChecks.Expected memory) {
        return ReleaseChecks.Expected(
            11155111,
            owner,
            address(router),
            address(factory),
            address(lottery),
            address(passport),
            COORDINATOR,
            PRICE
        );
    }

    function _rules(uint256 price, uint256 first) internal pure returns (Sorphera.Rules memory) {
        return Sorphera.Rules(price, first, 1 hours, 2 days, 0.02 ether, 0.03 ether, 1 ether, 500);
    }

    /// @dev Post-deployment owner actions in release order; sales stay disabled.
    function _configure(Sorphera l, SorpheraRouter r, uint256 price) internal {
        vm.startPrank(owner);
        r.configure(address(pool), address(helper));
        l.configureRules(0, _rules(price, cutoff));
        l.configureRules(1, _rules(price, cutoff + 3 days)); // NFT round still open after the ETH draw
        l.configureRandomness(Sorphera.RandomConfig(123, KEY, 3, 200000, true));
        l.configureVRFReserve(0, 1);
        l.validateLaunch();
        vm.stopPrank();
    }

    function _picks(uint8 game, uint256 id, uint256 word, uint256 n)
        internal
        view
        returns (Sorphera.Pick[] memory picks)
    {
        picks = new Sorphera.Pick[](n);
        (uint8[3] memory main, uint8 bonus,) = Balls.draw(lottery.seedFor(game, id, word));
        for (uint256 i; i < n; ++i) {
            picks[i] = Sorphera.Pick(main, bonus);
        }
    }

    function _keys(uint8 game, uint256 id) internal pure returns (SorpheraPassport.RoundKey[] memory k) {
        k = new SorpheraPassport.RoundKey[](1);
        k[0] = SorpheraPassport.RoundKey(game, id);
    }

    function _one(uint256 id) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = id;
    }

    function _draw(uint8 game, uint256 id, uint256 word) internal {
        vm.warp(lottery.getRound(game, id).earliestDraw);
        lottery.requestDraw(game, id);
        vrf.fulfill(lottery.getRound(game, id).requestId, word);
        lottery.finalize(game, id);
    }

    // ----------------------------------------------------------------------------------------------
    // Deployment wiring
    // ----------------------------------------------------------------------------------------------

    function testRehearsalDeploysBindsPassportAndEndsWithSalesDisabled() public {
        assertEq(router.owner(), owner);
        assertEq(factory.owner(), owner);
        assertEq(lottery.owner(), owner);
        assertEq(address(factory.router()), address(router));
        assertEq(factory.lottery(), address(lottery));
        assertEq(lottery.passport(), address(passport));
        assertEq(address(passport.lottery()), address(lottery));
        assertEq(passport.qualifyingPrice(), PRICE);
        assertFalse(lottery.salesEnabled());
        ReleaseChecks.Report memory report = checks.verify(_expected());
        assertEq(report.chain, 11155111);
        assertEq(report.passportCodeHash, address(passport).codehash);
        assertEq(report.lotteryCodeHash, address(lottery).codehash);
        assertFalse(report.rulesConfigured[0] || report.rulesConfigured[1] || report.launchValidated);
        vm.expectRevert("release: rules not configured");
        checks.requireReady(_expected());
        _configure(lottery, router, PRICE);
        report = checks.requireReady(_expected());
        assertTrue(report.rulesConfigured[0] && report.rulesConfigured[1] && report.launchValidated);
        assertFalse(lottery.salesEnabled(), "readiness never enables sales");
        checks.expectPassportCode(address(passport), address(lottery), PRICE);
    }

    function testRehearsalRejectsWrongChainOwnerPriceAndCoordinator() public {
        vm.expectRevert("rehearsal inputs");
        rehearse.run(1, owner, COORDINATOR, KEY, PRICE);
        vm.expectRevert("rehearsal inputs");
        rehearse.run(11155111, address(0), COORDINATOR, KEY, PRICE);
        vm.expectRevert("rehearsal qualifying price");
        rehearse.run(11155111, owner, COORDINATOR, KEY, 0);
        vm.expectRevert("rehearsal qualifying price");
        rehearse.run(11155111, owner, COORDINATOR, KEY, PRICE + 5);
        vm.expectRevert("Sorphera: network configuration");
        rehearse.run(11155111, owner, 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a, KEY, PRICE);
        vm.expectRevert("Sorphera: network configuration");
        rehearse.run(11155111, owner, COORDINATOR, bytes32(uint256(1)), PRICE);
    }

    function testChecksFailClosedOnWrongInputsMisbindingAndRepeatedBinding() public {
        ReleaseChecks.Expected memory e = _expected();
        e.chain = 1;
        vm.expectRevert("release: wrong chain");
        checks.verify(e);
        e = _expected();
        e.owner = alice;
        vm.expectRevert("release: router owner");
        checks.verify(e);
        e = _expected();
        e.passport = address(router);
        vm.expectRevert("release: passport not bound");
        checks.verify(e);
        e = _expected();
        e.passport = address(0);
        vm.expectRevert("release: passport code");
        checks.verify(e);
        e = _expected();
        e.qualifyingPrice = PRICE + 10;
        vm.expectRevert("release: passport price");
        checks.verify(e);
        e = _expected();
        e.qualifyingPrice = 15;
        vm.expectRevert("release: qualifying price");
        checks.verify(e);
        vm.expectRevert("release: passport code mismatch");
        checks.expectPassportCode(address(passport), address(lottery), PRICE + 10);
        // A game frozen at another price can never qualify: readiness refuses it.
        vm.prank(owner);
        lottery.configureRules(1, _rules(PRICE + 10, cutoff));
        vm.expectRevert("release: game price not qualifying");
        checks.verify(_expected());
        vm.prank(owner);
        lottery.configureRules(1, _rules(PRICE, cutoff));
        checks.verify(_expected());
        // Repeated bindings are refused by the contracts themselves.
        vm.startPrank(owner);
        vm.expectRevert("Sorphera: passport binding");
        lottery.setPassport(address(passport));
        vm.expectRevert("Sorphera: lottery bound");
        factory.setLottery(address(lottery));
        vm.stopPrank();
        // A Passport built for another lottery is detected even though `setPassport` only checks code.
        SorpheraRouter router2 = new SorpheraRouter(owner);
        SorpheraVaultFactory factory2 = new SorpheraVaultFactory(address(router2), owner);
        Sorphera lottery2 = new Sorphera(owner, address(factory2), COORDINATOR);
        vm.startPrank(owner);
        factory2.setLottery(address(lottery2));
        lottery2.setPassport(address(passport));
        vm.stopPrank();
        e = _expected();
        e.router = address(router2);
        e.factory = address(factory2);
        e.lottery = address(lottery2);
        vm.expectRevert("release: passport misbound");
        checks.verify(e);
    }

    function testMissingPassportBlocksReadinessWhileOrdinaryBuyWorks() public {
        SorpheraRouter r = new SorpheraRouter(owner);
        SorpheraVaultFactory f = new SorpheraVaultFactory(address(r), owner);
        Sorphera l = new Sorphera(owner, address(f), COORDINATOR);
        vm.prank(owner);
        f.setLottery(address(l));
        vrf.setConsumer(address(l));
        _configure(l, r, PRICE);
        ReleaseChecks.Expected memory e = ReleaseChecks.Expected(
            11155111, owner, address(r), address(f), address(l), address(0), COORDINATOR, PRICE
        );
        vm.expectRevert("release: passport code");
        checks.requireReady(e);
        // ISOLATED LOCAL FIXTURE: sales are enabled only here to show buy does not depend on the Passport.
        vm.prank(owner);
        l.setSalesEnabled(true);
        l.openRound(0);
        Sorphera.Pick[] memory picks = new Sorphera.Pick[](1);
        picks[0] = Sorphera.Pick([uint8(1), 2, 3], 1);
        vm.prank(alice);
        l.buy{value: PRICE}(0, 1, picks);
        assertEq(l.getRound(0, 1).paidEntries, 1);
        vm.prank(alice);
        vm.expectRevert("Sorphera: passport only");
        l.enter(alice, 0, 1, picks, 0);
        SorpheraPassport p = new SorpheraPassport(address(l), PRICE);
        vm.prank(owner);
        l.setPassport(address(p));
        e.passport = address(p);
        vm.expectRevert("release: sales must remain disabled");
        checks.requireReady(e);
        vm.prank(owner);
        l.setSalesEnabled(false);
        checks.requireReady(e);
    }

    // ----------------------------------------------------------------------------------------------
    // Lifecycle through the rehearsed deployment
    // ----------------------------------------------------------------------------------------------

    function testLifecycleDirectBuyPassportEntryRewardRedemptionAndCancellationRestore() public {
        _configure(lottery, router, PRICE);
        vm.prank(owner);
        lottery.setSalesEnabled(true); // ISOLATED LOCAL FIXTURE
        lottery.openRound(0);
        SorpheraVault v = SorpheraVault(payable(lottery.getRound(0, 1).vault));
        Sorphera.Pick[] memory win = _picks(0, 1, 123, 12);
        // Direct buy: alice, 1 ticket, 90% to the vault and 10% held by the lottery.
        Sorphera.Pick[] memory single = _picks(0, 1, 123, 1); // computed before the prank: getters consume it
        vm.prank(alice);
        lottery.buy{value: PRICE}(0, 1, single);
        assertEq(address(v).balance, PRICE * 9 / 10);
        assertEq(address(lottery).balance, PRICE / 10);
        // Passport paid entry: bob, 12 tickets, exact forwarding, player ownership.
        vm.prank(bob);
        passport.enter{value: 12 * PRICE}(0, 1, win, 0, _keys(0, 1));
        assertEq(address(v).balance, 13 * PRICE * 9 / 10);
        assertEq(address(lottery).balance, 13 * PRICE / 10);
        assertEq(address(passport).balance, 0, "passport holds no ETH");
        (address player,, bool isReward) = lottery.tickets(0, 1, 13);
        assertEq(player, bob);
        assertFalse(isReward);
        vm.prank(bob);
        vm.expectRevert("Sorphera: tickets/payment");
        passport.enter{value: 11 * PRICE}(0, 1, win, 0, _keys(0, 1));
        Sorphera.Round memory r = lottery.getRound(0, 1);
        assertEq(r.sold, 13);
        assertEq(r.paidEntries, 13);
        assertEq(r.rewardEntries, 0);
        assertEq(r.fees, 13 * PRICE / 10);
        // Finalization: both alice and bob hold winning combinations; equal shares per ticket.
        _draw(0, 1, 123);
        assertEq(uint8(lottery.getRound(0, 1).status), uint8(Sorphera.Status.Won));
        assertEq(lottery.getRound(0, 1).matches, 13);
        assertEq(passport.process(bob, _keys(0, 1)), 1);
        assertEq(passport.process(bob, _keys(0, 1)), 0);
        (uint256 finalizedPaid, uint256 stamps, uint256 earned,,, uint256 available) = passport.summary(bob);
        assertEq(finalizedPaid, 12);
        assertEq(stamps, 0);
        assertEq(earned, 1);
        assertEq(available, 1);
        (,,,,, uint256 aliceAvailable) = passport.summary(alice);
        assertEq(aliceAvailable, 0, "wallet isolation");
        vm.prank(bob);
        lottery.claimETH(0, 1, _one(13), bob);
        vm.prank(alice);
        lottery.claimETH(0, 1, _one(1), alice);
        assertEq(lottery.claimedETH(0, 1, 13), lottery.claimedETH(0, 1, 1));
        // Redemption in the NFT game (shared counter): one reward plus one paid entry.
        lottery.openRound(1);
        SorpheraVault nftVault = SorpheraVault(payable(lottery.getRound(1, 1).vault));
        Sorphera.Pick[] memory mixed = _picks(1, 1, 7, 2);
        vm.prank(bob);
        passport.enter{value: PRICE}(1, 1, mixed, 1, _keys(1, 1));
        assertEq(address(nftVault).balance, PRICE * 9 / 10, "reward entry funds nothing");
        r = lottery.getRound(1, 1);
        assertEq(r.sold, 2);
        assertEq(r.paidEntries, 1);
        assertEq(r.rewardEntries, 1);
        (,,,,, available) = passport.summary(bob);
        assertEq(available, 0);
        Sorphera.Pick[] memory extra = _picks(1, 1, 7, 1);
        vm.prank(bob);
        vm.expectRevert("Sorphera: insufficient rewards");
        passport.enter(1, 1, extra, 1, _keys(1, 1));
        // Cancellation without inventory after the deadline: paid cohort only, reward restored once.
        vm.warp(lottery.getRound(1, 1).settlementDeadline);
        lottery.requestDraw(1, 1);
        assertEq(uint8(lottery.getRound(1, 1).status), uint8(Sorphera.Status.Cancelled));
        assertEq(passport.process(bob, _keys(1, 1)), 1);
        assertEq(passport.process(bob, _keys(1, 1)), 0, "restored once");
        (finalizedPaid,,,,, available) = passport.summary(bob);
        assertEq(finalizedPaid, 12, "cancelled paid entry earns no stamp");
        assertEq(available, 1);
        vm.expectRevert("Sorphera: reward entry");
        lottery.entitlement(1, 1, 2, bob);
        assertEq(lottery.entitlement(1, 1, 1, bob), 1, "divisor is the paid cohort");
        uint256 before = bob.balance;
        vm.prank(bob);
        lottery.claimETH(1, 1, _one(1), bob);
        assertGt(bob.balance, before);
        assertEq(address(lottery).balance, lottery.totalLiabilities());
        // Readiness refuses the enabled fixture and passes again once sales are disabled.
        vm.expectRevert("release: sales must remain disabled");
        checks.requireReady(_expected());
        vm.prank(owner);
        lottery.setSalesEnabled(false);
        checks.requireReady(_expected());
    }
}
