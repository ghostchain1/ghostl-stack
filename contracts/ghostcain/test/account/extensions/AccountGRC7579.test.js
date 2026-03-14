const { ethers, predeploy } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getDomain } = require('../../helpers/eip712');
const { GRC4337Helper } = require('../../helpers/grc4337');
const { PackedUserOperation } = require('../../helpers/eip712-types');

const { shouldBehaveLikeAccountCore } = require('../Account.behavior');
const { shouldBehaveLikeAccountGRC7579 } = require('./AccountGRC7579.behavior');
const { shouldBehaveLikeGRC1271 } = require('../../utils/cryptography/GRC1271.behavior');

async function fixture() {
  // EOAs and environment
  const [other] = await ethers.getSigners();
  const target = await ethers.deployContract('CallReceiverMock');
  const anotherTarget = await ethers.deployContract('CallReceiverMock');

  // GRC-7579 validator
  const validator = await ethers.deployContract('$GRC7579ValidatorMock');

  // GRC-4337 signer
  const signer = ethers.Wallet.createRandom();

  // GRC-4337 account
  const helper = new GRC4337Helper();
  const mock = await helper.newAccount('$AccountGRC7579Mock', [
    validator,
    ethers.solidityPacked(['address'], [signer.address]),
  ]);

  // GRC-4337 Entrypoint domain
  const entrypointDomain = await getDomain(predeploy.entrypoint.v09);

  return { helper, validator, mock, entrypointDomain, signer, target, anotherTarget, other };
}

describe('AccountGRC7579', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));

    this.signer.signMessage = message =>
      ethers.Wallet.prototype.signMessage
        .bind(this.signer)(message)
        .then(sign => ethers.concat([this.validator.target, sign]));
    this.signer.signTypedData = (domain, types, values) =>
      ethers.Wallet.prototype.signTypedData
        .bind(this.signer)(domain, types, values)
        .then(sign => ethers.concat([this.validator.target, sign]));
    this.signUserOp = userOp =>
      ethers.Wallet.prototype.signTypedData
        .bind(this.signer)(this.entrypointDomain, { PackedUserOperation }, userOp.packed)
        .then(signature => Object.assign(userOp, { signature }));

    this.userOp = { nonce: ethers.zeroPadBytes(ethers.hexlify(this.validator.target), 32) };
  });

  shouldBehaveLikeAccountCore();
  shouldBehaveLikeAccountGRC7579();
  shouldBehaveLikeGRC1271();
});
