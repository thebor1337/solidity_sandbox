// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IWisp {
    function execute() external payable;
    function die(address recipient) external;
}

contract WispFactory {
    event Deployed(address indexed wisp);

    bytes public constant initCode = hex"632095f3ac6000526103ff60206004601c335afa6040516060f3";

    bool _reentrancyLock = false;
    bytes _runtimeCode;

    // 0x2095f3ac
    function getRuntimeCode() external view returns (bytes memory) {
        return _runtimeCode;
    }

    function execute(bytes memory runtimeCode, bytes32 salt) external payable {
        require(!_reentrancyLock, "WispFactory: reentrant call");
        _reentrancyLock = true;

        bytes memory _initCode = initCode;
        _runtimeCode = runtimeCode;

        address wisp;
        assembly {
            wisp := create2(
                callvalue(),
                add(_initCode, 0x20),
                mload(_initCode),
                salt
            )
        }

        IWisp(wisp).execute();
        IWisp(wisp).die(msg.sender);

        _reentrancyLock = false;
        _runtimeCode = "";

        emit Deployed(wisp);
    }

    function getWispAddress(bytes32 salt) external view returns (address) {
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                hex"ff",
                                address(this),
                                salt,
                                keccak256(abi.encodePacked(initCode))
                            )
                        )
                    )
                )
            );
    }

    receive() external payable {}
}

contract TestWisp1 is IWisp {
    event Executed(address indexed self);
    
    function execute() external payable {
        emit Executed(address(this));
    }

    function die(address recipient) external {
        selfdestruct(payable(recipient));
    }
}

contract TestWisp2 is IWisp {
    event Executed(address indexed self, uint256 initialBalance, uint256 value);
    
    function execute() external payable {
        require(address(this).balance > 0, "TestWisp2: no balance");
        emit Executed(address(this), address(this).balance, msg.value);
    }

    function die(address recipient) external {
        selfdestruct(payable(recipient));
    }
}


contract TestWisp3 is IWisp {
    event Executed(address indexed self, uint256 initialBalance, uint256 value);

    function execute() external payable {
        uint256 initialBalance = address(this).balance;
        payable(msg.sender).transfer(msg.value);
        emit Executed(address(this), initialBalance, msg.value);
    }

    function die(address recipient) external {
        selfdestruct(payable(recipient));
    }
}
