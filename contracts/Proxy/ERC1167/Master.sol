// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./Factory.sol";

contract MasterMyERC20 is ERC20Upgradeable, OwnableUpgradeable {

    event Deposited(address indexed from, uint256 amount);

    address public factory;

    function init(
        address _factory, 
        address owner,
        string memory name, 
        string memory symbol
    ) external initializer {
        require(msg.sender == _factory, "Only factory allowed");
        factory = _factory;
        _transferOwnership(owner);
        __ERC20_init(name, symbol);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw() external onlyOwner {
        uint _amount = address(this).balance;
        uint _fee = (_amount * MyERC20Factory(payable(factory)).fee()) / 100;
        if (_fee > 0) {
            _send(address(factory), _fee);
        }
        _send(msg.sender, _amount - _fee);
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }
}