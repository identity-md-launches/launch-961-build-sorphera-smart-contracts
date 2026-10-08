// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {SorpheraVault} from "./SorpheraVault.sol";
import {SorpheraRouter} from "./SorpheraRouter.sol";
import {Owned} from "./lib/Security.sol";

/// @notice Deploys ordinary immutable round vaults, never proxies or delegatecall clones.
/// @dev Only the one registered lottery can create vaults, so `VaultCreated` is a trustworthy
///      discovery index. The lottery is deployed after the factory, so the owner binds it once.
contract SorpheraVaultFactory is Owned {
    SorpheraRouter public immutable router;
    address public lottery;
    event LotteryRegistered(address indexed lottery);
    event VaultCreated(address indexed lottery, uint8 indexed game, uint256 indexed round, address vault);

    constructor(address router_, address owner_) Owned(owner_) {
        require(router_.code.length != 0, "Sorphera: router");
        router = SorpheraRouter(payable(router_));
    }

    function setLottery(address lottery_) external onlyOwner {
        require(lottery == address(0), "Sorphera: lottery bound");
        require(lottery_.code.length != 0, "Sorphera: lottery code");
        lottery = lottery_;
        emit LotteryRegistered(lottery_);
    }

    function create(uint8 game, uint256 round, SorpheraVault.Settings calldata settings)
        external
        returns (SorpheraVault vault)
    {
        require(lottery != address(0), "Sorphera: lottery not bound");
        require(msg.sender == lottery, "Sorphera: lottery only");
        router.validate(router.pool());
        vault = new SorpheraVault(msg.sender, router, game, round, settings);
        emit VaultCreated(msg.sender, game, round, address(vault));
    }
}
