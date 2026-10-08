// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IFWA {
    struct Acquisition {
        address purchaser;
        uint256 requestBlock;
        uint256 priceEscrowed;
        uint256 listingId;
        uint8 status;
    }

    struct Listing {
        address collection;
        address depositor;
        address purchaser;
        uint256 tokenId;
        uint256 weight;
        uint256 value;
        uint256 feeShare;
        uint256 feeDebt;
        uint256 slot;
        uint64 allocatedAt;
        uint8 status;
    }
    function acquisitions(uint256) external view returns (Acquisition memory);
    function listings(uint256) external view returns (Listing memory);
    function quoteAcquisitionPrice() external view returns (uint256 fee, uint256 vrf, uint256 total);
    function acquire(address, uint256, uint256, uint256, uint256) external payable returns (uint256[] memory);
    function processAcquisitions(uint256) external returns (uint256);
    function acquisitionRefundCredit(address) external view returns (uint256);
    function withdrawAcquisitionRefund() external returns (uint256);
    function keepNFT(uint256) external;
    function acceptDepositorBid(uint256) external;
    function recoverStuckNFT(uint256) external;
    function stuckNFTRecipient(uint256) external view returns (address);
    function settlementWindow() external view returns (uint256);
    function finalizeWindow() external view returns (uint256);
    function selectionTimeoutBlocks() external view returns (uint256);
    function isPurchaseBlackout() external view returns (bool);
    function rewards() external view returns (address);
    function token() external view returns (address);
    function weightedBackingTotal() external view returns (uint256);
    function activeListingCount() external view returns (uint256);
}

interface IRewards {
    function fwa() external view returns (address);
    function token() external view returns (address);
    function tokenPoolManager() external view returns (address);
    function tokenHook() external view returns (address);
    function builderRewardBps() external view returns (uint256);
    function tokenBuyAllowance(address) external view returns (uint256);
    function claimAccruedTokens(uint256) external returns (uint256);
    function claimEpochTokens(uint256[] calldata) external returns (uint256);
    function withdrawTokenBuyAllowanceAsETH() external returns (uint256);
}

interface IERC721 {
    function ownerOf(uint256) external view returns (address);
    function safeTransferFrom(address, address, uint256) external;
}

interface IFWAToken {
    function balanceOf(address) external view returns (uint256);
    function permit2() external view returns (address);
    function poolManager() external view returns (address);
    function hook() external view returns (address);
    function isDistributor(address) external view returns (bool);
}

interface IPermit2 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

interface ITransferHelper {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }
    function token() external view returns (address);
    function permit2() external view returns (address);
    function depositWithPermit2(PermitTransferFrom calldata, bytes calldata, address)
        external
        returns (uint256);
}

interface IVRF {
    struct Request {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }
    function requestRandomWords(Request calldata) external returns (uint256);
    function getSubscription(uint256)
        external
        view
        returns (uint96, uint96, uint64, address, address[] memory);
}

interface ISorphera {
    function acquisitionOpen(uint8 game, uint256 round) external view returns (bool);
    function credit(uint8 game, uint256 round) external payable;
    function recordNFT(uint8 game, uint256 round) external;
    function entitlement(uint8 game, uint256 round, uint256 ticket, address claimant)
        external
        view
        returns (uint256 count);
    function groupOf(uint8 game, uint256 round) external view returns (uint256);
}
