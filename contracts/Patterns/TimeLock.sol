// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TimeLockPattern is Ownable {

    uint256 constant public MIN_DELAY = 60; // seconds
    uint256 constant public MAX_DELAY = 1 days;
    uint256 constant public GRACE_PERIOD = 1 days;

    event Queued(
        bytes32 indexed txId, 
        address indexed creator,
        address indexed to, 
        string func, 
        bytes data, 
        uint256 value, 
        uint256 timestamp
    );

    event Discarded(bytes32 indexed txId);
    event Executed(bytes32 indexed txId, address indexed executor);

    mapping(bytes32 => bool) public queue;

    function _computeTxId(
        address _to,
        string calldata _func,
        bytes calldata _data,
        uint256 _value,
        uint256 _timestamp
    ) internal pure returns(bytes32) {
        return keccak256(abi.encode(
            _to,
            _func,
            _data,
            _value,
            _timestamp
        ));
    }

    function addToQueue(
        address _to,
        string calldata _func,
        bytes calldata _data,
        uint256 _value,
        uint256 _timestamp
    ) external onlyOwner returns(bytes32 txId) {
        require(
            _timestamp > block.timestamp + MIN_DELAY &&
            _timestamp < block.timestamp + MAX_DELAY,
            "Timestamp out of bounds" 
        );

        txId = _computeTxId(_to, _func, _data, _value, _timestamp);
        require(!queue[txId], "Already queued");

        queue[txId] = true;

        emit Queued(txId, msg.sender, _to, _func, _data, _value, _timestamp);
    }

    function execute(
        address _to,
        string calldata _func,
        bytes calldata _data,
        uint256 _value,
        uint256 _timestamp
    ) external payable returns(bytes memory) {
        require(block.timestamp > _timestamp, "Too early");
        require(block.timestamp < _timestamp + GRACE_PERIOD, "Tx expired");
        require(msg.value == _value, "Incorrect value");

        bytes32 txId = _computeTxId(_to, _func, _data, _value, _timestamp);
        require(queue[txId], "Not queued");

        delete queue[txId];

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
        require(success, "Tx failed");

        emit Executed(txId, msg.sender);

        return response;
    }

    function discard(bytes32 _txId) external onlyOwner {
        require(queue[_txId], "Not queued");
        delete queue[_txId];
        emit Discarded(_txId);
    }
}

contract TimeLockDemo {
    string public message;
    uint256 public value;

    function demo(string calldata _msg) external payable {
        message = _msg;
        value = msg.value;
    }
}

// 0x939a79ac
// 0000000000000000000000000000000000000000000000000000000000000020
// 0000000000000000000000000000000000000000000000000000000000000060
// 0000000000000000000000000000000000000000000000000000000000000020
// 000000000000000000000000000000000000000000000000000000000000000b
// 68656c6c6f20776f726c64000000000000000000000000000000000000000000