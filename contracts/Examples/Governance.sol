// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleGovernance {

    uint public constant MINIMAL_TOKENS_TO_PROPOSE = 1;
    uint public constant VOTING_START_DELAY = 10;
    uint public constant VOTING_DURATION = 60;

    struct ProposalVote {
        uint againstVotes;
        uint forVotes;
        uint abstainVotes;
        mapping(address => bool) hasVoted;
    }

    struct Proposal {
        uint votingStarts;
        uint votingEnds;
        bool executed;
    }

    enum ProposalState { Pending, Active, Succeeded, Defeated, Executed }

    IERC20 public token;
    
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => ProposalVote) public proposalVotes;

    constructor(IERC20 _token) {
        token = _token;
    }

    function propose(
        address _to,
        uint256 _value,
        string calldata _func,
        bytes calldata _data,
        string calldata _description
    ) external returns(bytes32) {
        require(token.balanceOf(msg.sender) > MINIMAL_TOKENS_TO_PROPOSE, "Not enough tokens");
        bytes32 proposalId = _generateProposalId(
            _to, _value, _func, _data, keccak256(bytes(_description))
        );
        require(proposals[proposalId].votingStarts == 0, "Proposal already exists");

        proposals[proposalId] = Proposal({
            votingStarts: block.timestamp + VOTING_START_DELAY,
            votingEnds: block.timestamp + VOTING_START_DELAY + VOTING_DURATION,
            executed: false
        });

        return proposalId;
    }

    function execute(
        address _to,
        uint256 _value,
        string calldata _func,
        bytes calldata _data,
        string calldata _description
    ) external  returns(bytes memory) {
        bytes32 proposalId = _generateProposalId(
            _to, _value, _func, _data, keccak256(bytes(_description))
        );
        require(state(proposalId) == ProposalState.Succeeded, "Proposal is not succeeded");
        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        bytes memory data;
        if (bytes(_func).length > 0) {
            data = abi.encodePacked(
                bytes4(keccak256(bytes(_func))), 
                _data
            );
        } else {
            data = _data;
        }

        (bool success, bytes memory response) = _to.call{value: _value}(data);
        require(success, "Execution failed");

        return response;
    }

    function vote(bytes32 _proposalId, uint8 _voteType) external {
        require(state(_proposalId) == ProposalState.Active, "Proposal is not active");
        uint votingPower = token.balanceOf(msg.sender);
        require(votingPower > 0, "No voting power");
        ProposalVote storage proposalVote = proposalVotes[_proposalId];
        require(!proposalVote.hasVoted[msg.sender], "Already voted");

        if (_voteType == 0) {
            proposalVote.againstVotes += votingPower;
        } else if (_voteType == 1) {
            proposalVote.forVotes += votingPower;
        } else {
            proposalVote.abstainVotes += votingPower;
        }

        proposalVote.hasVoted[msg.sender] = true;
    }

    function state(bytes32 _proposalId) public view returns(ProposalState) {
        Proposal storage proposal = proposals[_proposalId];
        require(proposal.votingStarts > 0, "Proposal does not exist");

        if (proposal.executed) {
            return ProposalState.Executed;
        }
        
        if (proposal.votingStarts > block.timestamp) {
            return ProposalState.Pending;
        }

        if (proposal.votingEnds < block.timestamp) {
            return ProposalState.Active;
        }

        ProposalVote storage proposalVote = proposalVotes[_proposalId];

        if (proposalVote.forVotes > proposalVote.againstVotes) {
            return ProposalState.Succeeded;
        } else {
            return ProposalState.Defeated;
        }
    }

    function _generateProposalId(
        address _to,
        uint256 _value,
        string memory _func,
        bytes memory _data,
        bytes32 _descriptionHash
    ) internal pure returns(bytes32) {
        return keccak256(abi.encode(
            _to, _value, _func, _data, _descriptionHash
        ));
    }
}

contract DAOToken is ERC20 {
    constructor() ERC20("DAOToken", "DAO") {}

    function mint() external payable {
        _mint(msg.sender, msg.value);
    }
}

contract GovernanceDemo is Ownable {
    string public message;
    uint public value;

    constructor(address _governance) {
        _transferOwnership(_governance);
    }

    function demo(string calldata _message) external payable onlyOwner {
        message = _message;
        value = msg.value;
    }
}