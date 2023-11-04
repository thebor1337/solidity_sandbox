// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MerkleTree {
    function verify(
        uint256 amount,
        bytes32 root,
        bytes32[] memory proof
    ) external view returns(bool) {
        bytes32 computedHash = getLeaf(msg.sender, amount);
        for (uint256 i = 0; i < proof.length; i++){
            computedHash = hashPair(computedHash, proof[i]);
        }

        return computedHash == root;
    }

    function hashPair(bytes32 a, bytes32 b) public pure returns(bytes32) {
        if (a < b) {
            return keccak256(abi.encode(a, b));
        }
        return keccak256(abi.encode(b, a));
    }

    function getLeaf(address account, uint256 amount) public pure returns(bytes32) {
        return keccak256(abi.encodePacked(account, amount));
    }
}
