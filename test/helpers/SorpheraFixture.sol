// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {SimulatedSorphera} from "./SimulatedSorphera.sol";
import {Test} from "forge-std/Test.sol";
import {Sorphera} from "../../src/Sorphera.sol";
import {SorpheraVault} from "../../src/SorpheraVault.sol";
import {SorpheraRouter} from "../../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../../src/SorpheraVaultFactory.sol";
import {Balls} from "../../src/lib/Balls.sol";
import {IFWA} from "../../src/interfaces/External.sol";
import {
    MockNFT,
    MockToken,
    MockRewards,
    MockFWA,
    MockHelper,
    MockPermit2,
    MockVRF
} from "../mocks/ExternalMocks.sol";

abstract contract SorpheraFixture is Test {
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

    function setUp() public virtual {
        vm.chainId(31337);
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
        factory = new SorpheraVaultFactory(address(router), address(this));
        vrf = new MockVRF();
        lottery = new SimulatedSorphera(address(this), address(factory), address(vrf));
        factory.setLottery(address(lottery));
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
        if (lottery.getRound(game, id).status == Sorphera.Status.TieBreakNeeded) {
            lottery.requestTieBreak(game, id);
            vrf.fulfill(lottery.getRound(game, id).tieBreakRequestId, word + 1000);
            lottery.finalizeTieBreak(game, id);
        }
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
}
