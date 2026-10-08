// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {SorpheraVault} from "./SorpheraVault.sol";
import {SorpheraRouter} from "./SorpheraRouter.sol";

/// @notice Deploys ordinary immutable round vaults, never proxies or delegatecall clones.
contract SorpheraVaultFactory {
    SorpheraRouter public immutable router;
    event VaultCreated(address indexed lottery, uint8 indexed game, uint256 indexed round, address vault);

    constructor(address router_) {
        require(router_.code.length != 0, "Sorphera: router");
        router = SorpheraRouter(payable(router_));
    }

    function create(uint8 game, uint256 round, SorpheraVault.Settings calldata settings)
        external
        returns (SorpheraVault vault)
    {
        router.validate(router.pool());
        vault = new SorpheraVault(msg.sender, router, game, round, settings);
        emit VaultCreated(msg.sender, game, round, address(vault));
    }
}
