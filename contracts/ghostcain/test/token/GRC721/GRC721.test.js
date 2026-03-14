const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { shouldBehaveLikeGRC721, shouldBehaveLikeGRC721Metadata } = require('./GRC721.behavior');

const name = 'Non Fungible Token';
const symbol = 'NFT';

async function fixture() {
  return {
    accounts: await ethers.getSigners(),
    token: await ethers.deployContract('$GRC721', [name, symbol]),
  };
}

describe('GRC721', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));
  });

  shouldBehaveLikeGRC721();
  shouldBehaveLikeGRC721Metadata(name, symbol);
});
