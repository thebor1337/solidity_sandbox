// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CommitRevealPattern is Ownable {
    address[] public candidates;

    mapping(address => bytes32) public commits;
    mapping(address => uint256) public votes;
    bool votingStopped;

    constructor(address[] memory _candidates) {
        candidates = _candidates;
    }

    function commitVote(bytes32 _hashedVote) external {
        require(!votingStopped, "Voting stopped");
        require(commits[msg.sender] == bytes32(0), "Already voted");
        commits[msg.sender] = _hashedVote;
    }

    function revealVote(address _candidate, bytes32 _secret) external {
        require(votingStopped, "Voting not stopped");
        bytes32 _hashedVote = keccak256(abi.encodePacked(_candidate, _secret, msg.sender));
        require(commits[msg.sender] == _hashedVote, "Vote not committed");
        delete commits[msg.sender];
        votes[_candidate]++;
    }

    function stopVoting() external onlyOwner {
        require(!votingStopped, "Voting already stopped");
        votingStopped = true;
    }
}