// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageSlot {
    struct AddressSlot {
        address value;
    }

    function getAddressSlot(bytes32 _slot) internal pure returns(AddressSlot storage ret) {
        assembly {
            ret.slot := _slot
        }
    }
}

contract Proxy {
    using StorageSlot for bytes32;

    bytes32 private constant IMPLEMENTATION_SLOT = 
        bytes32(
            uint(
                keccak256("eip1967.proxy.implementation")
            ) - 1
        );

    bytes32 private constant ADMIN_SLOT = 
        bytes32(
            uint(
                keccak256("eip1967.proxy.admin")
            ) - 1
        );

    modifier checkAdmin() {
        if (msg.sender == _getAdmin()) {
            _;
        } else {
            _fallback();
        }
    }

    constructor() {
        _setAdmin(msg.sender);
    }

    function upgradeTo(address _impl) external checkAdmin {
        _setImplementation(_impl);
    }

    function changeAdmin(address _newAdmin) external checkAdmin {
        _setAdmin(_newAdmin);
    }

    function admin() external checkAdmin returns(address) {
        return _getAdmin();
    }

    function implementation() external checkAdmin returns(address) {
        return _getImplementation();
    }

    function _fallback() private {
        _delegate(_getImplementation());
    }

    function _delegate(address _impl) private {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    function _setImplementation(address _impl) private {
        require(_impl != address(0), "Cannot set implementation to zero address");
        IMPLEMENTATION_SLOT.getAddressSlot().value = _impl;
    }

    function _setAdmin(address _admin) private {
        require(_admin != address(0), "Cannot set admin to zero address");
        // StorageSlot.getAddressSlot(ADMIN_SLOT).value = _admin;
        ADMIN_SLOT.getAddressSlot().value = _admin;
    }

    function _getImplementation() private view returns(address) {
        return IMPLEMENTATION_SLOT.getAddressSlot().value; 
    }

    function _getAdmin() private view returns(address) {
        return ADMIN_SLOT.getAddressSlot().value;
    }

    fallback() external payable {
        _fallback();
    }

    receive() external payable {
        _fallback();
    }
}

contract ProxyAdmin {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    function getProxyAdmin(address proxy) external view returns(address) {
        (bool ok, bytes memory resp) = proxy.staticcall(
            abi.encodeWithSelector(Proxy.admin.selector)
        );
        require(ok, "Failed");

        return abi.decode(resp, (address));
    }

    function getProxyImplementation(address proxy) external view returns(address) {
        (bool ok, bytes memory resp) = proxy.staticcall(
            abi.encodeWithSelector(Proxy.implementation.selector)
        );
        require(ok, "Failed");

        return abi.decode(resp, (address));
    }

    function upgrade(address payable proxy, address implementation) external onlyOwner {
        Proxy(proxy).upgradeTo(implementation);
    }

    function changeProxyAdmin(address payable proxy, address newAdmin) external onlyOwner {
        Proxy(proxy).changeAdmin(newAdmin);
    }
}