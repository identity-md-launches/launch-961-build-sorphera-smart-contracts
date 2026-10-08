// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Public VRF v2.5 bindings. Subscription IDs remain owner supplied.
library Networks {
    address internal constant MAINNET_COORDINATOR = 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a;
    address internal constant SEPOLIA_COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    address internal constant MAINNET_POOL = 0x958C41181182e76F221331b2755b77D9e1426A98;

    function validate(uint256 chain, address coordinator, bytes32 key) internal pure {
        bool valid;
        if (chain == 1) {
            valid = coordinator == MAINNET_COORDINATOR
                && (key == 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9
                    || key == 0x3fd2fec10d06ee8f65e7f2e95f5c56511359ece3f33960ad8a866ae24a8ff10b
                    || key == 0xc6bf2e7b88e5cfbb4946ff23af846494ae1f3c65270b79ee7876c9aa99d3d45f);
        } else if (chain == 11155111) {
            valid = coordinator == SEPOLIA_COORDINATOR
                && key == 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;
        }
        require(valid, "Sorphera: network configuration");
    }
}
