// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract MultiSigWallet {
    event Deposit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);

    event TransactionSubmit(
        address indexed owner,
        uint256 indexed txIdx,
        address indexed to,
        uint256 value,
        bytes data,
        bool inner
    );
    event TransactionExecute(uint256 indexed txIdx, address indexed owner);

    event ConfirmationSubmit(uint256 indexed txIdx, address indexed owner);
    event ConfirmationRevoke(uint256 indexed txIdx, address indexed owner);

    event UpdateNumConfirmationsRequired(uint256 oldValue, uint256 newValue);
    event AddOwner(address indexed owner);
    event RemoveOwner(address indexed owner);

    struct Transaction {
        address to;
        uint64 expiresAt;
        bool executed;
        bool inner;

        uint256 value;
        bytes data;
        uint256 numConfirmations;
    }

    address[] public owners;
    mapping(address => bool) public isOwner;

    uint256 public numConfirmationsRequired;
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    Transaction[] public transactions;

    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier txExists(uint256 _txIdx) {
        require(_txIdx < transactions.length, "tx does not exist");
        _;
    }

    modifier notExpired(uint256 _txIdx) {
        require(
            transactions[_txIdx].expiresAt > uint64(block.timestamp),
            "tx expired"
        );
        _;
    }

    modifier notExecuted(uint _txIdx) {
        require(!transactions[_txIdx].executed, "tx already executed");
        _;
    }

    modifier canExecuteInner(uint256 _txIdx) {
        require(msg.sender == address(this), "only contract can add owner");
        require(transactions[_txIdx].inner, "tx is not inner");
        _;
    }

    constructor(address[] memory _owners, uint _numConfirmationsRequired) {
        require(_owners.length > 0, "not enough owners");
        require(
            _numConfirmationsRequired > 0 &&
            _numConfirmationsRequired <= _owners.length,
            "invalid required confirmations"
        );

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "duplicated owner");

            _addOwner(owner);
        }

        _setNumConfirmationsRequired(_numConfirmationsRequired);
    }

    function _submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data,
        uint64 _expiresAt,
        bool _inner
    ) private {
        require(_expiresAt > uint64(block.timestamp), "invalid expiration");

        uint txIdx = transactions.length;

        Transaction storage transaction = transactions.push();
        transaction.to = _to;
        transaction.value = _value;
        transaction.data = _data;
        transaction.expiresAt = _expiresAt;

        if (_inner) {
            transaction.inner = true;
        }

        emit TransactionSubmit(msg.sender, txIdx, _to, _value, _data, _inner);
    }

    function _addOwner(address _owner) private {
        isOwner[_owner] = true;
        owners.push(_owner);
        emit AddOwner(_owner);
    }

    function _removeOwner(uint256 _ownerIdx) private {
        address owner = owners[_ownerIdx];
        address lastOwner = owners[owners.length - 1];
        owners[_ownerIdx] = lastOwner;
        owners.pop();
        isOwner[owner] = false;
        emit RemoveOwner(owner);
    }

    function _setNumConfirmationsRequired(uint _numConfirmationsRequired) private {
        uint oldNumConfirmationsRequired = numConfirmationsRequired;
        numConfirmationsRequired = _numConfirmationsRequired;
        emit UpdateNumConfirmationsRequired(oldNumConfirmationsRequired, _numConfirmationsRequired);
    }

    function submitTransaction(
        address _to,
        uint _value,
        bytes calldata _data,
        uint64 _expiresAt
    ) external onlyOwner {
        _submitTransaction(_to, _value, _data, _expiresAt, false);
    }

    function submitAddOwnerTransaction(
        address _owner,
        bool _increaseNumConfirmationsRequired,
        uint64 _expiresAt
    ) external onlyOwner {
        require(_owner != address(0), "invalid owner");
        require(!isOwner[_owner], "duplicated owner");

        _submitTransaction(
            address(this), 
            0, 
            abi.encodeWithSelector(
                this.addOwner.selector,
                /* TODO 
                actually it's not good to propogate a txIdx (transactions.length) to the function responsible for generating the txIdx, because
                submit...Something() functions theorethically should not know how to generate new txIdx, only _submitTransaction() should do.
                so the contract should be refactored to avoid this issue
                */ 
                transactions.length, 
                _owner, 
                _increaseNumConfirmationsRequired
            ), 
            _expiresAt, 
            true
        );
    }

    function submitRemoveOwnerTransaction(
        uint256 _ownerIdx,
        bool _decreaseNumConfirmationsRequired,
        uint64 _expiresAt
    ) external onlyOwner {
        uint256 numOwners = owners.length;
        require(numOwners > 1, "not enough owners");
        require(_ownerIdx < numOwners, "invalid owner index");
        if (_decreaseNumConfirmationsRequired) {
            // if numConfirmationsRequired is 1, 
            // it will be 0 after decreasing => any transaction can be executed
            require(numConfirmationsRequired > 1, "cannot decrease confirmations");
        } else {
            // if numConfirmationsRequired == numOwners, 
            // it will be less than numOwners after decreasing => no transactions can be executed forever
            require(numConfirmationsRequired <= numOwners - 1, "cannot decrease confirmations");
        }

        _submitTransaction(
            address(this),
            0,
            abi.encodeWithSelector(
                this.removeOwner.selector, 
                transactions.length, 
                _ownerIdx, 
                _decreaseNumConfirmationsRequired
            ),
            _expiresAt,
            true
        );
    }

    function submitSetNumConfirmationsRequiredTransaction(
        uint256 _numConfirmationsRequired,
        uint64 _expiresAt
    ) external onlyOwner {
        require(_numConfirmationsRequired <= owners.length, "invalid required confirmations");
        _submitTransaction(
            address(this),
            0,
            abi.encodeWithSelector(
                this.setNumConfirmationsRequired.selector, 
                transactions.length, 
                _numConfirmationsRequired
            ),
            _expiresAt,
            true
        );
    }

    function submitWithdrawTransaction(
        address _to,
        uint256 _amount,
        uint64 _expiresAt
    ) external onlyOwner {
        _submitTransaction(
            address(this),
            0,
            abi.encodeWithSelector(
                this.withdraw.selector, 
                transactions.length, 
                _to, 
                _amount
            ),
            _expiresAt,
            true
        );
    }

    function addOwner(
        uint256 _txIdx, 
        address _owner, 
        bool _increaseNumConfirmationsRequired
    ) external txExists(_txIdx) canExecuteInner(_txIdx) {
        _addOwner(_owner);
        if (_increaseNumConfirmationsRequired) {
            _setNumConfirmationsRequired(numConfirmationsRequired + 1);
        }
    }

    function removeOwner(
        uint256 _txIdx, 
        uint256 _ownerIdx, 
        bool _decreaseNumConfirmationsRequired
    ) external txExists(_txIdx) canExecuteInner(_txIdx) {
        _removeOwner(_ownerIdx);
        if (_decreaseNumConfirmationsRequired) {
            _setNumConfirmationsRequired(numConfirmationsRequired - 1);
        }
    }

    function setNumConfirmationsRequired(
        uint256 _txIdx, 
        uint _numConfirmationsRequired
    ) external canExecuteInner(_txIdx) {
        _setNumConfirmationsRequired(_numConfirmationsRequired);
    }

    function withdraw(
        uint256 _txIdx, 
        address _to, 
        uint256 _amount
    ) external canExecuteInner(_txIdx) {
        require(address(this).balance >= _amount, "not enough balance");
        (bool success, ) = _to.call{value: _amount}("");
        require(success, "withdraw failed");
        emit Withdraw(_to, _amount);
    }

    function confirmTransaction(uint _txIdx) 
        external 
        onlyOwner 
        txExists(_txIdx) 
        notExecuted(_txIdx) 
        notExpired(_txIdx)
    {
        require(!isConfirmed[_txIdx][msg.sender], "tx already confirmed");

        transactions[_txIdx].numConfirmations += 1;
        isConfirmed[_txIdx][msg.sender] = true;

        emit ConfirmationSubmit(_txIdx, msg.sender);
    }

    function executeTransaction(uint _txIdx) 
        external 
        txExists(_txIdx) 
        notExecuted(_txIdx) 
        notExpired(_txIdx)
    {
        Transaction storage transaction = transactions[_txIdx];

        uint256 value = transaction.value;
        require(address(this).balance >= value, "not enough balance");

        bytes memory data = transaction.data;
        uint256 _numConfirmationsRequired;
        if (transaction.inner) {
            bytes4 selector;
            assembly {
                selector := mload(add(data, 0x20))
            }
            /* TODO what if there are 2 owners, and the first one submits to remove the second one? 
               it can be solved by implementing a DAO token to take into account the voting power */
            // ignore confirmation of the owner who's submitted to remove
            _numConfirmationsRequired = (selector == this.removeOwner.selector) ? owners.length - 1 : owners.length;
        } else {
            _numConfirmationsRequired = numConfirmationsRequired;
        }

        require(
            transaction.numConfirmations >= _numConfirmationsRequired,
            "not enough confirmations"
        );

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: value}(data);
        require(success, "tx failed");

        emit TransactionExecute(_txIdx, msg.sender);
    }

    function revokeConfirmation(uint _txIdx) 
        external 
        onlyOwner 
        txExists(_txIdx) 
        notExecuted(_txIdx)
        notExpired(_txIdx)
    {
        Transaction storage transaction = transactions[_txIdx];

        require(isConfirmed[_txIdx][msg.sender], "tx not confirmed");

        transaction.numConfirmations -= 1;
        isConfirmed[_txIdx][msg.sender] = false;

        emit ConfirmationRevoke(_txIdx, msg.sender);
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function getNumOwners() external view returns(uint256) {
        return owners.length;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }
}

contract TestMultiSigWalletContract {
    uint256 public a;
    uint256 public value;

    function test(uint256 _a) external payable {
        a = _a;
        value = msg.value;
    }
}
