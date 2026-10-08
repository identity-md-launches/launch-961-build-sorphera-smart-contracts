// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {IRewards} from "../src/interfaces/External.sol";
import {SorpheraVault} from "../src/SorpheraVault.sol";
import {IFWA} from "../src/interfaces/External.sol";

/// @notice Read-only keeper planner. Returned calldata is unsigned; simulate again immediately before sending.
contract Operations {
    function run(Sorphera lottery, uint8 game, uint256 round, uint256 cursor)
        external
        view
        returns (address target, bytes memory data, string memory reason, uint256 nextCursor)
    {
        Sorphera.Round memory r = lottery.getRound(game, round);
        require(r.vault != address(0), "unknown round");
        SorpheraVault v = SorpheraVault(payable(r.vault));
        IFWA pool = v.pool();
        uint256 end = cursor + 50;
        if (end > v.requestCount()) end = v.requestCount();
        for (uint256 i = cursor; i < end; ++i) {
            uint256 id = v.requestAt(i);
            IFWA.Acquisition memory a = pool.acquisitions(id);
            if (a.status == 2 && pool.listings(a.listingId).status == 2) {
                return
                    (
                        address(v),
                        abi.encodeCall(v.settle, (id)),
                        "settle allocation before external window",
                        i
                    );
            }
            if (v.requestState(id) == 1 && (a.status == 2 || a.status == 3 || a.status == 4)) {
                uint256[] memory ids = new uint256[](1);
                ids[0] = id;
                return (address(v), abi.encodeCall(v.reconcile, (ids)), "reconcile terminal request", i + 1);
            }
        }
        if (end < v.requestCount()) return (address(0), "", "continue bounded request scan", end);
        if (v.refundCredit() != 0) {
            return (address(v), abi.encodeCall(v.recoverRefund, ()), "recover purchaser refund", 0);
        }
        if (r.status == Sorphera.Status.Sales && block.timestamp >= r.cutoff) {
            return (address(lottery), abi.encodeCall(lottery.close, (game, round)), "close ticket sales", 0);
        }
        // Cancellation must remain possible even if the external queue is permanently delayed.
        if (
            game == 1 && r.status == Sorphera.Status.Closed && r.eligibleNFTs == 0
                && block.timestamp >= r.settlementDeadline
        ) {
            return (
                address(lottery),
                abi.encodeCall(lottery.requestDraw, (game, round)),
                "NFT deadline recovery",
                0
            );
        }
        if (v.pending() != 0) {
            return
                (address(v), abi.encodeCall(v.process, (50)), "advance FWA queue; monitor actual progress", 0);
        }
        if (r.status == Sorphera.Status.Closed && block.timestamp >= r.earliestDraw) {
            return (
                address(lottery),
                abi.encodeCall(lottery.requestDraw, (game, round)),
                "request draw or resolve empty inventory",
                0
            );
        }
        if (r.status == Sorphera.Status.RandomReady) {
            return (
                address(lottery),
                abi.encodeCall(lottery.finalize, (game, round)),
                "publish balls and match count",
                0
            );
        }
        if (r.status == Sorphera.Status.TieBreakNeeded) {
            return (
                address(lottery),
                abi.encodeCall(lottery.requestTieBreak, (game, round)),
                "request independent NFT tie-break",
                0
            );
        }
        if (r.status == Sorphera.Status.TieBreakReady) {
            return (
                address(lottery),
                abi.encodeCall(lottery.finalizeTieBreak, (game, round)),
                "publish NFT winning ticket",
                0
            );
        }
        return (address(0), "", "wait for cutoff/oracle or process claims; never replace a VRF request", 0);
    }

    function acquisition(SorpheraVault v, uint256 count, uint256 deadline)
        external
        view
        returns (address, bytes memory)
    {
        require(count > 0 && count <= 8, "bounded acquisitions");
        IFWA p = v.pool();
        (uint256 fee,, uint256 total) = p.quoteAcquisitionPrice();
        (uint256 maxFee, uint256 maxTotal, uint256 minValue,, uint256 cutoff) = v.settings();
        require(
            !p.isPurchaseBlackout() && p.activeListingCount() > 0 && p.weightedBackingTotal() >= minValue,
            "pool unavailable"
        );
        require(
            fee > 0 && fee <= maxFee && total <= maxTotal && total * count <= v.budget(),
            "quote/budget bounds"
        );
        require(block.timestamp <= deadline && deadline <= cutoff, "deadline");
        return (address(v), abi.encodeCall(v.acquire, (count, deadline)));
    }

    function builderReward(
        SorpheraRouter router,
        address pool,
        address treasury,
        uint256 minOut,
        uint256 deadline
    ) external view returns (address, bytes memory) {
        router.validate(pool);
        require(treasury != address(0) && minOut > 0 && block.timestamp <= deadline, "reward inputs");
        require(
            IRewards(router.rewardsForPool(pool)).tokenBuyAllowance(address(router)) > 0,
            "no company allowance"
        );
        return
            (address(router), abi.encodeCall(router.claimBuilderRewards, (pool, treasury, minOut, deadline)));
    }

    function purchaserRewards(SorpheraVault vault, uint256[] calldata epochs)
        external
        pure
        returns (address, bytes memory)
    {
        require(epochs.length > 0 && epochs.length <= 32, "bounded epochs");
        return (address(vault), abi.encodeCall(vault.claimEpochRewards, (epochs)));
    }

    function helperDelivery(address helper, address recipient) external pure returns (address, bytes memory) {
        require(recipient != address(0), "recipient");
        return (helper, abi.encodeWithSignature("claim(address)", recipient));
    }
}
