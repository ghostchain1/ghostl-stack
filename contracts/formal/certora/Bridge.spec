methods {
  finalizeToL3(address,address,uint256,uint256) returns () env e;
  releaseERC20FromL3(address,address,address,uint256,uint256) returns () env e;
}

rule finalizeConsumesDeposit(env e, address from, address to, uint256 amount, uint256 nonce) {
  bytes32 key = keccak256(abi.encode(from, to, amount, nonce));
  finalizeToL3(e, from, to, amount, nonce);
  assert depositTime(key) == 0;
}
