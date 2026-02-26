// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SecureChainAnchors {
    event Anchored(bytes32 indexed docHash, address indexed by, uint256 ts);

    mapping(bytes32 => uint256) public anchoredAt; // 0 = no anclado

    function anchor(bytes32 docHash) external {
        require(docHash != bytes32(0), "hash=0");
        require(anchoredAt[docHash] == 0, "already anchored");
        anchoredAt[docHash] = block.timestamp;
        emit Anchored(docHash, msg.sender, block.timestamp);
    }

    function isAnchored(bytes32 docHash) external view returns (bool) {
        return anchoredAt[docHash] != 0;
    }
}