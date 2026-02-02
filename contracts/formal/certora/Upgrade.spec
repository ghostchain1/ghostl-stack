methods {
  execute(uint256) env e;
  constitutionalGuard() returns (address) env e;
  owner() returns (address) env e;
  proposalsLength() returns (uint256) env e;
  proposals(uint256) returns (bytes32,uint256,bool) env e;
  isPermitted(address,bytes32) returns (bool) env e;
}

rule upgradeRequiresConstitutionGuard(env e, uint256 id) {
  require constitutionalGuard() == 0;
  execute(e, id);
  assert false;
}

rule upgradeRequiresConstitutionApproval(env e, uint256 id) {
  address guard = constitutionalGuard(e);
  require guard != 0;
  require e.msg.sender == owner(e);
  require id < proposalsLength(e);
  (bytes32 implHash, uint256 activateAt, bool executed) = proposals(e, id);
  require !executed;
  require e.block.timestamp >= activateAt;
  bytes32 actionType = keccak256("ghost.upgrade.execute");
  bytes32 actionHash = keccak256(abi.encode(actionType, id, implHash, activateAt));
  require !isPermitted(e, guard, actionHash);
  execute(e, id);
  assert false;
}
