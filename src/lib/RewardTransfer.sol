// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IFWAToken, IPermit2, ITransferHelper} from "../interfaces/External.sol";

/// @notice Narrow Permit2 authorization, following FWA's builder example. No general signature authority.
abstract contract RewardTransfer {
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 public transferNonce;
    bytes32 private activePermit;
    event RewardQueued(address indexed token, address indexed recipient, uint256 amount, uint256 nonce);

    function _queue(address token, address helper, address recipient, uint256 amount, uint256 deadline)
        internal
    {
        require(
            recipient != address(0) && recipient != address(this) && recipient != helper,
            "Sorphera: recipient"
        );
        require(amount != 0 && block.timestamp <= deadline, "Sorphera: reward bounds");
        uint256 nonce = transferNonce++;
        bytes32 permissionsHash =
            keccak256(abi.encode(keccak256("TokenPermissions(address token,uint256 amount)"), token, amount));
        bytes32 permitHash = keccak256(
            abi.encode(
                keccak256(
                    "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
                ),
                permissionsHash,
                helper,
                nonce,
                deadline
            )
        );
        activePermit =
            keccak256(abi.encodePacked("\x19\x01", IPermit2(PERMIT2).DOMAIN_SEPARATOR(), permitHash));
        ITransferHelper(helper)
            .depositWithPermit2(
                ITransferHelper.PermitTransferFrom(
                    ITransferHelper.TokenPermissions(token, amount), nonce, deadline
                ),
                "",
                recipient
            );
        delete activePermit;
        emit RewardQueued(token, recipient, amount, nonce);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return msg.sender == PERMIT2 && signature.length == 0 && activePermit != bytes32(0)
            && hash == activePermit
            ? bytes4(0x1626ba7e)
            : bytes4(0xffffffff);
    }
}
