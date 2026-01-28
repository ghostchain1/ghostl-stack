methods {
  execute(uint256) returns (bytes) env e;
  constitutionalGuard() returns (address) env e;
  governor() returns (address) env e;
  complianceGuard() returns (address) env e;
  queueLength() returns (uint256) env e;
  queue(uint256) returns (address,uint256,bytes,uint256,bool) env e;
  isPermitted(address,bytes32) returns (bool) env e;
}

rule executeOnlyGovernor(env e, uint256 id) {
  require e.msg.sender != governor();
  execute(e, id);
  assert false;
}

rule executeRequiresConstitutionGuard(env e, uint256 id) {
  require constitutionalGuard() == 0;
  execute(e, id);
  assert false;
}

rule executeRequiresConstitutionApproval(env e, uint256 id) {
  address guard = constitutionalGuard(e);
  require guard != 0;
  require e.msg.sender == governor(e);
  require complianceGuard(e) == 0;
  require id < queueLength(e);
  (address target, uint256 value, bytes data, uint256 eta, bool executed) = queue(e, id);
  require !executed;
  require e.block.timestamp >= eta;
  bytes32 actionType = keccak256("ghost.governance.execute");
  bytes32 actionHash = keccak256(abi.encode(actionType, id, target, value, keccak256(data), eta));
  require !isPermitted(e, guard, actionHash);
  execute(e, id);
  assert false;
}
