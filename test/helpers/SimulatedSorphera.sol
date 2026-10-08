// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Sorphera} from "../../src/Sorphera.sol";

/// @dev Offline simulation only. Production Sorphera always verifies published network bindings.
contract SimulatedSorphera is Sorphera {
    constructor(address owner_, address factory_, address coordinator_)
        Sorphera(owner_, factory_, coordinator_)
    {}

    function _validateNetwork(RandomConfig memory) internal view override {
        require(block.chainid == 31337 && block.chainid == deploymentChainId, "simulation chain only");
    }
}
