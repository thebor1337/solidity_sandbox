// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IERC6551Registry.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

library ERC6551BytecodeLib {
    function getCreatingCode(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3",
            abi.encode(salt, chainId, tokenContract, tokenId)
        );
    }
}

contract ERC6551Registry is IERC6551Registry {
    error AccountCreatingFailed();

    function createAccount(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt,
        bytes calldata initData
    ) external returns (address) {
        
        bytes memory code = ERC6551BytecodeLib.getCreatingCode(
            implementation, 
            chainId, 
            tokenContract, 
            tokenId, 
            salt
        );

        address _account = Create2.computeAddress(bytes32(salt), keccak256(code));
        if (_account.code.length != 0) return _account;

        assembly {
            _account := create2(0, add(code, 0x20), mload(code), salt)
        }

        if (initData.length != 0) {
            (bool success, bytes memory result) = _account.call(initData);
            if (!success) {
                assembly {
                    revert(add(result, 0x20), mload(result))
                }
            }
        }

        emit AccountCreated(_account, implementation, chainId, tokenContract, tokenId, salt);

        return _account;
    }

    function account(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) external view override returns (address) {
        bytes32 bytecodeHash = keccak256(
            ERC6551BytecodeLib.getCreatingCode(
                implementation, 
                chainId, 
                tokenContract, 
                tokenId, 
                salt
            )
        );

        return Create2.computeAddress(bytes32(salt), bytecodeHash);
    }
}