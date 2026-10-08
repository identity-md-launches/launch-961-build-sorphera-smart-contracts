// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IFWA, IRewards, IFWAToken, ITransferHelper} from "./interfaces/External.sol";
import {Guard, Owned} from "./lib/Security.sol";
import {RewardTransfer} from "./lib/RewardTransfer.sol";

/// @title Sorphera builder router
/// @notice Immediate FWA caller. Round vaults remain purchasers; company owns only builder revenue.
contract SorpheraRouter is Guard, Owned, RewardTransfer {
    address public pool;
    address public helper;
    mapping(address => address) public helperForPool;
    mapping(address => address) public rewardsForPool;
    mapping(address => address) public tokenForPool;
    event DependenciesConfigured(address indexed pool, address indexed rewards, address helper);
    event AcquisitionForwarded(
        address indexed purchaser, address indexed pool, uint256[] requests, uint256 refund
    );
    event BuilderRewardClaimed(address indexed rewards, uint256 allowance, uint256 tokenOut);
    constructor(address owner_) Owned(owner_) {}

    function configure(address pool_, address helper_) external onlyOwner {
        require(pool_.code.length != 0 && helper_.code.length != 0, "Sorphera: dependency code");
        IFWA p = IFWA(pool_);
        IRewards r = IRewards(p.rewards());
        IFWAToken t = IFWAToken(p.token());
        require(address(r).code.length != 0 && address(t).code.length != 0, "Sorphera: dependency code");
        // Deliberately rejects the older public Sepolia pool that lacks builder attribution.
        require(
            r.builderRewardBps() <= 2500 && r.fwa() == pool_ && r.token() == address(t),
            "Sorphera: incompatible rewards"
        );
        require(
            r.tokenPoolManager() == t.poolManager() && r.tokenHook() == t.hook(), "Sorphera: market wiring"
        );
        require(
            t.permit2() == PERMIT2 && ITransferHelper(helper_).permit2() == PERMIT2
                && ITransferHelper(helper_).token() == address(t) && t.isDistributor(helper_),
            "Sorphera: helper wiring"
        );
        require(rewardsForPool[pool_] == address(0), "Sorphera: already registered");
        pool = pool_;
        helper = helper_;
        helperForPool[pool_] = helper_;
        rewardsForPool[pool_] = address(r);
        tokenForPool[pool_] = address(t);
        emit DependenciesConfigured(pool_, address(r), helper_);
    }

    function validate(address p) public view {
        require(p != address(0) && rewardsForPool[p] != address(0), "Sorphera: FWA not configured");
        require(
            IFWA(p).token() == tokenForPool[p] && IRewards(rewardsForPool[p]).token() == tokenForPool[p]
                && IFWA(p).rewards() == rewardsForPool[p]
                && IRewards(rewardsForPool[p]).builderRewardBps() <= 2500,
            "Sorphera: dependency changed"
        );
    }

    function acquire(
        address p,
        uint256 count,
        uint256 maxFee,
        uint256 minValue,
        uint256 slippage,
        uint256 deadline
    ) external payable nonReentrant returns (uint256[] memory ids) {
        validate(p);
        require(msg.sender != address(this) && count > 0 && count <= 8, "Sorphera: acquisition batch");
        require(
            block.timestamp <= deadline && maxFee > 0 && minValue > 0 && slippage <= 1000,
            "Sorphera: acquisition bounds"
        );
        uint256 beforeBalance = address(this).balance - msg.value;
        ids = IFWA(p).acquire{value: msg.value}(msg.sender, count, maxFee, minValue, slippage);
        require(ids.length == count, "Sorphera: request count");
        uint256 refund = address(this).balance - beforeBalance;
        if (refund != 0) _send(msg.sender, refund);
        emit AcquisitionForwarded(msg.sender, p, ids, refund);
    }

    function claimBuilderRewards(address p, address recipient, uint256 minOut, uint256 deadline)
        external
        onlyOwner
        nonReentrant
    {
        validate(p);
        require(minOut > 0 && block.timestamp <= deadline, "Sorphera: reward bounds");
        IRewards r = IRewards(rewardsForPool[p]);
        uint256 allowance = r.tokenBuyAllowance(address(this));
        require(allowance > 0, "Sorphera: no builder allowance");
        uint256 amount = r.claimAccruedTokens(minOut);
        require(amount >= minOut, "Sorphera: reward slippage");
        _queue(r.token(), helperForPool[p], recipient, amount, deadline);
        emit BuilderRewardClaimed(address(r), allowance, amount);
    }

    function recoverBuilderAllowance(address p, address recipient) external onlyOwner nonReentrant {
        validate(p);
        uint256 beforeBalance = address(this).balance;
        IRewards(rewardsForPool[p]).withdrawTokenBuyAllowanceAsETH();
        _send(recipient, address(this).balance - beforeBalance);
    }
    receive() external payable {}
}
