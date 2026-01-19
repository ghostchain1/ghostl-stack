methods {
  withdrawETH(address,uint256) returns () env e;
}

rule withdrawReducesBalance(env e, address to, uint256 amount) {
  uint256 before = address(this).balance;
  withdrawETH(e, to, amount);
  assert address(this).balance == before - amount;
}
