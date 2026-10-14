// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Sorphera} from "./Sorphera.sol";
import {Guard} from "./lib/Security.sol";

/// @title Sorphera Passport — buy 12 paid tickets, earn 1 free
/// @notice One qualifying paid ticket earns one stamp once its own round reaches Won or Rolled. Every
///         twelve stamps earn one reward; remainders carry across purchases, weeks and both games. A reward
///         is one zero-price entry in an open qualifying round. Rewards redeemed into a round that is later
///         cancelled are restored exactly once. No expiry, cap, enrollment, admin grant or transfer.
/// @dev Holds no ETH and no tickets. The lottery records paid/reward entries per wallet/game/round; this
///      contract derives all credit from those counts after the round is terminal, each round at most once.
contract SorpheraPassport is Guard {
    uint256 public constant STAMPS_PER_REWARD = 12;
    uint256 public constant MAX_PROCESS = 50;

    struct RoundKey {
        uint8 game;
        uint256 round;
    }

    struct Progress {
        uint256 finalizedPaid;
        uint256 redeemed;
        uint256 restored;
    }

    /// @notice 0 pending (round not terminal), 1 credited paid stamps, 2 restored rewards (cancelled),
    ///         3 ineligible (other frozen price or round without entries by this wallet).
    enum Outcome {
        Pending,
        Credited,
        Restored,
        Ineligible
    }

    Sorphera public immutable lottery;
    /// @notice The one frozen round price that earns stamps and accepts reward entries. Immutable.
    uint256 public immutable qualifyingPrice;
    mapping(address => Progress) private progressOf;
    mapping(address => mapping(uint8 => mapping(uint256 => Outcome))) public processed;

    event StampsCredited(
        address indexed wallet, uint8 indexed game, uint256 indexed round, uint256 paid, uint256 finalizedPaid
    );
    event RewardsRestored(address indexed wallet, uint8 indexed game, uint256 indexed round, uint256 count);
    event RoundIneligible(address indexed wallet, uint8 indexed game, uint256 indexed round, uint256 price);
    event RewardsRedeemed(
        address indexed wallet,
        uint8 indexed game,
        uint256 indexed round,
        uint256 count,
        uint256 firstRewardTicket,
        uint256 lastRewardTicket
    );

    constructor(address lottery_, uint256 qualifyingPrice_) {
        require(lottery_ != address(0), "Sorphera: lottery");
        require(qualifyingPrice_ != 0, "Sorphera: qualifying price");
        lottery = Sorphera(lottery_);
        qualifyingPrice = qualifyingPrice_;
    }

    // ----------------------------------------------------------------------------------------------
    // Finalization and restoration
    // ----------------------------------------------------------------------------------------------

    /// @notice Permissionless, bounded, idempotent. Credits only `wallet`, only from the lottery's own
    ///         per-wallet counts, only for rounds that are terminal, each round at most once.
    /// @return credited The number of rounds that changed state in this call.
    function process(address wallet, RoundKey[] calldata keys)
        external
        nonReentrant
        returns (uint256 credited)
    {
        return _process(wallet, keys);
    }

    function _process(address wallet, RoundKey[] calldata keys) internal returns (uint256 credited) {
        require(wallet != address(0), "Sorphera: wallet");
        require(keys.length <= MAX_PROCESS, "Sorphera: process batch");
        for (uint256 i; i < keys.length; ++i) {
            if (_processOne(wallet, keys[i].game, keys[i].round)) ++credited;
        }
    }

    function _processOne(address wallet, uint8 game, uint256 round) internal returns (bool changed) {
        if (game > 1 || processed[wallet][game][round] != Outcome.Pending) return false;
        Sorphera.Round memory r = lottery.getRound(game, round);
        if (!lottery.isTerminal(r.status)) return false;
        Progress storage p = progressOf[wallet];
        if (r.price != qualifyingPrice) {
            processed[wallet][game][round] = Outcome.Ineligible;
            emit RoundIneligible(wallet, game, round, r.price);
            return true;
        }
        if (r.status == Sorphera.Status.Cancelled) {
            (, uint256 rewards) = lottery.entriesOf(game, round, wallet);
            processed[wallet][game][round] = Outcome.Restored;
            if (rewards != 0) {
                p.restored += rewards;
                emit RewardsRestored(wallet, game, round, rewards);
            }
            return true;
        }
        (uint256 paid,) = lottery.entriesOf(game, round, wallet);
        processed[wallet][game][round] = Outcome.Credited;
        p.finalizedPaid += paid;
        emit StampsCredited(wallet, game, round, paid, p.finalizedPaid);
        return true;
    }

    // ----------------------------------------------------------------------------------------------
    // Redemption
    // ----------------------------------------------------------------------------------------------

    /// @notice Enters `picks` into an open qualifying round. The first `picks.length - rewards` picks are
    ///         paid with `msg.value`; the last `rewards` consume one reward each. `finalizeFirst` lets the
    ///         caller finalize their own terminal rounds in the same transaction. All or nothing.
    function enter(
        uint8 game,
        uint256 id,
        Sorphera.Pick[] calldata picks,
        uint256 rewards,
        RoundKey[] calldata finalizeFirst
    ) external payable nonReentrant {
        _process(msg.sender, finalizeFirst);
        if (rewards != 0) {
            require(
                lottery.getRound(game, id).price == qualifyingPrice, "Sorphera: round price not qualifying"
            );
            Progress storage p = progressOf[msg.sender];
            require(rewards <= _available(p), "Sorphera: insufficient rewards");
            p.redeemed += rewards;
        }
        uint256 last = lottery.getRound(game, id).sold + picks.length;
        lottery.enter{value: msg.value}(msg.sender, game, id, picks, rewards);
        if (rewards != 0) emit RewardsRedeemed(msg.sender, game, id, rewards, last + 1 - rewards, last);
    }

    // ----------------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------------

    function _available(Progress storage p) internal view returns (uint256) {
        return p.finalizedPaid / STAMPS_PER_REWARD + p.restored - p.redeemed;
    }

    /// @notice Authoritative wallet credit. `available` is the spendable reward count.
    function summary(address wallet)
        external
        view
        returns (
            uint256 finalizedPaid,
            uint256 stamps,
            uint256 earned,
            uint256 restored,
            uint256 redeemed,
            uint256 available
        )
    {
        Progress storage p = progressOf[wallet];
        return (
            p.finalizedPaid,
            p.finalizedPaid % STAMPS_PER_REWARD,
            p.finalizedPaid / STAMPS_PER_REWARD,
            p.restored,
            p.redeemed,
            _available(p)
        );
    }

    function availableRewards(address wallet) external view returns (uint256) {
        return _available(progressOf[wallet]);
    }

    function stamps(address wallet) external view returns (uint256) {
        return progressOf[wallet].finalizedPaid % STAMPS_PER_REWARD;
    }

    /// @notice Bounded per-round credit preview. `pendingPaid` is paid entries not yet credited (the round
    ///         is not terminal or not yet processed); `pendingRestore` is rewards that a cancelled round
    ///         would give back. Both are zero once processed. `processable` says `process` would act now.
    function roundCredit(address wallet, uint8 game, uint256 round)
        external
        view
        returns (uint256 pendingPaid, uint256 pendingRestore, bool processable, Outcome outcome)
    {
        outcome = processed[wallet][game][round];
        if (game > 1 || outcome != Outcome.Pending) return (0, 0, false, outcome);
        Sorphera.Round memory r = lottery.getRound(game, round);
        if (r.price != qualifyingPrice) return (0, 0, false, outcome);
        processable = lottery.isTerminal(r.status);
        (uint256 paid, uint256 reward) = lottery.entriesOf(game, round, wallet);
        if (r.status == Sorphera.Status.Cancelled) pendingRestore = reward;
        else pendingPaid = paid;
    }
}
