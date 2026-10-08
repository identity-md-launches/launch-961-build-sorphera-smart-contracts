// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IVRF} from "./interfaces/External.sol";
import {Guard, Owned} from "./lib/Security.sol";
import {Balls} from "./lib/Balls.sol";
import {SorpheraVault} from "./SorpheraVault.sol";
import {SorpheraVaultFactory} from "./SorpheraVaultFactory.sol";

/// @title Sorphera — Weekly ETH & NFT lottery ball jackpots. Powered by FWA.
/// @notice Independent weekly games. Nontransferable entries, indexed matches, claim-based prizes.
contract Sorphera is Guard, Owned {
    uint256 public constant WEEK = 7 days;
    uint256 public constant DEFAULT_PRICE = 0.005 ether;
    uint256 public constant FEE_BPS = 1000;
    uint256 public constant MAX_TICKETS_PER_TX = 100;
    enum Status {
        None,
        Sales,
        Closed,
        Requested,
        RandomReady,
        Won,
        Rolled,
        Cancelled
    }

    struct Rules {
        uint256 price;
        uint256 firstCutoff;
        uint256 drawDelay;
        uint256 settlementDelay;
        uint256 maxFee;
        uint256 maxTotal;
        uint256 minValue;
        uint256 slippage;
    }

    struct RandomConfig {
        uint256 subscription;
        bytes32 keyHash;
        uint16 confirmations;
        uint32 callbackGas;
        bool nativePayment;
    }

    struct Round {
        Status status;
        uint256 group;
        uint256 price;
        uint256 start;
        uint256 cutoff;
        uint256 earliestDraw;
        uint256 settlementDeadline;
        address vault;
        uint256 sold;
        uint256 fees;
        uint256 requestId;
        uint256 requestedAt;
        uint256 randomWord;
        uint8[3] ordered;
        uint8 bonus;
        uint32 winningKey;
        uint256 matches;
        uint256 winningTicket;
        uint256 eligibleNFTs;
        uint256 frozenNFTs;
    }

    struct Group {
        uint256 currentRound;
        uint256 terminalRound;
        uint256 cash;
        uint256 perTicket;
        uint256 divisor;
        uint256 nftCount;
    }

    struct Ticket {
        address player;
        uint32 combination;
    }

    struct Pick {
        uint8[3] main;
        uint8 bonus;
    }

    struct RequestBinding {
        uint8 game;
        uint256 round;
        bool exists;
    }
    SorpheraVaultFactory public immutable factory;
    IVRF public immutable coordinator;
    bool public salesEnabled;
    bool public launchValidated;
    RandomConfig public randomConfig;
    mapping(uint8 => Rules) public futureRules;
    mapping(uint8 => uint256) public latestRound;
    mapping(uint8 => uint256) public currentGroup;
    mapping(uint8 => mapping(uint256 => Round)) private rounds;
    mapping(uint8 => mapping(uint256 => RandomConfig)) public roundRandomConfig;
    mapping(uint8 => mapping(uint256 => Group)) public groups;
    mapping(uint8 => mapping(uint256 => mapping(uint256 => Ticket))) public tickets;
    mapping(uint8 => mapping(uint256 => mapping(uint32 => uint256[]))) private matching;
    mapping(uint256 => RequestBinding) public requests;
    mapping(uint8 => mapping(uint256 => mapping(uint256 => uint256))) public claimedETH;
    mapping(uint8 => mapping(uint256 => uint256)) public releasedFees;
    uint256 public operatorFees;
    uint256 public totalLiabilities;
    event RulesConfigured(uint8 indexed game, Rules rules);
    event RandomnessConfigured(RandomConfig config);
    event SalesEnabled(bool enabled);
    event LaunchValidated();
    event RoundOpened(
        uint8 indexed game,
        uint256 indexed round,
        uint256 indexed group,
        address vault,
        uint256 start,
        uint256 cutoff,
        uint256 earliestDraw,
        uint256 settlementDeadline,
        uint256 price
    );
    event TicketBought(
        uint8 indexed game, uint256 indexed round, uint256 indexed ticket, address player, uint32 combination
    );
    event RoundClosed(uint8 indexed game, uint256 indexed round, uint256 tickets);
    event PrizeCredited(
        uint8 indexed game, uint256 indexed originRound, uint256 indexed group, uint256 amount
    );
    event DrawRequested(
        uint8 indexed game, uint256 indexed round, uint256 indexed requestId, uint256 frozenNFTs
    );
    event RandomnessStored(
        uint8 indexed game, uint256 indexed round, uint256 indexed requestId, uint256 word
    );
    event Result(
        uint8 indexed game,
        uint256 indexed round,
        uint8[3] ordered,
        uint8 bonus,
        uint32 combination,
        uint256 matches,
        uint256 winningTicket
    );
    event Rollover(
        uint8 indexed game, uint256 indexed round, uint256 indexed group, uint256 cash, uint256 NFTs
    );
    event Cancelled(uint8 indexed game, uint256 indexed round, uint256 available, uint256 tickets);
    event Claimed(
        uint8 indexed game, uint256 indexed round, uint256 indexed ticket, address recipient, uint256 amount
    );
    event FeesReleased(uint8 indexed game, uint256 indexed round, uint256 amount);
    event OperatorWithdrawal(address indexed recipient, uint256 amount);
    event DustCarried(uint8 indexed game, uint256 indexed group, uint256 amount);
    event InventoryRecorded(
        uint8 indexed game, uint256 indexed originRound, uint256 indexed group, uint256 count
    );

    constructor(address owner_, address factory_, address coordinator_) Owned(owner_) {
        require(factory_.code.length != 0 && coordinator_.code.length != 0, "Sorphera: dependencies");
        factory = SorpheraVaultFactory(factory_);
        coordinator = IVRF(coordinator_);
        currentGroup[0] = 1;
        currentGroup[1] = 1;
    }

    function name(uint8 game) external pure returns (string memory) {
        _game(game);
        return game == 0 ? "Sorphera ETH Jackpot" : "Sorphera NFT Jackpot";
    }

    function _game(uint8 game) internal pure {
        require(game < 2, "Sorphera: game");
    }

    function configureRules(uint8 game, Rules calldata r) external onlyOwner {
        _game(game);
        require(r.price >= 10 && r.price <= 100 ether && r.price % 10 == 0, "Sorphera: ticket price");
        require(
            r.firstCutoff >= WEEK && r.drawDelay <= r.settlementDelay && r.settlementDelay > 0
                && r.settlementDelay <= 30 days,
            "Sorphera: schedule"
        );
        require(
            r.maxFee > 0 && r.maxTotal >= r.maxFee && r.minValue > 0 && r.slippage <= 1000, "Sorphera: bounds"
        );
        if (latestRound[game] != 0) {
            require(r.firstCutoff == futureRules[game].firstCutoff, "Sorphera: fixed weekly anchor");
        }
        futureRules[game] = r;
        emit RulesConfigured(game, r);
    }

    function configureRandomness(RandomConfig calldata c) external onlyOwner {
        require(
            c.subscription != 0 && c.keyHash != bytes32(0) && c.confirmations >= 3 && c.confirmations <= 200
                && c.callbackGas >= 150000 && c.callbackGas <= 2500000,
            "Sorphera: VRF config"
        );
        randomConfig = c;
        launchValidated = false;
        salesEnabled = false;
        emit RandomnessConfigured(c);
        emit SalesEnabled(false);
    }

    function validateLaunch() external onlyOwner {
        require(block.chainid == 11155111, "Sorphera: Sepolia only");
        factory.router().validate(factory.router().pool());
        _checkFunding(randomConfig);
        require(futureRules[0].price != 0 && futureRules[1].price != 0, "Sorphera: rules not configured");
        launchValidated = true;
        emit LaunchValidated();
    }

    function _checkFunding(RandomConfig memory c) internal view {
        require(c.subscription != 0, "Sorphera: VRF not configured");
        (uint96 link, uint96 nativeBalance,,, address[] memory consumers) =
            coordinator.getSubscription(c.subscription);
        require(c.nativePayment ? nativeBalance > 0 : link > 0, "Sorphera: VRF unfunded");
        bool present;
        for (uint256 i; i < consumers.length; ++i) {
            if (consumers[i] == address(this)) present = true;
        }
        require(present, "Sorphera: VRF consumer missing");
    }

    function setSalesEnabled(bool enabled) external onlyOwner {
        require(!enabled || launchValidated, "Sorphera: launch not validated");
        salesEnabled = enabled;
        emit SalesEnabled(enabled);
    }

    function openRound(uint8 game) external nonReentrant returns (uint256 id) {
        _game(game);
        require(launchValidated, "Sorphera: launch not validated");
        uint256 previous = latestRound[game];
        if (previous != 0) {
            require(uint8(rounds[game][previous].status) >= uint8(Status.Won), "Sorphera: previous unsettled");
        }
        Rules memory rules = futureRules[game];
        require(rules.price != 0, "Sorphera: rules not configured");
        _checkFunding(randomConfig);
        id = previous + 1;
        uint256 cutoff = rules.firstCutoff + previous * WEEK;
        require(block.timestamp >= cutoff - WEEK, "Sorphera: window not started");
        Round storage r = rounds[game][id];
        r.status = Status.Sales;
        r.group = currentGroup[game];
        r.price = rules.price;
        r.start = cutoff - WEEK;
        r.cutoff = cutoff;
        r.earliestDraw = cutoff + rules.drawDelay;
        r.settlementDeadline = cutoff + rules.settlementDelay;
        r.vault = address(
            factory.create(
                game,
                id,
                SorpheraVault.Settings(rules.maxFee, rules.maxTotal, rules.minValue, rules.slippage, cutoff)
            )
        );
        Group storage g = groups[game][r.group];
        g.currentRound = id;
        r.eligibleNFTs = g.nftCount;
        latestRound[game] = id;
        roundRandomConfig[game][id] = randomConfig;
        emit RoundOpened(
            game, id, r.group, r.vault, r.start, cutoff, r.earliestDraw, r.settlementDeadline, r.price
        );
    }

    function buy(uint8 game, uint256 id, Pick[] calldata picks) external payable nonReentrant {
        Round storage r = rounds[game][id];
        require(
            salesEnabled && r.status == Status.Sales && block.timestamp >= r.start
                && block.timestamp < r.cutoff,
            "Sorphera: sales closed"
        );
        require(
            picks.length > 0 && picks.length <= MAX_TICKETS_PER_TX && msg.value == picks.length * r.price,
            "Sorphera: tickets/payment"
        );
        uint256 fee = msg.value / 10;
        r.fees += fee;
        totalLiabilities += fee;
        for (uint256 i; i < picks.length; ++i) {
            uint32 combination = Balls.key(picks[i].main, picks[i].bonus);
            uint256 ticket = ++r.sold;
            tickets[game][id][ticket] = Ticket(msg.sender, combination);
            matching[game][id][combination].push(ticket);
            emit TicketBought(game, id, ticket, msg.sender, combination);
        }
        SorpheraVault(payable(r.vault)).fund{value: msg.value - fee}();
    }

    function acquisitionOpen(uint8 game, uint256 id) external view returns (bool) {
        Round storage r = rounds[game][id];
        return r.status == Status.Sales && block.timestamp < r.cutoff;
    }

    function close(uint8 game, uint256 id) public {
        Round storage r = rounds[game][id];
        require(r.status == Status.Sales && block.timestamp >= r.cutoff, "Sorphera: cannot close");
        r.status = Status.Closed;
        emit RoundClosed(game, id, r.sold);
    }

    function credit(uint8 game, uint256 id) external payable {
        Round storage r = rounds[game][id];
        require(msg.sender == r.vault, "Sorphera: vault only");
        Group storage g = groups[game][r.group];
        g.cash += msg.value;
        totalLiabilities += msg.value;
        if (g.terminalRound != 0) _distribute(game, r.group);
        emit PrizeCredited(game, id, r.group, msg.value);
    }

    function recordNFT(uint8 game, uint256 id) external {
        Round storage r = rounds[game][id];
        require(msg.sender == r.vault, "Sorphera: vault only");
        Group storage g = groups[game][r.group];
        ++g.nftCount;
        Round storage active = rounds[game][g.currentRound];
        if (g.terminalRound == 0 && block.timestamp < active.settlementDeadline) ++active.eligibleNFTs;
        emit InventoryRecorded(game, id, r.group, g.nftCount);
    }

    /// @notice Closes, reconciles and freezes before one immutable lottery request. Zero-ticket rounds skip VRF.
    function requestDraw(uint8 game, uint256 id) external nonReentrant {
        Round storage r = rounds[game][id];
        if (r.status == Status.Sales) close(game, id);
        require(r.status == Status.Closed, "Sorphera: draw state");
        SorpheraVault v = SorpheraVault(payable(r.vault));
        v.syncETH();
        Group storage g = groups[game][r.group];
        if (r.sold == 0) {
            _roll(game, id);
            return;
        }
        if (game == 1 && r.eligibleNFTs == 0 && block.timestamp >= r.settlementDeadline) {
            _cancel(game, id);
            return;
        }
        require(
            block.timestamp >= r.earliestDraw && v.pending() == 0 && v.budget() == 0 && v.refundCredit() == 0,
            "Sorphera: reconciliation/time"
        );
        require(game == 0 || (r.eligibleNFTs != 0 && g.nftCount != 0), "Sorphera: no secured NFT");
        r.frozenNFTs = g.nftCount;
        r.status = Status.Requested;
        r.requestedAt = block.timestamp;
        RandomConfig memory c = roundRandomConfig[game][id];
        uint256 requestId = coordinator.requestRandomWords(
            IVRF.Request(
                c.keyHash,
                c.subscription,
                c.confirmations,
                c.callbackGas,
                1,
                abi.encodeWithSelector(bytes4(keccak256("VRF ExtraArgsV1")), c.nativePayment)
            )
        );
        require(requestId != 0 && !requests[requestId].exists, "Sorphera: duplicate VRF request");
        r.requestId = requestId;
        requests[requestId] = RequestBinding(game, id, true);
        emit DrawRequested(game, id, requestId, r.frozenNFTs);
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata words) external {
        require(msg.sender == address(coordinator), "Sorphera: coordinator only");
        RequestBinding memory b = requests[requestId];
        require(b.exists && words.length == 1, "Sorphera: unknown callback");
        Round storage r = rounds[b.game][b.round];
        require(r.status == Status.Requested && r.requestId == requestId, "Sorphera: stale callback");
        r.randomWord = words[0];
        r.status = Status.RandomReady;
        emit RandomnessStored(b.game, b.round, requestId, words[0]);
    }

    function seedFor(uint8 game, uint256 id, uint256 word) public view returns (bytes32) {
        return keccak256(abi.encode("Sorphera lottery v1", block.chainid, address(this), game, id, word));
    }

    function finalize(uint8 game, uint256 id) external nonReentrant {
        Round storage r = rounds[game][id];
        require(r.status == Status.RandomReady, "Sorphera: randomness not ready");
        bytes32 seed = seedFor(game, id, r.randomWord);
        (r.ordered, r.bonus, r.winningKey) = Balls.draw(seed);
        r.matches = matching[game][id][r.winningKey].length;
        if (r.matches == 0) {
            _releaseFees(game, id);
            _roll(game, id);
        } else {
            r.status = Status.Won;
            if (game == 1) {
                uint256 index =
                    Balls.uniform(seed, keccak256("Sorphera NFT matching ticket tie-break v1"), r.matches);
                r.winningTicket = matching[game][id][r.winningKey][index];
            }
            Group storage g = groups[game][r.group];
            g.terminalRound = id;
            g.divisor = game == 0 ? r.matches : 1;
            ++currentGroup[game];
            _releaseFees(game, id);
            _distribute(game, r.group);
        }
        emit Result(game, id, r.ordered, r.bonus, r.winningKey, r.matches, r.winningTicket);
    }

    function _roll(uint8 game, uint256 id) internal {
        Round storage r = rounds[game][id];
        r.status = Status.Rolled;
        Group storage g = groups[game][r.group];
        emit Rollover(game, id, r.group, g.cash, g.nftCount);
    }

    function _cancel(uint8 game, uint256 id) internal {
        Round storage r = rounds[game][id];
        r.status = Status.Cancelled;
        Group storage g = groups[game][r.group];
        g.terminalRound = id;
        g.divisor = r.sold;
        g.cash += r.fees;
        r.fees = 0;
        ++currentGroup[game];
        emit Cancelled(game, id, g.cash, r.sold);
        _distribute(game, r.group);
    }

    function _releaseFees(uint8 game, uint256 id) internal {
        Round storage r = rounds[game][id];
        releasedFees[game][id] = r.fees;
        emit FeesReleased(game, id, r.fees);
        operatorFees += r.fees;
        r.fees = 0;
    }

    function _distribute(uint8 game, uint256 group) internal {
        Group storage g = groups[game][group];
        uint256 share = g.cash / g.divisor;
        g.perTicket += share;
        g.cash -= share * g.divisor;
        // Cancelled refunds retain remainder for future recovery accumulation. Winning ETH dust rolls.
        if (rounds[game][g.terminalRound].status == Status.Won && g.cash != 0) {
            uint256 dust = g.cash;
            g.cash = 0;
            groups[game][currentGroup[game]].cash += dust;
            emit DustCarried(game, currentGroup[game], dust);
        }
    }

    function entitlement(uint8 game, uint256 origin, uint256 ticket, address claimant)
        public
        view
        returns (uint256 count)
    {
        Group storage g = groups[game][rounds[game][origin].group];
        uint256 terminal = g.terminalRound;
        require(terminal != 0, "Sorphera: prize not finalized");
        Round storage r = rounds[game][terminal];
        Ticket storage t = tickets[game][terminal][ticket];
        require(t.player == claimant && claimant != address(0), "Sorphera: ticket owner");
        if (r.status == Status.Won) {
            require(
                t.combination == r.winningKey && (game == 0 || ticket == r.winningTicket),
                "Sorphera: not winning ticket"
            );
        } else {
            require(r.status == Status.Cancelled, "Sorphera: prize state");
        }
        return g.divisor;
    }

    function claimETH(uint8 game, uint256 origin, uint256[] calldata ids, address recipient)
        external
        nonReentrant
    {
        require(ids.length > 0 && ids.length <= 100, "Sorphera: claim batch");
        uint256 group = rounds[game][origin].group;
        Group storage g = groups[game][group];
        uint256 amount;
        for (uint256 i; i < ids.length; ++i) {
            entitlement(game, origin, ids[i], msg.sender);
            uint256 delta = g.perTicket - claimedETH[game][group][ids[i]];
            claimedETH[game][group][ids[i]] = g.perTicket;
            amount += delta;
        }
        require(amount != 0, "Sorphera: nothing to claim");
        totalLiabilities -= amount;
        _send(recipient, amount);
        emit Claimed(game, g.terminalRound, ids[0], recipient, amount);
    }

    function withdrawOperator(address recipient, uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0 && amount <= operatorFees, "Sorphera: reserved funds");
        operatorFees -= amount;
        totalLiabilities -= amount;
        _send(recipient, amount);
        emit OperatorWithdrawal(recipient, amount);
    }

    function getRound(uint8 game, uint256 id) external view returns (Round memory) {
        return rounds[game][id];
    }

    function groupOf(uint8 game, uint256 id) external view returns (uint256) {
        return rounds[game][id].group;
    }

    function matchCount(uint8 game, uint256 id, uint32 combination) external view returns (uint256) {
        return matching[game][id][combination].length;
    }

    function matchingTicket(uint8 game, uint256 id, uint32 combination, uint256 index)
        external
        view
        returns (uint256)
    {
        return matching[game][id][combination][index];
    }

    function combinationKey(uint8[3] calldata main, uint8 bonus) external pure returns (uint32) {
        return Balls.key(main, bonus);
    }
}
