// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Master.sol";

contract MyERC20Factory is Ownable {
    event Deployed(address indexed addr, address indexed owner);

    address public immutable implementation;
    uint8 public immutable fee;

    constructor(address _implementation, uint8 _fee) {
        implementation = _implementation;
        fee = _fee;
    }

    function deploy(string calldata name, string calldata symbol) external {
        address deployed = _deploy(implementation);
        MasterMyERC20(deployed).init(address(this), msg.sender, name, symbol);
        emit Deployed(deployed, msg.sender);
    }

    function _deploy(address _implementation) internal returns(address addr) {
        // proxy bytecode: 602d8060093d393df3363d3d373d3d3d363d73<implementation>5af43d82803e903d91602b57fd5bf3
        assembly {
            mstore(0x00, shl(0x68, 0x602d8060093d393df3363d3d373d3d3d363d73)) // 104
            mstore(0x13, shl(0x60, _implementation)) // 96
            mstore(0x27, shl(0x88, 0x5af43d82803e903d91602b57fd5bf3)) // 136
            addr := create(0, 0x00, 0x36)
        }
        require(addr != address(0), "deploy failed");
    }

    function withdraw() external onlyOwner {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "transfer failed");
    }

    receive() external payable {}
}