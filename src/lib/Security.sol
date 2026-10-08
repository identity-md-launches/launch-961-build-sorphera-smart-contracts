// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

abstract contract Guard {
    uint256 private entered;
    modifier nonReentrant() {
        require(entered == 0, "Sorphera: reentrancy");
        entered = 1;
        _;
        entered = 0;
    }

    function _send(address to, uint256 amount) internal {
        require(to != address(0) && to != address(this), "Sorphera: recipient");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "Sorphera: ETH rejected");
    }
}

abstract contract Owned {
    address public owner;
    address public pendingOwner;
    event OwnershipProposed(address indexed next);
    event OwnershipAccepted(address indexed owner);

    constructor(address owner_) {
        require(owner_ != address(0), "Sorphera: owner");
        owner = owner_;
    }
    modifier onlyOwner() {
        require(msg.sender == owner, "Sorphera: owner only");
        _;
    }

    function proposeOwner(address next) external onlyOwner {
        require(next != address(0), "Sorphera: owner");
        pendingOwner = next;
        emit OwnershipProposed(next);
    }

    function acceptOwner() external {
        require(msg.sender == pendingOwner, "Sorphera: pending owner");
        owner = msg.sender;
        delete pendingOwner;
        emit OwnershipAccepted(msg.sender);
    }
}
