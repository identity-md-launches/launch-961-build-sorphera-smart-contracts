// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script} from "forge-std/Script.sol";
import {Sorphera} from "../src/Sorphera.sol";
import {SorpheraRouter} from "../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../src/SorpheraVaultFactory.sol";
import {Networks} from "../src/lib/Networks.sol";

/// @notice Local fork rehearsal only. No broadcast calls or keys. Owner is an explicit input.
contract Rehearse is Script {
    event Resolved(
        uint256 chain,
        uint256 blockNumber,
        address owner,
        address router,
        address factory,
        address coordinator,
        address lottery
    );

    function run(uint256 expectedChain, address owner, address coordinator, bytes32 keyHash)
        external
        returns (SorpheraRouter router, SorpheraVaultFactory factory, Sorphera lottery)
    {
        require(block.chainid == expectedChain && owner != address(0), "rehearsal inputs");
        Networks.validate(expectedChain, coordinator, keyHash);
        router = new SorpheraRouter(owner);
        factory = new SorpheraVaultFactory(address(router), owner);
        lottery = new Sorphera(owner, address(factory), coordinator);
        vm.prank(owner);
        factory.setLottery(address(lottery));
        require(!lottery.salesEnabled(), "sales must remain disabled");
        emit Resolved(
            block.chainid,
            block.number,
            owner,
            address(router),
            address(factory),
            coordinator,
            address(lottery)
        );
    }
}
