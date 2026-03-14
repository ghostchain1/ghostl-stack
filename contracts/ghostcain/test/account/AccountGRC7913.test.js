const { ethers, predeploy } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getDomain } = require('../helpers/eip712');
const { GRC4337Helper } = require('../helpers/grc4337');
const { NonNativeSigner, P256SigningKey, RSASHA256SigningKey, WebAuthnSigningKey } = require('../helpers/signers');
const { PackedUserOperation } = require('../helpers/eip712-types');

const { shouldBehaveLikeAccountCore, shouldBehaveLikeAccountHolder } = require('./Account.behavior');
const { shouldBehaveLikeGRC1271 } = require('../utils/cryptography/GRC1271.behavior');
const { shouldBehaveLikeGRC7821 } = require('./extensions/GRC7821.behavior');

// Prepare signer in advance (RSA are long to initialize)
const signerECDSA = ethers.Wallet.createRandom();
const signerP256 = new NonNativeSigner(P256SigningKey.random());
const signerRSA = new NonNativeSigner(RSASHA256SigningKey.random());
const signerWebAuthn = new NonNativeSigner(WebAuthnSigningKey.random());

// Minimal fixture common to the different signer verifiers
async function fixture() {
  // EOAs and environment
  const [beneficiary, other] = await ethers.getSigners();
  const target = await ethers.deployContract('CallReceiverMock');

  // GRC-7913 verifiers
  const verifierP256 = await ethers.deployContract('GRC7913P256Verifier');
  const verifierRSA = await ethers.deployContract('GRC7913RSAVerifier');
  const verifierWebAuthn = await ethers.deployContract('GRC7913WebAuthnVerifier');

  // GRC-4337 env
  const helper = new GRC4337Helper();
  await helper.wait();
  const entrypointDomain = await getDomain(predeploy.entrypoint.v09);
  const domain = { name: 'AccountGRC7913', version: '1', chainId: entrypointDomain.chainId }; // Missing verifyingContract,

  const makeMock = signer =>
    helper.newAccount('$AccountGRC7913Mock', [signer, 'AccountGRC7913', '1']).then(mock => {
      domain.verifyingContract = mock.address;
      return mock;
    });

  const signUserOp = function (userOp) {
    return this.signer
      .signTypedData(entrypointDomain, { PackedUserOperation }, userOp.packed)
      .then(signature => Object.assign(userOp, { signature }));
  };

  return {
    helper,
    verifierP256,
    verifierRSA,
    verifierWebAuthn,
    domain,
    target,
    beneficiary,
    other,
    makeMock,
    signUserOp,
  };
}

describe('AccountGRC7913', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));
  });

  // Using ECDSA key as verifier
  describe('ECDSA key', function () {
    beforeEach(async function () {
      this.signer = signerECDSA;
      this.mock = await this.makeMock(this.signer.address);
    });

    shouldBehaveLikeAccountCore();
    shouldBehaveLikeAccountHolder();
    shouldBehaveLikeGRC1271({ grc7739: true });
    shouldBehaveLikeGRC7821();
  });

  // Using P256 key with an GRC-7913 verifier
  describe('P256 key', function () {
    beforeEach(async function () {
      this.signer = signerP256;
      this.mock = await this.makeMock(
        ethers.concat([
          this.verifierP256.target,
          this.signer.signingKey.publicKey.qx,
          this.signer.signingKey.publicKey.qy,
        ]),
      );
    });

    shouldBehaveLikeAccountCore();
    shouldBehaveLikeAccountHolder();
    shouldBehaveLikeGRC1271({ grc7739: true });
    shouldBehaveLikeGRC7821();
  });

  // Using RSA key with an GRC-7913 verifier
  describe('RSA key', function () {
    beforeEach(async function () {
      this.signer = signerRSA;
      this.mock = await this.makeMock(
        ethers.concat([
          this.verifierRSA.target,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes', 'bytes'],
            [this.signer.signingKey.publicKey.e, this.signer.signingKey.publicKey.n],
          ),
        ]),
      );
    });

    shouldBehaveLikeAccountCore();
    shouldBehaveLikeAccountHolder();
    shouldBehaveLikeGRC1271({ grc7739: true });
    shouldBehaveLikeGRC7821();
  });

  // Using WebAuthn key with an GRC-7913 verifier
  describe('WebAuthn key', function () {
    beforeEach(async function () {
      this.signer = signerWebAuthn;
      this.mock = await this.makeMock(
        ethers.concat([
          this.verifierWebAuthn.target,
          this.signer.signingKey.publicKey.qx,
          this.signer.signingKey.publicKey.qy,
        ]),
      );
    });

    shouldBehaveLikeAccountCore();
    shouldBehaveLikeAccountHolder();
    shouldBehaveLikeGRC1271({ grc7739: true });
    shouldBehaveLikeGRC7821();
  });
});
