// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TestFactory {
    event Deployed(address indexed addr);

    uint public counter;

    function create() external {
        TestChildContract child = new TestChildContract();
        emit Deployed(address(child));
    }

    function create2(bytes32 salt) external {
        address child = address(new TestChildContract{salt: salt}());
        emit Deployed(child);
    }

    function dummy() external {
        counter += 1;
    }

    function getPrecomputedCreate2ChildAddress(bytes32 salt) external view returns(address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            keccak256(
                                abi.encodePacked(
                                    type(TestChildContract).creationCode
                                )
                            )
                        )
                    )
                )
            )
        );
    }
}

contract TestChildContract {
    function getAddress() external view returns (address) {
        return address(this);
    }

    function getBalance() external view returns (uint) {
        return address(this).balance;
    }
}
