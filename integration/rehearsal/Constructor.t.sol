// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {Sorphera} from "../../src/Sorphera.sol";
import {SorpheraRouter} from "../../src/SorpheraRouter.sol";
import {SorpheraVaultFactory} from "../../src/SorpheraVaultFactory.sol";

/// @notice Run on empty state to reproduce a missing production coordinator, or real Sepolia fork to succeed.
contract ConstructorRehearsalTest is Test {
    address constant COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    event Resolved(
        string name,
        address owner,
        address dependency,
        address coordinator,
        uint256 chain,
        uint256 blockNumber,
        uint256 dependencyCode,
        uint256 coordinatorCode
    );

    function testResolvedManifestConstructorOrder() public {
        address owner = makeAddr("explicit rehearsal owner; not a deployment input");
        SorpheraRouter router = new SorpheraRouter(owner);
        emit Resolved(
            "SorpheraVaultFactory",
            owner,
            address(router),
            COORDINATOR,
            block.chainid,
            block.number,
            address(router).code.length,
            COORDINATOR.code.length
        );
        SorpheraVaultFactory factory = new SorpheraVaultFactory(address(router), owner);
        emit Resolved(
            "Sorphera",
            owner,
            address(factory),
            COORDINATOR,
            block.chainid,
            block.number,
            address(factory).code.length,
            COORDINATOR.code.length
        );
        if (COORDINATOR.code.length == 0) {
            vm.expectRevert(
                abi.encodeWithSelector(Sorphera.MissingCoordinatorCode.selector, COORDINATOR, block.chainid)
            );
            new Sorphera(owner, address(factory), COORDINATOR);
        } else {
            require(block.chainid == 11155111, "wrong fork");
            Sorphera lottery = new Sorphera(owner, address(factory), COORDINATOR);
            assertEq(lottery.owner(), owner);
            assertFalse(lottery.salesEnabled());
            vm.prank(owner);
            factory.setLottery(address(lottery));
            assertEq(factory.lottery(), address(lottery));
        }
    }
}
