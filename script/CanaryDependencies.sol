// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Sorphera} from "../src/Sorphera.sol";
import {IFWA} from "../src/interfaces/External.sol";

interface ICanaryNFTReceiver {
    function onERC721Received(address operator, address from, uint256 id, bytes calldata data)
        external
        returns (bytes4);
}

/// @notice ISOLATED TEST ONLY. No market, FWA oracle or rewards-delivery equivalence is claimed.
contract CanaryController {
    address public immutable operator;

    constructor(address operator_) {
        require(operator_ != address(0), "canary operator required");
        operator = operator_;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "canary operator only");
        _;
    }

    function execute(address target, bytes calldata data)
        external
        payable
        onlyOperator
        returns (bytes memory)
    {
        (bool ok, bytes memory result) = target.call{value: msg.value}(data);
        if (!ok) {
            assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
        }
        return result;
    }

    /// @dev Sales are never enabled between transactions. Only this controller owns test tickets.
    function buyBatch(Sorphera lottery, uint8 game, uint256 round, Sorphera.Pick[] calldata picks)
        external
        payable
        onlyOperator
    {
        lottery.setSalesEnabled(true);
        lottery.buy{value: msg.value}(game, round, picks);
        lottery.setSalesEnabled(false);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }
    receive() external payable {}
}

contract CanaryNFT {
    address private immutable bootstrap = msg.sender;
    address public minter;
    mapping(uint256 => address) public ownerOf;

    function bind(address pool) external {
        require(msg.sender == bootstrap && minter == address(0), "canary binding");
        minter = pool;
    }

    function mint(uint256 id) external {
        require(msg.sender == minter && ownerOf[id] == address(0), "canary mint");
        ownerOf[id] = msg.sender;
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        require(msg.sender == from && ownerOf[id] == from && to != address(0), "canary NFT owner");
        ownerOf[id] = to;
        if (to.code.length != 0) {
            require(ICanaryNFTReceiver(to).onERC721Received(msg.sender, from, id, "") == 0x150b7a02);
        }
    }
}

