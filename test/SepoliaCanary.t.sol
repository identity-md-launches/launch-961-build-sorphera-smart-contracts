// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {
    CanaryDependencies,
    CanaryController,
    CanaryPool,
    CanaryRewards,
    CanaryNFT
} from "../script/CanaryDependencies.sol";
import {MockVRF, MockPermit2} from "./mocks/ExternalMocks.sol";

/// @notice OFFLINE SIMULATION. Etched coordinator is explicitly not live Chainlink evidence.
contract SepoliaCanaryTest is Test {
    address constant COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    bytes32 constant KEY = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;
    CanaryDependencies deps;
    CanaryController control;
    Sorphera lottery;
    MockVRF vrf;
    uint256 cutoff;

    function setUp() public {
        vm.chainId(11155111);
        vm.warp(10 days);
        MockVRF implementation = new MockVRF();
        vm.etch(COORDINATOR, address(implementation).code);
        vrf = MockVRF(COORDINATOR);
        vrf.setFunding(1 ether);
        MockPermit2 permit = new MockPermit2();
        vm.etch(0x000000000022D473030F116dDEE9F6B43aC78BA3, address(permit).code);
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
        deps = new CanaryDependencies(address(this));
        control = deps.controller();
        SorpheraRouter router = new SorpheraRouter(address(control));
        SorpheraVaultFactory factory = new SorpheraVaultFactory(address(router), address(control));
        lottery = new Sorphera(address(control), address(factory), COORDINATOR);
        control.execute(address(factory), abi.encodeCall(factory.setLottery, (address(lottery))));
        control.execute(
            address(router), abi.encodeCall(router.configure, (address(deps.pool()), address(deps.helper())))
        );
        vrf.setConsumer(address(lottery));
        cutoff = block.timestamp + 6 hours;
        Sorphera.Rules memory rules = Sorphera.Rules(1000, cutoff, 60, 3600, 1000, 1000, 1, 0);
        control.execute(address(lottery), abi.encodeCall(lottery.configureRules, (0, rules)));
        control.execute(address(lottery), abi.encodeCall(lottery.configureRules, (1, rules)));
        control.execute(
            address(lottery),
            abi.encodeCall(lottery.configureRandomness, (Sorphera.RandomConfig(123, KEY, 3, 200000, true)))
        );
        control.execute(address(lottery), abi.encodeCall(lottery.configureVRFReserve, (0, 1)));
        control.execute(address(lottery), abi.encodeCall(lottery.validateLaunch, ()));
        vm.deal(address(this), 1 ether);
    }

    function testControlledDependenciesAndNoPublicSalesWindow() public {
        lottery.openRound(0);
        Sorphera.Pick[] memory entry = new Sorphera.Pick[](1);
        entry[0] = Sorphera.Pick([uint8(1), 2, 3], 1);
        control.buyBatch{value: 1000}(lottery, 0, 1, entry);
        assertFalse(lottery.salesEnabled());
        vm.expectRevert("Sorphera: sales closed");
        lottery.buy{value: 1000}(0, 1, entry);
        address stranger = makeAddr("unauthorized canary caller");
        CanaryPool pool = deps.pool();
        CanaryRewards rewards = deps.rewards();
        CanaryNFT nft = deps.nft();
        vm.prank(stranger);
        vm.expectRevert("canary operator only");
        control.buyBatch(lottery, 0, 1, entry);
        vm.prank(stranger);
        vm.expectRevert("canary operator only");
        control.execute(address(lottery), abi.encodeCall(lottery.setSalesEnabled, (true)));
        vm.expectRevert("Sorphera: tickets/payment");
        control.buyBatch{value: 999}(lottery, 0, 1, entry);
        assertFalse(lottery.salesEnabled(), "reverting purchase must also roll back enable");
        vm.prank(stranger);
        vm.expectRevert("canary operator only");
        pool.allocate(1);
        vm.prank(stranger);
        vm.expectRevert("canary binding");
        rewards.bind(stranger);
        vm.prank(stranger);
        vm.expectRevert("canary mint");
        nft.mint(1);
        vm.chainId(1);
        vm.expectRevert("canary chain only");
        new CanaryDependencies(address(this));
    }

    function _coverage(uint8 game, uint256 copies) internal {
        // 171 separate live transactions exceed one Forge test's aggregate gas limit.
        // This only exempts exhaustive fixture creation, never callback/finalization execution.
        vm.pauseGasMetering();
        Sorphera.Pick[] memory entries = new Sorphera.Pick[](100);
        uint256 cursor;
        for (uint256 copy; copy < copies; ++copy) {
            for (uint8 a = 1; a <= 18; ++a) {
                for (uint8 b = a + 1; b <= 19; ++b) {
                    for (uint8 c = b + 1; c <= 20; ++c) {
                        for (uint8 bonus = 1; bonus <= 5; ++bonus) {
                            entries[cursor++] = Sorphera.Pick([a, b, c], bonus);
                            if (cursor == 100) {
                                control.buyBatch{value: 100000}(lottery, game, 1, entries);
                                cursor = 0;
                            }
                        }
                    }
                }
            }
        }
        assertEq(cursor, 0);
        assertFalse(lottery.salesEnabled());
        vm.resumeGasMetering();
    }

    function testFullCoverageTwoGamesDelayedDrawAndIndependentTieClaims() public {
        SorpheraVault[2] memory vaults;
        for (uint8 game; game < 2; ++game) {
            lottery.openRound(game);
            _coverage(game, game == 0 ? 1 : 2);
            vaults[game] = SorpheraVault(payable(lottery.getRound(game, 1).vault));
            vaults[game].acquire(1, cutoff);
            uint256 request = vaults[game].requestAt(0);
            deps.pool().allocate(request);
            vaults[game].settle(request);
        }
        vm.warp(cutoff + 60);
        lottery.requestDraw(0, 1);
        lottery.requestDraw(1, 1);
        uint256 ethRequest = lottery.getRound(0, 1).requestId;
        uint256 nftRequest = lottery.getRound(1, 1).requestId;
        vm.warp(block.timestamp + 20 days);
        vm.expectRevert("Sorphera: draw state");
        lottery.requestDraw(1, 1);
        // Chosen AFTER exhaustive entries; these are mock callbacks, never live evidence.
        vrf.fulfill(nftRequest, 9876);
        vrf.fulfill(ethRequest, 1234);
        lottery.finalize(0, 1);
        lottery.finalize(1, 1);
        assertEq(lottery.getRound(0, 1).matches, 1);
        assertEq(lottery.getRound(1, 1).matches, 2);
        lottery.requestTieBreak(1, 1);
        uint256 tieRequest = lottery.getRound(1, 1).tieBreakRequestId;
        assertTrue(tieRequest != ethRequest && tieRequest != nftRequest && ethRequest != nftRequest);
        vrf.fulfill(tieRequest, 777);
        lottery.finalizeTieBreak(1, 1);
        uint256[] memory ids = new uint256[](1);
        for (uint8 game; game < 2; ++game) {
            Sorphera.Round memory r = lottery.getRound(game, 1);
            ids[0] = game == 0 ? lottery.matchingTicket(game, 1, r.winningKey, 0) : r.winningTicket;
            control.execute(address(lottery), abi.encodeCall(lottery.claimETH, (game, 1, ids, address(this))));
            assertGt(lottery.claimedETH(game, r.group, ids[0]), 0);
        }
        uint256 winner = lottery.getRound(1, 1).winningTicket;
        ids[0] = 0;
        control.execute(
            address(vaults[1]), abi.encodeCall(vaults[1].claimNFTs, (winner, ids, address(control)))
        );
        assertEq(deps.nft().ownerOf(2), address(control));
        assertEq(address(lottery).balance, lottery.totalLiabilities());
    }
    receive() external payable {}
}
