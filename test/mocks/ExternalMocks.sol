// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IFWA, IVRF, ITransferHelper} from "../../src/interfaces/External.sol";

interface IReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

interface IRandomReceiver {
    function rawFulfillRandomWords(uint256, uint256[] calldata) external;
}

interface ISignature {
    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4);
}

contract MockNFT {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => bool) public rejected;

    function mint(address to, uint256 id) external {
        require(ownerOf[id] == address(0));
        ownerOf[id] = to;
    }

    function setRejected(uint256 id, bool value) external {
        rejected[id] = value;
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        require(msg.sender == from && ownerOf[id] == from && !rejected[id], "mock NFT rejected");
        ownerOf[id] = to;
        if (to.code.length != 0) {
            require(IReceiver(to).onERC721Received(msg.sender, from, id, "") == 0x150b7a02);
        }
    }
}

contract MockToken {
    address public constant permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address public poolManager = address(this);
    address public hook = address(this);
    mapping(address => bool) public isDistributor;
    mapping(address => uint256) public balanceOf;

    function setDistributor(address who) external {
        isDistributor[who] = true;
    }

    function revokeDistributor(address who) external {
        isDistributor[who] = false;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(msg.sender == permit2);
        _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal {
        require(
            isDistributor[from] || isDistributor[to] || from == poolManager || to == poolManager,
            "FWA: InvalidTransfer"
        );
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract MockPermit2 {
    mapping(address => mapping(uint256 => bool)) public used;

    function DOMAIN_SEPARATOR() public pure returns (bytes32) {
        return keccak256("mock Permit2 domain");
    }

    function move(address owner, ITransferHelper.PermitTransferFrom calldata permit, bytes calldata signature)
        external
    {
        require(!used[owner][permit.nonce] && block.timestamp <= permit.deadline);
        bytes32 ph = keccak256(
            abi.encode(
                keccak256("TokenPermissions(address token,uint256 amount)"),
                permit.permitted.token,
                permit.permitted.amount
            )
        );
        bytes32 h = keccak256(
            abi.encode(
                keccak256(
                    "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
                ),
                ph,
                msg.sender,
                permit.nonce,
                permit.deadline
            )
        );
        require(
            ISignature(owner)
                .isValidSignature(keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), h)), signature)
            == 0x1626ba7e
        );
        used[owner][permit.nonce] = true;
        MockToken(permit.permitted.token).transferFrom(owner, msg.sender, permit.permitted.amount);
    }
}

contract MockHelper {
    address public immutable token;
    address public constant permit2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    mapping(address => uint256) public pending;
    mapping(address => uint256) public atBlock;
    bool public enabled = true;

    constructor(address token_) {
        token = token_;
    }

    function depositsPaused() external view returns (bool) {
        return !enabled;
    }

    function setEnabled(bool b) external {
        enabled = b;
    }

    function depositWithPermit2(
        ITransferHelper.PermitTransferFrom calldata permit,
        bytes calldata sig,
        address recipient
    ) external returns (uint256) {
        require(enabled && permit.permitted.token == token);
        MockPermit2(permit2).move(msg.sender, permit, sig);
        pending[recipient] += permit.permitted.amount;
        atBlock[recipient] = block.number;
        return pending[recipient];
    }

    function claim(address recipient) external {
        require(block.number > atBlock[recipient]);
        uint256 amount = pending[recipient];
        pending[recipient] = 0;
        MockToken(token).transfer(recipient, amount);
    }
}