/// @dev Wiring stub, deliberately has no minting, reward balance or transfer helper implementation.
contract CanaryToken {
    address private immutable bootstrap = msg.sender;
    address public constant permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address public immutable poolManager = address(this);
    address public immutable hook = address(this);
    mapping(address => bool) public isDistributor;
    bool private bound;

    function bind(address rewards, address helper) external {
        require(msg.sender == bootstrap && !bound, "canary binding");
        bound = true;
        isDistributor[rewards] = true;
        isDistributor[helper] = true;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

contract CanaryRewards {
    address private immutable bootstrap = msg.sender;
    address public fwa;
    address public immutable token;
    address public immutable tokenPoolManager;
    address public immutable tokenHook;
    uint256 public constant builderRewardBps = 1500;

    constructor(address token_) {
        token = token_;
        tokenPoolManager = token_;
        tokenHook = token_;
    }

    function bind(address pool) external {
        require(msg.sender == bootstrap && fwa == address(0), "canary binding");
        fwa = pool;
    }

    function tokenBuyAllowance(address) external pure returns (uint256) {
        return 0;
    }
}

contract CanaryHelper {
    address public immutable token;
    address public constant permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    constructor(address token_) {
        token = token_;
    }

    function depositsPaused() external pure returns (bool) {
        return false;
    }
}

/// @notice Synthetic FWA allocations are authorized explicitly; lottery randomness never is.
contract CanaryPool {
    address public immutable operator;
    address public immutable token;
    address public immutable rewards;
    CanaryNFT public immutable nft;
    uint256 public constant fee = 1000;
    uint256 public constant settlementWindow = 1 hours;
    uint256 public constant finalizeWindow = 1 hours;
    uint256 public constant selectionTimeoutBlocks = 30;
    uint256 public constant weightedBackingTotal = 1000;
    uint256 public constant activeListingCount = 10000;
    uint256 public count;
    mapping(uint256 => IFWA.Acquisition) private requests;
    mapping(uint256 => IFWA.Listing) private allocated;
    event NFTAllocated(
        uint256 indexed requestId,
        uint256 indexed listingId,
        address indexed purchaser,
        address depositor,
        uint256 value,
        uint256 randomWord
    );

    constructor(address operator_, address token_, address rewards_, CanaryNFT nft_) {
        operator = operator_;
        token = token_;
        rewards = rewards_;
        nft = nft_;
    }

    function isPurchaseBlackout() external pure returns (bool) {
        return false;
    }

    function quoteAcquisitionPrice() external pure returns (uint256, uint256, uint256) {
        return (fee, 0, fee);
    }

    function acquisitionRefundCredit(address) external pure returns (uint256) {
        return 0;
    }

    function stuckNFTRecipient(uint256) external pure returns (address) {
        return address(0);
    }

    function acquisitions(uint256 id) external view returns (IFWA.Acquisition memory) {
        return requests[id];
    }

    function listings(uint256 id) external view returns (IFWA.Listing memory) {
        return allocated[id];
    }

    function acquire(address purchaser, uint256 n, uint256 maxFee, uint256 minValue, uint256 slippage)
        external
        payable
        returns (uint256[] memory ids)
    {
        require(
            n > 0 && n <= 8 && msg.value == n * fee && maxFee >= fee && minValue <= fee && slippage <= 1000
        );
        require(purchaser != msg.sender && purchaser != address(0));
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            uint256 id = ++count;
            ids[i] = id;
            requests[id] = IFWA.Acquisition(purchaser, block.number, fee, 0, 1);
        }
    }

    function allocate(uint256 id) external {
        require(msg.sender == operator, "canary operator only");
        IFWA.Acquisition storage a = requests[id];
        require(a.status == 1, "canary request state");
        nft.mint(id);
        allocated[id] = IFWA.Listing(
            address(nft), address(this), a.purchaser, id, 1, fee, 0, 0, 0, uint64(block.timestamp), 2
        );
        a.status = 2;
        a.listingId = id;
        // Synthetic allocation has no random word; this event is fixture-only FWA interface coverage.
        emit NFTAllocated(id, id, a.purchaser, address(this), fee, 0);
    }

    function keepNFT(uint256 id) external {
        IFWA.Listing storage l = allocated[id];
        require(msg.sender == l.purchaser && l.status == 2, "canary purchaser only");
        l.status = 4;
        nft.safeTransferFrom(address(this), l.purchaser, id);
    }

    function acceptDepositorBid(uint256 id) external {
        IFWA.Listing storage l = allocated[id];
        require(msg.sender == l.purchaser && l.status == 2, "canary purchaser only");
        l.status = 4;
        (bool ok,) = msg.sender.call{value: fee * 9 / 10}("");
        require(ok);
    }

    function processAcquisitions(uint256) external pure returns (uint256) {
        return 0;
    }
}

/// @notice Deploy ONLY on isolated local chains or authorized Sepolia canaries, never mainnet.
contract CanaryDependencies {
    CanaryController public immutable controller;
    CanaryNFT public immutable nft;
    CanaryToken public immutable token;
    CanaryRewards public immutable rewards;
    CanaryHelper public immutable helper;
    CanaryPool public immutable pool;

    constructor(address operator) {
        require(block.chainid == 11155111 || block.chainid == 31337, "canary chain only");
        controller = new CanaryController(operator);
        nft = new CanaryNFT();
        token = new CanaryToken();
        rewards = new CanaryRewards(address(token));
        helper = new CanaryHelper(address(token));
        pool = new CanaryPool(operator, address(token), address(rewards), nft);
        nft.bind(address(pool));
        rewards.bind(address(pool));
        token.bind(address(rewards), address(helper));
    }
}
