// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

library Balls {
    function key(uint8[3] memory input, uint8 bonus) internal pure returns (uint32) {
        uint8[3] memory a = [input[0], input[1], input[2]];
        require(bonus >= 1 && bonus <= 5, "Sorphera: bonus");
        for (uint256 i; i < 3; ++i) {
            require(a[i] >= 1 && a[i] <= 20, "Sorphera: ball");
        }
        if (a[0] > a[1]) (a[0], a[1]) = (a[1], a[0]);
        if (a[1] > a[2]) (a[1], a[2]) = (a[2], a[1]);
        if (a[0] > a[1]) (a[0], a[1]) = (a[1], a[0]);
        require(a[0] != a[1] && a[1] != a[2], "Sorphera: distinct balls");
        return uint32(a[0]) | (uint32(a[1]) << 5) | (uint32(a[2]) << 10) | (uint32(bonus) << 15);
    }

    // Rejection sampling removes modulo bias. Counter/hash expansion is domain separated.
    function uniform(bytes32 seed, bytes32 domain, uint256 n) internal pure returns (uint256) {
        require(n != 0, "Sorphera: empty sample");
        uint256 threshold = (type(uint256).max - n + 1) % n;
        for (uint256 counter;; ++counter) {
            uint256 x = uint256(keccak256(abi.encode(seed, domain, counter)));
            if (x >= threshold) return x % n;
        }
        revert("unreachable");
    }

    function draw(bytes32 seed)
        internal
        pure
        returns (uint8[3] memory ordered, uint8 bonus, uint32 combination)
    {
        uint8[20] memory bag;
        for (uint8 i; i < 20; ++i) {
            bag[i] = i + 1;
        }
        for (uint256 i; i < 3; ++i) {
            uint256 index = uniform(seed, bytes32(i + 1), 20 - i);
            ordered[i] = bag[index];
            bag[index] = bag[19 - i];
        }
        bonus = uint8(uniform(seed, keccak256("Sorphera bonus"), 5) + 1);
        combination = key(ordered, bonus);
    }
}