contract MockRewards {
    address public fwa;
    address public immutable token;
    address public immutable tokenPoolManager;
    address public immutable tokenHook;
    uint256 public builderRewardBps = 1500;
    mapping(address => uint256) public tokenBuyAllowance;
    mapping(address => mapping(uint256 => uint256)) public epochAmount;

    constructor(MockToken t) {
        token = address(t);
        tokenPoolManager = t.poolManager();
        tokenHook = t.hook();
    }

    function setFWA(address p) external {
        fwa = p;
    }

    function accrue(address who, uint256 value) external {
        tokenBuyAllowance[who] += value;
    }

    function grantEpoch(address who, uint256 epoch, uint256 amount) external {
        epochAmount[who][epoch] += amount;
    }

    function claimAccruedTokens(uint256 minOut) external returns (uint256 amount) {
        amount = tokenBuyAllowance[msg.sender] * 100;
        require(amount >= minOut && amount != 0);
        tokenBuyAllowance[msg.sender] = 0;
        MockToken(token).mint(msg.sender, amount);
    }

    function claimEpochTokens(uint256[] calldata epochs) external returns (uint256 amount) {
        for (uint256 i; i < epochs.length; ++i) {
            amount += epochAmount[msg.sender][epochs[i]];
            delete epochAmount[msg.sender][epochs[i]];
        }
        require(amount > 0);
        MockToken(token).mint(msg.sender, amount);
    }

    function withdrawTokenBuyAllowanceAsETH() external pure returns (uint256) {
        revert("mock exit disabled");
    }
}

