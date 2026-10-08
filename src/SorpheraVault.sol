// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IFWA, IRewards, IFWAToken, IERC721, ISorphera} from "./interfaces/External.sol";
import {SorpheraRouter} from "./SorpheraRouter.sol";
import {Guard} from "./lib/Security.sol";
import {RewardTransfer} from "./lib/RewardTransfer.sol";

/// @title Sorphera round prize vault
/// @notice One purchaser per game/round isolates even FWA's aggregated refund and epoch credits.
contract SorpheraVault is Guard, RewardTransfer {
    struct Settings {
        uint256 maxFee;
        uint256 maxTotal;
        uint256 minValue;
        uint256 slippage;
        uint256 cutoff;
    }

    struct Asset {
        address collection;
        uint256 tokenId;
        uint256 requestId;
        uint256 listingId;
        bool claimed;
    }
    address public immutable lottery;
    SorpheraRouter public immutable router;
    IFWA public immutable pool;
    IRewards public immutable rewards;
    IFWAToken public immutable prizeToken;
    address public immutable helper;
    uint8 public immutable game;
    uint256 public immutable round;
    Settings public settings;
    uint256 public budget;
    uint256 public spent;
    uint256 public pending;
    uint256 public requestCount;
    uint256 public securedCount;
    uint256 public exportedETH;
    uint256 public queuedTokens;
    mapping(uint256 => uint8) public requestState; // 0 unknown, 1 pending, 2 reconciled
    mapping(uint256 => uint256) public requestAt;
    mapping(uint256 => uint256) public assetIndexPlusOne;
    Asset[] public assets;
    mapping(uint256 => uint256) public tokenClaimed;
    // Physical receipt time per (collection, tokenId), written by the ERC721 receive hook. Reconciliation
    // uses it so an NFT delivered before the settlement deadline counts even when recorded afterwards.
    mapping(address => mapping(uint256 => uint256)) public receivedAt;
    // For exceptional forced NFT delivery in an ETH round, or late NFT in a cancelled round:
    // equal ticket owners may unanimously nominate a recipient, without admin discretion or a sale.
    mapping(uint256 => mapping(address => uint256)) public releaseVotes;
    mapping(uint256 => mapping(uint256 => address)) public releaseVote;
    event Acquisition(
        uint8 indexed game,
        uint256 indexed round,
        uint256 indexed requestId,
        uint256 fee,
        uint256 vrf,
        uint256 settlementWindow,
        uint256 finalizeWindow
    );
    event Reconciled(uint256 indexed requestId, uint256 listingId, uint8 status);
    event DeliveryStuck(uint256 indexed requestId, uint256 listingId);
    event CustodySecured(
        uint256 indexed index,
        address indexed collection,
        uint256 tokenId,
        uint256 requestId,
        uint256 listingId
    );
    event ETHExported(uint256 amount);
    event NFTClaimed(uint256 indexed index, address indexed recipient);
    event NFTClaimFailed(uint256 indexed index, address indexed recipient);
    event RefundRecovered(uint256 amount);
    event PurchaserRewardsClaimed(uint256 amount);
    event SharedAssetVote(uint256 indexed index, uint256 indexed ticket, address indexed recipient);

    constructor(
        address lottery_,
        SorpheraRouter router_,
        uint8 game_,
        uint256 round_,
        Settings memory settings_
    ) {
        lottery = lottery_;
        router = router_;
        game = game_;
        round = round_;
        settings = settings_;
        pool = IFWA(router_.pool());
        rewards = IRewards(router_.rewardsForPool(address(pool)));
        prizeToken = IFWAToken(pool.token());
        helper = router_.helper();
    }
    modifier onlyLottery() {
        require(msg.sender == lottery, "Sorphera: lottery only");
        _;
    }

    function fund() external payable onlyLottery {
        budget += msg.value;
    }

    function acquire(uint256 count, uint256 deadline) external nonReentrant {
        require(
            ISorphera(lottery).acquisitionOpen(game, round) && block.timestamp < settings.cutoff
                && deadline <= settings.cutoff,
            "Sorphera: acquisition closed"
        );
        require(count > 0 && count <= 8 && block.timestamp <= deadline, "Sorphera: acquisition batch");
        require(!pool.isPurchaseBlackout(), "Sorphera: FWA blackout");
        (uint256 fee, uint256 vrf, uint256 total) = pool.quoteAcquisitionPrice();
        require(
            fee > 0 && fee <= settings.maxFee && total == fee + vrf && total <= settings.maxTotal,
            "Sorphera: quote bounds"
        );
        uint256 cost = count * total;
        require(cost <= budget, "Sorphera: acquisition budget");
        budget -= cost;
        uint256 balanceBefore = address(this).balance;
        uint256[] memory ids = router.acquire{value: cost}(
            address(pool), count, settings.maxFee, settings.minValue, settings.slippage, deadline
        );
        spent += balanceBefore - address(this).balance;
        uint256 sw = pool.settlementWindow();
        uint256 fw = pool.finalizeWindow();
        for (uint256 i; i < count; ++i) {
            require(ids[i] != 0 && requestState[ids[i]] == 0, "Sorphera: duplicate request");
            IFWA.Acquisition memory acquisition = pool.acquisitions(ids[i]);
            require(acquisition.purchaser == address(this), "Sorphera: purchaser");
            requestState[ids[i]] = 1;
            requestAt[requestCount++] = ids[i];
            emit Acquisition(game, round, ids[i], acquisition.priceEscrowed, vrf, sw, fw);
        }
        pending += count;
    }

    /// @notice Fixed settlement: only ETH for game 0, only keepNFT for game 1. No caller choice.
    /// @dev An allocation that lands after the NFT round was already cancelled has no jackpot to join;
    ///      it settles to the ETH bid so the refund cohort receives divisible cash, not a shared NFT.
    function settle(uint256 id) external nonReentrant {
        require(requestState[id] != 0, "Sorphera: unknown acquisition");
        IFWA.Acquisition memory a = pool.acquisitions(id);
        require(a.purchaser == address(this) && a.status == 2 && a.listingId != 0, "Sorphera: not allocated");
        IFWA.Listing memory l = pool.listings(a.listingId);
        require(l.purchaser == address(this), "Sorphera: purchaser");
        if (l.status == 2) {
            if (game == 0 || ISorphera(lottery).isCancelled(game, round)) {
                pool.acceptDepositorBid(a.listingId);
            } else {
                pool.keepNFT(a.listingId);
            }
        }
        _reconcile(id);
    }

    function process(uint256 count) external nonReentrant {
        require(count > 0 && count <= 50, "Sorphera: process batch");
        pool.processAcquisitions(count);
    }

    function reconcile(uint256[] calldata ids) external nonReentrant {
        require(ids.length > 0 && ids.length <= 50, "Sorphera: reconcile batch");
        for (uint256 i; i < ids.length; ++i) {
            _reconcile(ids[i]);
        }
    }

    function _reconcile(uint256 id) internal {
        require(requestState[id] != 0, "Sorphera: unknown acquisition");
        IFWA.Acquisition memory a = pool.acquisitions(id);
        require(a.purchaser == address(this), "Sorphera: purchaser");
        bool terminal = a.status == 3 || a.status == 4;
        if (a.status == 2 && a.listingId != 0) {
            IFWA.Listing memory l = pool.listings(a.listingId);
            require(l.purchaser == address(this), "Sorphera: purchaser");
            terminal = l.status == 4;
            if (terminal && assetIndexPlusOne[a.listingId] == 0) {
                bool held;
                try IERC721(l.collection).ownerOf(l.tokenId) returns (address holder) {
                    held = holder == address(this);
                } catch {}
                if (held) {
                    uint256 index = assets.length;
                    assets.push(Asset(l.collection, l.tokenId, id, a.listingId, false));
                    assetIndexPlusOne[a.listingId] = index + 1;
                    ++securedCount;
                    uint256 securedAt = receivedAt[l.collection][l.tokenId];
                    if (securedAt == 0) securedAt = block.timestamp;
                    ISorphera(lottery).recordNFT(game, round, securedAt);
                    emit CustodySecured(index, l.collection, l.tokenId, id, a.listingId);
                } else if (pool.stuckNFTRecipient(a.listingId) == address(this)) {
                    // A Settled flag is not custody, so nothing is recorded. The request is still terminal
                    // for pending accounting: FWA will not change it again, and waiting on a collection that
                    // rejects the vault would freeze this round and every later round of the game. A later
                    // recoverNFT records the asset as a late in-kind recovery of this round's entitlements.
                    emit DeliveryStuck(id, a.listingId);
                }
            }
        }
        if (terminal && requestState[id] == 1) {
            requestState[id] = 2;
            --pending;
            emit Reconciled(id, a.listingId, a.status);
        }
    }

    function recoverNFT(uint256 id) external nonReentrant {
        require(requestState[id] != 0, "Sorphera: unknown acquisition");
        IFWA.Acquisition memory a = pool.acquisitions(id);
        require(a.purchaser == address(this), "Sorphera: purchaser");
        pool.recoverStuckNFT(a.listingId);
        _reconcile(id);
    }

    function refundCredit() external view returns (uint256) {
        return pool.acquisitionRefundCredit(address(this));
    }

    function recoverRefund() external nonReentrant {
        uint256 beforeBalance = address(this).balance;
        pool.withdrawAcquisitionRefund();
        emit RefundRecovered(address(this).balance - beforeBalance);
    }

    function syncETH() external nonReentrant {
        _sync();
    }

    function _sync() internal {
        if (block.timestamp >= settings.cutoff) budget = 0;
        uint256 amount = address(this).balance - budget;
        if (amount != 0) {
            exportedETH += amount;
            ISorphera(lottery).credit{value: amount}(game, round);
            emit ETHExported(amount);
        }
    }

    function claimEpochRewards(uint256[] calldata epochs) external nonReentrant {
        require(epochs.length > 0 && epochs.length <= 32, "Sorphera: epoch batch");
        uint256 beforeBalance = prizeToken.balanceOf(address(this));
        rewards.claimEpochTokens(epochs);
        emit PurchaserRewardsClaimed(prizeToken.balanceOf(address(this)) - beforeBalance);
    }

    function claimTokens(uint256 ticket, address recipient, uint256 deadline) external nonReentrant {
        uint256 count = ISorphera(lottery).entitlement(game, round, ticket, msg.sender);
        address token = address(prizeToken);
        uint256 entitled = (IFWAToken(token).balanceOf(address(this)) + queuedTokens) / count;
        uint256 amount = entitled - tokenClaimed[ticket];
        require(amount != 0, "Sorphera: no reward");
        tokenClaimed[ticket] = entitled;
        queuedTokens += amount;
        _queue(token, helper, recipient, amount, deadline);
    }

    function claimNFTs(uint256 ticket, uint256[] calldata indices, address recipient) external nonReentrant {
        require(
            recipient != address(0) && recipient != address(this) && indices.length > 0
                && indices.length <= 20,
            "Sorphera: NFT claim bounds"
        );
        uint256 count = ISorphera(lottery).entitlement(game, round, ticket, msg.sender);
        for (uint256 i; i < indices.length; ++i) {
            uint256 index = indices[i];
            Asset storage a = assets[index];
            require(!a.claimed, "Sorphera: NFT claimed");
            if (count > 1) {
                address old = releaseVote[index][ticket];
                if (old != recipient) {
                    if (old != address(0)) --releaseVotes[index][old];
                    releaseVote[index][ticket] = recipient;
                    ++releaseVotes[index][recipient];
                    emit SharedAssetVote(index, ticket, recipient);
                }
                if (releaseVotes[index][recipient] != count) continue;
            }
            a.claimed = true;
            try this.deliver{gas: 500000}(index, recipient) {
                emit NFTClaimed(index, recipient);
            } catch {
                a.claimed = false;
                emit NFTClaimFailed(index, recipient);
            }
        }
    }

    function deliver(uint256 index, address recipient) external {
        require(msg.sender == address(this), "Sorphera: self only");
        Asset storage a = assets[index];
        require(IERC721(a.collection).ownerOf(a.tokenId) == address(this), "Sorphera: missing custody");
        IERC721(a.collection).safeTransferFrom(address(this), recipient, a.tokenId);
        require(IERC721(a.collection).ownerOf(a.tokenId) == recipient, "Sorphera: delivery failed");
    }

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        receivedAt[msg.sender][tokenId] = block.timestamp;
        return 0x150b7a02;
    }
    receive() external payable {}
}
