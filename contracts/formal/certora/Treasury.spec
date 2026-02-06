methods {
  withdrawLegacyValue(address,uint256) returns () env e;
}

rule legacyWithdrawalDisabled(env e, address to, uint256 amount) {
  withdrawLegacyValue(e, to, amount);
  assert false;
}
