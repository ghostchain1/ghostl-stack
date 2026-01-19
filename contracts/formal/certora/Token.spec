methods {
  mint(address,uint256) returns () env e;
  burn(address,uint256) returns () env e;
}

rule mintIncreasesSupply(env e, address to, uint256 amount) {
  uint256 before = totalSupply();
  mint(e, to, amount);
  assert totalSupply() == before + amount;
}

rule burnDecreasesSupply(env e, address from, uint256 amount) {
  uint256 before = totalSupply();
  burn(e, from, amount);
  assert totalSupply() == before - amount;
}