contract MockFWA {
    address public immutable token;
    address public immutable rewards;
    MockNFT public immutable nft;
    uint256 public fee = 0.009 ether;
    uint256 public vrfFee = 0.001 ether;
    uint256 public settlementWindow = 1 hours;
    uint256 public finalizeWindow = 2 hours;
    uint256 public selectionTimeoutBlocks = 30;
    uint256 public weightedBackingTotal = 100 ether;
    uint256 public activeListingCount = 10000;
    bool public isPurchaseBlackout;
    uint256 public count;
    uint256 public listingCount;
    uint256 public refundOnAcquire;
    uint256 public processCursor = 1;
    mapping(uint256 => IFWA.Acquisition) private acq;
    mapping(uint256 => IFWA.Listing) private listed;
    mapping(uint256 => address) public builder;
    mapping(address => uint256) public acquisitionRefundCredit;
    mapping(uint256 => address) public stuckNFTRecipient;

    constructor(MockRewards r, MockNFT n) {
        token = r.token();
        rewards = address(r);
        nft = n;
    }

    function setQuote(uint256 fee_, uint256 vrf_) external {
        fee = fee_;
        vrfFee = vrf_;
    }

    function setInventory(uint256 n) external {
        activeListingCount = n;
    }

    function setBlackout(bool value) external {
        isPurchaseBlackout = value;
    }

    function setRefund(uint256 amount) external {
        refundOnAcquire = amount;
    }

    function quoteAcquisitionPrice() external view returns (uint256, uint256, uint256) {
        return (fee, vrfFee, fee + vrfFee);
    }

    function acquisitions(uint256 id) external view returns (IFWA.Acquisition memory) {
        return acq[id];
    }

    function listings(uint256 id) external view returns (IFWA.Listing memory) {
        return listed[id];
    }

    function acquire(address purchaser, uint256 n, uint256 maxFee, uint256 minValue, uint256 slip)
        external
        payable
        returns (uint256[] memory ids)
    {
        require(
            !isPurchaseBlackout && activeListingCount > 0 && n > 0 && n <= 8 && maxFee >= fee
                && minValue <= weightedBackingTotal && slip <= 10000
        );
        require(msg.value >= (fee + vrfFee) * n && purchaser != msg.sender);
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            uint256 id = ++count;
            ids[i] = id;
            acq[id] = IFWA.Acquisition(purchaser, block.number, fee, 0, 1);
            builder[id] = msg.sender;
        }
        uint256 overpayment = msg.value - (fee + vrfFee) * n + refundOnAcquire;
        if (overpayment > 0) {
            (bool ok,) = msg.sender.call{value: overpayment}("");
            require(ok);
        }
    }

    function allocate(uint256 id, uint256 backing) external returns (uint256 listingId) {
        IFWA.Acquisition storage a = acq[id];
        require(a.status == 1);
        listingId = ++listingCount;
        nft.mint(address(this), listingId);
        listed[listingId] = IFWA.Listing(
            address(nft),
            address(this),
            a.purchaser,
            listingId,
            1,
            backing,
            0,
            0,
            0,
            uint64(block.timestamp),
            2
        );
        a.status = 2;
        a.listingId = listingId;
        MockRewards(rewards).accrue(builder[id], a.priceEscrowed / 1000);
    }

    function refund(uint256 id) public {
        IFWA.Acquisition storage a = acq[id];
        require(a.status == 1 || a.status == 6);
        a.status = 4;
        acquisitionRefundCredit[a.purchaser] += a.priceEscrowed;
    }

    function processAcquisitions(uint256 maxCount) external returns (uint256 processed) {
        for (; processCursor <= count && processed < maxCount; ++processCursor) {
            IFWA.Acquisition storage a = acq[processCursor];
            if (a.status == 1 && block.number <= a.requestBlock + selectionTimeoutBlocks) break;
            if (a.status == 1 || a.status == 6) {
                refund(processCursor);
                acq[processCursor].status = 3;
            }
            ++processed;
        }
    }

    function withdrawAcquisitionRefund() external returns (uint256 amount) {
        amount = acquisitionRefundCredit[msg.sender];
        require(amount > 0);
        acquisitionRefundCredit[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }

    function keepNFT(uint256 id) external {
        IFWA.Listing storage l = listed[id];
        require(msg.sender == l.purchaser && l.status == 2);
        l.status = 4;
        nft.safeTransferFrom(address(this), l.purchaser, l.tokenId);
    }

    function acceptDepositorBid(uint256 id) external {
        IFWA.Listing storage l = listed[id];
        require(msg.sender == l.purchaser && l.status == 2);
        _cashout(l);
    }

    function forcedCashout(uint256 id) external {
        IFWA.Listing storage l = listed[id];
        require(l.status == 2 && block.timestamp >= l.allocatedAt + settlementWindow);
        _cashout(l);
    }

    function _cashout(IFWA.Listing storage l) internal {
        l.status = 4;
        (bool ok,) = l.purchaser.call{value: l.value * 9 / 10}("");
        require(ok);
    }

    function finalizeUnsettled(uint256 id) external {
        IFWA.Listing storage l = listed[id];
        require(l.status == 2 && block.timestamp >= l.allocatedAt + finalizeWindow);
        l.status = 4;
        try nft.safeTransferFrom(address(this), l.purchaser, l.tokenId) {}
        catch {
            stuckNFTRecipient[id] = l.purchaser;
        }
    }

    function recoverStuckNFT(uint256 id) external {
        require(stuckNFTRecipient[id] == msg.sender);
        delete stuckNFTRecipient[id];
        nft.safeTransferFrom(address(this), msg.sender, listed[id].tokenId);
    }
    receive() external payable {}
}

contract MockVRF {
    uint256 public requests;
    uint96 public funding = 1 ether;
    address public consumer;
    mapping(uint256 => address) public requestConsumer;
    mapping(uint256 => bytes32) public requestHash;

    function setConsumer(address who) external {
        consumer = who;
    }

    function setFunding(uint96 amount) external {
        funding = amount;
    }

    function getSubscription(uint256)
        external
        view
        returns (uint96, uint96, uint64, address, address[] memory a)
    {
        a = new address[](1);
        a[0] = consumer;
        return (funding, funding, 0, address(this), a);
    }

    function requestRandomWords(IVRF.Request calldata r) external returns (uint256 id) {
        require(msg.sender == consumer && funding > 0 && r.numWords == 1 && r.subId != 0);
        require(bytes4(r.extraArgs) == bytes4(keccak256("VRF ExtraArgsV1")));
        id = ++requests;
        requestConsumer[id] = msg.sender;
        requestHash[id] = keccak256(abi.encode(r));
    }

    function fulfill(uint256 id, uint256 word) external {
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        IRandomReceiver(requestConsumer[id]).rawFulfillRandomWords(id, words);
    }
}
