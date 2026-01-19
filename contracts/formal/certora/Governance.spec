methods {
  execute(uint256) returns (bytes) env e;
}

rule executeOnlyGovernor(env e, uint256 id) {
  require e.msg.sender != governor();
  execute(e, id);
  assert false;
}
