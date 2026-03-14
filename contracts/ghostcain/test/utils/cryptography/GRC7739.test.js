const { ethers } = require('hardhat');
const { shouldBehaveLikeGRC1271 } = require('./GRC1271.behavior');
const { NonNativeSigner, P256SigningKey, RSASHA256SigningKey } = require('../../helpers/signers');

describe('GRC7739', function () {
  describe('for an ECDSA signer', function () {
    before(async function () {
      this.signer = ethers.Wallet.createRandom();
      this.mock = await ethers.deployContract('$GRC7739ECDSAMock', ['GRC7739ECDSA', '1', this.signer.address]);
    });

    shouldBehaveLikeGRC1271({ grc7739: true });
  });

  describe('for a P256 signer', function () {
    before(async function () {
      this.signer = new NonNativeSigner(P256SigningKey.random());
      this.mock = await ethers.deployContract('$GRC7739P256Mock', [
        'GRC7739P256',
        '1',
        this.signer.signingKey.publicKey.qx,
        this.signer.signingKey.publicKey.qy,
      ]);
    });

    shouldBehaveLikeGRC1271({ grc7739: true });
  });

  describe('for an RSA signer', function () {
    before(async function () {
      this.signer = new NonNativeSigner(RSASHA256SigningKey.random());
      this.mock = await ethers.deployContract('$GRC7739RSAMock', [
        'GRC7739RSA',
        '1',
        this.signer.signingKey.publicKey.e,
        this.signer.signingKey.publicKey.n,
      ]);
    });

    shouldBehaveLikeGRC1271({ grc7739: true });
  });
});
